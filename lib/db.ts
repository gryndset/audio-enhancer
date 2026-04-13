// FIX #5: "use client" 追加 → Next.js App Router の SSR で idb (ブラウザAPI) がクラッシュするのを防ぐ
"use client";

import { openDB, DBSchema, IDBPDatabase } from "idb";

export interface HistoryItem {
  id: string;
  fileName: string;
  processedAt: number;
  fileSize: number;
  // FIX #10: Blob → ArrayBuffer で保存（Safariの Blob シリアライズ問題を回避）
  enhancedBuffer: ArrayBuffer | null;
  outputFormat: "mp3" | "wav";
  transcript: string | null;
  status: "success" | "error";
  // 後方互換: 旧データ読み出し用
  enhancedBlob?: Blob | null;
}

interface AudioDB extends DBSchema {
  history: {
    key: string;
    value: HistoryItem;
    indexes: { by_date: number };
  };
}

const DB_NAME = "audio-enhancer-db";
const DB_VERSION = 2; // Blob→ArrayBuffer 移行のためバージョンアップ
const MAX_ITEMS = 20;

let db: IDBPDatabase<AudioDB> | null = null;

async function getDB() {
  if (db) return db;
  db = await openDB<AudioDB>(DB_NAME, DB_VERSION, {
    upgrade(database, oldVersion) {
      if (oldVersion < 1) {
        const store = database.createObjectStore("history", { keyPath: "id" });
        store.createIndex("by_date", "processedAt");
      }
      // v1→v2: スキーマ変更なし（フィールド追加は後方互換）
    },
  });
  return db;
}

// Blob → ArrayBuffer 変換ヘルパー
async function blobToBuffer(blob: Blob): Promise<ArrayBuffer> {
  return blob.arrayBuffer();
}

// ArrayBuffer → Blob 復元ヘルパー
function bufferToBlob(buf: ArrayBuffer, format: "mp3" | "wav"): Blob {
  return new Blob([buf], { type: format === "mp3" ? "audio/mpeg" : "audio/wav" });
}

export async function saveHistory(item: {
  id: string;
  fileName: string;
  processedAt: number;
  fileSize: number;
  enhancedBlob: Blob | null;
  transcript: string | null;
  outputFormat: "mp3" | "wav";
  status: "success" | "error";
}): Promise<void> {
  const database = await getDB();

  // FIX #10: Blob を ArrayBuffer に変換してから保存
  const enhancedBuffer = item.enhancedBlob ? await blobToBuffer(item.enhancedBlob) : null;

  await database.put("history", {
    id: item.id,
    fileName: item.fileName,
    processedAt: item.processedAt,
    fileSize: item.fileSize,
    enhancedBuffer,
    outputFormat: item.outputFormat,
    transcript: item.transcript,
    status: item.status,
  });

  const all = await database.getAllFromIndex("history", "by_date");
  if (all.length > MAX_ITEMS) {
    const toDelete = all.slice(0, all.length - MAX_ITEMS);
    const tx = database.transaction("history", "readwrite");
    for (const old of toDelete) await tx.store.delete(old.id);
    await tx.done;
  }
}

// 読み出し時に enhancedBlob を復元して返す
export async function getHistory(): Promise<(HistoryItem & { enhancedBlob: Blob | null })[]> {
  const database = await getDB();
  const all = await database.getAllFromIndex("history", "by_date");
  return all.reverse().map((item) => ({
    ...item,
    enhancedBlob: item.enhancedBuffer
      ? bufferToBlob(item.enhancedBuffer, item.outputFormat)
      : (item.enhancedBlob ?? null), // 旧データ後方互換
  }));
}

export async function deleteHistoryItem(id: string): Promise<void> {
  const database = await getDB();
  await database.delete("history", id);
}

export async function clearHistory(): Promise<void> {
  const database = await getDB();
  await database.clear("history");
}

export async function getStorageUsage(): Promise<number> {
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const { usage } = await navigator.storage.estimate();
      return usage ?? 0;
    }
  } catch {}
  const items = await getHistory();
  return items.reduce((acc, item) => {
    const blobSize = item.enhancedBlob?.size ?? 0;
    const textSize = item.transcript ? new Blob([item.transcript]).size : 0;
    return acc + blobSize + textSize;
  }, 0);
}

export function formatStorageSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
