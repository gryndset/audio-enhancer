"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Trash2, Music2, Settings, HistoryIcon, HardDrive } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import ToastContainer from "@/components/ToastContainer";
import { showToast } from "@/hooks/useToast";
import HistoryCard from "@/components/HistoryCard";
import { getHistory, deleteHistoryItem, clearHistory, getStorageUsage, formatStorageSize } from "@/lib/db";

type HistoryItemWithBlob = Awaited<ReturnType<typeof getHistory>>[number];

export default function HistoryPage() {
  const { theme, changeTheme } = useTheme();
  const [items, setItems] = useState<HistoryItemWithBlob[]>([]);
  const [loading, setLoading] = useState(true);
  const [storageUsage, setStorageUsage] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      getHistory(),
      getStorageUsage(),
    ]).then(([histItems, usage]) => {
      setItems(histItems);
      setStorageUsage(formatStorageSize(usage));
    }).finally(() => setLoading(false));
  }, []);

  async function handleDelete(id: string) {
    await deleteHistoryItem(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
    // refresh usage
    getStorageUsage().then((u) => setStorageUsage(formatStorageSize(u)));
    showToast("削除しました", "info");
  }

  async function handleClearAll() {
    if (!confirm("すべての履歴を削除しますか？")) return;
    await clearHistory();
    setItems([]);
    setStorageUsage("0 B");
    showToast("全件削除しました", "info");
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-primary)", paddingBottom: "5rem" }}>
      <ToastContainer />

      {/* Header */}
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
          <span style={{ fontWeight: 700, fontSize: "1rem" }} className="label-upper">処理履歴</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <ThemeSwitcher theme={theme} onChange={changeTheme} />
          {items.length > 0 && (
            <button
              className="btn-icon"
              onClick={handleClearAll}
              title="全件削除"
              style={{ color: "#ef4444", borderColor: "rgba(239,68,68,0.3)" }}
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </header>

      <main style={{ maxWidth: 700, margin: "0 auto", padding: "1.5rem 1rem" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-secondary)" }}>
            読み込み中...
          </div>
        ) : items.length === 0 ? (
          <div style={{ textAlign: "center", padding: "4rem 2rem", color: "var(--text-secondary)" }}>
            <HistoryIcon size={48} style={{ margin: "0 auto 1rem", opacity: 0.3 }} />
            <p style={{ fontWeight: 600, marginBottom: "0.5rem" }}>履歴がありません</p>
            <p style={{ fontSize: "0.85rem" }}>処理を完了すると、ここに記録されます。</p>
            <Link href="/" style={{ display: "inline-block", marginTop: "1.5rem" }}>
              <button className="btn-primary">
                <Music2 size={16} /> メイン画面へ
              </button>
            </Link>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
            {/* Storage info */}
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "0.5rem 0.75rem",
              background: "var(--bg-secondary)",
              borderRadius: "var(--radius-btn)",
              border: "1px solid var(--border)",
              fontSize: "0.78rem",
              color: "var(--text-secondary)",
            }}>
              <span>{items.length}件（最新20件まで保存）</span>
              {storageUsage && (
                <span style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                  <HardDrive size={12} />
                  使用量: {storageUsage}
                </span>
              )}
            </div>

            {items.map((item) => (
              <HistoryCard key={item.id} item={item} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </main>

      <nav className="bottom-nav">
        <Link href="/"><Music2 size={20} /><span>メイン</span></Link>
        <Link href="/history" className="active"><HistoryIcon size={20} /><span>履歴</span></Link>
        <Link href="/settings"><Settings size={20} /><span>設定</span></Link>
      </nav>
    </div>
  );
}
