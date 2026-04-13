"use client";

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptResult {
  text: string;
  segments?: TranscriptSegment[];
}

export async function transcribeAudio(
  blob: Blob,
  apiKey: string,
  withTimestamps: boolean,
  fileName = "audio.mp3",
  signal?: AbortSignal
): Promise<TranscriptResult> {
  const formData = new FormData();
  formData.append("file", blob, fileName);
  formData.append("model", "whisper-1");
  formData.append("language", "ja");
  if (withTimestamps) {
    formData.append("response_format", "verbose_json");
  }

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
    signal,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Whisper API error: ${err}`);
  }

  if (withTimestamps) {
    const data = await res.json();
    return {
      text: data.text,
      segments: data.segments?.map((s: { start: number; end: number; text: string }) => ({
        start: s.start,
        end: s.end,
        text: s.text.trim(),
      })),
    };
  } else {
    const data = await res.json();
    return { text: data.text };
  }
}

export function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function segmentsToText(
  segments: TranscriptSegment[],
  withTimestamps: boolean,
  offsetSeconds = 0
): string {
  return segments
    .map((seg) => {
      const text = seg.text.trim();
      if (!withTimestamps) return text;
      const ts = formatTimestamp(seg.start + offsetSeconds);
      return `[${ts}] ${text}`;
    })
    .join("\n");
}

/** OpenAI APIキーの疎通確認（models エンドポイントで検証） */
export async function testOpenAIKey(apiKey: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.status === 401) return { ok: false, error: "認証エラー。APIキーを確認してください。" };
    if (!res.ok) return { ok: false, error: `エラー: ${res.status}` };
    return { ok: true };
  } catch {
    return { ok: false, error: "接続エラー。ネットワークを確認してください。" };
  }
}
