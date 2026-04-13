"use client";

import { Theme } from "@/hooks/useTheme";

interface Props {
  theme: Theme;
  onChange: (t: Theme) => void;
}

const themes: { id: Theme; label: string; emoji: string }[] = [
  { id: "clean", label: "Clean", emoji: "🧊" },
  { id: "kawaii", label: "Kawaii", emoji: "🌸" },
  { id: "hiphop", label: "HipHop", emoji: "🎤" },
];

export default function ThemeSwitcher({ theme, onChange }: Props) {
  return (
    <div style={{ display: "flex", gap: "0.375rem" }}>
      {themes.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          title={t.label}
          style={{
            padding: "0.375rem 0.625rem",
            borderRadius: "var(--radius-btn)",
            border: theme === t.id
              ? "1px solid var(--accent-primary)"
              : "1px solid var(--border)",
            background: theme === t.id ? "var(--accent-primary)" : "transparent",
            color: theme === t.id ? "var(--button-text)" : "var(--text-secondary)",
            cursor: "pointer",
            fontSize: "0.8rem",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: "0.25rem",
            transition: "all 0.15s ease",
          }}
        >
          <span>{t.emoji}</span>
          <span style={{ display: "none" }}>{t.label}</span>
        </button>
      ))}
    </div>
  );
}
