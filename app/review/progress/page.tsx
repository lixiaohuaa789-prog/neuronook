"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Virtuoso } from "react-virtuoso";
import { FormulaText } from "../../../components/FormulaText";
import {
  getDB,
  type ReviewQueueItem,
} from "../../../lib/db";
import { getSubjectTheme } from "../../../lib/subjectTheme";
import { formatNextReviewHint, srsStepHint, srsStepLabel } from "../../../lib/srs";

const PROGRESS_BATCH_SIZE = 18;

function getProgressReviews() {
  const db = getDB();
  if (!db) return [];

  const inProgressReviews = db.reviews.filter((r) => r.srsStep >= 2 && r.srsStep <= 4);

  const items: ReviewQueueItem[] = [];
  for (const r of inProgressReviews) {
    const note = db.notes.find((n) => n.id === r.note_id);
    if (note) items.push({ ...r, note });
  }

  // 按照下次复习时间排序
  return items.sort((a, b) => {
    const dateA = a.next_review ? new Date(a.next_review).getTime() : 0;
    const dateB = b.next_review ? new Date(b.next_review).getTime() : 0;
    return dateA - dateB;
  });
}

export default function ProgressPage() {
  const [items, setItems] = useState<ReviewQueueItem[]>([]);
  const [flipped, setFlipped] = useState<Set<number>>(() => new Set());
  const [collapsedSubjects, setCollapsedSubjects] = useState<Set<string>>(() => new Set());
  const [subjectVisibleCounts, setSubjectVisibleCounts] = useState<Record<string, number>>({});
  const [virtualReady, setVirtualReady] = useState(false);

  const refresh = useCallback(() => {
    setItems(getProgressReviews());
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

  const total = items.length;
  const groupedSubjects = useMemo(() => {
    const grouped = items.reduce<Record<string, ReviewQueueItem[]>>((acc, item) => {
      const subject = item.note.subject?.trim() || "未分类";
      if (!acc[subject]) acc[subject] = [];
      acc[subject].push(item);
      return acc;
    }, {});

    return Object.entries(grouped)
      .map(([subject, subjectItems]) => ({ subject, items: subjectItems }))
      .sort((a, b) => b.items.length - a.items.length);
  }, [items]);

  const indexById = useMemo(() => {
    const map = new Map<number, number>();
    items.forEach((item, idx) => {
      map.set(item.note_id, idx + 1);
    });
    return map;
  }, [items]);

  useEffect(() => {
    const initialCounts: Record<string, number> = {};
    for (const group of groupedSubjects) {
      initialCounts[group.subject] = Math.min(PROGRESS_BATCH_SIZE, group.items.length);
    }
    setSubjectVisibleCounts(initialCounts);
    setVirtualReady(false);
    const timer = window.setTimeout(() => setVirtualReady(true), 120);
    return () => window.clearTimeout(timer);
  }, [groupedSubjects]);

  useEffect(() => {
    setCollapsedSubjects((prev) => {
      const validSubjects = new Set(groupedSubjects.map((g) => g.subject));
      const next = new Set<string>();
      prev.forEach((subject) => {
        if (validSubjects.has(subject)) next.add(subject);
      });
      return next;
    });
  }, [groupedSubjects]);

  const toggleSubject = (subject: string) => {
    setCollapsedSubjects((prev) => {
      const next = new Set(prev);
      if (next.has(subject)) next.delete(subject);
      else next.add(subject);
      return next;
    });
  };

  return (
    <>
      <div className="page-hero">
        <Link href="/review" className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 mb-4 text-sm font-medium">
          ← 返回复习
        </Link>
        <span className="page-kicker">Progress</span>
        <h1 className="page-title">在前进中 🚀</h1>
        <p className="page-desc">
          这些知识点正处于 reviewing 阶段（跨日复习）。持续复习这些内容，有助于强化记忆，逐步向 graduated 阶段迈进。
        </p>
      </div>

      <div className="review-toolbar">
        <div className="review-toolbar-meta">
          {total > 0 ? (
            <span className="pill">
              <span className="pill-dot" aria-hidden />
              {total} 张卡片（reviewing 阶段）
            </span>
          ) : (
            <span className="pill">暂无进行中的卡片</span>
          )}
        </div>
      </div>

      {total === 0 && (
        <div className="empty-state">
          <strong>还没有开始复习</strong>
          <p>继续添加知识点并开始复习，进阶卡片就会出现在这里。</p>
        </div>
      )}

      <div className="space-y-4">
        {groupedSubjects.map((group) => {
          const subjectTheme = getSubjectTheme(group.subject);
          const isCollapsed = collapsedSubjects.has(group.subject);

          return (
            <section
              key={group.subject}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 sm:p-4"
            >
              <button
                type="button"
                onClick={() => toggleSubject(group.subject)}
                className="w-full text-left flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-[var(--surface-2)] transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ background: subjectTheme.accent }}
                    aria-hidden
                  />
                  <span className="font-semibold text-sm sm:text-base text-[var(--text)] truncate">
                    {group.subject}
                  </span>
                  <span className="text-xs text-[var(--muted)]">
                    {group.items.length} 张
                  </span>
                </div>
                <span className="text-sm text-[var(--muted)]">{isCollapsed ? "展开" : "折叠"}</span>
              </button>

              {!isCollapsed && (
                <div className="relative mt-2 ml-2 pl-5 border-l-2 border-slate-200 space-y-3">
                  {!virtualReady ? (
                    <div className="space-y-3">
                      {[1, 2].map((i) => (
                        <div key={`${group.subject}-progress-skeleton-${i}`} className="h-24 rounded-xl border border-[var(--border)] bg-[var(--surface)] animate-pulse" />
                      ))}
                    </div>
                  ) : (
                    <Virtuoso
                      useWindowScroll
                      totalCount={subjectVisibleCounts[group.subject] ?? Math.min(PROGRESS_BATCH_SIZE, group.items.length)}
                      endReached={() => {
                        setSubjectVisibleCounts((prev) => {
                          const current = prev[group.subject] ?? Math.min(PROGRESS_BATCH_SIZE, group.items.length);
                          if (current >= group.items.length) return prev;
                          return {
                            ...prev,
                            [group.subject]: Math.min(group.items.length, current + PROGRESS_BATCH_SIZE),
                          };
                        });
                      }}
                      itemContent={(index) => {
                        const item = group.items[index];
                        const theme = getSubjectTheme(item.note.subject ?? "未分类");
                        return (
                      <div key={item.note_id} className="relative mb-3">
                        <span
                          className="absolute -left-5 top-7 w-5 border-t-2 border-slate-200"
                          aria-hidden
                        />
                        <article className="card card-anki">
                          <span className="review-card-index">
                            {indexById.get(item.note_id)} / {total}
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
                      </div>
                        );
                      }}
                    />
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
