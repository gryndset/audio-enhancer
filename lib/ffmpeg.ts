"use client";

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

let loadPromise: Promise<FFmpeg> | null = null;

export const CHUNK_MINUTES = 12;
export const WHISPER_LIMIT_BYTES = 25 * 1024 * 1024;

async function _loadFFmpeg(onLog?: (msg: string) => void): Promise<FFmpeg> {
  const ff = new FFmpeg();
  if (onLog) ff.on("log", ({ message }) => onLog(message));
  const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
  await ff.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
  });
  return ff;
}

export async function loadFFmpeg(onLog?: (msg: string) => void): Promise<FFmpeg> {
  if (!loadPromise) loadPromise = _loadFFmpeg(onLog);
  return loadPromise;
}

export interface ConvertOptions {
  file: File;
  outputFormat: "mp3" | "wav";
  onProgress?: (p: number) => void;
  onLog?: (msg: string) => void;
  signal?: AbortSignal;
}

// FIX #1: Uint8Array<SharedArrayBuffer> → Blob の型エラー修正
// buffer は ArrayBufferLike (SharedArrayBuffer の可能性あり) なので slice でコピーして普通の ArrayBuffer にする
function toBlob(data: Uint8Array, type: string): Blob {
  const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  return new Blob([buf], { type });
}

export async function convertAudio(opts: ConvertOptions): Promise<Blob> {
  const { file, outputFormat, onProgress, onLog, signal } = opts;
  if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");

  const ff = await loadFFmpeg(onLog);
  const inputName = `input.${file.name.split(".").pop()}`;
  const outputName = `output.${outputFormat}`;

  const progressHandler = ({ progress }: { progress: number }) => {
    onProgress?.(Math.round(Math.min(progress * 100, 99)));
  };
  ff.on("progress", progressHandler);

  try {
    await ff.writeFile(inputName, await fetchFile(file));
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    // モノラル16kHz変換でWhisperの精度と速度を上げる
    const args = outputFormat === "mp3"
      ? ["-i", inputName, "-q:a", "2", "-ar", "16000", "-ac", "1", outputName]
      : ["-i", inputName, "-ar", "16000", "-ac", "1", outputName];
    await ff.exec(args);
    const data = await ff.readFile(outputName) as Uint8Array;
    onProgress?.(100);
    return toBlob(data, outputFormat === "mp3" ? "audio/mpeg" : "audio/wav");
  } finally {
    ff.off("progress", progressHandler);
    await ff.deleteFile(inputName).catch(() => {});
    await ff.deleteFile(outputName).catch(() => {});
  }
}

// FIX #2: duration取得 "pipe:1" バグ修正 → "-i inputName" のみ実行してlogからdurationを拾う
export async function splitAudio(
  blob: Blob,
  outputFormat: "mp3" | "wav",
  chunkMinutes = CHUNK_MINUTES,
  onLog?: (msg: string) => void,
  signal?: AbortSignal
): Promise<Blob[]> {
  if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");

  const ff = await loadFFmpeg(onLog);
  const ext = outputFormat;
  const inputName = `split_input.${ext}`;
  await ff.writeFile(inputName, await fetchFile(blob));

  let duration = 0;
  const durationListener = ({ message }: { message: string }) => {
    const m = message.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/);
    if (m) {
      duration = parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseFloat(m[3]);
    }
  };
  ff.on("log", durationListener);
  // 出力ファイルを指定しないのでエラーになるが、その前にDurationがlogに出る
  await ff.exec(["-i", inputName]).catch(() => {});
  ff.off("log", durationListener);

  // durationが取れなかった場合はそのまま返す
  if (duration === 0) {
    const data = await ff.readFile(inputName) as Uint8Array;
    await ff.deleteFile(inputName).catch(() => {});
    return [toBlob(data, outputFormat === "mp3" ? "audio/mpeg" : "audio/wav")];
  }

  const chunkSecs = chunkMinutes * 60;
  const numChunks = Math.ceil(duration / chunkSecs);
  const chunks: Blob[] = [];

  for (let i = 0; i < numChunks; i++) {
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    const start = i * chunkSecs;
    const outputChunk = `chunk_${i}.${ext}`;
    await ff.exec(["-i", inputName, "-ss", String(start), "-t", String(chunkSecs), "-c", "copy", outputChunk]);
    const data = await ff.readFile(outputChunk) as Uint8Array;
    chunks.push(toBlob(data, outputFormat === "mp3" ? "audio/mpeg" : "audio/wav"));
    await ff.deleteFile(outputChunk).catch(() => {});
  }

  await ff.deleteFile(inputName).catch(() => {});
  return chunks;
}

// FIX #3: mp3のconcat "-c copy" → libmp3lame再エンコード
// "-c copy"でmp3をconcatするとヘッダーが壊れて再生できないケースがある
export async function mergeAudio(
  blobs: Blob[],
  outputFormat: "mp3" | "wav",
  onLog?: (msg: string) => void
): Promise<Blob> {
  if (blobs.length === 1) return blobs[0];

  const ff = await loadFFmpeg(onLog);
  const ext = outputFormat;
  const fileList: string[] = [];

  for (let i = 0; i < blobs.length; i++) {
    const name = `merge_${i}.${ext}`;
    await ff.writeFile(name, await fetchFile(blobs[i]));
    fileList.push(name);
  }

  const concatContent = fileList.map((f) => `file '${f}'`).join("\n");
  await ff.writeFile("concat.txt", new TextEncoder().encode(concatContent));

  const encodeArgs = outputFormat === "mp3"
    ? ["-c:a", "libmp3lame", "-q:a", "2"]
    : ["-c:a", "pcm_s16le"];

  await ff.exec(["-f", "concat", "-safe", "0", "-i", "concat.txt", ...encodeArgs, `merged.${ext}`]);

  const data = await ff.readFile(`merged.${ext}`) as Uint8Array;

  for (const f of fileList) await ff.deleteFile(f).catch(() => {});
  await ff.deleteFile("concat.txt").catch(() => {});
  await ff.deleteFile(`merged.${ext}`).catch(() => {});

  return toBlob(data, outputFormat === "mp3" ? "audio/mpeg" : "audio/wav");
}
