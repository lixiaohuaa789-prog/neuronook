"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  getTrainingTimerState,
  pauseTrainingTimer,
  resetTrainingTimer,
  setTrainingTimerPreset,
  startTrainingTimer,
  type TrainingTimerState,
} from "../lib/trainingTimer";

const DEFAULT_MINUTES = 25;

type SessionPreset = {
  label: string;
  minutes: number;
};

const SESSION_PRESETS: SessionPreset[] = [
  { label: "25 分钟", minutes: 25 },
  { label: "40 分钟", minutes: 40 },
  { label: "50 分钟", minutes: 50 },
];

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function TrainingTimerCard({ onDone }: { onDone: (message: string) => void }) {
  const [timerState, setTimerState] = useState<TrainingTimerState>(() => getTrainingTimerState());
  const prevRunningRef = useRef(timerState.running);

  useEffect(() => {
    const sync = () => setTimerState(getTrainingTimerState());
    sync();
    const timer = window.setInterval(sync, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (prevRunningRef.current && !timerState.running && timerState.remainingSec === 0) {
      onDone("本轮专注结束，建议立刻完成 3-5 张主动回忆卡片。");
    }
    prevRunningRef.current = timerState.running;
  }, [onDone, timerState.running, timerState.remainingSec]);

  const totalSec = timerState.totalSec;
  const sessionMinutes = Math.max(1, Math.round(totalSec / 60));
  const progress = 1 - timerState.remainingSec / Math.max(totalSec, 1);

  return (
    <section className="card border border-[var(--border)]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="section-label !mb-0">沉浸计时器</p>
        <div className="chip-row mt-0">
          {SESSION_PRESETS.map((preset) => (
            <button
              key={preset.minutes}
              type="button"
              className="chip"
              data-active={sessionMinutes === preset.minutes ? "true" : "false"}
              onClick={() => setTimerState(setTrainingTimerPreset(preset.minutes))}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div className="pomodoro-layout">
        <div className="pomodoro-visual" style={{ "--progress": progress } as CSSProperties} aria-hidden>
          <div className="pomodoro-ring-track" />
          <div className="pomodoro-ring-fill" />
          <div className="pomodoro-ring-core">
            <div className="pomodoro-status" data-on={timerState.running ? "true" : "false"}>
              {timerState.running ? "沉浸复习中" : "已暂停"}
            </div>
            <div className="pomodoro-display">{formatTime(timerState.remainingSec)}</div>
          </div>
        </div>

        <div className="pomodoro-bar" aria-hidden>
          <div className="pomodoro-bar-fill" style={{ width: `${Math.max(0, progress) * 100}%` }} />
        </div>
      </div>

      <div className="card-actions" style={{ justifyContent: "center" }}>
        <button type="button" className="btn btn-primary" onClick={() => setTimerState(startTrainingTimer())}>
          开始
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setTimerState(pauseTrainingTimer())}>
          暂停
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setTimerState(resetTrainingTimer())}>
          重置
        </button>
      </div>

      <div className="mt-4 rounded-lg p-2">
        <p className="text-xs text-[var(--muted)] opacity-70">
          💡 建议每轮只处理一个主题：<br />先看题面回忆，再核对答案，<br />再用"记住/忘记"完成反馈闭环。
        </p>
      </div>
    </section>
  );
}
