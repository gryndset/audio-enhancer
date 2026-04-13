'use client'
import { useState, useRef, useCallback } from 'react'
import DropZone from '@/components/DropZone'
import ProgressSteps, { Step, StepStatus } from '@/components/ProgressSteps'
import AudioPlayer from '@/components/AudioPlayer'
import TranscriptViewer from '@/components/TranscriptViewer'
import SummaryPanel from '@/components/SummaryPanel'
import ToastContainer from '@/components/ToastContainer'
import { useToast } from '@/hooks/useToast'
import { useWakeLock } from '@/hooks/useWakeLock'
import { enhanceAudio, testDolbyConnection } from '@/lib/dolby'
import { transcribeAudio, TranscriptSegment, WhisperEngine } from '@/lib/whisper'
import { generateSummary, SummaryMode, SummaryResult } from '@/lib/summarize'
import { saveHistory, fileToBase64, base64ToBlob, formatBytes, formatDuration } from '@/lib/db'

interface QueueItem {
  id: string
  file: File
  status: 'pending' | 'processing' | 'done' | 'error'
  result?: ProcessResult
  error?: string
}

interface ProcessResult {
  enhancedUrl: string | null
  enhancedMime: string
  transcript: TranscriptSegment[]
  summary: SummaryResult | null
  processingTime: number
}

interface Settings {
  dolbyKey: string
  dolbySecret: string
  whisperEngine: WhisperEngine
  whisperKey: string
  openaiKey: string
  language: string
  noiseReduction: 'low' | 'medium' | 'high'
  chunkMinutes: number
  overlapSeconds: number
  removeFiller: boolean
  customVocab: string
  nightMode: boolean
  enableDolby: boolean
  enableSummary: boolean
  summaryMode: SummaryMode
}

function loadSettings(): Settings {
  if (typeof window === 'undefined') return defaultSettings()
  try {
    const s = localStorage.getItem('ac_settings_v4')
    return s ? { ...defaultSettings(), ...JSON.parse(s) } : defaultSettings()
  } catch { return defaultSettings() }
}

function defaultSettings(): Settings {
  return {
    dolbyKey: '', dolbySecret: '', whisperEngine: 'groq', whisperKey: '', openaiKey: '',
    language: 'ja', noiseReduction: 'medium', chunkMinutes: 5, overlapSeconds: 30,
    removeFiller: false, customVocab: '', nightMode: false,
    enableDolby: true, enableSummary: true, summaryMode: 'lecture',
  }
}

const MARQUEE_ITEMS = ['Dolby音質強化', 'ノイズ除去', 'Whisper文字起こし', 'AI要約生成', 'SRT字幕出力', 'Groq対応', '夜間バッチモード', 'WakeLock対応', 'チェックポイント保存', '複数ファイルキュー']

export default function Home() {
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [steps, setSteps] = useState<Step[]>([])
  const [stepPct, setStepPct] = useState(0)
  const [settings] = useState<Settings>(loadSettings)
  const [editTranscript, setEditTranscript] = useState<TranscriptSegment[]>([])
  const abortRef = useRef<AbortController | null>(null)
  const { toasts, addToast, removeToast } = useToast()
  const { acquire: acquireWakeLock, release: releaseWakeLock } = useWakeLock()

  const updateStep = useCallback((id: string, status: StepStatus, desc?: string, timeMs?: number) => {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, status, ...(desc ? { desc } : {}), ...(timeMs !== undefined ? { timeMs } : {}) } : s))
  }, [])

  const makeSteps = useCallback((enableDolby: boolean, enableSummary: boolean): Step[] => [
    { id: 'upload', name: 'ファイル読み込み', status: 'pending' },
    ...(enableDolby ? [{ id: 'dolby', name: 'Dolby 音質強化', status: 'pending' as StepStatus }] : []),
    { id: 'whisper', name: 'Whisper 文字起こし', status: 'pending' },
    ...(enableSummary ? [{ id: 'summary', name: 'AI 要約生成', status: 'pending' as StepStatus }] : []),
    { id: 'save', name: '結果を保存', status: 'pending' },
  ], [])

  const processFile = useCallback(async (item: QueueItem) => {
    const s = loadSettings()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    const initialSteps = makeSteps(s.enableDolby, s.enableSummary)
    setSteps(initialSteps)
    setActiveId(item.id)
    setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'processing' } : q))

    await acquireWakeLock()
    const startTime = Date.now()

    try {
      // Validate settings
      if (s.enableDolby && (!s.dolbyKey || !s.dolbySecret)) throw new Error('Dolby APIキーが設定されていません')
      if (!s.whisperKey) throw new Error(`${s.whisperEngine === 'groq' ? 'Groq' : 'OpenAI'} APIキーが設定されていません`)
      if (s.enableSummary && !s.openaiKey) throw new Error('OpenAI APIキーが設定されていません（AI要約に必要）')

      // Step: upload
      updateStep('upload', 'active', 'ファイル読み込み中...')
      const t0 = Date.now()
      const mime = item.file.type || 'audio/mpeg'
      let audioBlob: Blob = item.file
      updateStep('upload', 'done', `${formatBytes(item.file.size)}`, Date.now() - t0)

      // Step: dolby
      let enhancedUrl: string | null = null
      let enhancedMime = mime
      if (s.enableDolby) {
        updateStep('dolby', 'active', '音質強化中...')
        const td = Date.now()
        try {
          const enhanced = await enhanceAudio(
            audioBlob, mime, item.file.name,
            { appKey: s.dolbyKey, appSecret: s.dolbySecret, noiseReduction: s.noiseReduction },
            pct => { updateStep('dolby', 'active', `音質強化中... ${pct}%`); setStepPct(pct) },
            ctrl.signal
          )
          audioBlob = enhanced
          enhancedMime = enhanced.type || mime
          enhancedUrl = URL.createObjectURL(enhanced)
          updateStep('dolby', 'done', '音質強化完了', Date.now() - td)
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e)
          if (msg.includes('Aborted')) throw e
          // Dolby失敗はスキップして続行
          updateStep('dolby', 'error', `スキップ: ${msg.slice(0,60)}`)
          addToast('Dolby処理をスキップしました', 'info')
        }
      }

      // Step: whisper
      updateStep('whisper', 'active', '文字起こし準備中...')
      const tw = Date.now()
      const transcript = await transcribeAudio(
        audioBlob, enhancedMime,
        {
          engine: s.whisperEngine, apiKey: s.whisperKey, language: s.language,
          removeFiller: s.removeFiller, customVocab: s.customVocab,
          chunkMinutes: s.chunkMinutes, overlapSeconds: s.overlapSeconds,
          nightMode: s.nightMode,
        },
        (pct, msg) => { updateStep('whisper', 'active', msg); setStepPct(pct) },
        ctrl.signal
      )
      setEditTranscript(transcript)
      updateStep('whisper', 'done', `${transcript.length} セグメント`, Date.now() - tw)

      // Step: summary
      let summary: SummaryResult | null = null
      if (s.enableSummary) {
        updateStep('summary', 'active', 'AI要約生成中...')
        const ts = Date.now()
        try {
          summary = await generateSummary(transcript, s.openaiKey, s.summaryMode, ctrl.signal)
          updateStep('summary', 'done', '要約完了', Date.now() - ts)
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e)
          updateStep('summary', 'error', `スキップ: ${msg.slice(0,60)}`)
          addToast('AI要約をスキップしました', 'info')
        }
      }

      // Step: save
      updateStep('save', 'active', '保存中...')
      const enhancedB64 = enhancedUrl ? await fileToBase64(audioBlob) : null
      const totalTime = Date.now() - startTime

      await saveHistory({
        id: item.id,
        filename: item.file.name,
        duration: transcript.length > 0 ? transcript[transcript.length - 1].end : 0,
        fileSize: item.file.size,
        processedAt: Date.now(),
        engine: s.whisperEngine,
        language: s.language,
        mode: s.summaryMode,
        transcript,
        summary: summary ? JSON.stringify(summary) : '',
        enhancedAudioB64: enhancedB64,
        enhancedMime,
        processingTime: totalTime,
        checksum: item.id,
      })
      updateStep('save', 'done', `処理時間 ${(totalTime/1000).toFixed(0)}s`)

      const result: ProcessResult = { enhancedUrl, enhancedMime, transcript, summary, processingTime: totalTime }
      setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'done', result } : q))
      addToast(`完了: ${item.file.name}`, 'success')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('Aborted')) {
        addToast('処理をキャンセルしました', 'info')
        setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'pending' } : q))
        setSteps(prev => prev.map(s => s.status === 'active' ? { ...s, status: 'error' as StepStatus } : s))
      } else {
        addToast(`エラー: ${msg.slice(0,80)}`, 'error')
        setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'error', error: msg } : q))
        setSteps(prev => prev.map(s => s.status === 'active' ? { ...s, status: 'error' as StepStatus, desc: msg.slice(0,80) } : s))
      }
    } finally {
      releaseWakeLock()
      setActiveId(null)
      abortRef.current = null
    }
  }, [updateStep, makeSteps, acquireWakeLock, releaseWakeLock, addToast])

  const handleFiles = useCallback((files: File[]) => {
    const newItems: QueueItem[] = files.map(f => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file: f, status: 'pending',
    }))
    setQueue(prev => [...prev, ...newItems])
  }, [])

  const startProcessing = useCallback(async () => {
    const pending = queue.filter(q => q.status === 'pending')
    for (const item of pending) {
      await processFile(item)
    }
  }, [queue, processFile])

  const cancel = () => { abortRef.current?.abort() }
  const removeFromQueue = (id: string) => setQueue(prev => prev.filter(q => q.id !== id))
  const clearDone = () => setQueue(prev => prev.filter(q => q.status !== 'done'))

  const activeItem = queue.find(q => q.id === activeId)
  const doneItems = queue.filter(q => q.status === 'done')
  const pendingCount = queue.filter(q => q.status === 'pending').length
  const isProcessing = activeId !== null

  const s = settings // for display

  return (
    <>
      {/* NAV */}
      <nav>
        <a href="/" style={{ textDecoration:'none' }}>
          <div className="nav-logo-main">AudioClear</div>
          <div className="nav-logo-sub">Audio Enhancement · Transcription · AI Summary</div>
        </a>
        <ul className="nav-links">
          <li><a href="/history">履歴</a></li>
          <li><a href="/settings">設定</a></li>
        </ul>
        <div style={{ display:'flex', gap:8 }}>
          <a href="/settings" className="nav-ghost">設定</a>
          <a href="/history" className="nav-cta">履歴を見る →</a>
        </div>
      </nav>

      {/* MARQUEE */}
      <div style={{ marginTop:58 }}>
        <div className="mq">
          <div className="mq-track">
            {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((item, i) => (
              <div key={i} className="mq-item"><span className="mq-dot">●</span>{item}</div>
            ))}
          </div>
        </div>
      </div>

      {/* HERO */}
      <section style={{ padding:'72px 40px 40px', maxWidth:900, margin:'0 auto' }}>
        <div className="s-tag animate-up animate-up-1">長時間録音 × AIパイプライン</div>
        <h1 className="s-h2 animate-up animate-up-2" style={{ fontSize:'clamp(36px,5vw,60px)', marginBottom:12 }}>
          録音を入れるだけ。<br /><span style={{ color:'var(--t2)', fontStyle:'italic' }}>あとは全部AIが動く。</span>
        </h1>
        <p className="s-sub animate-up animate-up-3">
          Dolby音質強化 → Whisper文字起こし → GPT要約まで全自動。<br />
          90分の授業録音が<strong style={{ color:'var(--tx)' }}>15〜25分</strong>で処理完了。
        </p>

        {/* Mode banner */}
        <div style={{ display:'flex', gap:12, marginTop:28, flexWrap:'wrap' }} className="animate-up animate-up-4">
          {(['lecture','meeting','care','general'] as SummaryMode[]).map(m => {
            const labels: Record<SummaryMode,string> = { lecture:'授業・講義', meeting:'会議・ミーティング', care:'介護記録', general:'汎用' }
            return (
              <div key={m} style={{ fontFamily:'DM Mono,monospace', fontSize:9, letterSpacing:2, color: s.summaryMode===m?'var(--cy)':'var(--t3)', border:`1px solid ${s.summaryMode===m?'rgba(91,200,232,.4)':'var(--bd)'}`, padding:'5px 12px', textTransform:'uppercase' }}>
                {labels[m]}
              </div>
            )
          })}
          <a href="/settings" style={{ fontFamily:'DM Mono,monospace', fontSize:9, letterSpacing:2, color:'var(--am)', border:'1px solid rgba(240,180,41,.3)', padding:'5px 12px', textTransform:'uppercase', textDecoration:'none' }}>
            設定で変更 →
          </a>
        </div>
      </section>

      {/* MAIN */}
      <main style={{ maxWidth:900, margin:'0 auto', padding:'0 40px 80px' }}>

        {/* Drop zone */}
        <DropZone onFiles={handleFiles} disabled={isProcessing} />

        {/* Queue */}
        {queue.length > 0 && (
          <div className="card" style={{ marginTop:16 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
              <div className="s-tag" style={{ margin:0 }}>キュー ({queue.length})</div>
              <div style={{ display:'flex', gap:8 }}>
                {doneItems.length > 0 && <button className="btn-ghost" style={{ fontSize:9, padding:'5px 12px' }} onClick={clearDone}>完了を消す</button>}
              </div>
            </div>
            {queue.map(item => (
              <div key={item.id} className="queue-item">
                <div className="queue-name">{item.file.name}</div>
                <div className="queue-size">{formatBytes(item.file.size)}</div>
                <div className={`queue-status ${item.status}`}>
                  {item.status === 'pending' ? '待機中'
                    : item.status === 'processing' ? '処理中'
                    : item.status === 'done' ? '完了'
                    : 'エラー'}
                </div>
                {item.status !== 'processing' && (
                  <button onClick={() => removeFromQueue(item.id)} style={{ background:'none', border:'none', color:'var(--t3)', cursor:'pointer', fontSize:14, marginLeft:4 }}>×</button>
                )}
              </div>
            ))}

            <div style={{ display:'flex', gap:10, marginTop:20 }}>
              {!isProcessing && pendingCount > 0 && (
                <button className="btn-primary" onClick={startProcessing}>
                  ▶ 処理開始 ({pendingCount}件)
                </button>
              )}
              {isProcessing && (
                <button className="btn-danger" onClick={cancel}>■ キャンセル</button>
              )}
            </div>
          </div>
        )}

        {/* Processing progress */}
        {isProcessing && steps.length > 0 && (
          <div className="card" style={{ marginTop:16 }}>
            <div className="s-tag" style={{ marginBottom:16 }}>処理中: {activeItem?.file.name}</div>

            {/* Progress bar */}
            <div style={{ height:2, background:'var(--bd2)', marginBottom:24, position:'relative', overflow:'hidden' }}>
              <div style={{ position:'absolute', left:0, top:0, height:'100%', background:'var(--cy)', width:`${stepPct}%`, transition:'width .5s' }} />
            </div>

            <ProgressSteps steps={steps} />

            <div style={{ marginTop:16, fontFamily:'DM Mono,monospace', fontSize:9, letterSpacing:1.5, color:'var(--t3)', textTransform:'uppercase' }}>
              ⚠ 処理中は画面を閉じないでください（WakeLock有効）
            </div>
          </div>
        )}

        {/* Results */}
        {doneItems.map(item => {
          if (!item.result) return null
          const r = item.result
          const originalUrl = URL.createObjectURL(item.file)
          return (
            <div key={item.id} className="card" style={{ marginTop:24 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:8 }}>
                <div>
                  <div className="s-tag" style={{ margin:0, marginBottom:4 }}>結果</div>
                  <div style={{ fontFamily:'DM Mono,monospace', fontSize:11, color:'var(--tx)' }}>{item.file.name}</div>
                  <div style={{ fontFamily:'DM Mono,monospace', fontSize:9, color:'var(--t3)', marginTop:2 }}>
                    処理時間 {(r.processingTime/1000).toFixed(0)}s · {r.transcript.length} セグメント
                    {r.transcript.length > 0 && ` · ${formatDuration(r.transcript[r.transcript.length-1].end)}`}
                  </div>
                </div>
              </div>

              {/* Audio players */}
              <div style={{ display:'flex', flexDirection:'column', gap:12, marginBottom:24 }}>
                <AudioPlayer src={originalUrl} label="元の音声" />
                {r.enhancedUrl && <AudioPlayer src={r.enhancedUrl} label="音質強化後" />}
              </div>

              <hr className="divider" style={{ marginBottom:24 }} />

              {/* Transcript */}
              {r.transcript.length > 0 && (
                <div style={{ marginBottom:24 }}>
                  <div className="s-tag" style={{ marginBottom:12 }}>文字起こし</div>
                  <TranscriptViewer
                    segments={editTranscript.length ? editTranscript : r.transcript}
                    editable
                    onEdit={segs => setEditTranscript(segs)}
                  />
                </div>
              )}

              {/* Summary */}
              {r.summary && (
                <>
                  <hr className="divider" style={{ marginBottom:24 }} />
                  <SummaryPanel summary={r.summary} mode={s.summaryMode} />
                </>
              )}
            </div>
          )
        })}

        {/* Empty state */}
        {queue.length === 0 && (
          <div style={{ marginTop:40, textAlign:'center' }}>
            <div style={{ fontFamily:'DM Mono,monospace', fontSize:9, letterSpacing:3, color:'var(--t3)', textTransform:'uppercase', marginBottom:16 }}>はじめ方</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:12, maxWidth:700, margin:'0 auto' }}>
              {[
                { n:'01', t:'設定', d:'設定画面でAPIキーを入力' },
                { n:'02', t:'アップロード', d:'音声・動画ファイルをドロップ' },
                { n:'03', t:'自動処理', d:'Dolby → Whisper → AI要約' },
                { n:'04', t:'ダウンロード', d:'テキスト・字幕・要約を取得' },
              ].map(item => (
                <div key={item.n} className="card-sm" style={{ textAlign:'left' }}>
                  <div style={{ fontFamily:'Cormorant Garamond,serif', fontSize:28, fontWeight:300, color:'var(--t3)', marginBottom:8 }}>{item.n}</div>
                  <div style={{ fontFamily:'DM Mono,monospace', fontSize:10, letterSpacing:1.5, color:'var(--tx)', textTransform:'uppercase', marginBottom:4 }}>{item.t}</div>
                  <div style={{ fontSize:12, color:'var(--t2)' }}>{item.d}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop:24 }}>
              <a href="/settings" className="btn-primary" style={{ display:'inline-flex' }}>設定を開く →</a>
            </div>
          </div>
        )}
      </main>

      <ToastContainer toasts={toasts} onRemove={removeToast} />

      {/* Footer */}
      <footer style={{ borderTop:'1px solid var(--bd)', padding:'32px 40px', maxWidth:900, margin:'0 auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:12 }}>
          <div style={{ fontFamily:'Cormorant Garamond,serif', fontSize:18, fontWeight:300, letterSpacing:5, textTransform:'uppercase', color:'var(--t2)' }}>AudioClear</div>
          <div style={{ display:'flex', gap:20 }}>
            <a href="/history" style={{ fontFamily:'DM Mono,monospace', fontSize:10, color:'var(--t3)', textDecoration:'none', letterSpacing:1.5 }}>履歴</a>
            <a href="/settings" style={{ fontFamily:'DM Mono,monospace', fontSize:10, color:'var(--t3)', textDecoration:'none', letterSpacing:1.5 }}>設定</a>
          </div>
        </div>
        <div style={{ marginTop:16, fontFamily:'DM Mono,monospace', fontSize:9, color:'var(--t3)', letterSpacing:1 }}>
          APIキー持ち込み式 · 運用コストゼロ · データはブラウザ内のみ保存
        </div>
      </footer>
    </>
  )
}
