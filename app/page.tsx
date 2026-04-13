"use client";

import { useState, useCallback, useRef } from "react";
import Link from "next/link";
import {
  Settings, History, Sparkles, Music2, X, Plus, ChevronDown, ChevronUp,
} from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { showToast } from "@/hooks/useToast";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import ToastContainer from "@/components/ToastContainer";
import DropZone from "@/components/DropZone";
import ProgressSteps, { Step } from "@/components/ProgressSteps";
import ResultPanel from "@/components/ResultPanel";
import { convertAudio, splitAudio, mergeAudio, WHISPER_LIMIT_BYTES, CHUNK_MINUTES } from "@/lib/ffmpeg";
// FIX #4: enhanceAudio のシグネチャが (blob, appKey, appSecret, ...) に変更
import { enhanceAudio } from "@/lib/dolby";
import { transcribeAudio, segmentsToText, TranscriptSegment } from "@/lib/whisper";
import { saveHistory } from "@/lib/db";

type OutputFormat = "mp3" | "wav";
type ItemStatus = "queued" | "processing" | "done" | "error" | "cancelled";

interface QueueItem {
  id: string;
  file: File;
  status: ItemStatus;
  steps: Step[];
  error?: string;
  enhancedBlob?: Blob | null;
  transcript?: string | null;
  expanded: boolean;
}

const INITIAL_STEPS: Step[] = [
  { label: "変換中", progress: 0, status: "waiting" },
  { label: "音質強化中", progress: 0, status: "waiting" },
  { label: "文字起こし中", progress: 0, status: "waiting" },
];

function getApiKeys() {
  return {
    dolbyAppKey: typeof window !== "undefined" ? localStorage.getItem("dolby_app_key") ?? "" : "",
    dolbyAppSecret: typeof window !== "undefined" ? localStorage.getItem("dolby_app_secret") ?? "" : "",
    openai: typeof window !== "undefined" ? localStorage.getItem("openai_api_key") ?? "" : "",
  };
}

function makeId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export default function Home() {
  const { theme, changeTheme } = useTheme();

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("mp3");
  const [withTranscript, setWithTranscript] = useState(true);
  const [withTimestamps, setWithTimestamps] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  // FIX #5: キャンセル中のUX表示用フラグ
  const [isCancelling, setIsCancelling] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  function updateItem(id: string, patch: Partial<QueueItem>) {
    setQueue((prev) => prev.map((q) => q.id === id ? { ...q, ...patch } : q));
  }

  function updateStep(id: string, stepIndex: number, partial: Partial<Step>) {
    setQueue((prev) => prev.map((q) => {
      if (q.id !== id) return q;
      const steps = q.steps.map((s, i) => i === stepIndex ? { ...s, ...partial } : s);
      return { ...q, steps };
    }));
  }

  const addFiles = useCallback((files: File[]) => {
    const newItems: QueueItem[] = files.map((file) => ({
      id: makeId(),
      file,
      status: "queued",
      steps: INITIAL_STEPS,
      expanded: false,
    }));
    setQueue((prev) => [...prev, ...newItems]);
  }, []);

  function removeItem(id: string) {
    setQueue((prev) => prev.filter((q) => q.id !== id));
  }

  function toggleExpand(id: string) {
    setQueue((prev) => prev.map((q) => q.id === id ? { ...q, expanded: !q.expanded } : q));
  }

  function clearDone() {
    setQueue((prev) => prev.filter((q) => q.status === "queued" || q.status === "processing"));
  }

  async function processItem(item: QueueItem, signal: AbortSignal) {
    const keys = getApiKeys();

    updateItem(item.id, {
      status: "processing",
      expanded: true,
      steps: [
        { label: "変換中", progress: 0, status: "running" },
        { label: "音質強化中", progress: 0, status: "waiting" },
        { label: withTranscript ? "文字起こし中" : "文字起こし（スキップ）", progress: withTranscript ? 0 : 100, status: withTranscript ? "waiting" : "done" },
      ],
    });

    // STEP 1: Convert
    updateStep(item.id, 0, { status: "running", progress: 0, detail: "ffmpeg.wasm を初期化中..." });

    const convertedBlob = await convertAudio({
      file: item.file,
      outputFormat,
      onProgress: (p) => updateStep(item.id, 0, { progress: p, detail: `変換中... ${p}%` }),
      signal,
    });

    const needsSplit = convertedBlob.size > WHISPER_LIMIT_BYTES;
    let chunks: Blob[] = [convertedBlob];

    if (needsSplit) {
      updateStep(item.id, 0, { progress: 90, detail: "分割処理中..." });
      chunks = await splitAudio(convertedBlob, outputFormat, CHUNK_MINUTES, undefined, signal);
      updateStep(item.id, 0, { progress: 100, detail: `${chunks.length}チャンクに分割完了` });
    }

    updateStep(item.id, 0, { status: "done", progress: 100, detail: needsSplit ? `${chunks.length}チャンクに分割` : "変換完了" });

    // STEP 2: Enhance — FIX #4: appKey + appSecret を渡す
    updateStep(item.id, 1, { status: "running", progress: 0, detail: "Dolby.io API へ送信中..." });

    const enhancedChunks: Blob[] = [];
    for (let i = 0; i < chunks.length; i++) {
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
      const label = chunks.length > 1 ? `チャンク ${i + 1}/${chunks.length} を処理中...` : "処理中...";
      updateStep(item.id, 1, { detail: label });
      const enhanced = await enhanceAudio(
        chunks[i],
        keys.dolbyAppKey,
        keys.dolbyAppSecret,
        (p) => {
          const overall = Math.round(((i + p / 100) / chunks.length) * 100);
          updateStep(item.id, 1, { progress: overall, detail: label });
        },
        signal
      );
      enhancedChunks.push(enhanced);
    }

    const finalEnhanced = await mergeAudio(enhancedChunks, outputFormat);
    updateStep(item.id, 1, { status: "done", progress: 100, detail: "音質強化完了" });

    // STEP 3: Transcribe
    let finalTranscript: string | null = null;

    if (withTranscript) {
      updateStep(item.id, 2, { status: "running", progress: 0, detail: "Whisper API へ送信中..." });

      const allSegments: TranscriptSegment[] = [];
      let allText = "";
      let offsetSeconds = 0;
      const chunkDurationSec = CHUNK_MINUTES * 60;

      for (let i = 0; i < enhancedChunks.length; i++) {
        if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
        const label = enhancedChunks.length > 1 ? `チャンク ${i + 1}/${enhancedChunks.length} を文字起こし中...` : "文字起こし中...";
        updateStep(item.id, 2, { detail: label, progress: Math.round((i / enhancedChunks.length) * 100) });

        const result = await transcribeAudio(
          enhancedChunks[i],
          keys.openai,
          withTimestamps,
          `chunk_${i}.${outputFormat}`,
          signal
        );

        if (withTimestamps && result.segments) {
          allSegments.push(
            ...result.segments.map((s) => ({ ...s, start: s.start + offsetSeconds, end: s.end + offsetSeconds }))
          );
        } else {
          allText += (i > 0 ? "\n" : "") + result.text;
        }
        offsetSeconds += chunkDurationSec;
      }

      finalTranscript = withTimestamps && allSegments.length > 0
        ? segmentsToText(allSegments, true)
        : allText;

      updateStep(item.id, 2, { status: "done", progress: 100, detail: "文字起こし完了" });
    }

    await saveHistory({
      id: `${item.id}_saved`,
      fileName: item.file.name,
      processedAt: Date.now(),
      fileSize: item.file.size,
      enhancedBlob: finalEnhanced,
      transcript: finalTranscript,
      outputFormat,
      status: "success",
    }).catch(() => {});

    updateItem(item.id, {
      status: "done",
      enhancedBlob: finalEnhanced,
      transcript: finalTranscript,
    });
  }

  async function handleStart() {
    const keys = getApiKeys();
    if (!keys.dolbyAppKey || !keys.dolbyAppSecret) {
      showToast("Dolby.io の App Key と App Secret を設定してください", "error");
      return;
    }
    if (withTranscript && !keys.openai) {
      showToast("OpenAI APIキーが設定されていません", "error");
      return;
    }

    const pending = queue.filter((q) => q.status === "queued");
    if (pending.length === 0) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setIsRunning(true);
    setIsCancelling(false);

    for (const item of pending) {
      if (controller.signal.aborted) break;
      try {
        await processItem(item, controller.signal);
        showToast(`✓ ${item.file.name} 完了`, "success");
      } catch (err) {
        if (controller.signal.aborted) {
          setQueue((prev) => prev.map((q) =>
            q.status === "queued" || q.status === "processing"
              ? { ...q, status: "cancelled", steps: q.steps.map((s) => s.status === "running" ? { ...s, status: "error" } : s) }
              : q
          ));
          showToast("キャンセルしました", "info");
          break;
        }
        const msg = err instanceof Error ? err.message : String(err);
        updateItem(item.id, {
          status: "error",
          error: msg,
          steps: item.steps.map((s) => s.status === "running" ? { ...s, status: "error" } : s),
        });
        showToast(`✕ ${item.file.name} エラー`, "error");
      }
    }

    setIsRunning(false);
    setIsCancelling(false);
    abortRef.current = null;
  }

  // FIX #5: キャンセル時に isCancelling フラグを立てて「キャンセル中...」表示
  function handleCancel() {
    setIsCancelling(true);
    abortRef.current?.abort();
  }

  const queuedCount = queue.filter((q) => q.status === "queued").length;
  const doneCount = queue.filter((q) => q.status === "done" || q.status === "error" || q.status === "cancelled").length;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-primary)", paddingBottom: "5rem" }}>
      <ToastContainer />

      <header style={{
        background: "var(--bg-card)",
        borderBottom: "1px solid var(--border)",
        padding: "0.875rem 1.25rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        position: "sticky",
        top: 0,
        zIndex: 50,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
          <Music2 size={22} color="var(--accent-primary)" />
          <span style={{ fontWeight: 700, fontSize: "1rem" }}>
            <span className="label-upper">AudioClear</span>
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <ThemeSwitcher theme={theme} onChange={changeTheme} />
          <Link href="/history" style={{ color: "var(--text-secondary)" }}>
            <History size={20} />
          </Link>
          <Link href="/settings" style={{ color: "var(--text-secondary)" }}>
            <Settings size={20} />
          </Link>
        </div>
      </header>

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "1.5rem 1rem", display: "flex", flexDirection: "column", gap: "1rem" }}>

        <div className="card">
          <DropZone onFiles={addFiles} disabled={isRunning} multiple />
        </div>

        <div className="card">
          <p style={{ fontWeight: 600, marginBottom: "1rem", fontSize: "0.9rem" }} className="label-upper">
            オプション
          </p>

          <div style={{ marginBottom: "1rem" }}>
            <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "0.5rem", fontWeight: 500 }}>出力形式</p>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              {(["mp3", "wav"] as OutputFormat[]).map((f) => (
                <button
                  key={f}
                  onClick={() => !isRunning && setOutputFormat(f)}
                  style={{
                    flex: 1,
                    padding: "0.5rem",
                    borderRadius: "var(--radius-btn)",
                    border: outputFormat === f ? "2px solid var(--accent-primary)" : "1px solid var(--border)",
                    background: outputFormat === f ? "var(--accent-primary)" : "transparent",
                    color: outputFormat === f ? "var(--button-text)" : "var(--text-primary)",
                    fontWeight: 600,
                    fontSize: "0.85rem",
                    cursor: isRunning ? "not-allowed" : "pointer",
                    transition: "all 0.15s ease",
                    fontFamily: "var(--font)",
                  }}
                >
                  .{f}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
            <div>
              <p style={{ fontSize: "0.85rem", fontWeight: 500 }}>文字起こし</p>
              <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>OpenAI Whisper APIを使用</p>
            </div>
            <label className="toggle">
              <input type="checkbox" checked={withTranscript}
                onChange={(e) => !isRunning && setWithTranscript(e.target.checked)} disabled={isRunning} />
              <span className="toggle-slider" />
            </label>
          </div>

          {withTranscript && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <p style={{ fontSize: "0.85rem", fontWeight: 500 }}>タイムスタンプ付き</p>
                <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>[0:00] 形式で出力</p>
              </div>
              <label className="toggle">
                <input type="checkbox" checked={withTimestamps}
                  onChange={(e) => !isRunning && setWithTimestamps(e.target.checked)} disabled={isRunning} />
                <span className="toggle-slider" />
              </label>
            </div>
          )}
        </div>

        {queue.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                {queue.length}件（待機 {queuedCount}）
              </p>
              {doneCount > 0 && !isRunning && (
                <button
                  className="btn-secondary"
                  style={{ fontSize: "0.75rem", padding: "0.25rem 0.625rem" }}
                  onClick={clearDone}
                >
                  完了済みをクリア
                </button>
              )}
            </div>

            {queue.map((item) => (
              <QueueCard
                key={item.id}
                item={item}
                onRemove={removeItem}
                onToggle={toggleExpand}
                outputFormat={outputFormat}
              />
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: "0.75rem" }}>
          {isRunning ? (
            <button
              className="btn-primary"
              style={{
                flex: 1, justifyContent: "center", padding: "0.875rem", fontSize: "1rem",
                background: isCancelling ? "#888" : "#ef4444",
                cursor: isCancelling ? "not-allowed" : "pointer",
              }}
              onClick={handleCancel}
              disabled={isCancelling}
            >
              <X size={16} />
              {/* FIX #5: キャンセル中は「キャンセル中...」と表示 */}
              {isCancelling ? "キャンセル中..." : "キャンセル"}
            </button>
          ) : (
            <button
              className="btn-primary"
              style={{ flex: 1, justifyContent: "center", padding: "0.875rem", fontSize: "1rem" }}
              onClick={handleStart}
              disabled={queuedCount === 0}
            >
              <Sparkles size={16} />
              {queuedCount > 0 ? `処理開始（${queuedCount}件）` : "ファイルを追加してください"}
            </button>
          )}
        </div>
      </main>

      <nav className="bottom-nav">
        <Link href="/" className="active">
          <Music2 size={20} />
          <span>メイン</span>
        </Link>
        <Link href="/history">
          <History size={20} />
          <span>履歴</span>
        </Link>
        <Link href="/settings">
          <Settings size={20} />
          <span>設定</span>
        </Link>
      </nav>
    </div>
  );
}

function QueueCard({
  item,
  onRemove,
  onToggle,
  outputFormat,
}: {
  item: QueueItem;
  onRemove: (id: string) => void;
  onToggle: (id: string) => void;
  outputFormat: OutputFormat;
}) {
  const statusColor: Record<ItemStatus, string> = {
    queued: "var(--text-secondary)",
    processing: "var(--accent-primary)",
    done: "#22c55e",
    error: "#ef4444",
    cancelled: "var(--text-secondary)",
  };
  const statusLabel: Record<ItemStatus, string> = {
    queued: "待機中",
    processing: "処理中",
    done: "完了",
    error: "エラー",
    cancelled: "キャンセル",
  };

  return (
    <div className="card" style={{ padding: "0.875rem 1rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
        <Music2 size={15} color="var(--accent-primary)" style={{ flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: "0.85rem", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {item.file.name}
          </p>
          <p style={{ fontSize: "0.72rem", color: statusColor[item.status], fontWeight: 500 }}>
            {statusLabel[item.status]}
            {item.status === "error" && item.error && ` — ${item.error.slice(0, 60)}`}
          </p>
        </div>

        {(item.status === "processing" || item.status === "done" || item.status === "error") && (
          <button className="btn-icon" onClick={() => onToggle(item.id)} style={{ padding: "0.25rem" }}>
            {item.expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        )}

        {item.status !== "processing" && (
          <button className="btn-icon" onClick={() => onRemove(item.id)} style={{ padding: "0.25rem" }}>
            <X size={14} />
          </button>
        )}
      </div>

      {item.expanded && (item.status === "processing" || item.status === "error") && (
        <div style={{ marginTop: "0.875rem" }}>
          <ProgressSteps steps={item.steps} />
        </div>
      )}

      {item.expanded && item.status === "done" && (item.enhancedBlob || item.transcript) && (
        <div style={{ marginTop: "0.875rem", borderTop: "1px solid var(--border)", paddingTop: "0.875rem" }}>
          <ResultPanel
            enhancedBlob={item.enhancedBlob ?? null}
            transcript={item.transcript ?? null}
            outputFormat={outputFormat}
            fileName={item.file.name}
          />
        </div>
      )}
    </div>
  );
}
