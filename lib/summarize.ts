'use client'

export interface SummaryResult {
  highlights: string
  keywords: string[]
  importantPoints: string[]
  review: string
  carryover: string
}

export type SummaryMode = 'lecture' | 'meeting' | 'care' | 'general'

const PROMPTS: Record<SummaryMode, string> = {
  lecture: `以下は授業・講義の文字起こしです。以下の形式でJSON出力してください（日本語）:
{
  "highlights": "授業全体の要点を3〜5文で",
  "keywords": ["重要語句1", "重要語句2", ...（最大10個）"],
  "importantPoints": ["試験に出そうなポイント1", ...（最大8個）"],
  "review": "今日学んだことの振り返り（2〜3文）",
  "carryover": "次回への引き継ぎ・宿題・注意事項"
}`,
  meeting: `以下はミーティング・会議の文字起こしです。以下の形式でJSON出力してください（日本語）:
{
  "highlights": "会議全体のサマリーを3〜5文で",
  "keywords": ["キーワード1", "キーワード2", ...（最大10個）"],
  "importantPoints": ["決定事項・アクションアイテム1", ...（最大8個）"],
  "review": "今日決まったことまとめ（2〜3文）",
  "carryover": "次回への申し送り・宿題・フォローアップ事項"
}`,
  care: `以下は介護・ケア記録の文字起こしです。以下の形式でJSON出力してください（日本語）:
{
  "highlights": "本日の様子（全体サマリー）",
  "keywords": ["気になったこと1", "気になったこと2", ...（最大8個）"],
  "importantPoints": ["重要な発言・状態変化・服薬・食事記録1", ...（最大8個）"],
  "review": "本日のケア記録まとめ",
  "carryover": "次回への申し送り・注意事項"
}`,
  general: `以下は音声の文字起こしです。以下の形式でJSON出力してください（日本語）:
{
  "highlights": "内容の要点を3〜5文で",
  "keywords": ["重要語句1", ...（最大10個）"],
  "importantPoints": ["重要なポイント1", ...（最大8個）"],
  "review": "全体の振り返り（2〜3文）",
  "carryover": "メモ・引き継ぎ事項"
}`
}

export async function generateSummary(
  transcript: Array<{ start: number; end: number; text: string }>,
  openaiKey: string,
  mode: SummaryMode,
  signal?: AbortSignal
): Promise<SummaryResult> {
  const fullText = transcript.map(s => s.text).join('\n')
  const truncated = fullText.slice(0, 12000) // ~4000 tokens

  const systemPrompt = PROMPTS[mode]
  const userPrompt = `文字起こし:\n${truncated}\n\n上記をJSON形式のみで出力。前置きなし、マークダウン不要。`

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 1200,
      temperature: 0.3,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
    signal,
  })

  if (!res.ok) throw new Error(`Summary API failed: ${res.status}`)

  const data = await res.json()
  const raw = data.choices?.[0]?.message?.content ?? '{}'
  const clean = raw.replace(/```json|```/g, '').trim()

  try {
    const parsed = JSON.parse(clean)
    return {
      highlights: parsed.highlights ?? '',
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
      importantPoints: Array.isArray(parsed.importantPoints) ? parsed.importantPoints : [],
      review: parsed.review ?? '',
      carryover: parsed.carryover ?? '',
    }
  } catch {
    return { highlights: raw, keywords: [], importantPoints: [], review: '', carryover: '' }
  }
}

export function summaryToText(summary: SummaryResult, mode: SummaryMode): string {
  const labels: Record<SummaryMode, { ip: string; co: string }> = {
    lecture: { ip: '試験ポイント', co: '次回への引き継ぎ' },
    meeting: { ip: '決定事項・アクションアイテム', co: '申し送り事項' },
    care: { ip: '重要記録', co: '申し送り事項' },
    general: { ip: '重要ポイント', co: 'メモ・引き継ぎ' },
  }
  const l = labels[mode]
  return [
    `【概要】\n${summary.highlights}`,
    summary.keywords.length ? `【キーワード】\n${summary.keywords.join('、')}` : '',
    summary.importantPoints.length ? `【${l.ip}】\n${summary.importantPoints.map(p=>`・${p}`).join('\n')}` : '',
    summary.review ? `【振り返り】\n${summary.review}` : '',
    summary.carryover ? `【${l.co}】\n${summary.carryover}` : '',
  ].filter(Boolean).join('\n\n')
}
