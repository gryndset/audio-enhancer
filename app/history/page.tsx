'use client'
import { useEffect, useState } from 'react'
import { getHistory, deleteHistory, HistoryEntry, getStorageEstimate, base64ToBlob, formatBytes, formatDuration } from '@/lib/db'
import AudioPlayer from '@/components/AudioPlayer'
import TranscriptViewer from '@/components/TranscriptViewer'
import SummaryPanel from '@/components/SummaryPanel'
import ToastContainer from '@/components/ToastContainer'
import { useToast } from '@/hooks/useToast'
import { SummaryMode, SummaryResult } from '@/lib/summarize'

export default function HistoryPage() {
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [selected, setSelected] = useState<HistoryEntry | null>(null)
  const [storage, setStorage] = useState<{ used: number; quota: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const { toasts, addToast, removeToast } = useToast()

  useEffect(() => {
    getHistory().then(h => { setEntries(h); setLoading(false) })
    getStorageEstimate().then(setStorage)
  }, [])

  const handleDelete = async (id: string) => {
    await deleteHistory(id)
    setEntries(prev => prev.filter(e => e.id !== id))
    if (selected?.id === id) setSelected(null)
    addToast('削除しました', 'info')
  }

  const engineLabel: Record<string, string> = { openai: 'OpenAI', groq: 'Groq' }
  const modeLabel: Record<string, string> = { lecture:'授業', meeting:'会議', care:'介護記録', general:'汎用' }

  return (
    <>
      <nav>
        <a href="/" style={{ textDecoration:'none' }}>
          <div className="nav-logo-main">AudioClear</div>
          <div className="nav-logo-sub">処理履歴</div>
        </a>
        <ul className="nav-links">
          <li><a href="/">ホーム</a></li>
          <li><a href="/settings">設定</a></li>
        </ul>
        <a href="/" className="nav-cta">← 戻る</a>
      </nav>

      <main style={{ maxWidth:1100, margin:'0 auto', padding:'88px 40px 80px' }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:32, flexWrap:'wrap', gap:12 }}>
          <div>
            <h1 className="s-h2">処理履歴</h1>
            {storage && (
              <div style={{ fontFamily:'DM Mono,monospace', fontSize:9, color:'var(--t3)', marginTop:8 }}>
                ストレージ使用量: {formatBytes(storage.used)} / {formatBytes(storage.quota)}
                <span style={{ marginLeft:12, display:'inline-block', width:120, height:3, background:'var(--bd2)', verticalAlign:'middle', position:'relative', overflow:'hidden' }}>
                  <span style={{ position:'absolute', left:0, top:0, height:'100%', background:'var(--cy)', width:`${Math.min(100,(storage.used/storage.quota)*100).toFixed(1)}%` }} />
                </span>
              </div>
            )}
          </div>
          {entries.length > 0 && (
            <div style={{ fontFamily:'DM Mono,monospace', fontSize:9, color:'var(--t3)' }}>{entries.length} 件</div>
          )}
        </div>

        {loading && (
          <div style={{ textAlign:'center', color:'var(--t3)', fontFamily:'DM Mono,monospace', fontSize:11, padding:'60px 0' }}>読み込み中...</div>
        )}

        {!loading && entries.length === 0 && (
          <div style={{ textAlign:'center', padding:'80px 0' }}>
            <div style={{ fontFamily:'Cormorant Garamond,serif', fontSize:48, fontWeight:300, color:'var(--t3)', marginBottom:16 }}>空</div>
            <div style={{ fontFamily:'DM Mono,monospace', fontSize:11, color:'var(--t3)', marginBottom:24 }}>処理履歴がありません</div>
            <a href="/" className="btn-primary">音声を処理する →</a>
          </div>
        )}

        <div style={{ display: selected ? 'grid' : 'block', gridTemplateColumns:'320px 1fr', gap:24, alignItems:'start' }}>
          {/* List */}
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {entries.map(entry => (
              <div
                key={entry.id}
                className="history-card"
                style={{ borderColor: selected?.id === entry.id ? 'rgba(91,200,232,.4)' : undefined, background: selected?.id === entry.id ? 'rgba(91,200,232,.04)' : undefined }}
                onClick={() => setSelected(selected?.id === entry.id ? null : entry)}
              >
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontFamily:'DM Mono,monospace', fontSize:11, color:'var(--tx)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginBottom:6 }}>
                      {entry.filename}
                    </div>
                    <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                      <span style={{ fontFamily:'DM Mono,monospace', fontSize:9, color:'var(--t3)', border:'1px solid var(--bd)', padding:'2px 6px' }}>
                        {modeLabel[entry.mode] ?? entry.mode}
                      </span>
                      <span style={{ fontFamily:'DM Mono,monospace', fontSize:9, color:'var(--t3)', border:'1px solid var(--bd)', padding:'2px 6px' }}>
                        {engineLabel[entry.engine] ?? entry.engine}
                      </span>
                      {entry.duration > 0 && (
                        <span style={{ fontFamily:'DM Mono,monospace', fontSize:9, color:'var(--t3)' }}>
                          {formatDuration(entry.duration)}
                        </span>
                      )}
                    </div>
                    <div style={{ fontFamily:'DM Mono,monospace', fontSize:8, color:'var(--t3)', marginTop:6 }}>
                      {new Date(entry.processedAt).toLocaleString('ja-JP')}
                    </div>
                  </div>
                  <button
                    className="btn-danger"
                    style={{ fontSize:9, padding:'4px 10px', flexShrink:0 }}
                    onClick={e => { e.stopPropagation(); handleDelete(entry.id) }}
                  >
                    削除
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Detail */}
          {selected && (
            <div>
              <div className="card">
                <div className="s-tag" style={{ marginBottom:8 }}>詳細</div>
                <div style={{ fontFamily:'DM Mono,monospace', fontSize:13, color:'var(--tx)', marginBottom:4 }}>{selected.filename}</div>
                <div style={{ fontFamily:'DM Mono,monospace', fontSize:9, color:'var(--t3)', marginBottom:20 }}>
                  {formatBytes(selected.fileSize)} · {formatDuration(selected.duration)} · 処理時間 {(selected.processingTime/1000).toFixed(0)}s
                </div>

                {selected.enhancedAudioB64 && (() => {
                  const blob = base64ToBlob(selected.enhancedAudioB64, selected.enhancedMime)
                  const url = URL.createObjectURL(blob)
                  return <div style={{ marginBottom:20 }}><AudioPlayer src={url} label="音質強化後の音声" /></div>
                })()}

                {selected.transcript.length > 0 && (
                  <div style={{ marginBottom:20 }}>
                    <div className="s-tag" style={{ marginBottom:12 }}>文字起こし</div>
                    <TranscriptViewer segments={selected.transcript} />
                  </div>
                )}

                {selected.summary && (() => {
                  try {
                    const summary: SummaryResult = JSON.parse(selected.summary)
                    return (
                      <>
                        <hr className="divider" style={{ marginBottom:20 }} />
                        <SummaryPanel summary={summary} mode={selected.mode as SummaryMode} />
                      </>
                    )
                  } catch { return null }
                })()}
              </div>
            </div>
          )}
        </div>
      </main>

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </>
  )
}
