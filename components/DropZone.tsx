"use client";

import { useRef, useState } from "react";
import { Music, Plus } from "lucide-react";
import { showToast } from "@/hooks/useToast";

const ACCEPTED = ["audio/mpeg", "audio/mp4", "audio/wav", "audio/ogg", "audio/flac", "audio/x-m4a", "audio/aac"];
const ACCEPTED_EXT = ["mp3", "m4a", "wav", "ogg", "flac", "aac"];
const MAX_SIZE = 500 * 1024 * 1024;

interface Props {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  multiple?: boolean;
}

function validateFile(file: File): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ACCEPTED.includes(file.type) && !ACCEPTED_EXT.includes(ext)) {
    return `${file.name}：対応外の形式です`;
  }
  if (file.size > MAX_SIZE) return `${file.name}：500MB を超えています`;
  return null;
}

export default function DropZone({ onFiles, disabled, multiple = false }: Props) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFiles(fileList: FileList) {
    const valid: File[] = [];
    const errors: string[] = [];
    Array.from(fileList).forEach((f) => {
      const err = validateFile(f);
      if (err) errors.push(err);
      else valid.push(f);
    });
    // FIX #6: alert() → showToast() に統一
    if (errors.length > 0) {
      errors.forEach((e) => showToast(e, "error", 5000));
    }
    if (valid.length > 0) onFiles(valid);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
  }

  return (
    <div
      className={`drop-zone ${dragging ? "dragging" : ""}`}
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      style={{ opacity: disabled ? 0.5 : 1, cursor: disabled ? "not-allowed" : "pointer" }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".mp3,.m4a,.wav,.ogg,.flac,.aac"
        multiple={multiple}
        style={{ display: "none" }}
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
        <div style={{
          width: 56, height: 56,
          borderRadius: "var(--radius-card)",
          background: "var(--bg-secondary)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {dragging ? <Music size={28} color="var(--accent-primary)" /> : <Plus size={28} color="var(--accent-primary)" />}
        </div>
        <div style={{ textAlign: "center" }}>
          <p style={{ fontWeight: 600, marginBottom: "0.25rem" }}>
            {dragging ? "ドロップして追加" : "ここにドロップ、またはクリックして選択"}
          </p>
          <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
            対応形式：m4a / mp3 / wav / ogg / flac　最大 500MB{multiple ? "・複数ファイル可" : ""}
          </p>
        </div>
      </div>
    </div>
  );
}
