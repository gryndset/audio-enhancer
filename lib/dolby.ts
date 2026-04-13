"use client";

const DOLBY_BASE = "https://api.dolby.com";

interface DolbyUploadResponse {
  url: string;
}

interface DolbyEnhanceResponse {
  job_id: string;
}

interface DolbyJobStatus {
  status: "Pending" | "Running" | "Success" | "Failed";
  progress: number;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// FIX #4: Dolby.io の認証は App Key + App Secret の Basic 認証
// 旧コード: btoa(apiKey + ":") → APIキー単体ではなく "AppKey:AppSecret" をBase64する
function authHeader(appKey: string, appSecret: string) {
  return `Basic ${btoa(`${appKey}:${appSecret}`)}`;
}

// localStorage のキー名も変更（設定画面と合わせる）
export function getDolbyKeys(): { appKey: string; appSecret: string } {
  if (typeof window === "undefined") return { appKey: "", appSecret: "" };
  return {
    appKey: localStorage.getItem("dolby_app_key") ?? "",
    appSecret: localStorage.getItem("dolby_app_secret") ?? "",
  };
}

export async function enhanceAudio(
  blob: Blob,
  appKey: string,
  appSecret: string,
  onProgress?: (p: number) => void,
  signal?: AbortSignal
): Promise<Blob> {
  const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const inputPath = `dlb://input/audio_${uid}`;
  const outputPath = `dlb://output/enhanced_${uid}`;
  const auth = authHeader(appKey, appSecret);

  // 1. Get upload URL
  const uploadRes = await fetch(`${DOLBY_BASE}/media/input`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({ url: inputPath }),
    signal,
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    throw new Error(`Dolby upload URL error (${uploadRes.status}): ${err}`);
  }

  const { url: uploadUrl }: DolbyUploadResponse = await uploadRes.json();

  // 2. Upload audio
  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": blob.type || "audio/mpeg" },
    body: blob,
    signal,
  });
  if (!putRes.ok) throw new Error(`Dolby PUT failed: ${putRes.status}`);

  // 3. Start enhance job
  const enhanceRes = await fetch(`${DOLBY_BASE}/media/enhance`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      input: inputPath,
      output: outputPath,
      audio: {
        noise: { reduction: { enable: true } },
        loudness: { enable: true },
        speech: { isolation: { enable: true } },
      },
    }),
    signal,
  });

  if (!enhanceRes.ok) {
    const err = await enhanceRes.text();
    throw new Error(`Dolby enhance error (${enhanceRes.status}): ${err}`);
  }

  const { job_id }: DolbyEnhanceResponse = await enhanceRes.json();

  // 4. Poll job status
  let attempts = 0;
  while (attempts < 120) {
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    await sleep(3000);

    const statusRes = await fetch(`${DOLBY_BASE}/media/enhance?job_id=${job_id}`, {
      headers: { Authorization: auth },
      signal,
    });
    const status: DolbyJobStatus = await statusRes.json();
    onProgress?.(status.progress ?? 0);

    if (status.status === "Success") {
      const outputRes = await fetch(
        `${DOLBY_BASE}/media/output?url=${encodeURIComponent(outputPath)}`,
        { headers: { Authorization: auth }, signal }
      );
      if (!outputRes.ok) throw new Error("Dolby output fetch failed");
      const { url: downloadUrl }: { url: string } = await outputRes.json();
      const audioRes = await fetch(downloadUrl, { signal });
      return await audioRes.blob();
    }

    if (status.status === "Failed") throw new Error("Dolby enhance job failed");
    attempts++;
  }

  throw new Error("Dolby enhance timed out");
}

/** APIキーの疎通確認 */
export async function testDolbyKey(appKey: string, appSecret: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${DOLBY_BASE}/media/input`, {
      method: "POST",
      headers: { Authorization: authHeader(appKey, appSecret), "Content-Type": "application/json" },
      body: JSON.stringify({ url: "dlb://input/test_ping" }),
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: "認証エラー。App KeyとApp Secretを確認してください。" };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "接続エラー。ネットワークを確認してください。" };
  }
}
