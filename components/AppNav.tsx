"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Brain, CalendarDays, LayoutDashboard, Trees } from "lucide-react";
import { getTrainingTimerState, STUDY_TIMER_EVENT } from "../lib/trainingTimer";
import { BioClockWidget } from "./BioClockWidget";
import { CloudSyncPanel } from "./CloudSyncPanel";

const links = [
  {
    href: "/",
    title: "神经中枢",
    subtitle: "学习总览",
    icon: LayoutDashboard,
    match: (p: string) => p === "/",
  },
  {
    href: "/forest",
    title: "知识森林",
    subtitle: "树干优先 · 融合星图",
    icon: Trees,
    match: (p: string) =>
      p.startsWith("/forest") || p.startsWith("/folders") || p.startsWith("/notes") || p.startsWith("/galaxy"),
  },
  {
    href: "/training",
    title: "专注训练",
    subtitle: "沉浸复习",
    icon: Brain,
    match: (p: string) => p.startsWith("/training") || p.startsWith("/review") || p.startsWith("/pomodoro"),
  },
  {
    href: "/stats",
    title: "记忆轨迹",
    subtitle: "多巴胺热力图 · 突触生长",
    icon: CalendarDays,
    match: (p: string) => p.startsWith("/stats") || p.startsWith("/calendar"),
  },
] as const;

export function AppNav({
  className,
  onNavigate,
}: {
  className?: string;
  onNavigate?: () => void;
}) {
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
    <nav className={className ?? "flex flex-col gap-1.5"} aria-label="主导航">
      {links.map(({ href, title, subtitle, icon: Icon, match }) => {
        const active = match(pathname);
        const isTraining = href === "/training";

        return (
          <Link
            key={href}
            href={href}
            className={[
              "group flex items-center gap-3 rounded-xl px-3 py-2.5 no-underline transition-all duration-200",
              "hover:bg-[var(--surface-hover)] hover:text-[var(--text)]",
              active
                ? "border border-[var(--border)] bg-[var(--surface)] text-emerald-500 font-semibold shadow-sm"
                : "border border-transparent text-[var(--muted)] font-medium",
            ].join(" ")}
            title={title}
            data-active={active ? "true" : "false"}
            onClick={onNavigate}
          >
            <span
              className={[
                "inline-flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-200",
                active ? "text-emerald-500" : "text-[var(--muted)] group-hover:text-[var(--text)]",
              ].join(" ")}
              aria-hidden
            >
              <Icon size={18} strokeWidth={2.2} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block whitespace-normal break-words text-[0.88rem] leading-tight">{title}</span>
              <span
                className={[
                  "mt-0.5 block whitespace-normal break-words text-[0.7rem] font-medium leading-tight",
                  active ? "text-emerald-500/90" : "text-[var(--muted)] group-hover:text-[var(--muted)]/90",
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

      <div className="mt-4 border-t border-[var(--border)] pt-4">
        <BioClockWidget mode="appnav" />
      </div>

      <div className="mt-4 border-t border-[var(--border)] pt-3">
        <p className="whitespace-normal break-words text-[0.68rem] font-medium tracking-wide text-[var(--muted)]">
          本地优先 · 可选端到端云备份
        </p>
      </div>
    </nav>
  );
}
