"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useToastContainer } from "@/hooks/useToast";
import { CheckCircle, XCircle, Info } from "lucide-react";

const icons = {
  success: <CheckCircle size={16} color="#22c55e" />,
  error: <XCircle size={16} color="#ef4444" />,
  info: <Info size={16} color="var(--accent-primary)" />,
};

export default function ToastContainer() {
  const toasts = useToastContainer();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;

  const root = document.getElementById("toast-root");
  if (!root) return null;

  return createPortal(
    <>
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.625rem",
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-card)",
            boxShadow: "var(--shadow-card)",
            padding: "0.75rem 1rem",
            fontSize: "0.875rem",
            pointerEvents: "auto",
            animation: "slideIn 0.2s ease",
            maxWidth: 320,
            color: "var(--text-primary)",
          }}
        >
          {icons[t.type]}
          <span>{t.message}</span>
        </div>
      ))}
      <style>{`@keyframes slideIn { from { transform: translateY(8px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
    </>,
    root
  );
}
