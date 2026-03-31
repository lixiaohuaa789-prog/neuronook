"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

type ThemeMode = "light" | "dark";
type ResolvedTheme = "light" | "dark";

type ThemeContextValue = {
  mode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
};

const THEME_STORAGE_KEY = "study-app.theme-mode";
const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyHtmlTheme(theme: ResolvedTheme) {
  const htmlElement = document.documentElement;
  htmlElement.classList.remove("light", "dark");
  htmlElement.classList.add(theme);
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme 必须在 ThemeProvider 内使用");
  }
  return context;
}

/**
 * ThemeProvider 处理动态主题应用
 * 
 * 设计理念：
 * - SSR 时返回 children，使用初始的 className="light"（来自 html 标签）
 * - 客户端挂载后，useEffect 立即检测时间并应用正确的主题
 * - 由于主题类在 <html> 上应用，不会影响内部 DOM 结构，不会产生 hydration mismatch
 * - Sidebar 通过 dynamic({ ssr: false }) 彻底避免服务端渲染，也不再需要复杂的 mounted 判断
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("light");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light");

  const setMode = (nextMode: ThemeMode) => {
    setModeState(nextMode);
    window.localStorage.setItem(THEME_STORAGE_KEY, nextMode);
  };

  const toggleTheme = () => {
    setMode(resolvedTheme === "dark" ? "light" : "dark");
  };

  useEffect(() => {
    const persisted = window.localStorage.getItem(THEME_STORAGE_KEY);
    const nextMode: ThemeMode = persisted === "dark" ? "dark" : "light";
    setModeState(nextMode);
  }, []);

  useEffect(() => {
    const nextResolved = mode;
    setResolvedTheme(nextResolved);
    applyHtmlTheme(nextResolved);
  }, [mode]);

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, resolvedTheme, setMode, toggleTheme }),
    [mode, resolvedTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
