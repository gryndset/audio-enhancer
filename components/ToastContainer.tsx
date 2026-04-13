'use client'
import { Toast } from '@/hooks/useToast'

interface Props {
  toasts: Toast[]
  onRemove: (id: string) => void
}

const icons: Record<string, string> = {
  success: '✓',
  error: '✕',
  info: '·',
}

export default function ToastContainer({ toasts, onRemove }: Props) {
  if (!toasts.length) return null
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          <span style={{ fontFamily:'DM Mono,monospace', fontSize:13, color: t.type==='success'?'var(--gn)':t.type==='error'?'var(--rd)':'var(--cy)' }}>
            {icons[t.type]}
          </span>
          <span className="toast-msg">{t.message}</span>
          <button className="toast-close" onClick={() => onRemove(t.id)}>×</button>
        </div>
      ))}
    </div>
  )
}
