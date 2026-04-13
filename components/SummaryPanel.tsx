'use client'
import { SummaryResult, SummaryMode, summaryToText } from '@/lib/summarize'

interface Props {
  summary: SummaryResult
  mode: SummaryMode
}

const modeLabels: Record<SummaryMode, { ip: string; co: string }> = {
  lecture: { ip: '試験ポイント', co: '次回への引き継ぎ' },
  meeting: { ip: '決定事項・アクションアイテム', co: '申し送り事項' },
  care: { ip: '重要記録', co: '申し送り事項' },
  general: { ip: '重要ポイント', co: 'メモ・引き継ぎ' },
}

export default function SummaryPanel({ summary, mode }: Props) {
  const labels = modeLabels[mode]

  const downloadTxt = () => {
    const text = summaryToText(summary, mode)
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'summary.txt'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <div className="s-tag" style={{ margin:0 }}>AI サマリー</div>
        <button className="btn-ghost" style={{ fontSize:9, padding:'6px 12px' }} onClick={downloadTxt}>↓ TXT</button>
      </div>
      <div className="summary-box">
        {summary.highlights && (
          <div className="summary-section">
            <div className="summary-label">概要</div>
            <div className="summary-content">{summary.highlights}</div>
          </div>
        )}
        {summary.keywords.length > 0 && (
          <div className="summary-section">
            <div className="summary-label">キーワード</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
              {summary.keywords.map((kw, i) => (
                <span key={i} style={{ fontFamily:'DM Mono,monospace', fontSize:10, color:'var(--pu)', border:'1px solid rgba(139,124,248,.25)', padding:'3px 8px' }}>{kw}</span>
              ))}
            </div>
          </div>
        )}
        {summary.importantPoints.length > 0 && (
          <div className="summary-section">
            <div className="summary-label">{labels.ip}</div>
            <ul style={{ listStyle:'none', display:'flex', flexDirection:'column', gap:6 }}>
              {summary.importantPoints.map((p, i) => (
                <li key={i} style={{ display:'flex', gap:8, fontSize:13, color:'var(--tx)', lineHeight:1.7 }}>
                  <span style={{ color:'var(--am)', flexShrink:0 }}>·</span>
                  {p}
                </li>
              ))}
            </ul>
          </div>
        )}
        {summary.review && (
          <div className="summary-section">
            <div className="summary-label">振り返り</div>
            <div className="summary-content">{summary.review}</div>
          </div>
        )}
        {summary.carryover && (
          <div className="summary-section">
            <div className="summary-label">{labels.co}</div>
            <div className="summary-content" style={{ color:'var(--cy)' }}>{summary.carryover}</div>
          </div>
        )}
      </div>
    </div>
  )
}
