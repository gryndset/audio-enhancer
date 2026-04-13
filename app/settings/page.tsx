'use client'
import { useState, useEffect } from 'react'
import { testDolbyConnection } from '@/lib/dolby'
import { testWhisperConnection, WhisperEngine } from '@/lib/whisper'
import { SummaryMode } from '@/lib/summarize'
import ToastContainer from '@/components/ToastContainer'
import { useToast } from '@/hooks/useToast'

interface Settings {
  dolbyKey: string; dolbySecret: string
  whisperEngine: WhisperEngine; whisperKey: string; openaiKey: string
  language: string; noiseReduction: 'low'|'medium'|'high'
  chunkMinutes: number; overlapSeconds: number
  removeFiller: boolean; customVocab: string; nightMode: boolean
  enableDolby: boolean; enableSummary: boolean; summaryMode: SummaryMode
}

function defaultSettings(): Settings {
  return { dolbyKey:'', dolbySecret:'', whisperEngine:'groq', whisperKey:'', openaiKey:'',
    language:'ja', noiseReduction:'medium', chunkMinutes:5, overlapSeconds:30,
    removeFiller:false, customVocab:'', nightMode:false,
    enableDolby:true, enableSummary:true, summaryMode:'lecture' }
}

export default function SettingsPage() {
  const [s, setS] = useState<Settings>(defaultSettings)
  const [testing, setTesting] = useState<Record<string,boolean>>({})
  const { toasts, addToast, removeToast } = useToast()

  useEffect(() => {
    try {
      const saved = localStorage.getItem('ac_settings_v4')
      if (saved) setS({ ...defaultSettings(), ...JSON.parse(saved) })
    } catch {}
  }, [])

  const save = (patch: Partial<Settings>) => {
    const next = { ...s, ...patch }
    setS(next)
    localStorage.setItem('ac_settings_v4', JSON.stringify(next))
  }

  const exportSettings = () => {
    const safe = { ...s, dolbyKey:'', dolbySecret:'', whisperKey:'', openaiKey:'' }
    const blob = new Blob([JSON.stringify(safe, null, 2)], { type:'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href=url; a.download='audioclear-settings.json'; a.click()
    URL.revokeObjectURL(url)
  }

  const importSettings = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target?.result as string)
        save(data)
        addToast('設定をインポートしました', 'success')
      } catch { addToast('JSONの読み込みに失敗しました', 'error') }
    }
    reader.readAsText(file)
  }

  const testDolby = async () => {
    if (!s.dolbyKey || !s.dolbySecret) return addToast('App KeyとApp Secretを入力してください', 'error')
    setTesting(t => ({ ...t, dolby: true }))
    const ok = await testDolbyConnection(s.dolbyKey, s.dolbySecret)
    setTesting(t => ({ ...t, dolby: false }))
    addToast(ok ? 'Dolby接続成功 ✓' : 'Dolby接続失敗 - キーを確認してください', ok?'success':'error')
  }

  const testWhisper = async () => {
    if (!s.whisperKey) return addToast('APIキーを入力してください', 'error')
    setTesting(t => ({ ...t, whisper: true }))
    const ok = await testWhisperConnection(s.whisperEngine, s.whisperKey)
    setTesting(t => ({ ...t, whisper: false }))
    addToast(ok ? `${s.whisperEngine}接続成功 ✓` : '接続失敗 - キーを確認してください', ok?'success':'error')
  }

  const Toggle = ({ value, onChange }: { value: boolean; onChange: (v:boolean)=>void }) => (
    <div className={`toggle${value?' on':''}`} onClick={() => onChange(!value)} style={{ cursor:'pointer' }} />
  )

  const SectionTitle = ({ title }: { title: string }) => (
    <div className="s-tag" style={{ marginBottom:16 }}>{title}</div>
  )

  return (
    <>
      <nav>
        <a href="/" style={{ textDecoration:'none' }}>
          <div className="nav-logo-main">AudioClear</div>
          <div className="nav-logo-sub">Settings</div>
        </a>
        <ul className="nav-links">
          <li><a href="/">ホーム</a></li>
          <li><a href="/history">履歴</a></li>
        </ul>
        <a href="/" className="nav-cta">← 戻る</a>
      </nav>

      <main style={{ maxWidth:760, margin:'0 auto', padding:'88px 40px 80px' }}>
        <div style={{ marginBottom:40 }}>
          <h1 className="s-h2">設定</h1>
          <p className="s-sub">APIキーはブラウザのlocalStorageにのみ保存されます。サーバーには送信されません。</p>
        </div>

        {/* Dolby */}
        <div className="card" style={{ marginBottom:16 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
            <SectionTitle title="Dolby.io 音質強化" />
            <div className="toggle-wrap">
              <Toggle value={s.enableDolby} onChange={v => save({ enableDolby: v })} />
              <span className="toggle-label" style={{ fontSize:11 }}>{s.enableDolby ? '有効' : '無効'}</span>
            </div>
          </div>

          {s.enableDolby && (
            <>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
                <div>
                  <label className="input-label">App Key</label>
                  <input className="input-field" type="password" placeholder="your-app-key" value={s.dolbyKey} onChange={e => save({ dolbyKey: e.target.value })} />
                </div>
                <div>
                  <label className="input-label">App Secret</label>
                  <input className="input-field" type="password" placeholder="your-app-secret" value={s.dolbySecret} onChange={e => save({ dolbySecret: e.target.value })} />
                </div>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
                <button className="btn-ghost" style={{ fontSize:9, padding:'6px 14px' }} onClick={testDolby} disabled={testing.dolby}>
                  {testing.dolby ? '接続テスト中...' : '接続テスト'}
                </button>
                <span style={{ fontFamily:'DM Mono,monospace', fontSize:9, color:'var(--t3)' }}>
                  取得先: dashboard.dolby.io → Applications → API Keys
                </span>
              </div>
              <div>
                <label className="input-label">ノイズ除去強度</label>
                <div className="radio-group">
                  {(['low','medium','high'] as const).map(v => (
                    <div key={v} className={`radio-opt${s.noiseReduction===v?' selected':''}`} onClick={() => save({ noiseReduction: v })}>
                      <div className="radio-dot" />
                      <div>
                        <div className="radio-text">{v==='low'?'弱':v==='medium'?'中':'強'}</div>
                        <div className="radio-sub">{v==='low'?'自然な音を保ちつつ軽くノイズ除去':v==='medium'?'授業・会議録音に推奨':'ホワイトノイズが強い環境向け'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Whisper */}
        <div className="card" style={{ marginBottom:16 }}>
          <SectionTitle title="文字起こしエンジン" />
          <div className="radio-group" style={{ marginBottom:16 }}>
            {([
              { v:'groq', label:'Groq Whisper', sub:'無料枠あり・高速・推奨。api.groq.com でキー発行（クレカ不要）' },
              { v:'openai', label:'OpenAI Whisper', sub:'$0.006/分。高品質。platform.openai.com でキー発行' },
            ] as const).map(opt => (
              <div key={opt.v} className={`radio-opt${s.whisperEngine===opt.v?' selected':''}`} onClick={() => save({ whisperEngine: opt.v })}>
                <div className="radio-dot" />
                <div>
                  <div className="radio-text">{opt.label}</div>
                  <div className="radio-sub">{opt.sub}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginBottom:12 }}>
            <label className="input-label">{s.whisperEngine === 'groq' ? 'Groq' : 'OpenAI'} APIキー</label>
            <input className="input-field" type="password" placeholder="sk-..." value={s.whisperKey} onChange={e => save({ whisperKey: e.target.value })} />
          </div>
          <div style={{ display:'flex', gap:10, marginBottom:16 }}>
            <button className="btn-ghost" style={{ fontSize:9, padding:'6px 14px' }} onClick={testWhisper} disabled={testing.whisper}>
              {testing.whisper ? '接続テスト中...' : '接続テスト'}
            </button>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div>
              <label className="input-label">言語</label>
              <select className="select-field" value={s.language} onChange={e => save({ language: e.target.value })}>
                <option value="ja">日本語</option>
                <option value="en">English</option>
                <option value="auto">自動検出</option>
                <option value="zh">中文</option>
                <option value="ko">한국어</option>
              </select>
            </div>
            <div>
              <label className="input-label">チャンク長（分）</label>
              <select className="select-field" value={s.chunkMinutes} onChange={e => save({ chunkMinutes: Number(e.target.value) })}>
                <option value={3}>3分（高精度）</option>
                <option value={5}>5分（推奨）</option>
                <option value={10}>10分（高速）</option>
              </select>
            </div>
          </div>
        </div>

        {/* Advanced */}
        <div className="card" style={{ marginBottom:16 }}>
          <SectionTitle title="詳細設定" />
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div className="toggle-wrap">
              <Toggle value={s.removeFiller} onChange={v => save({ removeFiller: v })} />
              <div>
                <div className="toggle-label">フィラーワード除去</div>
                <div style={{ fontSize:11, color:'var(--t3)' }}>えー、あのー、えっと、などを自動除去</div>
              </div>
            </div>
            <div className="toggle-wrap">
              <Toggle value={s.nightMode} onChange={v => save({ nightMode: v })} />
              <div>
                <div className="toggle-label">🌙 夜間モード（高精度）</div>
                <div style={{ fontSize:11, color:'var(--t3)' }}>各チャンクを2回処理して精度UP。処理時間が2倍になります</div>
              </div>
            </div>
            <div>
              <label className="input-label">カスタム語彙（専門用語・人名をカンマ区切りで）</label>
              <input className="input-field" placeholder="例: 微分方程式, 量子力学, 田中教授" value={s.customVocab} onChange={e => save({ customVocab: e.target.value })} />
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="card" style={{ marginBottom:16 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
            <SectionTitle title="AI 要約" />
            <div className="toggle-wrap">
              <Toggle value={s.enableSummary} onChange={v => save({ enableSummary: v })} />
              <span className="toggle-label" style={{ fontSize:11 }}>{s.enableSummary ? '有効' : '無効'}</span>
            </div>
          </div>
          {s.enableSummary && (
            <>
              <div style={{ marginBottom:16 }}>
                <label className="input-label">OpenAI APIキー（要約に使用）</label>
                <input className="input-field" type="password" placeholder="sk-..." value={s.openaiKey} onChange={e => save({ openaiKey: e.target.value })} />
                <div style={{ fontFamily:'DM Mono,monospace', fontSize:9, color:'var(--t3)', marginTop:6 }}>
                  GPT-4o-miniを使用。90分録音で約$0.01〜0.02。
                </div>
              </div>
              <div>
                <label className="input-label">要約モード</label>
                <div className="radio-group">
                  {([
                    { v:'lecture', label:'授業・講義', sub:'要点・キーワード・試験ポイント・次回引き継ぎ' },
                    { v:'meeting', label:'会議・ミーティング', sub:'サマリー・決定事項・アクションアイテム' },
                    { v:'care', label:'介護・ケア記録', sub:'本日の様子・重要記録・申し送り事項' },
                    { v:'general', label:'汎用', sub:'内容の要点・重要ポイント・振り返り' },
                  ] as const).map(opt => (
                    <div key={opt.v} className={`radio-opt${s.summaryMode===opt.v?' selected':''}`} onClick={() => save({ summaryMode: opt.v })}>
                      <div className="radio-dot" />
                      <div>
                        <div className="radio-text">{opt.label}</div>
                        <div className="radio-sub">{opt.sub}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Export/Import */}
        <div className="card" style={{ marginBottom:16 }}>
          <SectionTitle title="設定のエクスポート / インポート" />
          <div style={{ display:'flex', gap:10 }}>
            <button className="btn-ghost" onClick={exportSettings}>↓ エクスポート（APIキー除く）</button>
            <label className="btn-ghost" style={{ cursor:'pointer' }}>
              ↑ インポート
              <input type="file" accept=".json" style={{ display:'none' }} onChange={importSettings} />
            </label>
          </div>
        </div>

        <div style={{ display:'flex', gap:10, marginTop:24 }}>
          <a href="/" className="btn-primary">← ホームへ戻る</a>
        </div>
      </main>

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </>
  )
}
