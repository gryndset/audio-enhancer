"use client";

import { useEffect, useRef } from "react";

interface Props {
  blob: Blob;
  label?: string;
}

export default function AudioPlayer({ blob, label }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(blob);
    urlRef.current = url;
    if (audioRef.current) audioRef.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [blob]);

  return (
    <div>
      {label && (
        <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "0.5rem", fontWeight: 500 }}>
          {label}
        </p>
      )}
      <audio
        ref={audioRef}
        controls
        style={{
          width: "100%",
          borderRadius: "var(--radius-btn)",
          accentColor: "var(--accent-primary)",
        }}
      />
    </div>
  );
}
