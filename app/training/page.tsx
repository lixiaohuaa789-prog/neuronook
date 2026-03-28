"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getReviewQueue, getTodayReviewStats, type ReviewQueueItem } from "../../lib/db";
import { FormulaText } from "../../components/FormulaText";
import { TrainingTimerCard } from "../../components/TrainingTimerCard";

export default function TrainingPage() {
  const [queue, setQueue] = useState<ReviewQueueItem[]>([]);
  const [stats, setStats] = useState({ total: 0, processed: 0, pending: 0, remembered: 0, forgotten: 0, accuracy: 0 });
  const [doneToast, setDoneToast] = useState<string | null>(null);

  const refresh = () => {
    setQueue(getReviewQueue());
    setStats(getTodayReviewStats());
  };

  useEffect(() => {
    refresh();
    const onChanged = () => refresh();
    window.addEventListener("study-app-changed", onChanged);
    return () => window.removeEventListener("study-app-changed", onChanged);
  }, []);

  useEffect(() => {
    if (!doneToast) return;
    const t = window.setTimeout(() => setDoneToast(null), 2800);
    return () => window.clearTimeout(t);
  }, [doneToast]);

  const handleTimerDone = useCallback((message: string) => {
    setDoneToast(message);
  }, []);

  const nextReview = useMemo(() => {
    return queue[0] ?? null;
  }, [queue]);

  return (
    <>
      <div className="page-hero">
        <span className="page-kicker">Training</span>
        <h1 className="page-title">专注训练 🚀</h1>
        <p className="page-desc">
          输出依赖输入质量。进入即倒计时，用一个番茄把注意力锁定在主动回忆，再完成今天的复习闭环。
        </p>
      </div>

      <div className="mx-auto max-w-3xl">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_3fr]">
        <TrainingTimerCard onDone={handleTimerDone} />

        <section className="card border border-[var(--border)] flex flex-col items-center text-center gap-4 justify-between">
          <p className="section-label">复习联动</p>

          <div className="grid grid-cols-2 gap-3 w-full">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 flex flex-col items-center gap-1">
              <p className="text-xs text-[var(--muted)]">今日完成度</p>
              <p className="text-3xl font-bold text-[var(--text)]">
                {stats.total > 0 ? `${Math.round((stats.processed / stats.total) * 100)}%` : "0%"}
              </p>
              <p className="text-xs text-[var(--muted)]">{stats.processed} / {stats.total} 已处理</p>
              <p className="text-xs text-[var(--muted)]">待复习：{stats.pending}</p>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 flex flex-col items-center gap-1">
              <p className="text-xs text-[var(--muted)]">今日正确率</p>
              <p className="text-3xl font-bold text-[var(--text)]">{stats.accuracy}%</p>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 w-full flex flex-col items-center gap-1">
            <p className="text-xs text-[var(--muted)]">下一张卡片</p>
            {nextReview ? (
              <>
                <div className="w-full max-w-full overflow-hidden px-1">
                  <p className="training-next-card-text text-sm font-semibold text-[var(--text)] text-center leading-6">
                    <FormulaText
                      text={nextReview.note.question || nextReview.note.front}
                      inline
                      className="training-next-formula"
                    />
                  </p>
                </div>
                <p className="text-xs text-[var(--muted)]">{nextReview.note.subject || "未分类"}</p>
              </>
            ) : (
              <p className="text-sm text-[var(--muted)]">今天队列已清空，可以去查看复盘总结。</p>
            )}
          </div>

          <div className="card-actions justify-center w-full">
            <Link href="/review" className="btn btn-primary no-underline">
              进入复习模式
            </Link>
            <Link href="/review/summary" className="btn btn-ghost no-underline">
              查看今日复盘
            </Link>
          </div>
        </section>
        </div>
      </div>

      {doneToast && (
        <div className="fixed bottom-4 right-4 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-lg">
          {doneToast}
        </div>
      )}
    </>
  );
}
