"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getCheckins, getDB, getStreak, type StudyDB } from "../../lib/db";

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function calendarCells(year: number, month: number) {
  const first = new Date(year, month, 1);
  const startPad = (first.getDay() + 6) % 7;
  const total = daysInMonth(year, month);
  const cells: { day: number | null; key: string | null }[] = [];

  for (let i = 0; i < startPad; i++) cells.push({ day: null, key: null });
  for (let d = 1; d <= total; d++) {
    cells.push({ day: d, key: `${year}-${pad(month + 1)}-${pad(d)}` });
  }
  while (cells.length % 7 !== 0) cells.push({ day: null, key: null });

  return cells;
}

function isoToLocalDateKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function buildLast7DaySeries(db: StudyDB | null) {
  if (!db) return [] as Array<{ key: string; value: number }>;

  const counts: Record<string, number> = {};
  for (const log of db.reviewLogs) {
    counts[log.review_date] = (counts[log.review_date] ?? 0) + 1;
  }

  const out: Array<{ key: string; value: number }> = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    out.push({ key, value: counts[key] ?? 0 });
  }

  return out;
}

export default function StatsPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [dbSnap, setDbSnap] = useState<StudyDB | null>(null);
  const [checkSet, setCheckSet] = useState<Set<string>>(new Set());
  const [streak, setStreak] = useState(0);

  const sync = useCallback(() => {
    setDbSnap(getDB());
    setCheckSet(new Set(getCheckins()));
    setStreak(getStreak());
  }, []);

  useEffect(() => {
    sync();
    window.addEventListener("study-app-changed", sync as EventListener);
    return () => window.removeEventListener("study-app-changed", sync as EventListener);
  }, [sync]);

  const cells = useMemo(() => calendarCells(year, month), [year, month]);

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  const heatLevels = useMemo(() => {
    if (!dbSnap) return {} as Record<string, number>;

    const prefix = `${year}-${pad(month + 1)}-`;

    const logCounts: Record<string, number> = {};
    for (const log of dbSnap.reviewLogs) {
      if (log.review_date.startsWith(prefix)) {
        logCounts[log.review_date] = (logCounts[log.review_date] ?? 0) + 1;
      }
    }

    const out: Record<string, number> = {};
    const totalDays = daysInMonth(year, month);
    for (let day = 1; day <= totalDays; day++) {
      const key = `${year}-${pad(month + 1)}-${pad(day)}`;
      out[key] = Math.max(0, Math.min(4, Math.floor(logCounts[key] ?? 0)));
    }

    return out;
  }, [dbSnap, year, month]);

  const scheduledCounts = useMemo(() => {
    if (!dbSnap) return {} as Record<string, number>;
    const prefix = `${year}-${pad(month + 1)}-`;
    const out: Record<string, number> = {};
    for (const review of dbSnap.reviews) {
      if (!review.next_review) continue;
      const key = isoToLocalDateKey(review.next_review);
      if (!key.startsWith(prefix)) continue;
      if (key <= todayKey) continue;
      out[key] = (out[key] ?? 0) + 1;
    }
    return out;
  }, [dbSnap, year, month, todayKey]);

  const title = `${year} 年 ${month + 1} 月`;

  const noteCount = dbSnap?.notes.length ?? 0;
  const inProgress = dbSnap?.reviews.filter((r) => r.srsStep >= 2 && r.srsStep <= 4).length ?? 0;
  const mastered = dbSnap?.reviews.filter((r) => r.srsStep === 5).length ?? 0;
  const synapseRatio = noteCount > 0 ? Math.round((mastered / noteCount) * 100) : 0;

  const last7Days = useMemo(() => buildLast7DaySeries(dbSnap), [dbSnap]);
  const maxBar = Math.max(1, ...last7Days.map((d) => d.value));

  const prevMonth = () => {
    if (month === 0) {
      setMonth(11);
      setYear((v) => v - 1);
    } else {
      setMonth((v) => v - 1);
    }
  };

  const nextMonth = () => {
    if (month === 11) {
      setMonth(0);
      setYear((v) => v + 1);
    } else {
      setMonth((v) => v + 1);
    }
  };

  return (
    <>
      <div className="page-hero">
        <span className="page-kicker">Memory Track</span>
        <h1 className="page-title">记忆轨迹 📈</h1>
        <p className="page-desc">
          在这里观察多巴胺热力图与突触生长情况，看到你每天复习投入如何沉淀为长期记忆连接。
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-4">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
          <p className="text-xs text-[var(--muted)]">连续活跃</p>
          <p className="text-2xl font-bold text-[var(--text)]">{streak}</p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
          <p className="text-xs text-[var(--muted)]">总知识点</p>
          <p className="text-2xl font-bold text-[var(--text)]">{noteCount}</p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
          <p className="text-xs text-[var(--muted)]">突触生长中</p>
          <p className="text-2xl font-bold text-emerald-700">{inProgress}</p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
          <p className="text-xs text-[var(--muted)]">长期巩固率</p>
          <p className="text-2xl font-bold text-emerald-700">{synapseRatio}%</p>
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-[1100px] grid-cols-1 justify-items-center gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="card calendar-card w-full">
          <div className="calendar-toolbar">
            <button type="button" className="btn btn-ghost btn-icon" onClick={prevMonth} aria-label="上一月">
              ‹
            </button>
            <h2 className="calendar-month-title text-center">多巴胺热力图 · {title}</h2>
            <button type="button" className="btn btn-ghost btn-icon" onClick={nextMonth} aria-label="下一月">
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
                return <div key={`empty-${i}`} className="calendar-cell empty" />;
              }
              const isToday = cell.key === todayKey;
              const checked = checkSet.has(cell.key);
              const heat = heatLevels[cell.key] ?? 0;
              const scheduled = (scheduledCounts[cell.key] ?? 0) > 0;

              return (
                <div
                  key={cell.key}
                  className={`calendar-cell heat-${heat} ${isToday ? "today" : ""} ${checked ? "checked" : ""} ${scheduled ? "scheduled" : ""}`}
                  title={scheduled ? `计划复习 ${scheduledCounts[cell.key]} 条` : undefined}
                >
                  <span className="calendar-day-num">{cell.day}</span>
                  {checked && <span className="calendar-dot" aria-hidden />}
                  {scheduled && <span className="calendar-scheduled-dot" aria-hidden />}
                </div>
              );
            })}
          </div>

          <p className="mt-3 text-xs text-[var(--muted)]">
            颜色越深表示当天复习密度越高，圆点表示有打卡记录，小角标表示未来有待复习安排。
          </p>
        </section>

        <section className="card w-full">
          <p className="section-label text-center">突触生长趋势</p>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
            <p className="text-xs text-[var(--muted)]">近 7 天复习输出</p>
            <div className="mt-3 grid grid-cols-7 gap-2 items-end h-28">
              {last7Days.map((d) => {
                const h = Math.max(8, Math.round((d.value / maxBar) * 100));
                return (
                  <div key={d.key} className="flex flex-col items-center gap-1">
                    <div className="w-full rounded-md bg-emerald-100" style={{ height: `${h}%` }} />
                    <span className="text-[0.62rem] text-[var(--muted)]">{d.key.slice(8)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50/70 p-3">
            <p className="text-xs font-semibold text-emerald-700">生长解读</p>
            <p className="mt-1 text-sm text-gray-600">
              当前有 {inProgress} 个知识点处于巩固阶段，{mastered} 个已进入长期记忆。保持连续复习能持续强化突触连接。
            </p>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link href="/review" className="btn btn-primary no-underline px-6 py-3 text-base min-w-[140px] text-center shadow-lg shadow-emerald-200/80 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-emerald-300/90 transition-all">去复习</Link>
            <Link href="/calendar" className="btn btn-ghost no-underline px-6 py-3 text-base min-w-[140px] text-center">查看打卡日历</Link>
          </div>
        </section>
      </div>
    </>
  );
}
