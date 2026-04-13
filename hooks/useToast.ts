"use client";

import { useCallback } from "react";
import { createPortal } from "react-dom";
import { createElement, useState, useEffect, useRef } from "react";

export type ToastType = "success" | "error" | "info";

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

// グローバルな状態（シンプルなイベントバス方式）
const listeners = new Set<(toasts: Toast[]) => void>();
let toasts: Toast[] = [];

function notify() {
  listeners.forEach((fn) => fn([...toasts]));
}

export function showToast(message: string, type: ToastType = "info", durationMs = 3000) {
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
  toasts = [...toasts, { id, message, type }];
  notify();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    notify();
  }, durationMs);
}

export function useToastContainer() {
  const [items, setItems] = useState<Toast[]>([]);

  useEffect(() => {
    listeners.add(setItems);
    return () => { listeners.delete(setItems); };
  }, []);

  return items;
}
