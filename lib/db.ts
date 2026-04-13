'use client'

import { openDB, type IDBPDatabase } from 'idb'

export interface HistoryEntry {
  id: string
  filename: string
  duration: number
  fileSize: number
  processedAt: number
  engine: string
  language: string
  mode: string
  transcript: Array<{ start: number; end: number; text: string }>
  summary: string
  enhancedAudioB64: string | null
  enhancedMime: string
  processingTime: number
  checksum: string
}

export interface CheckpointData {
  id: string
  fileB64: string
  fileMime: string
  filename: string
  fileSize: number
  dolboDone: boolean
  enhancedB64: string | null
  transcriptChunks: Array<{ start: number; end: number; text: string }>
  currentChunk: number
  totalChunks: number
  updatedAt: number
}

let dbPromise: Promise<IDBPDatabase> | null = null

function getDB() {
  if (typeof window === 'undefined') throw new Error('IndexedDB not available on server')
  if (!dbPromise) {
    dbPromise = openDB('audio-enhancer-v4', 2, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore('history', { keyPath: 'id' })
        }
        if (oldVersion < 2) {
          db.createObjectStore('checkpoints', { keyPath: 'id' })
        }
      },
    })
  }
  return dbPromise
}

export async function saveHistory(entry: HistoryEntry) {
  const db = await getDB()
  await db.put('history', entry)
}

export async function getHistory(): Promise<HistoryEntry[]> {
  const db = await getDB()
  const all = await db.getAll('history')
  return all.sort((a, b) => b.processedAt - a.processedAt)
}

export async function deleteHistory(id: string) {
  const db = await getDB()
  await db.delete('history', id)
}

export async function getHistoryById(id: string): Promise<HistoryEntry | undefined> {
  const db = await getDB()
  return db.get('history', id)
}

export async function saveCheckpoint(cp: CheckpointData) {
  const db = await getDB()
  await db.put('checkpoints', cp)
}

export async function getCheckpoint(id: string): Promise<CheckpointData | undefined> {
  const db = await getDB()
  return db.get('checkpoints', id)
}

export async function deleteCheckpoint(id: string) {
  const db = await getDB()
  await db.delete('checkpoints', id)
}

export async function getStorageEstimate(): Promise<{ used: number; quota: number } | null> {
  if (typeof navigator === 'undefined' || !navigator.storage) return null
  try {
    const est = await navigator.storage.estimate()
    return { used: est.usage ?? 0, quota: est.quota ?? 0 }
  } catch {
    return null
  }
}

export function fileToBase64(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1])
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function base64ToBlob(b64: string, mime: string): Blob {
  const bytes = atob(b64)
  const arr = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
  return new Blob([arr], { type: mime })
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
  return `${m}:${String(s).padStart(2,'0')}`
}
