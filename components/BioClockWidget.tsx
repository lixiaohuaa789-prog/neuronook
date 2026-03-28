"use client";

import { useEffect, useState } from "react";

type RhythmState = {
  badge: string;
  title: string;
  description: string;
  palette: {
    border: string;
    background: string;
    title: string;
    badge: string;
  };
};

type BioClockWidgetProps = {
  mode?: "sidebar" | "appnav";
};

function getRhythmState(date = new Date()): RhythmState {
  const hour = date.getHours();

  if ((hour >= 8 && hour < 12) || (hour >= 14 && hour < 18)) {
    return {
      badge: "🦁 狮子期·活跃",
      title: "记忆活跃·宜复习新知识",
      description: "前额叶更清醒，适合高强度编码与主动回忆。",
      palette: {
        border: "border-amber-100/60",
        background: "bg-orange-50/50",
        title: "text-orange-700",
        badge: "text-amber-700",
      },
    };
  }

  if (hour >= 21 || hour < 6) {
    return {
      badge: "🌙 睡眠黄金期",
      title: "脑波平缓·宜复盘入睡",
      description: "轻量复盘后留白休息，让记忆在夜间完成巩固。",
      palette: {
        border: "border-indigo-100/60",
        background: "bg-indigo-50/50",
        title: "text-indigo-700",
        badge: "text-indigo-700",
      },
    };
  }

  return {
    badge: "🌿 节律平稳",
    title: "保持节奏·宜整理与串联",
    description: "把碎片知识连成路径，给下一次输出做准备。",
    palette: {
      border: "border-emerald-100/60",
      background: "bg-emerald-50/50",
      title: "text-emerald-700",
      badge: "text-emerald-700",
    },
  };
}

function isSameRhythm(a: RhythmState, b: RhythmState): boolean {
  return a.badge === b.badge && a.title === b.title && a.description === b.description;
}

export function BioClockWidget({ mode = "sidebar" }: BioClockWidgetProps) {
  const [rhythm, setRhythm] = useState<RhythmState>(() => getRhythmState());

  useEffect(() => {
    const tick = () => {
      setRhythm((prev) => {
        const next = getRhythmState();
        return isSameRhythm(prev, next) ? prev : next;
      });
    };

    tick();
    const timer = window.setInterval(tick, 300_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div
      className={[
        "rounded-2xl p-3 backdrop-blur-sm",
        rhythm.palette.border,
        rhythm.palette.background,
      ].join(" ")}
    >
      <p className={["text-[0.75rem] font-semibold", rhythm.palette.badge].join(" ")}>{rhythm.badge}</p>
      {mode === "sidebar" ? (
        <>
          <p className={["mt-1 text-[0.8rem] font-medium leading-snug", rhythm.palette.title].join(" ")}>
            {rhythm.title}
          </p>
          <p className="mt-1 text-[0.72rem] leading-relaxed text-gray-500">{rhythm.description}</p>
        </>
      ) : (
        <p className={["text-[0.78rem] font-medium leading-snug", rhythm.palette.title].join(" ")}>
          {rhythm.description}
        </p>
      )}
    </div>
  );
}
