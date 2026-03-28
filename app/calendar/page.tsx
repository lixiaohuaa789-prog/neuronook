"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  checkInToday,
  getDB,
  getCheckins,
  getStreak,
  hasCheckedInToday,
  type StudyDB,
} from "../../lib/db";

function daysInMonth(y: number, m: number) {
  return new Date(y, m + 1, 0).getDate();
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function calendarCells(viewYear: number, viewMonth: number) {
  const first = new Date(viewYear, viewMonth, 1);
  const startPad = (first.getDay() + 6) % 7;
  const total = daysInMonth(viewYear, viewMonth);
  const cells: { day: number | null; key: string | null }[] = [];
  for (let i = 0; i < startPad; i++) cells.push({ day: null, key: null });
  for (let d = 1; d <= total; d++) {
    const key = `${viewYear}-${pad(viewMonth + 1)}-${pad(d)}`;
    cells.push({ day: d, key });
  }
  while (cells.length % 7 !== 0) cells.push({ day: null, key: null });
  return cells;
}

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

function isoToLocalDateKey(iso: string) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function CalendarPage() {
  const now = new Date();
  const [y, setY] = useState(now.getFullYear());
  const [m, setM] = useState(now.getMonth());
  const [checkSet, setCheckSet] = useState<Set<string>>(new Set());
  const [streak, setStreak] = useState(0);
  const [checkedToday, setCheckedToday] = useState(false);
  const [dbSnap, setDbSnap] = useState<StudyDB | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const sync = useCallback(() => {
    setDbSnap(getDB());
    setCheckSet(new Set(getCheckins()));
    setStreak(getStreak());
    setCheckedToday(hasCheckedInToday());
  }, []);

  useEffect(() => {
    sync();
    window.addEventListener("study-app-changed", sync as EventListener);
    return () =>
      window.removeEventListener("study-app-changed", sync as EventListener);
  }, [sync]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(t);
  }, [toast]);

  const dNow = new Date();
  const todayKey = `${dNow.getFullYear()}-${pad(dNow.getMonth() + 1)}-${pad(dNow.getDate())}`;

  const cells = useMemo(() => calendarCells(y, m), [y, m]);

  const heatLevels = useMemo(() => {
    if (!dbSnap) return {};
    const prefix = `${y}-${pad(m + 1)}-`;

    const logCounts: Record<string, number> = {};
    for (const l of dbSnap.reviewLogs) {
      if (l.review_date.startsWith(prefix)) {
        logCounts[l.review_date] = (logCounts[l.review_date] ?? 0) + 1;
      }
    }

    const out: Record<string, number> = {};
    const totalDays = daysInMonth(y, m);
    for (let day = 1; day <= totalDays; day++) {
      const key = `${y}-${pad(m + 1)}-${pad(day)}`;
      const strength = logCounts[key] ?? 0;
      const level = Math.max(0, Math.min(4, Math.floor(strength)));
      out[key] = level;
    }
    return out;
  }, [dbSnap, y, m]);

  const scheduledCounts = useMemo(() => {
    if (!dbSnap) return {};

    const prefix = `${y}-${pad(m + 1)}-`;
    const out: Record<string, number> = {};

    for (const review of dbSnap.reviews) {
      if (!review.next_review) continue;

      const key = isoToLocalDateKey(review.next_review);
      if (!key.startsWith(prefix)) continue;
      if (key <= todayKey) continue;

      out[key] = (out[key] ?? 0) + 1;
    }

    return out;
  }, [dbSnap, y, m, todayKey]);

  const title = `${y} 年 ${m + 1} 月`;

  const prevMonth = () => {
    if (m === 0) {
      setM(11);
      setY((x) => x - 1);
    } else setM((x) => x - 1);
  };

  const nextMonth = () => {
    if (m === 11) {
      setM(0);
      setY((x) => x + 1);
    } else setM((x) => x + 1);
  };

  const onCheckIn = () => {
    const fresh = checkInToday();
    sync();
    setToast(fresh ? "打卡成功 · 继续保持！" : "今天已经打过卡啦");
  };

  return (
    <>
      <div className="page-hero">
        <span className="page-kicker">Habit</span>
        <h1 className="page-title">打卡日历</h1>
        <p className="page-desc">
          完成复习会自动记一天；也可以手动打卡，用连续天数堆出一点「不想断」的惯性。
        </p>
      </div>

      <div className="calendar-hero card">
        <div className="calendar-streak-block">
          <span className="calendar-streak-value">{streak}</span>
          <span className="calendar-streak-label">连续打卡天数</span>
        </div>
        <button
          type="button"
          className={`btn btn-checkin ${checkedToday ? "btn-checkin-done" : ""}`}
          onClick={onCheckIn}
        >
          {checkedToday ? "今日已打卡 ✓" : "今日打卡"}
        </button>
      </div>

      <div className="card calendar-card">
        <div className="calendar-toolbar">
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            onClick={prevMonth}
            aria-label="上一月"
          >
            ‹
          </button>
          <h2 className="calendar-month-title">{title}</h2>
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            onClick={nextMonth}
            aria-label="下一月"
          >
            ›
          </button>
        </div>
        <div className="calendar-grid-head">
          {WEEKDAYS.map((w) => (
            <div key={w} className="calendar-wd">
              {w}
            </div>
          ))}
        </div>
        <div className="calendar-grid">
          {cells.map((cell, i) => {
            if (cell.day == null || !cell.key) {
              return <div key={`e-${i}`} className="calendar-cell empty" />;
            }
            const hit = checkSet.has(cell.key);
            const isToday = cell.key === todayKey;
            const heat = heatLevels[cell.key] ?? 0;
            const scheduled = (scheduledCounts[cell.key] ?? 0) > 0;
            return (
              <div
                key={cell.key}
                className={`calendar-cell ${hit ? "checked" : ""} ${
                  isToday ? "today" : ""
                } ${scheduled ? "scheduled" : ""} heat-${heat}`}
                title={scheduled ? `计划复习 ${scheduledCounts[cell.key]} 条` : undefined}
              >
                <span className="calendar-day-num">{cell.day}</span>
                {hit && <span className="calendar-dot" aria-hidden />}
                {scheduled && <span className="calendar-scheduled-dot" aria-hidden />}
              </div>
            );
          })}
        </div>
        <p className="calendar-legend">
          颜色越深表示当天实际复习越多，圆点表示已打卡，小角标表示未来有待复习安排。
        </p>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
