"use client";

import { useState } from "react";
import { Play, FileText, Download, Trash2, Archive } from "lucide-react";
import { HistoryItem } from "@/lib/db";
import AudioPlayer from "./AudioPlayer";
import TranscriptViewer from "./TranscriptViewer";
import JSZip from "jszip";

interface Props {
  item: HistoryItem & { enhancedBlob: Blob | null };
  onDelete: (id: string) => void;
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleString("ja-JP", {
    month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// FIX #9: Firefox対応
function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function HistoryCard({ item, onDelete }: Props) {
  const [showPlayer, setShowPlayer] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const baseName = item.fileName.replace(/\.[^.]+$/, "");

  async function downloadZip() {
    const zip = new JSZip();
    if (item.enhancedBlob) zip.file(`${baseName}_enhanced.${item.outputFormat}`, item.enhancedBlob);
    if (item.transcript) zip.file(`${baseName}_transcript.txt`, item.transcript);
    const blob = await zip.generateAsync({ type: "blob" });
    downloadBlob(blob, `${baseName}_output.zip`);
  }

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
        <div>
          <p style={{ fontWeight: 600, marginBottom: "0.125rem", wordBreak: "break-all" }}>{item.fileName}</p>
          <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
            {formatDate(item.processedAt)} · {formatSize(item.fileSize)} ·{" "}
            <span style={{
              color: item.status === "success" ? "var(--accent-primary)" : "#ef4444",
              fontWeight: 500,
            }}>
              {item.status === "success" ? "成功" : "エラー"}
            </span>
          </p>
        </div>
        <button className="btn-icon" onClick={() => onDelete(item.id)} title="削除">
          <Trash2 size={14} />
        </button>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {item.enhancedBlob && (
          <button className="btn-secondary" style={{ fontSize: "0.8rem", padding: "0.375rem 0.75rem" }}
            onClick={() => { setShowPlayer(!showPlayer); setShowTranscript(false); }}>
            <Play size={13} /> 再生
          </button>
        )}
        {item.transcript && (
          <button className="btn-secondary" style={{ fontSize: "0.8rem", padding: "0.375rem 0.75rem" }}
            onClick={() => { setShowTranscript(!showTranscript); setShowPlayer(false); }}>
            <FileText size={13} /> テキスト
          </button>
        )}
        {item.enhancedBlob && (
          <button className="btn-secondary" style={{ fontSize: "0.8rem", padding: "0.375rem 0.75rem" }}
            onClick={() => downloadBlob(item.enhancedBlob!, `${baseName}_enhanced.${item.outputFormat}`)}>
            <Download size={13} /> 音声
          </button>
        )}
        {item.transcript && (
          <button className="btn-secondary" style={{ fontSize: "0.8rem", padding: "0.375rem 0.75rem" }}
            onClick={() => {
              const blob = new Blob([item.transcript!], { type: "text/plain" });
              downloadBlob(blob, `${baseName}_transcript.txt`);
            }}>
            <Download size={13} /> テキスト
          </button>
        )}
        {(item.enhancedBlob && item.transcript) && (
          <button className="btn-secondary" style={{ fontSize: "0.8rem", padding: "0.375rem 0.75rem" }}
            onClick={downloadZip}>
            <Archive size={13} /> ZIP
          </button>
        )}
      </div>

      {showPlayer && item.enhancedBlob && (
        <div style={{ marginTop: "1rem" }}>
          <AudioPlayer blob={item.enhancedBlob} />
        </div>
      )}
      {showTranscript && item.transcript && (
        <div style={{ marginTop: "1rem" }}>
          <TranscriptViewer text={item.transcript} />
        </div>
      )}
    </div>
  );
}
