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

const MASTERED_BATCH_SIZE = 24;

function getMasteredReviews() {
  const db = getDB();
  if (!db) return [];

  const masteredReviews = db.reviews.filter((r) => r.srsStep === 5);

  const items: ReviewQueueItem[] = [];
  for (const r of masteredReviews) {
    const note = db.notes.find((n) => n.id === r.note_id);
    if (note) items.push({ ...r, note });
  }

  // 按照创建时间倒序
  return items.sort((a, b) => {
    const dateA = new Date(a.note.created_at).getTime();
    const dateB = new Date(b.note.created_at).getTime();
    return dateB - dateA;
  });
}

export default function MasteredPage() {
  const [items, setItems] = useState<ReviewQueueItem[]>([]);
  const [flipped, setFlipped] = useState<Set<number>>(() => new Set());
  const [visibleCount, setVisibleCount] = useState(MASTERED_BATCH_SIZE);
  const [virtualReady, setVirtualReady] = useState(false);

  const refresh = useCallback(() => {
    setItems(getMasteredReviews());
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
  }, [refresh]);

  useEffect(() => {
    setVisibleCount(Math.min(MASTERED_BATCH_SIZE, items.length));
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
        <span className="page-kicker">Mastered</span>
        <h1 className="page-title">已掌握 🎖️</h1>
        <p className="page-desc">
          恭喜！这些知识点已进入 graduated（长期巡航）阶段。你可以定期轻量复习来保持记忆。
        </p>
      </div>

      <div className="review-toolbar">
        <div className="review-toolbar-meta">
          {total > 0 ? (
            <span className="pill">
              <span className="pill-dot" aria-hidden />
              {total} 张已掌握的卡片
            </span>
          ) : (
            <span className="pill">还没有掌握的卡片</span>
          )}
        </div>
      </div>

      {total === 0 && (
        <div className="empty-state">
          <strong>长期记忆库还是空的</strong>
          <p>当卡片完成 learning 与 reviewing 阶段后，就会出现在这里。加油！</p>
        </div>
      )}

      <div className="review-list">
        {!virtualReady ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={`mastered-skeleton-${i}`} className="h-24 rounded-xl border border-[var(--border)] bg-[var(--surface)] animate-pulse" />
            ))}
          </div>
        ) : (
          <Virtuoso
            useWindowScroll
            totalCount={visibleCount}
            endReached={() => {
              setVisibleCount((prev) => {
                if (prev >= items.length) return prev;
                return Math.min(items.length, prev + MASTERED_BATCH_SIZE);
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
                <FormulaText text={flipped.has(item.note_id) ? item.note.content : item.note.front} inline />
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
