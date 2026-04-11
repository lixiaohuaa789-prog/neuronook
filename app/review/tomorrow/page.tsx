"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Virtuoso } from "react-virtuoso";
import { FormulaText } from "../../../components/FormulaText";
import {
  getDB,
  type ReviewQueueItem,
} from "../../../lib/db";
import { getSubjectTheme } from "../../../lib/subjectTheme";
import { formatNextReviewHint, srsStepHint, srsStepLabel } from "../../../lib/srs";

const TOMORROW_BATCH_SIZE = 24;

function getTomorrowReviews() {
  const db = getDB();
  if (!db) return [];

  const now = new Date();
  now.setHours(23, 59, 59, 999);

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const tomorrowEnd = new Date(tomorrow);
  tomorrowEnd.setHours(23, 59, 59, 999);

  const tomorrowReviews = db.reviews.filter((r) => {
    if (!r.next_review) return false;
    const nextDate = new Date(r.next_review);
    return nextDate > now && nextDate <= tomorrowEnd;
  });

  const items: ReviewQueueItem[] = [];
  for (const r of tomorrowReviews) {
    const note = db.notes.find((n) => n.id === r.note_id);
    if (note) items.push({ ...r, note });
  }
  return items;
}

export default function TomorrowPage() {
  const [items, setItems] = useState<ReviewQueueItem[]>([]);
  const [flipped, setFlipped] = useState<Set<number>>(() => new Set());
  const [visibleCount, setVisibleCount] = useState(TOMORROW_BATCH_SIZE);
  const [virtualReady, setVirtualReady] = useState(false);

  const refresh = useCallback(() => {
    setItems(getTomorrowReviews());
  }, []);

  const toggleFlip = (noteId: number) => {
    setFlipped((prev) => {
      const next = new Set(prev);
      if (next.has(noteId)) next.delete(noteId);
      else next.add(noteId);
      return next;
    });
  };

  useEffect(() => {
    refresh();
    window.addEventListener("study-app-changed", refresh);
    return () => window.removeEventListener("study-app-changed", refresh);
  }, [refresh]);

  useEffect(() => {
    setVisibleCount(Math.min(TOMORROW_BATCH_SIZE, items.length));
    setVirtualReady(false);
    const timer = window.setTimeout(() => setVirtualReady(true), 120);
    return () => window.clearTimeout(timer);
  }, [items]);

  const total = items.length;

  return (
    <>
      <div className="page-hero">
        <Link href="/review" className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 mb-4 text-sm font-medium">
          ← 返回复习
        </Link>
        <span className="page-kicker">Tomorrow</span>
        <h1 className="page-title">明天到期 📩</h1>
        <p className="page-desc">
          这些知识点将在明天到期，需要进行复习。提前查看可以更好地规划学习时间。
        </p>
      </div>

      <div className="review-toolbar">
        <div className="review-toolbar-meta">
          {total > 0 ? (
            <span className="pill">
              <span className="pill-dot" aria-hidden />
              {total} 张卡片
            </span>
          ) : (
            <span className="pill">明天暂无计划</span>
          )}
        </div>
      </div>

      {total === 0 && (
        <div className="empty-state">
          <strong>太棒了！</strong>
          <p>明天没有待复习的卡片。你可以继续添加新的知识点。</p>
        </div>
      )}

      <div className="review-list">
        {!virtualReady ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={`tomorrow-skeleton-${i}`} className="h-24 rounded-xl border border-[var(--border)] bg-[var(--surface)] animate-pulse" />
            ))}
          </div>
        ) : (
          <Virtuoso
            useWindowScroll
            totalCount={visibleCount}
            endReached={() => {
              setVisibleCount((prev) => {
                if (prev >= items.length) return prev;
                return Math.min(items.length, prev + TOMORROW_BATCH_SIZE);
              });
            }}
            itemContent={(index) => {
              const item = items[index];
              const theme = getSubjectTheme(item.note.subject ?? "未分类");
              return (
            <article key={item.note_id} className="card card-anki mb-3">
              <span className="review-card-index">
                {index + 1} / {total}
              </span>
              <div className="card-meta">
                <span
                  className="badge badge-subject"
                  style={{
                    background: theme.soft,
                    color: theme.accent,
                    borderColor: theme.accent,
                  }}
                >
                  {item.note.subject ?? "未分类"}
                </span>
                <span
                  className={`badge ${item.srsStep === 5 ? "badge-mastered" : "badge-step"}`}
                >
                  {srsStepLabel(item.srsStep)}
                </span>
                <span className="badge badge-muted">
                  {srsStepHint(item.srsStep)}
                </span>
                <span className="badge badge-muted">
                  到期 {formatNextReviewHint(item.next_review)}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFlip(item.note_id);
                  }}
                >
                  {flipped.has(item.note_id) ? "收起" : "翻面"}
                </button>
              </div>
              {/* 面包屑导航 */}
              <div className="flex items-center gap-1 text-xs mb-2 flex-wrap" style={{ color: "var(--muted)" }}>
                <span>🧠</span>
                <span className="font-medium">{item.note.subject ?? "未分类"}</span>
                {item.note.keyPoints?.[0] && (
                  <>
                    <span className="opacity-40">›</span>
                    <span><FormulaText text={item.note.keyPoints[0]} inline /></span>
                  </>
                )}
                {item.note.keyPoints?.[1] && (
                  <>
                    <span className="opacity-40">›</span>
                    <span><FormulaText text={item.note.keyPoints[1]} inline /></span>
                  </>
                )}
              </div>
              <div
                className={
                  flipped.has(item.note_id) ? "note-body" : "note-body note-body-front"
                }
              >
                <FormulaText text={flipped.has(item.note_id) ? (item.note.coreAnswer || item.note.content || "") : item.note.front} inline />
              </div>
            </article>
              );
            }}
          />
        )}
      </div>
    </>
  );
}
