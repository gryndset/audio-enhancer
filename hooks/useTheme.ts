"use client";

import { useState, useEffect } from "react";

export type Theme = "clean" | "kawaii" | "hiphop";

export function useTheme() {
  const [theme, setTheme] = useState<Theme>("clean");

  useEffect(() => {
    const saved = localStorage.getItem("theme") as Theme | null;
    if (saved && ["clean", "kawaii", "hiphop"].includes(saved)) {
      setTheme(saved);
      document.documentElement.setAttribute("data-theme", saved);
    }
  }, []);

  const changeTheme = (t: Theme) => {
    setTheme(t);
    localStorage.setItem("theme", t);
    document.documentElement.setAttribute("data-theme", t);
  };

  return { theme, changeTheme };
}
