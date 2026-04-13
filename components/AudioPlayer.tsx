'use client'
import { useRef, useState, useEffect } from 'react'
import { formatDuration } from '@/lib/db'

interface Props {
  src: string
  label?: string
}

export default function AudioPlayer({ src, label }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    const onTime = () => setCurrentTime(a.currentTime)
    const onMeta = () => setDuration(a.duration)
    const onEnd = () => setPlaying(false)
    a.addEventListener('timeupdate', onTime)
    a.addEventListener('loadedmetadata', onMeta)
    a.addEventListener('ended', onEnd)
    return () => {
      a.removeEventListener('timeupdate', onTime)
      a.removeEventListener('loadedmetadata', onMeta)
      a.removeEventListener('ended', onEnd)
    }
  }, [src])

  const toggle = () => {
    if (!audioRef.current) return
    if (playing) { audioRef.current.pause(); setPlaying(false) }
    else { audioRef.current.play(); setPlaying(true) }
  }

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = (e.clientX - rect.left) / rect.width
    audioRef.current.currentTime = pct * duration
  }

  const pct = duration ? (currentTime / duration) * 100 : 0

  return (
    <div>
      {label && (
        <div style={{ fontFamily:'DM Mono,monospace', fontSize:9, letterSpacing:2, color:'var(--t3)', textTransform:'uppercase', marginBottom:8 }}>
          {label}
        </div>
      )}
      <audio ref={audioRef} src={src} preload="metadata" />
      <div className="player-bar">
        <button className="player-btn" onClick={toggle}>{playing ? '⏸' : '▶'}</button>
        <span className="player-time">{formatDuration(currentTime)}</span>
        <div className="player-progress" onClick={seek}>
          <div className="player-progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="player-time">{formatDuration(duration)}</span>
        <a
          href={src}
          download
          style={{ fontFamily:'DM Mono,monospace', fontSize:9, letterSpacing:1.5, color:'var(--t3)', textTransform:'uppercase', textDecoration:'none', marginLeft:4 }}
        >
          ↓
        </a>
      </div>
    </div>
  )
}
