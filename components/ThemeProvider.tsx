"use client";

import { useEffect } from "react";

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
  useEffect(() => {
    // 应用动态主题
    function applyTheme() {
      const hour = new Date().getHours();
      const isDarkMode = hour >= 21 || hour < 7;
      const htmlElement = document.documentElement;
      
      if (isDarkMode) {
        htmlElement.classList.add("dark");
        htmlElement.classList.remove("light");
      } else {
        htmlElement.classList.add("light");
        htmlElement.classList.remove("dark");
      }
    }

    // 初始应用
    applyTheme();

    // 每 5 分钟检查一次即可覆盖昼夜切换，避免不必要轮询
    const interval = setInterval(applyTheme, 300000);
    
    return () => clearInterval(interval);
  }, []);

  return children;
}
