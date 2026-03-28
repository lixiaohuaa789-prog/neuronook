"use client";

import { useEffect, useState } from "react";
import { STUDY_TIMER_FINISHED_EVENT } from "../lib/trainingTimer";

export function GlobalTrainingTimerToast() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onFinished = () => {
      setOpen(true);
      window.setTimeout(() => setOpen(false), 3000);
    };

    window.addEventListener(STUDY_TIMER_FINISHED_EVENT, onFinished);
    return () => window.removeEventListener(STUDY_TIMER_FINISHED_EVENT, onFinished);
  }, []);

  if (!open) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[80] rounded-lg border border-emerald-200 bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-lg">
      本轮专注结束，建议现在去完成 3-5 张复习卡片。
    </div>
  );
}