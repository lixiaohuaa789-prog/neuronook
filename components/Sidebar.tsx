"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Brain, CalendarDays, LayoutDashboard, Trees } from "lucide-react";
import { getTrainingTimerState, STUDY_TIMER_EVENT } from "../lib/trainingTimer";
import { BioClockWidget } from "./BioClockWidget";
import { CloudSyncPanel } from "./CloudSyncPanel";
import avatarImage from "../icon/yjtp.png";

const navItems = [
  {
    href: "/",
    title: "神经中枢",
    subtitle: "学习总览",
    icon: LayoutDashboard,
    isActive: (pathname: string) => pathname === "/",
  },
  {
    href: "/forest",
    title: "知识森林",
    subtitle: "树干优先 · 融合星图",
    icon: Trees,
    isActive: (pathname: string) =>
      pathname.startsWith("/forest") ||
      pathname.startsWith("/folders") ||
      pathname.startsWith("/notes") ||
      pathname.startsWith("/galaxy"),
  },
  {
    href: "/training",
    title: "专注训练",
    subtitle: "沉浸复习",
    icon: Brain,
    isActive: (pathname: string) =>
      pathname.startsWith("/training") || pathname.startsWith("/review") || pathname.startsWith("/pomodoro"),
  },
  {
    href: "/stats",
    title: "记忆轨迹",
    subtitle: "多巴胺热力图 · 突触生长",
    icon: CalendarDays,
    isActive: (pathname: string) => pathname.startsWith("/stats") || pathname.startsWith("/calendar"),
  },
] as const;


/**
 * Sidebar 组件 - 侧边栏
 * 
 * 这是一个仅由客户端渲染的组件（via dynamic({ ssr: false }))
 * 因此不会产生 hydration mismatch 问题
 */
export function Sidebar() {
  const pathname = usePathname();
  const [timerDisplay, setTimerDisplay] = useState<{ time: number } | null>(null);

  useEffect(() => {
    const sync = () => {
      const state = getTrainingTimerState();
      setTimerDisplay(state.running ? { time: state.remainingSec } : null);
    };

    const handler = () => sync();

    sync();
    window.addEventListener(STUDY_TIMER_EVENT, handler);
    const timer = window.setInterval(sync, 1000);

    return () => {
      window.removeEventListener(STUDY_TIMER_EVENT, handler);
      window.clearInterval(timer);
    };
  }, []);

  return (
    <aside className="sidebar border-r border-gray-200/60 bg-gray-50/40 px-3 py-4" aria-label="侧边栏">
      <div className="flex h-full flex-col bg-transparent px-1">
        <Link
          href="/"
          className="group flex items-center gap-3 rounded-xl px-2 py-2 no-underline transition-all duration-200 hover:bg-gray-100/50"
        >
          <span className="inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl bg-white/90 shadow-sm transition-all duration-200 ring-1 ring-gray-200/80 group-hover:ring-gray-300">
            <Image
              src={avatarImage}
              alt="头像"
              className="h-full w-full object-cover"
              priority
            />
          </span>
          <span className="flex min-w-0 flex-col leading-tight text-gray-800">
            <span className="break-words text-[0.95rem] font-bold tracking-tight">NeuroNook</span>
            <small className="whitespace-normal break-words text-[0.68rem] font-medium leading-snug text-gray-500">
              It's Okay to not to be Okay🤍
            </small>
          </span>
        </Link>

        <nav className="mt-4 flex flex-1 flex-col gap-1.5" aria-label="核心导航">
          {navItems.map(({ href, title, subtitle, icon: Icon, isActive }) => {
            const active = isActive(pathname);
            const isTraining = href === "/training";

            return (
              <Link
                key={href}
                href={href}
                data-active={active ? "true" : "false"}
                className={[
                  "group flex items-center gap-3 rounded-xl px-3 py-2.5 no-underline transition-all duration-200",
                  "hover:bg-gray-100/50 hover:text-gray-900",
                  active
                    ? "border border-gray-100/80 bg-white text-emerald-600 font-semibold shadow-sm"
                    : "border border-transparent text-gray-500 font-medium",
                ].join(" ")}
              >
                <span
                  className={[
                    "inline-flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-200",
                    active
                      ? "text-emerald-500"
                      : "text-gray-400 group-hover:text-gray-700",
                  ].join(" ")}
                >
                  <Icon size={18} strokeWidth={2.2} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block whitespace-normal break-words text-[0.88rem] leading-tight">{title}</span>
                  <span
                    className={[
                      "mt-0.5 block whitespace-normal break-words text-[0.7rem] font-medium leading-tight",
                      active ? "text-emerald-500/90" : "text-gray-400 group-hover:text-gray-500",
                    ].join(" ")}
                  >
                    {subtitle}
                  </span>
                  {isTraining && timerDisplay && (
                    <span className="mt-0.5 flex items-center gap-1">
                      <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                      <span className="font-mono text-[0.72rem] font-semibold text-emerald-600">
                        {String(Math.floor(timerDisplay.time / 60)).padStart(2, "0")}:{String(timerDisplay.time % 60).padStart(2, "0")}
                      </span>
                    </span>
                  )}
                </span>
              </Link>
            );
          })}

          <div className="pt-1">
            <CloudSyncPanel compact />
          </div>
        </nav>

        <section className="mt-4">
          <BioClockWidget mode="sidebar" />
        </section>

        <footer className="mt-4 border-t border-gray-200/70 pt-3">
          <p className="whitespace-normal break-words text-[0.68rem] font-medium tracking-wide text-gray-400">
            本地优先 · 可选端到端云备份
          </p>
        </footer>
      </div>
    </aside>
  );
}
