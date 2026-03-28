"use client";

import { useState, useEffect, type CSSProperties } from "react";

const DEFAULT_SEC = 25 * 60;

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function Pomodoro() {
  const [time, setTime] = useState(DEFAULT_SEC);
  const [running, setRunning] = useState(false);

  const progress = 1 - time / DEFAULT_SEC;

  useEffect(() => {
    if (!running) return;

    const timer = window.setInterval(() => {
      setTime((t) => {
        if (t <= 1) {
          window.clearInterval(timer);
          alert("完成一个番茄！");
          setRunning(false);
          return DEFAULT_SEC;
        }
        return t - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [running]);

  return (
    <>
      <div className="page-hero">
        <span className="page-kicker">Focus</span>
        <h1 className="page-title">番茄钟</h1>
        <p className="page-desc">
          默认 25 分钟；环形进度随时间推进，结束后自动复位。
        </p>
      </div>

      <div className="card">
        <div className="pomodoro-layout">
          <div
            className="pomodoro-visual"
            style={{ "--progress": progress } as CSSProperties}
            aria-hidden
          >
            <div className="pomodoro-ring-track" />
            <div className="pomodoro-ring-fill" />
            <div className="pomodoro-ring-core">
              <div
                className="pomodoro-status"
                data-on={running ? "true" : "false"}
              >
                {running ? "专注中" : "已暂停"}
              </div>
              <div className="pomodoro-display">{formatTime(time)}</div>
            </div>
          </div>
          <div className="pomodoro-bar" aria-hidden>
            <div
              className="pomodoro-bar-fill"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>
        <div className="card-actions" style={{ justifyContent: "center" }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setRunning(true)}
          >
            开始
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setRunning(false)}
          >
            暂停
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setRunning(false);
              setTime(DEFAULT_SEC);
            }}
          >
            重置
          </button>
        </div>
      </div>
    </>
  );
}
