"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Brain, Flame, BookOpen, Calendar, Zap, Target } from "lucide-react";
import { FormulaText } from "../components/FormulaText";
import {
  getDB,
  getStudyStats,
  getAllNotes,
  getLocalDateKey,
  type Note,
} from "../lib/db";

type Stats = {
  noteCount: number;
  dueCount: number;
  streak: number;
  masteredCount: number;
};
type ForecastItem = { label: string; count: number };

function getGreeting(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 9) return "🌅 清晨好呀，海马体正在预热";
  if (h >= 9 && h < 12) return "🌞 上午好呀，海马体正在活跃期";
  if (h >= 12 && h < 14) return "☀️ 午间好呀，注意适当休息";
  if (h >= 14 && h < 18) return "🌤️ 下午好呀，专注力处于峰值";
  if (h >= 18 && h < 21) return "🌆 傍晚好呀，复习记忆最佳时";
  return "🌙 夜间好，睡前轻度复习";
}

export default function Home() {
  const [stats, setStats] = useState<Stats>({
    noteCount: 0,
    dueCount: 0,
    streak: 0,
    masteredCount: 0,
  });
  const [recentNotes, setRecentNotes] = useState<Note[]>([]);
  const [forecast, setForecast] = useState<ForecastItem[]>([]);

  useEffect(() => {
    const load = () => {
      setStats(getStudyStats());
      setRecentNotes(getAllNotes().slice(0, 3));

      const db = getDB();
      if (!db) return;
      const today = new Date();
      const endOfToday = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
        23,
        59,
        59,
        999
      );
      const fc: ForecastItem[] = [1, 2, 3].map((i) => {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        const dayKey = getLocalDateKey(d);
        const count = db.reviews.filter((r) => {
          if (!r.next_review) return false;
          const rv = new Date(r.next_review);
          return rv > endOfToday && getLocalDateKey(rv) === dayKey;
        }).length;
        return { label: ["明天", "后天", "大后天"][i - 1], count };
      });
      setForecast(fc);
    };

    load();
    window.addEventListener("study-app-changed", load);
    return () => window.removeEventListener("study-app-changed", load);
  }, []);

  const greeting = getGreeting();
  const maxForecast = Math.max(...forecast.map((f) => f.count), 1);
  const conversionRate =
    stats.noteCount > 0
      ? Math.round((stats.masteredCount / stats.noteCount) * 100)
      : 0;

  return (
    <div className="space-y-5 md:space-y-6">
      {/* ── Hero Action Card ── */}
      <div
        className="rounded-[2rem] p-6 md:p-8"
        style={{
          background: "linear-gradient(135deg, var(--accent) 0%, #5a7353 100%)",
          boxShadow: "0 12px 32px var(--accent-soft)",
        }}
      >
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="text-white">
            <p className="mb-2 text-sm font-medium opacity-80">{greeting}</p>
            <h1 className="text-2xl font-bold leading-snug tracking-tight md:text-3xl">
              今日有 {" "}
              <span className="underline decoration-white/40 underline-offset-4">
                {stats.dueCount} 
              </span>
              个神经突触
              <br />
              等待加固
            </h1>
            <p className="mt-2 text-sm opacity-60">
              海马体记忆黄金窗口 · 间隔重复算法护航
            </p>
          </div>
          <Link
            href="/training"
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-[var(--surface)] px-7 py-4 text-base font-bold text-[var(--accent)] shadow-lg no-underline transition-all duration-200 hover:scale-105 hover:shadow-xl active:scale-[0.98]"
          >
            <Zap size={18} className="text-[var(--accent)]" />
            ▶ 启动今日专注舱
          </Link>
        </div>
      </div>

      {/* ── Vital Stats Row ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 md:gap-4">
        {/* 记忆转化率 */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm transition-shadow hover:shadow-md md:p-5">
          <div className="mb-3 flex items-center gap-2">
            <Target size={14} className="shrink-0 text-[var(--accent)]" />
            <span className="text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">
              记忆转化率
            </span>
          </div>
          <p className="text-3xl font-bold text-[var(--text)]">
            {conversionRate}
            <span className="ml-0.5 text-lg font-semibold text-[var(--muted)]">%</span>
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            已掌握{" "}
            <span className="font-medium text-[var(--text)]">{stats.masteredCount}</span>{" "}
            / 共{" "}
            <span className="font-medium text-[var(--text)]">{stats.noteCount}</span>{" "}
            个知识点
          </p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
            <div
              className="h-1.5 rounded-full bg-[var(--accent)] transition-all duration-700"
              style={{ width: `${conversionRate}%` }}
            />
          </div>
        </div>

        {/* 突触活跃度 */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm transition-shadow hover:shadow-md md:p-5">
          <div className="mb-3 flex items-center gap-2">
            <Flame size={14} className="shrink-0 text-[var(--accent)]" />
            <span className="text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">
              突触活跃度
            </span>
          </div>
          <p className="text-3xl font-bold text-[var(--text)]">
            {stats.streak}
            <span className="ml-1 text-2xl">🔥</span>
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">连续打卡天数</p>
          <p className="mt-2 text-xs text-[var(--muted)]">
            {stats.streak >= 7
              ? "🏆 连续一周！神经可塑性峰值"
              : stats.streak >= 3
              ? "⚡ 正在建立习惯突触"
              : "开始打卡，激活海马体"}
          </p>
        </div>

        {/* 今日脑负荷 */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm transition-shadow hover:shadow-md md:p-5">
          <div className="mb-3 flex items-center gap-2">
            <Brain size={14} className="shrink-0 text-[var(--accent)]" />
            <span className="text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">
              今日脑负荷
            </span>
          </div>
          <p className="text-3xl font-bold text-[var(--text)]">{stats.dueCount}</p>
          <p className="mt-1 text-sm text-[var(--muted)]">张卡片待复习</p>
          <p className="mt-2 text-xs text-[var(--muted)]">
            {stats.dueCount === 0
              ? "🎉 今日已清空！继续保持"
              : stats.dueCount <= 5
              ? "轻松模式，约 10 分钟可完成"
              : "建议分 2 轮完成，保持专注"}
          </p>
        </div>
      </div>

      {/* ── Dual Column ── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
        {/* 左：最新播种的神经元 */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm md:p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookOpen size={14} className="shrink-0 text-[var(--accent)]" />
              <h2 className="text-sm font-semibold text-[var(--text)]">
                🌱 最新播种的神经元
              </h2>
            </div>
            <Link
              href="/notes"
              className="text-xs text-[var(--accent)] no-underline hover:underline"
            >
              全部 →
            </Link>
          </div>
          {recentNotes.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--muted)]">
              还没有知识点，去添加第一个 ✨
            </p>
          ) : (
            <ul className="space-y-0.5">
              {recentNotes.map((note) => (
                <li key={note.id}>
                  <Link
                    href={`/notes?focusNote=${note.id}`}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 no-underline transition-colors hover:bg-[var(--surface-hover)]"
                  >
                    <span className="flex-1 truncate text-sm font-medium text-[var(--text)]">
                      <FormulaText text={note.front} inline />
                    </span>
                    <span className="shrink-0 rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[11px] font-medium text-[var(--muted)]">
                      {note.subject || "未分类"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 右：记忆潜伏期预告 */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm md:p-5">
          <div className="mb-4 flex items-center gap-2">
            <Calendar size={14} className="shrink-0 text-[var(--accent)]" />
            <h2 className="text-sm font-semibold text-[var(--text)]">
              🗓️ 记忆潜伏期预告
            </h2>
          </div>
          {forecast.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--muted)]">加载中…</p>
          ) : (
            <div className="space-y-3.5">
              {forecast.map(({ label, count }) => (
                <div key={label} className="flex items-center gap-3">
                  <span className="w-14 shrink-0 text-sm font-medium text-[var(--muted)]">
                    {label}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--surface-2)]">
                    <div
                      className="h-2 rounded-full bg-[var(--accent)] transition-all duration-500"
                      style={{
                        width:
                          count === 0
                            ? "0%"
                            : `${Math.max(6, Math.round((count / maxForecast) * 100))}%`,
                      }}
                    />
                  </div>
                  <span className="w-12 shrink-0 text-right text-sm font-bold text-[var(--text)]">
                    {count} 张
                  </span>
                </div>
              ))}
              <p className="pt-1 text-xs text-[var(--muted)]">
                提前预知复归压力，合理规划学习节奏
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
