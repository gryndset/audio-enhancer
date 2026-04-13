'use client'

export type WhisperEngine = 'openai' | 'groq'

export interface WhisperSettings {
  engine: WhisperEngine
  apiKey: string
  language: string // 'ja' | 'en' | 'auto'
  removeFiller: boolean
  customVocab: string
  chunkMinutes: number // default 5
  overlapSeconds: number // default 30
  nightMode: boolean // repeat 2x for higher accuracy
}

export interface TranscriptSegment {
  start: number
  end: number
  text: string
}

interface WhisperVerboseResponse {
  segments: Array<{ start: number; end: number; text: string }>
  text: string
  duration?: number
}

const ENGINES = {
  openai: 'https://api.openai.com/v1/audio/transcriptions',
  groq: 'https://api.groq.com/openai/v1/audio/transcriptions',
}

const FILLER_INSTRUCTION = 'えー、あのー、えっと、まあ、ちょっと、なんか（などのフィラーワード）を除去し、自然な文章にしてください。'

/**
 * Split a Blob into overlapping chunks using Web Audio API (no ffmpeg needed).
 * Returns array of {blob, startSec} pairs.
 */
async function splitAudioWebAPI(
  file: Blob,
  mime: string,
  chunkSec: number,
  overlapSec: number
): Promise<Array<{ blob: Blob; startSec: number; endSec: number }>> {
  const arrayBuf = await file.arrayBuffer()
  const audioCtx = new AudioContext()
  const decoded = await audioCtx.decodeAudioData(arrayBuf)
  const totalDuration = decoded.duration
  const sr = decoded.sampleRate
  const numCh = decoded.numberOfChannels

  const chunks: Array<{ blob: Blob; startSec: number; endSec: number }> = []

  let startSec = 0
  while (startSec < totalDuration) {
    const endSec = Math.min(startSec + chunkSec, totalDuration)
    const startFrame = Math.floor(startSec * sr)
    const endFrame = Math.floor(endSec * sr)
    const frameCount = endFrame - startFrame

    // Create offline context for this chunk
    const offCtx = new OfflineAudioContext(numCh, frameCount, sr)
    const buf = offCtx.createBuffer(numCh, frameCount, sr)
    for (let ch = 0; ch < numCh; ch++) {
      const srcData = decoded.getChannelData(ch).slice(startFrame, endFrame)
      buf.getChannelData(ch).set(srcData)
    }
    const src = offCtx.createBufferSource()
    src.buffer = buf
    src.connect(offCtx.destination)
    src.start()
    const rendered = await offCtx.startRendering()

    // Encode to WAV
    const wavBlob = audioBufferToWav(rendered)
    chunks.push({ blob: wavBlob, startSec, endSec })

    // Next chunk starts at (end - overlap)
    const nextStart = endSec - overlapSec
    if (nextStart <= startSec) break
    startSec = nextStart >= totalDuration ? totalDuration : nextStart
  }

  await audioCtx.close()
  return chunks
}

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numCh = buffer.numberOfChannels
  const sr = buffer.sampleRate
  const numFrames = buffer.length
  const dataLen = numFrames * numCh * 2
  const arrayBuf = new ArrayBuffer(44 + dataLen)
  const view = new DataView(arrayBuf)

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
  }
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + dataLen, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numCh, true)
  view.setUint32(24, sr, true)
  view.setUint32(28, sr * numCh * 2, true)
  view.setUint16(32, numCh * 2, true)
  view.setUint16(34, 16, true)
  writeStr(36, 'data')
  view.setUint32(40, dataLen, true)

  let offset = 44
  for (let i = 0; i < numFrames; i++) {
    for (let ch = 0; ch < numCh; ch++) {
      const s = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]))
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
      offset += 2
    }
  }
  return new Blob([arrayBuf], { type: 'audio/wav' })
}

async function transcribeChunk(
  blob: Blob,
  settings: WhisperSettings,
  prevText: string,
  signal?: AbortSignal
): Promise<WhisperVerboseResponse> {
  const url = ENGINES[settings.engine]
  const formData = new FormData()
  formData.append('file', blob, 'chunk.wav')
  formData.append('model', settings.engine === 'groq' ? 'whisper-large-v3' : 'whisper-1')
  formData.append('response_format', 'verbose_json')
  formData.append('timestamp_granularities[]', 'segment')

  if (settings.language !== 'auto') {
    formData.append('language', settings.language)
  }

  // Build prompt: custom vocab + filler instruction + context carry-over
  const promptParts: string[] = []
  if (settings.customVocab) promptParts.push(`専門用語: ${settings.customVocab}`)
  if (settings.removeFiller) promptParts.push(FILLER_INSTRUCTION)
  if (prevText) promptParts.push(prevText.slice(-200)) // carry last 200 chars
  if (promptParts.length) formData.append('prompt', promptParts.join('\n'))

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${settings.apiKey}` },
    body: formData,
    signal,
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`Whisper ${res.status}: ${errText.slice(0, 120)}`)
  }

  return res.json()
}

export async function transcribeAudio(
  file: Blob,
  mime: string,
  settings: WhisperSettings,
  onProgress?: (pct: number, msg: string) => void,
  signal?: AbortSignal
): Promise<TranscriptSegment[]> {
  const chunkSec = settings.chunkMinutes * 60
  const overlapSec = settings.overlapSeconds

  onProgress?.(2, '音声を分割中...')

  // If file < 24MB and < 30min, transcribe directly without splitting
  const fileSizeMB = file.size / (1024 * 1024)
  let chunks: Array<{ blob: Blob; startSec: number; endSec: number }>

  if (fileSizeMB < 24) {
    // Try direct first
    chunks = [{ blob: file, startSec: 0, endSec: 9999 }]
  } else {
    chunks = await splitAudioWebAPI(file, mime, chunkSec, overlapSec)
  }

  onProgress?.(8, `${chunks.length}チャンクに分割完了`)

  const allSegments: TranscriptSegment[] = []
  let prevText = ''
  const repeats = settings.nightMode ? 2 : 1

  for (let ci = 0; ci < chunks.length; ci++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const chunk = chunks[ci]
    const pct = 8 + Math.round((ci / chunks.length) * 85)
    onProgress?.(pct, `チャンク ${ci + 1}/${chunks.length} を文字起こし中...`)

    let bestResult: WhisperVerboseResponse | null = null

    for (let r = 0; r < repeats; r++) {
      const result = await transcribeChunk(chunk.blob, settings, prevText, signal)
      if (!bestResult || result.text.length > bestResult.text.length) {
        bestResult = result
      }
    }

    if (!bestResult) continue
    prevText = bestResult.text

    // Adjust timestamps by chunk start, deduplicate overlap
    const lastEnd = allSegments.length > 0 ? allSegments[allSegments.length - 1].end : -1

    for (const seg of bestResult.segments) {
      const adjustedStart = chunk.startSec + seg.start
      const adjustedEnd = chunk.startSec + seg.end

      // Skip segments that overlap with already-added content (overlap dedup)
      if (adjustedStart < lastEnd - 1) continue

      const text = seg.text.trim()
      if (!text) continue

      allSegments.push({
        start: Math.round(adjustedStart * 10) / 10,
        end: Math.round(adjustedEnd * 10) / 10,
        text,
      })
    }
  }

  onProgress?.(95, '文字起こし完了')
  return allSegments
}

export async function testWhisperConnection(engine: WhisperEngine, apiKey: string): Promise<boolean> {
  try {
    // Use a tiny silent WAV for testing
    const silentWav = new Blob(
      [new Uint8Array([
        82,73,70,70,36,0,0,0,87,65,86,69,102,109,116,32,16,0,0,0,1,0,1,0,
        68,172,0,0,136,88,1,0,2,0,16,0,100,97,116,97,0,0,0,0
      ])],
      { type: 'audio/wav' }
    )
    const fd = new FormData()
    fd.append('file', silentWav, 'test.wav')
    fd.append('model', engine === 'groq' ? 'whisper-large-v3' : 'whisper-1')
    fd.append('response_format', 'json')
    const res = await fetch(ENGINES[engine], {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: fd,
    })
    return res.status !== 401 && res.status !== 403
  } catch {
    return false
  }
}
