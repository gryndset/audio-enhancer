'use client'
import { useState, useRef, useEffect } from 'react'
import { formatDuration } from '@/lib/db'

interface Segment { start: number; end: number; text: string }

interface Props {
  segments: Segment[]
  onSeek?: (time: number) => void
  editable?: boolean
  onEdit?: (segments: Segment[]) => void
}

function toSRT(segments: Segment[]): string {
  return segments.map((seg, i) => {
    const fmt = (s: number) => {
      const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = Math.floor(s%60), ms = Math.round((s%1)*1000)
      return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')},${String(ms).padStart(3,'0')}`
    }
    return `${i+1}\n${fmt(seg.start)} --> ${fmt(seg.end)}\n${seg.text}\n`
  }).join('\n')
}

function toVTT(segments: Segment[]): string {
  const fmt = (s: number) => {
    const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = Math.floor(s%60), ms = Math.round((s%1)*1000)
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}.${String(ms).padStart(3,'0')}`
  }
  return 'WEBVTT\n\n' + segments.map((seg, i) =>
    `${i+1}\n${fmt(seg.start)} --> ${fmt(seg.end)}\n${seg.text}\n`
  ).join('\n')
}

export default function TranscriptViewer({ segments, onSeek, editable, onEdit }: Props) {
  const [query, setQuery] = useState('')
  const [localSegs, setLocalSegs] = useState(segments)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setLocalSegs(segments) }, [segments])

  const filtered = query
    ? localSegs.filter(s => s.text.toLowerCase().includes(query.toLowerCase()))
    : localSegs

  const download = (content: string, name: string, type: string) => {
    const blob = new Blob([content], { type })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = name; a.click()
    URL.revokeObjectURL(url)
  }

  const handleTextEdit = (idx: number, newText: string) => {
    const updated = localSegs.map((s, i) => i === idx ? { ...s, text: newText } : s)
    setLocalSegs(updated)
    onEdit?.(updated)
  }

  const fullText = localSegs.map(s => s.text).join('\n')

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12, flexWrap:'wrap' }}>
        <input
          className="transcript-search"
          style={{ flex:1, minWidth:180 }}
          placeholder="テキストを検索..."
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <div style={{ display:'flex', gap:6, flexShrink:0 }}>
          <button className="btn-ghost" style={{ fontSize:9, padding:'6px 12px' }}
            onClick={() => download(fullText, 'transcript.txt', 'text/plain')}>TXT</button>
          <button className="btn-ghost" style={{ fontSize:9, padding:'6px 12px' }}
            onClick={() => download(toSRT(localSegs), 'transcript.srt', 'text/plain')}>SRT</button>
          <button className="btn-ghost" style={{ fontSize:9, padding:'6px 12px' }}
            onClick={() => download(toVTT(localSegs), 'transcript.vtt', 'text/vtt')}>VTT</button>
        </div>
      </div>

      <div className="transcript-box" ref={containerRef}>
        {filtered.length === 0 && (
          <div style={{ color:'var(--t3)', fontFamily:'DM Mono,monospace', fontSize:11, textAlign:'center', padding:'20px 0' }}>
            {query ? '一致なし' : 'テキストなし'}
          </div>
        )}
        {filtered.map((seg, i) => {
          const highlighted = query && seg.text.toLowerCase().includes(query.toLowerCase())
          return (
            <div key={i} className="transcript-line" onClick={() => onSeek?.(seg.start)} style={{ cursor: onSeek ? 'pointer' : 'default' }}>
              <span className="transcript-time">{formatDuration(seg.start)}</span>
              {editable ? (
                <textarea
                  className="transcript-text"
                  style={{ background:'transparent', border:'none', outline:'none', color:'var(--tx)', fontFamily:'inherit', fontSize:'inherit', lineHeight:'inherit', resize:'vertical', width:'100%' }}
                  value={seg.text}
                  onChange={e => handleTextEdit(localSegs.indexOf(seg), e.target.value)}
                />
              ) : (
                <span className={`transcript-text${highlighted ? ' highlight' : ''}`}>{seg.text}</span>
              )}
            </div>
          )
        })}
      </div>
      <div style={{ marginTop:6, fontFamily:'DM Mono,monospace', fontSize:9, color:'var(--t3)' }}>
        {localSegs.length} セグメント
        {query && ` · 検索結果 ${filtered.length} 件`}
      </div>
    </div>
  )
}
