import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { GlobalTrainingTimer } from "../components/GlobalTrainingTimer";
import { GlobalTrainingTimerSync } from "../components/GlobalTrainingTimerSync";
import { GlobalTrainingTimerToast } from "../components/GlobalTrainingTimerToast";
import { MobileTopNav } from "../components/MobileTopNav";
import { ThemeProvider } from "../components/ThemeProvider";
import "katex/dist/katex.min.css";
import "./globals.css";

// 动态导入 Sidebar，设置 ssr: false 以彻底避免 hydration mismatch
const DynamicSidebar = dynamic(() => import("../components/Sidebar").then(mod => ({ default: mod.Sidebar })), {
  ssr: false,
});

export const metadata: Metadata = {
  title: "NeuroNook",
  description: "知识点笔记本、双引擎复习与打卡日历",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" className="light">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="app-body" suppressHydrationWarning>
        <ThemeProvider>
          <GlobalTrainingTimerSync />
          <GlobalTrainingTimerToast />
          <div className="app-shell">
            <DynamicSidebar />
            <div className="main-wrap">
              <MobileTopNav />
              <GlobalTrainingTimer />
              <main className="main-content max-w-5xl mx-auto">{children}</main>
              <footer className="app-footer">
                数据保存在本机浏览器 · 清空站点数据会丢失笔记
              </footer>
            </div>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
