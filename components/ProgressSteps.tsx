'use client'

export type StepStatus = 'pending' | 'active' | 'done' | 'error'

export interface Step {
  id: string
  name: string
  desc?: string
  status: StepStatus
  timeMs?: number
}

interface Props { steps: Step[] }

export default function ProgressSteps({ steps }: Props) {
  return (
    <div className="step-list">
      {steps.map(step => (
        <div key={step.id} className="step-item">
          <div className={`step-dot ${step.status}`}>
            {step.status === 'active' ? <span className="spin">◌</span>
              : step.status === 'done' ? '✓'
              : step.status === 'error' ? '✕'
              : '○'}
          </div>
          <div style={{ flex: 1 }}>
            <div className="step-name">{step.name}</div>
            {step.desc && <div className="step-desc">{step.desc}</div>}
            {step.timeMs !== undefined && step.status === 'done' && (
              <div className="step-time">{(step.timeMs / 1000).toFixed(1)}s</div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
