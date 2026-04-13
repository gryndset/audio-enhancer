"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

interface Props {
  text: string;
}

export default function TranscriptViewer({ text }: Props) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
        <p style={{ fontSize: "0.8rem", fontWeight: 500, color: "var(--text-secondary)" }}>
          文字起こし結果
        </p>
        <button className="btn-icon" onClick={copy} title="コピー">
          {copied ? <Check size={14} color="var(--accent-primary)" /> : <Copy size={14} />}
        </button>
      </div>
      <div style={{
        background: "var(--bg-secondary)",
        borderRadius: "var(--radius-btn)",
        border: "1px solid var(--border)",
        padding: "1rem",
        maxHeight: 280,
        overflowY: "auto",
        fontSize: "0.875rem",
        lineHeight: 1.75,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        color: "var(--text-primary)",
      }}>
        {text || <span style={{ color: "var(--text-secondary)" }}>（テキストなし）</span>}
      </div>
    </div>
  );
}
