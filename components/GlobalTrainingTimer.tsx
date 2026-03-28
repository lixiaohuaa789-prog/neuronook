"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getTrainingTimerState, STUDY_TIMER_EVENT } from "../lib/trainingTimer";

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function GlobalTrainingTimer() {
  const [timerDisplay, setTimerDisplay] = useState<{ time: number } | null>(null);

  useEffect(() => {
    const sync = () => {
      const state = getTrainingTimerState();
      if (state.running) {
        setTimerDisplay({ time: state.remainingSec });
        return;
      }
      setTimerDisplay(null);
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

  if (!timerDisplay) return null;

  return (
    <div className="mx-auto flex w-full max-w-5xl justify-end px-4 pt-2">
      <Link
        href="/training"
        className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/60 bg-white/70 px-2.5 py-1 text-xs font-medium text-emerald-700/90 no-underline shadow-[0_2px_8px_rgba(16,185,129,0.08)] backdrop-blur"
      >
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500/90" />
        <span className="font-mono text-[0.78rem] font-semibold text-emerald-800/90">{formatTime(timerDisplay.time)}</span>
      </Link>
    </div>
  );
}