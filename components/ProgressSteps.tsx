"use client";

export interface Step {
  label: string;
  progress: number; // 0-100
  status: "waiting" | "running" | "done" | "error";
  detail?: string;
}

interface Props {
  steps: Step[];
}

const statusIcon = (s: Step["status"]) => {
  if (s === "done") return "✓";
  if (s === "error") return "✕";
  if (s === "running") return "⟳";
  return "·";
};

export default function ProgressSteps({ steps }: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {steps.map((step, i) => (
        <div key={i}>
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: "0.375rem",
            fontSize: "0.85rem",
          }}>
            <span style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              fontWeight: 500,
              color: step.status === "waiting" ? "var(--text-secondary)" : "var(--text-primary)",
            }}>
              <span style={{
                display: "inline-flex",
                width: 20, height: 20,
                borderRadius: "50%",
                background: step.status === "done"
                  ? "var(--accent-primary)"
                  : step.status === "error"
                  ? "#ef4444"
                  : step.status === "running"
                  ? "var(--accent-secondary)"
                  : "var(--border)",
                color: step.status === "waiting" ? "var(--text-secondary)" : "var(--button-text)",
                fontSize: "0.7rem",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                animation: step.status === "running" ? "spin 1s linear infinite" : "none",
              }}>
                {statusIcon(step.status)}
              </span>
              <span>Step {i + 1}/{steps.length}　{step.label}</span>
            </span>
            <span style={{ color: "var(--text-secondary)", fontSize: "0.8rem" }}>
              {step.progress}%
            </span>
          </div>
          <div className="progress-track">
            <div
              className="progress-fill"
              style={{ width: `${step.progress}%` }}
            />
          </div>
          {step.detail && (
            <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
              {step.detail}
            </p>
          )}
        </div>
      ))}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
