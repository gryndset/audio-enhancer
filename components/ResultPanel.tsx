"use client";

import { Download, Archive } from "lucide-react";
import AudioPlayer from "./AudioPlayer";
import TranscriptViewer from "./TranscriptViewer";
import JSZip from "jszip";

interface Props {
  enhancedBlob: Blob | null;
  transcript: string | null;
  outputFormat: "mp3" | "wav";
  fileName: string;
}

// FIX #9: Firefox対応 - DOMに appendChild してから click する
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

export default function ResultPanel({ enhancedBlob, transcript, outputFormat, fileName }: Props) {
  const baseName = fileName.replace(/\.[^.]+$/, "");

  async function downloadZip() {
    const zip = new JSZip();
    if (enhancedBlob) {
      zip.file(`${baseName}_enhanced.${outputFormat}`, enhancedBlob);
    }
    if (transcript) {
      zip.file(`${baseName}_transcript.txt`, transcript);
    }
    const blob = await zip.generateAsync({ type: "blob" });
    downloadBlob(blob, `${baseName}_output.zip`);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {enhancedBlob && (
        <div>
          <AudioPlayer blob={enhancedBlob} label="強化済み音声" />
          <div style={{ marginTop: "0.75rem" }}>
            <button
              className="btn-secondary"
              style={{ width: "100%", justifyContent: "center" }}
              onClick={() => downloadBlob(enhancedBlob, `${baseName}_enhanced.${outputFormat}`)}
            >
              <Download size={16} />
              音声ファイルをダウンロード (.{outputFormat})
            </button>
          </div>
        </div>
      )}

      {transcript && (
        <div>
          <TranscriptViewer text={transcript} />
          <div style={{ marginTop: "0.75rem" }}>
            <button
              className="btn-secondary"
              style={{ width: "100%", justifyContent: "center" }}
              onClick={() => {
                const blob = new Blob([transcript], { type: "text/plain" });
                downloadBlob(blob, `${baseName}_transcript.txt`);
              }}
            >
              <Download size={16} />
              テキストをダウンロード (.txt)
            </button>
          </div>
        </div>
      )}

      {(enhancedBlob || transcript) && (
        <button
          className="btn-primary"
          style={{ width: "100%", justifyContent: "center" }}
          onClick={downloadZip}
        >
          <Archive size={16} />
          まとめてZIPでダウンロード
        </button>
      )}
    </div>
  );
}
