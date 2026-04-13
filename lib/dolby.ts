'use client'

export interface DolbySettings {
  appKey: string
  appSecret: string
  noiseReduction: 'low' | 'medium' | 'high'
}

interface DolbyTokenResponse {
  access_token: string
}

async function getToken(appKey: string, appSecret: string): Promise<string> {
  const creds = btoa(`${appKey}:${appSecret}`)
  const res = await fetch('https://api.dolby.io/v1/auth/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: 'grant_type=client_credentials&expires_in=1800',
  })
  if (!res.ok) throw new Error(`Dolby auth failed: ${res.status}`)
  const data: DolbyTokenResponse = await res.json()
  return data.access_token
}

async function getUploadUrl(token: string, filename: string): Promise<string> {
  const dlbPath = `dlb://input/${Date.now()}_${filename}`
  const res = await fetch('https://api.dolby.com/media/input', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: dlbPath }),
  })
  if (!res.ok) throw new Error(`Dolby input URL failed: ${res.status}`)
  const data = await res.json()
  return data.url
}

async function uploadFile(uploadUrl: string, file: Blob, mime: string) {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': mime },
    body: file,
  })
  if (!res.ok) throw new Error(`Dolby upload failed: ${res.status}`)
}

async function startEnhance(
  token: string,
  inputUrl: string,
  outputUrl: string,
  noiseLevel: 'low' | 'medium' | 'high'
): Promise<string> {
  const amountMap = { low: 30, medium: 60, high: 90 }
  const res = await fetch('https://api.dolby.com/media/enhance', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: inputUrl,
      output: outputUrl,
      content: { type: 'lecture' },
      audio: {
        noise: { reduction: { enable: true, amount: amountMap[noiseLevel] } },
        speech: { isolation: { enable: true, amount: 70 } },
      },
    }),
  })
  if (!res.ok) throw new Error(`Dolby enhance start failed: ${res.status}`)
  const data = await res.json()
  return data.job_id
}

async function pollJob(
  token: string,
  jobId: string,
  onProgress?: (pct: number) => void,
  signal?: AbortSignal
): Promise<void> {
  const maxTries = 300 // 10 min
  for (let i = 0; i < maxTries; i++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    await new Promise(r => setTimeout(r, 2000))

    const res = await fetch(`https://api.dolby.com/media/enhance?job_id=${jobId}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    })
    if (!res.ok) continue

    const data = await res.json()
    if (data.progress !== undefined && onProgress) {
      onProgress(Math.max(5, data.progress))
    }
    if (data.status === 'Success') return
    if (data.status === 'Failed' || data.status === 'Canceled') {
      throw new Error(`Dolby job ${data.status.toLowerCase()}`)
    }
  }
  throw new Error('Dolby job timed out')
}

async function downloadResult(token: string, outputDlbUrl: string): Promise<string> {
  const res = await fetch('https://api.dolby.com/media/output', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Failed to get output URL list')

  // Get presigned download URL
  const res2 = await fetch(`https://api.dolby.com/media/output?url=${encodeURIComponent(outputDlbUrl)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res2.ok) throw new Error(`Dolby output fetch failed: ${res2.status}`)
  const data = await res2.json()
  return data.url // presigned S3 URL
}

export async function enhanceAudio(
  file: Blob,
  mime: string,
  filename: string,
  settings: DolbySettings,
  onProgress?: (pct: number) => void,
  signal?: AbortSignal
): Promise<Blob> {
  onProgress?.(2)
  const token = await getToken(settings.appKey, settings.appSecret)

  onProgress?.(5)
  const ts = Date.now()
  const inputDlbPath = `dlb://input/${ts}_${filename}`
  const outputDlbPath = `dlb://output/${ts}_enhanced_${filename}`

  // Upload
  const uploadRes = await fetch('https://api.dolby.com/media/input', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: inputDlbPath }),
  })
  if (!uploadRes.ok) throw new Error(`Input URL: ${uploadRes.status}`)
  const { url: uploadUrl } = await uploadRes.json()

  await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': mime }, body: file, signal })

  onProgress?.(10)

  const jobId = await startEnhance(token, inputDlbPath, outputDlbPath, settings.noiseReduction)

  await pollJob(token, jobId, p => onProgress?.(10 + p * 0.8), signal)

  onProgress?.(92)

  // Get download URL
  const dlRes = await fetch(
    `https://api.dolby.com/media/output?url=${encodeURIComponent(outputDlbPath)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!dlRes.ok) throw new Error(`Output URL: ${dlRes.status}`)
  const { url: downloadUrl } = await dlRes.json()

  const audioRes = await fetch(downloadUrl, { signal })
  if (!audioRes.ok) throw new Error(`Download failed: ${audioRes.status}`)

  onProgress?.(99)
  return audioRes.blob()
}

export async function testDolbyConnection(appKey: string, appSecret: string): Promise<boolean> {
  try {
    const token = await getToken(appKey, appSecret)
    return !!token
  } catch {
    return false
  }
}
