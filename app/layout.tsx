import type { Metadata } from "next";
import "@/styles/themes.css";

export const metadata: Metadata = {
  title: "授業録音 音質強化・文字起こし",
  description: "授業録音の音質強化・ノイズ除去・文字起こしを自動で行うWebサービス",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@400;500;700&family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=Noto+Sans+JP:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <ToastPortal />
        {children}
      </body>
    </html>
  );
}

/**
 * Toast通知のグローバルコンテナ。
 * useToast() フックが document.getElementById("toast-root") にポータルを作る。
 */
function ToastPortal() {
  return <div id="toast-root" style={{ position: "fixed", bottom: "5rem", right: "1rem", zIndex: 9999, display: "flex", flexDirection: "column", gap: "0.5rem", pointerEvents: "none" }} />;
}
