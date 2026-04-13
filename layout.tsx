import type { Metadata } from 'next'
import '../styles/globals.css'

export const metadata: Metadata = {
  metadataBase: new URL('https://audio-enhancer.vercel.app'),
  title: {
    default: 'AudioClear — 長時間録音を自動で音質強化・文字起こし・AI要約',
    template: '%s | AudioClear',
  },
  description: '授業・会議・介護記録など長時間音声をアップロードするだけ。Dolby.io音質強化 × Whisper文字起こし × GPT-4o-mini要約を自動実行。完全ブラウザ完結、APIキー持ち込みで運用コストゼロ。',
  keywords: ['音声文字起こし', '授業録音 テキスト化', '音質強化 ノイズ除去', 'Whisper 日本語', 'Groq Whisper 無料', '長時間録音 文字起こし', '講義録音 AI要約', '介護記録 自動化', 'Dolby音質改善', '音声AI処理'],
  authors: [{ name: 'AudioClear' }],
  creator: 'AudioClear',
  openGraph: {
    type: 'website',
    locale: 'ja_JP',
    url: 'https://audio-enhancer.vercel.app',
    siteName: 'AudioClear',
    title: 'AudioClear — 長時間録音を自動で音質強化・文字起こし・AI要約',
    description: '授業・会議・介護記録など長時間音声をアップロードするだけ。完全ブラウザ完結、APIキー持ち込みで運用コストゼロ。',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AudioClear — 長時間録音を自動で音質強化・文字起こし・AI要約',
    description: '授業・会議・介護記録など長時間音声をアップロードするだけ。完全ブラウザ完結。',
  },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
  alternates: { canonical: 'https://audio-enhancer.vercel.app' },
}

const jsonLd = [
  {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'AudioClear',
    url: 'https://audio-enhancer.vercel.app',
    description: '長時間録音を自動で音質強化・文字起こし・AI要約するブラウザツール',
    potentialAction: { '@type': 'SearchAction', target: 'https://audio-enhancer.vercel.app', 'query-input': 'required name=search_term_string' },
  },
  {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'AudioClear',
    applicationCategory: 'MultimediaApplication',
    operatingSystem: 'Web',
    description: 'Dolby.io音質強化 × Whisper文字起こし × GPT要約を自動実行するブラウザツール。授業・会議・介護記録に対応。',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'JPY', description: 'APIキー持ち込みで無料利用可能' },
    featureList: ['Dolby.io音質強化・ノイズ除去', 'OpenAI/Groq Whisper文字起こし', 'GPT-4o-mini AI要約', 'SRT/VTT字幕ファイル出力', '複数ファイルキュー処理', '夜間バッチモード', 'WakeLock対応', 'チェックポイント再開'],
  },
  {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: '完全無料で使えますか？', acceptedAnswer: { '@type': 'Answer', text: 'Dolby.ioは月10時間まで無料、GroqのWhisperは無料枠で月数十時間利用可能です。自分のAPIキーを設定画面から入力して使う仕組みなので、AudioClear自体への課金は一切ありません。' } },
      { '@type': 'Question', name: '90分の授業録音はどれくらいで処理できますか？', acceptedAnswer: { '@type': 'Answer', text: 'ffmpegを使わずDolby/Whisper APIに直接投げる設計のため、PCで約15〜25分が目安です。スマホでもバックグラウンド処理対応で安定して動作します。' } },
      { '@type': 'Question', name: 'どのファイル形式に対応していますか？', acceptedAnswer: { '@type': 'Answer', text: 'MP3、M4A、AAC、WAV、OGG、WebM、MP4、MOVに対応しています。動画ファイルも音声部分だけ抽出して処理します。' } },
      { '@type': 'Question', name: 'AIによる要約はどのくらい精度がありますか？', acceptedAnswer: { '@type': 'Answer', text: 'GPT-4o-miniを使用し、授業・会議・介護記録・汎用の4モードから用途に合わせて選択できます。文字起こし後に自動で要点・キーワード・引き継ぎ事項を生成します。' } },
    ],
  },
]

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <link rel="canonical" href="https://audio-enhancer.vercel.app" />
        {jsonLd.map((schema, i) => (
          <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
        ))}
      </head>
      <body>{children}</body>
    </html>
  )
}
