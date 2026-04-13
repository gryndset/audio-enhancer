"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft, Eye, EyeOff, Save, Trash2, ExternalLink,
  Music2, History, CheckCircle, XCircle, Loader, Download, Upload,
} from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import ToastContainer from "@/components/ToastContainer";
import { showToast } from "@/hooks/useToast";
// FIX #4: testDolbyKey のシグネチャが (appKey, appSecret) に変更されたため更新
import { testDolbyKey } from "@/lib/dolby";
import { testOpenAIKey } from "@/lib/whisper";

type TestState = "idle" | "testing" | "ok" | "error";

interface TestResult {
  state: TestState;
  message?: string;
}

export default function SettingsPage() {
  const { theme, changeTheme } = useTheme();

  // FIX #4: dolbyKey 単体 → dolbyAppKey + dolbyAppSecret の2フィールドに変更
  const [dolbyAppKey, setDolbyAppKey] = useState("");
  const [dolbyAppSecret, setDolbyAppSecret] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [showDolbySecret, setShowDolbySecret] = useState(false);
  const [showOpenai, setShowOpenai] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dolbyTest, setDolbyTest] = useState<TestResult>({ state: "idle" });
  const [openaiTest, setOpenaiTest] = useState<TestResult>({ state: "idle" });

  useEffect(() => {
    setDolbyAppKey(localStorage.getItem("dolby_app_key") ?? "");
    setDolbyAppSecret(localStorage.getItem("dolby_app_secret") ?? "");
    setOpenaiKey(localStorage.getItem("openai_api_key") ?? "");
  }, []);

  function handleSave() {
    localStorage.setItem("dolby_app_key", dolbyAppKey.trim());
    localStorage.setItem("dolby_app_secret", dolbyAppSecret.trim());
    localStorage.setItem("openai_api_key", openaiKey.trim());
    setSaved(true);
    showToast("保存しました", "success");
    setTimeout(() => setSaved(false), 2000);
    setDolbyTest({ state: "idle" });
    setOpenaiTest({ state: "idle" });
  }

  function handleClear() {
    if (!confirm("APIキーをすべてクリアしますか？")) return;
    localStorage.removeItem("dolby_app_key");
    localStorage.removeItem("dolby_app_secret");
    localStorage.removeItem("openai_api_key");
    setDolbyAppKey("");
    setDolbyAppSecret("");
    setOpenaiKey("");
    setDolbyTest({ state: "idle" });
    setOpenaiTest({ state: "idle" });
    showToast("クリアしました", "info");
  }

  async function handleTestDolby() {
    if (!dolbyAppKey.trim() || !dolbyAppSecret.trim()) {
      showToast("App Key と App Secret を両方入力してください", "error");
      return;
    }
    setDolbyTest({ state: "testing" });
    const result = await testDolbyKey(dolbyAppKey.trim(), dolbyAppSecret.trim());
    setDolbyTest({ state: result.ok ? "ok" : "error", message: result.error });
  }

  async function handleTestOpenAI() {
    if (!openaiKey.trim()) { showToast("APIキーを入力してください", "error"); return; }
    setOpenaiTest({ state: "testing" });
    const result = await testOpenAIKey(openaiKey.trim());
    setOpenaiTest({ state: result.ok ? "ok" : "error", message: result.error });
  }

  function handleExport() {
    if (!dolbyAppKey && !dolbyAppSecret && !openaiKey) {
      showToast("保存されているAPIキーがありません", "error");
      return;
    }
    const data = JSON.stringify({
      dolby_app_key: dolbyAppKey,
      dolby_app_secret: dolbyAppSecret,
      openai_api_key: openaiKey,
    }, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "audioclear_keys.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("エクスポートしました", "success");
  }

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target?.result as string);
        if (json.dolby_app_key) setDolbyAppKey(json.dolby_app_key);
        if (json.dolby_app_secret) setDolbyAppSecret(json.dolby_app_secret);
        if (json.openai_api_key) setOpenaiKey(json.openai_api_key);
        showToast("インポートしました。「保存」を押して確定してください", "info");
      } catch {
        showToast("ファイルの読み込みに失敗しました", "error");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-primary)", paddingBottom: "5rem" }}>
      <ToastContainer />

      <header style={{
        background: "var(--bg-card)",
        borderBottom: "1px solid var(--border)",
        padding: "0.875rem 1.25rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        position: "sticky",
        top: 0,
        zIndex: 50,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <Link href="/" style={{ color: "var(--text-secondary)", display: "flex" }}>
            <ArrowLeft size={20} />
          </Link>
          <span style={{ fontWeight: 700, fontSize: "1rem" }} className="label-upper">設定</span>
        </div>
        <ThemeSwitcher theme={theme} onChange={changeTheme} />
      </header>

      <main style={{ maxWidth: 600, margin: "0 auto", padding: "1.5rem 1rem" }}>

        {/* Dolby.io — FIX #4: App Key + App Secret の2フィールドUI */}
        <div className="card" style={{ marginBottom: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
            <div>
              <p style={{ fontWeight: 700, marginBottom: "0.25rem" }}>Dolby.io API</p>
              <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>音質強化・ノイズ除去に使用（月10時間まで無料）</p>
            </div>
            <a href="https://dashboard.dolby.io/" target="_blank" rel="noopener noreferrer"
              style={{ color: "var(--accent-primary)", display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "0.75rem" }}>
              取得 <ExternalLink size={12} />
            </a>
          </div>

          {/* App Key */}
          <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "0.375rem", fontWeight: 500 }}>App Key</p>
          <div style={{ position: "relative", marginBottom: "0.75rem" }}>
            <input
              className="input-field"
              type="text"
              value={dolbyAppKey}
              onChange={(e) => { setDolbyAppKey(e.target.value); setDolbyTest({ state: "idle" }); }}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            />
          </div>

          {/* App Secret */}
          <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "0.375rem", fontWeight: 500 }}>App Secret</p>
          <div style={{ position: "relative", marginBottom: "0.625rem" }}>
            <input
              className="input-field"
              type={showDolbySecret ? "text" : "password"}
              value={dolbyAppSecret}
              onChange={(e) => { setDolbyAppSecret(e.target.value); setDolbyTest({ state: "idle" }); }}
              placeholder="••••••••••••••••••••••••••••••••"
              style={{ paddingRight: "3rem" }}
            />
            <button onClick={() => setShowDolbySecret(!showDolbySecret)} style={{
              position: "absolute", right: "0.75rem", top: "50%", transform: "translateY(-50%)",
              background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", display: "flex",
            }}>
              {showDolbySecret ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <TestButton state={dolbyTest} onTest={handleTestDolby} />
        </div>

        {/* OpenAI */}
        <div className="card" style={{ marginBottom: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
            <div>
              <p style={{ fontWeight: 700, marginBottom: "0.25rem" }}>OpenAI API Key</p>
              <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>文字起こし（Whisper）に使用。90分 ≈ ¥80</p>
            </div>
            <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer"
              style={{ color: "var(--accent-primary)", display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "0.75rem" }}>
              取得 <ExternalLink size={12} />
            </a>
          </div>
          <div style={{ position: "relative", marginBottom: "0.625rem" }}>
            <input
              className="input-field"
              type={showOpenai ? "text" : "password"}
              value={openaiKey}
              onChange={(e) => { setOpenaiKey(e.target.value); setOpenaiTest({ state: "idle" }); }}
              placeholder="sk-proj-..."
              style={{ paddingRight: "3rem" }}
            />
            <button onClick={() => setShowOpenai(!showOpenai)} style={{
              position: "absolute", right: "0.75rem", top: "50%", transform: "translateY(-50%)",
              background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", display: "flex",
            }}>
              {showOpenai ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <TestButton state={openaiTest} onTest={handleTestOpenAI} />
        </div>

        <div style={{
          padding: "0.875rem 1rem",
          background: "var(--bg-secondary)",
          borderRadius: "var(--radius-card)",
          border: "1px solid var(--border)",
          fontSize: "0.8rem",
          color: "var(--text-secondary)",
          marginBottom: "1.5rem",
          lineHeight: 1.6,
        }}>
          🔒 APIキーはブラウザのlocalStorageにのみ保存されます。サーバーには一切送信されません。
        </div>

        <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem" }}>
          <button className="btn-primary" style={{ flex: 1, justifyContent: "center" }} onClick={handleSave}>
            <Save size={16} />
            {saved ? "保存しました ✓" : "保存"}
          </button>
          <button className="btn-secondary" onClick={handleClear}>
            <Trash2 size={16} />
            クリア
          </button>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.5rem" }}>
          <button className="btn-secondary" style={{ flex: 1, justifyContent: "center" }} onClick={handleExport}>
            <Download size={15} /> エクスポート
          </button>
          <label className="btn-secondary" style={{ flex: 1, justifyContent: "center", cursor: "pointer" }}>
            <Upload size={15} /> インポート
            <input type="file" accept=".json" style={{ display: "none" }} onChange={handleImport} />
          </label>
        </div>

        <div className="card">
          <p style={{ fontWeight: 600, marginBottom: "0.75rem", fontSize: "0.9rem" }} className="label-upper">料金目安</p>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={{ textAlign: "left", padding: "0.5rem 0", color: "var(--text-secondary)", fontWeight: 500 }}>API</th>
                <th style={{ textAlign: "left", padding: "0.5rem 0", color: "var(--text-secondary)", fontWeight: 500 }}>料金</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "0.625rem 0" }}>Dolby.io Enhance</td>
                <td style={{ padding: "0.625rem 0", color: "var(--accent-primary)", fontWeight: 600 }}>月10時間まで無料</td>
              </tr>
              <tr>
                <td style={{ padding: "0.625rem 0" }}>OpenAI Whisper</td>
                <td style={{ padding: "0.625rem 0" }}>$0.006/分 → 90分 ≈ ¥80</td>
              </tr>
            </tbody>
          </table>
        </div>
      </main>

      <nav className="bottom-nav">
        <Link href="/"><Music2 size={20} /><span>メイン</span></Link>
        <Link href="/history"><History size={20} /><span>履歴</span></Link>
        <Link href="/settings" className="active"><Save size={20} /><span>設定</span></Link>
      </nav>
    </div>
  );
}

function TestButton({ state, onTest }: { state: TestResult; onTest: () => void }) {
  const icons = {
    idle: null,
    testing: <Loader size={13} style={{ animation: "spin 1s linear infinite" }} />,
    ok: <CheckCircle size={13} color="#22c55e" />,
    error: <XCircle size={13} color="#ef4444" />,
  };
  const labels = { idle: "接続テスト", testing: "テスト中...", ok: "接続OK", error: "接続失敗" };

  return (
    <div>
      <button
        className="btn-secondary"
        style={{ fontSize: "0.8rem", padding: "0.375rem 0.75rem", display: "flex", alignItems: "center", gap: "0.375rem" }}
        onClick={onTest}
        disabled={state.state === "testing"}
      >
        {icons[state.state]}
        {labels[state.state]}
      </button>
      {state.state === "error" && state.message && (
        <p style={{ fontSize: "0.75rem", color: "#ef4444", marginTop: "0.375rem" }}>{state.message}</p>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
