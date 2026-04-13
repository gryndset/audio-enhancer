'use client'
import { useRef, useState } from 'react'

const ACCEPTED = ['audio/mpeg','audio/mp4','audio/x-m4a','audio/aac','audio/wav','audio/ogg','audio/webm','video/mp4','video/quicktime','video/webm']
const ACCEPT_EXT = '.mp3,.m4a,.aac,.wav,.ogg,.webm,.mp4,.mov'

interface Props {
  onFiles: (files: File[]) => void
  disabled?: boolean
}

export default function DropZone({ onFiles, disabled }: Props) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFiles = (files: FileList | null) => {
    if (!files) return
    const valid = Array.from(files).filter(f => {
      const ok = ACCEPTED.includes(f.type) || ACCEPT_EXT.split(',').some(ext => f.name.toLowerCase().endsWith(ext.replace('.', '')))
      return ok && f.size < 2 * 1024 * 1024 * 1024 // 2GB limit
    })
    if (valid.length) onFiles(valid)
  }

  return (
    <div
      className={`dropzone${dragging ? ' drag-over' : ''}${disabled ? ' opacity-40 pointer-events-none' : ''}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files) }}
    >
      <div className="dropzone-icon">🎙</div>
      <div className="dropzone-title">音声・動画ファイルをドロップ</div>
      <div className="dropzone-sub" style={{ marginTop: 8 }}>
        MP3 · M4A · WAV · AAC · OGG · MP4 · MOV · WebM
      </div>
      <div className="dropzone-sub" style={{ marginTop: 6, fontSize: 9 }}>複数ファイル同時対応</div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT_EXT}
        style={{ display: 'none' }}
        onChange={e => handleFiles(e.target.files)}
      />
    </div>
  )
}
