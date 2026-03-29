"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type ReactNode, Suspense, forwardRef, useCallback, useEffect, useMemo, useState } from "react";
import { VirtuosoGrid } from "react-virtuoso";
import { FormulaText } from "../../../components/FormulaText";
import KeywordBubbles from "../../../components/KeywordBubbles";
import {
  getDB,
  getTodayReviewLogs,
  getTodayReviewStats,
  submitReview,
  updateNote,
  type TodayReviewLog,
} from "../../../lib/db";
import { getSubjectTheme } from "../../../lib/subjectTheme";
import { srsStepLabel, srsStepHint } from "../../../lib/srs";

const WENKAI_CONTENT_FONT = '"LXGW WenKai Screen", "LXGW WenKai", "Kaiti SC", "STKaiti", "Noto Serif SC", serif';

type FocusSplit = {
  focus: string | null;
  rest: string;
};

type CalloutSegment = {
  type: "text" | "caution";
  content: string;
};

function hasMathExpression(text: string): boolean {
  if (!text) return false;
  return /\$\$[\s\S]*?\$\$|\$[^\n$]+\$|\\\([^\n]+\\\)|\\\[[\s\S]*?\\\]/.test(text);
}

function extractFocusBlock(text: string): FocusSplit {
  if (!text) return { focus: null, rest: "" };
  const match = text.match(/:::focus[^\n]*\n([\s\S]*?)\n:::\s*/);
  if (!match || match.index === undefined) {
    return { focus: null, rest: text.trim() };
  }

  const focus = match[1]?.trim() ?? "";
  const before = text.slice(0, match.index);
  const after = text.slice(match.index + match[0].length);
  return {
    focus: focus || null,
    rest: `${before}${after}`.trim(),
  };
}

function splitCalloutSegments(text: string): CalloutSegment[] {
  if (!text.trim()) return [];
  const lines = text.split("\n");
  const result: CalloutSegment[] = [];
  let textBuffer: string[] = [];
  let cautionBuffer: string[] = [];
  let inCaution = false;

  const flushText = () => {
    const block = textBuffer.join("\n").trim();
    if (block) result.push({ type: "text", content: block });
    textBuffer = [];
  };

  const flushCaution = () => {
    const block = cautionBuffer.join("\n").trim();
    if (block) result.push({ type: "caution", content: block });
    cautionBuffer = [];
  };

  for (const line of lines) {
    if (line.trim() === "> [!CAUTION]") {
      flushText();
      inCaution = true;
      cautionBuffer = [];
      continue;
    }

    if (inCaution && line.startsWith("> ")) {
      cautionBuffer.push(line.slice(2));
      continue;
    }

    if (inCaution) {
      flushCaution();
      inCaution = false;
    }

    textBuffer.push(line);
  }

  if (inCaution) flushCaution();
  flushText();
  return result;
}

function renderSegmentsWithCallout(text: string, keyPrefix: string, className?: string): ReactNode {
  const segments = splitCalloutSegments(text);
  const baseTextClass = className
    ? `whitespace-pre-wrap text-[0.97rem] leading-7 text-slate-700 ${className}`
    : "whitespace-pre-wrap text-[0.97rem] leading-7 text-slate-700";

  if (segments.length === 0) {
    return (
      <div className={baseTextClass}>
        <FormulaText text={text} />
      </div>
    );
  }

  return segments.map((segment, idx) => {
    if (segment.type === "caution") {
      return (
        <aside
          key={`${keyPrefix}-caution-${idx}`}
          className="my-4 border-l-4 border-red-400/80 bg-red-50/50 px-4 py-3 text-[0.95rem] leading-7 text-red-950/75"
        >
          <p className="text-xs font-semibold tracking-[0.14em] uppercase text-red-900/70">易错点</p>
          <div className="mt-1 whitespace-pre-wrap">
            <FormulaText text={segment.content} />
          </div>
        </aside>
      );
    }

    return (
      <div key={`${keyPrefix}-text-${idx}`} className={baseTextClass}>
        <FormulaText text={segment.content} />
      </div>
    );
  });
}

function getGridColumnsByWidth(width: number): number {
  if (width >= 1280) return 4; // xl
  if (width >= 1024) return 3; // lg
  if (width >= 640) return 2; // sm
  return 1;
}

function getResponsiveBatchSize(width: number): number {
  const columns = getGridColumnsByWidth(width);
  const rowsPerBatch = columns === 1 ? 12 : 6;
  return columns * rowsPerBatch;
}

const SummaryGridList = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function SummaryGridList({ className = "", ...props }, ref) {
    return (
      <div
        ref={ref}
        {...props}
        className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-3 ${className}`.trim()}
      />
    );
  }
);

const SummaryGridItem = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function SummaryGridItem({ className = "", ...props }, ref) {
    return <div ref={ref} {...props} className={`w-full ${className}`.trim()} />;
  }
);

function SummaryPageContent() {
  const searchParams = useSearchParams();
  const [logs, setLogs] = useState<TodayReviewLog[]>([]);
  const [stats, setStats] = useState({ total: 0, remembered: 0, forgotten: 0, accuracy: 0 });
  const [flipped, setFlipped] = useState<Set<number>>(() => new Set());
  const [practicing, setPracticing] = useState<Set<number>>(() => new Set());
  const [collapsedSubjects, setCollapsedSubjects] = useState<Set<string>>(() => new Set());
  const [toast, setToast] = useState<string | null>(null);
  const [recallLog, setRecallLog] = useState<TodayReviewLog | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [keywordsByNoteId, setKeywordsByNoteId] = useState<Record<number, string[]>>({});
  const [keywordDraft, setKeywordDraft] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState({
    coreAnswer: "",
    keyPointsText: "",
    examples: "",
    commonMistakes: "",
  });
  const [subjectVisibleCounts, setSubjectVisibleCounts] = useState<Record<string, number>>({});
  const [virtualReady, setVirtualReady] = useState(false);
  const [summaryBatchSize, setSummaryBatchSize] = useState<number>(() => {
    if (typeof window === "undefined") return 12;
    return getResponsiveBatchSize(window.innerWidth);
  });

  const refresh = useCallback(() => {
    setLogs(getTodayReviewLogs());
    setStats(getTodayReviewStats());
  }, []);

  const toggleFlip = (logId: number) => {
    setFlipped((prev) => {
      const next = new Set(prev);
      if (next.has(logId)) next.delete(logId);
      else next.add(logId);
      return next;
    });
  };

  const handleRepractice = (noteId: number, feedback: "forgot" | "hard" | "easy") => {
    submitReview(noteId, feedback);
    setPracticing((prev) => {
      const next = new Set(prev);
      next.delete(noteId);
      return next;
    });
    setToast(
      feedback === "easy"
        ? "已记录轻松"
        : feedback === "hard"
          ? "已记录模糊"
          : "已记录忘了"
    );
    
    // 刷新统计
    setTimeout(() => {
      refresh();
    }, 300);
  };

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!previewImage) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreviewImage(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewImage]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let debounceTimer: number | null = null;
    const handleResize = () => {
      if (debounceTimer) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        const next = getResponsiveBatchSize(window.innerWidth);
        setSummaryBatchSize((prev) => (prev === next ? prev : next));
      }, 180);
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => {
      if (debounceTimer) window.clearTimeout(debounceTimer);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const filter = searchParams.get("filter") === "remembered"
    ? "remembered"
    : searchParams.get("filter") === "forgotten"
      ? "forgotten"
      : "all";

  const filteredLogs = useMemo(() => {
    const latestByNoteId = new Map<number, TodayReviewLog>();

    logs.forEach((log) => {
      if (filter === "remembered" && !log.remembered) return;
      if (filter === "forgotten" && log.remembered) return;

      const prev = latestByNoteId.get(log.note_id);
      if (!prev || log.id > prev.id) {
        latestByNoteId.set(log.note_id, log);
      }
    });

    return Array.from(latestByNoteId.values()).sort((a, b) => b.id - a.id);
  }, [logs, filter]);

  const groupedLogs = useMemo(() => {
    const grouped = filteredLogs.reduce<Record<string, TodayReviewLog[]>>((acc, log) => {
      const subject = log.note.subject?.trim() || "未分类";
      if (!acc[subject]) acc[subject] = [];
      acc[subject].push(log);
      return acc;
    }, {});

    return Object.entries(grouped)
      .map(([subject, subjectLogs]) => ({ subject, logs: subjectLogs }))
      .sort((a, b) => b.logs.length - a.logs.length);
  }, [filteredLogs]);

  const isSameSet = (a: Set<string>, b: Set<string>) => {
    if (a.size !== b.size) return false;
    for (const item of a) {
      if (!b.has(item)) return false;
    }
    return true;
  };

  useEffect(() => {
    if (groupedLogs.length === 0) {
      setCollapsedSubjects((prev) => (prev.size === 0 ? prev : new Set()));
      return;
    }

    setCollapsedSubjects((prev) => {
      if (prev.size === 0) {
        return new Set(groupedLogs.map((group) => group.subject));
      }

      const validSubjects = new Set(groupedLogs.map((group) => group.subject));
      const next = new Set<string>();
      prev.forEach((subject) => {
        if (validSubjects.has(subject)) next.add(subject);
      });

      groupedLogs.forEach((group) => {
        if (!next.has(group.subject) && !prev.has(group.subject)) {
          next.add(group.subject);
        }
      });
      return isSameSet(prev, next) ? prev : next;
    });
  }, [groupedLogs]);

  useEffect(() => {
    const initialCounts: Record<string, number> = {};
    for (const group of groupedLogs) {
      initialCounts[group.subject] = Math.min(summaryBatchSize, group.logs.length);
    }
    setSubjectVisibleCounts(initialCounts);
    setVirtualReady(false);
    const timer = window.setTimeout(() => setVirtualReady(true), 120);
    return () => window.clearTimeout(timer);
  }, [groupedLogs, summaryBatchSize]);

  const toggleSubject = (subject: string) => {
    setCollapsedSubjects((prev) => {
      const next = new Set(prev);
      if (next.has(subject)) next.delete(subject);
      else next.add(subject);
      return next;
    });
  };

  const hasDeepStudyInfo = (log: TodayReviewLog) => {
    const note = log.note;
    return Boolean(
      note.question ||
      note.coreAnswer ||
      (note.keyPoints && note.keyPoints.length > 0) ||
      note.commonMistakes ||
      note.examples ||
      (note.images && note.images.length > 0)
    );
  };

  const recallAnswerLayout = useMemo(() => {
    if (!recallLog) {
      return {
        focus: null as string | null,
        rest: "",
        hasFocus: false,
        focusIsMath: false,
      };
    }
    const answer = recallLog.note.coreAnswer ?? "";
    const content = recallLog.note.content ?? "";
    const parsedFromAnswer = extractFocusBlock(answer);
    const parsedFromContent = extractFocusBlock(content);
    const parsed = parsedFromAnswer.focus ? parsedFromAnswer : parsedFromContent;
    return {
      ...parsed,
      hasFocus: Boolean(parsed.focus),
      focusIsMath: hasMathExpression(parsed.focus ?? ""),
    };
  }, [recallLog]);

  const activeKeywords = useMemo(() => {
    if (!recallLog) return [];
    return keywordsByNoteId[recallLog.note.id] ?? [];
  }, [recallLog, keywordsByNoteId]);

  useEffect(() => {
    if (!recallLog) {
      setKeywordDraft("");
      setIsEditing(false);
      return;
    }

    setKeywordDraft("");
    setIsEditing(false);
    setEditDraft({
      coreAnswer: recallLog.note.coreAnswer ?? "",
      keyPointsText: (recallLog.note.keyPoints ?? []).join("\n"),
      examples: recallLog.note.examples ?? "",
      commonMistakes: recallLog.note.commonMistakes ?? "",
    });

    setKeywordsByNoteId((prev) => {
      if (prev[recallLog.note.id]) return prev;
      const stored = recallLog.note.keywords ?? [];
      if (stored.length === 0) return prev;
      return { ...prev, [recallLog.note.id]: stored };
    });
  }, [recallLog]);

  const addKeywordForRecall = (keyword: string) => {
    if (!recallLog) return;
    const value = keyword.trim();
    if (!value) return;
    const current = keywordsByNoteId[recallLog.note.id] ?? recallLog.note.keywords ?? [];
    if (current.includes(value)) return;
    const nextKeywords = [...current, value];

    const updated = updateNote(recallLog.note.id, {
      front: recallLog.note.front,
      question: recallLog.note.question,
      subject: recallLog.note.subject,
      difficulty: recallLog.note.difficulty,
      content: recallLog.note.coreAnswer ?? recallLog.note.content,
      coreAnswer: recallLog.note.coreAnswer ?? recallLog.note.content,
      keyPoints: recallLog.note.keyPoints ?? [],
      keywords: nextKeywords,
      examples: recallLog.note.examples,
      commonMistakes: recallLog.note.commonMistakes,
      images: recallLog.note.images,
    });

    if (!updated) return;
    setRecallLog((prev) => (prev ? { ...prev, note: updated } : prev));
    setLogs((prev) => prev.map((log) => (log.note_id === updated.id ? { ...log, note: updated } : log)));
    setKeywordsByNoteId((prev) => ({ ...prev, [updated.id]: updated.keywords ?? [] }));
    setKeywordDraft("");
  };

  const removeKeywordForRecall = (keyword: string) => {
    if (!recallLog) return;
    const current = keywordsByNoteId[recallLog.note.id] ?? recallLog.note.keywords ?? [];
    const nextKeywords = current.filter((item) => item !== keyword);

    const updated = updateNote(recallLog.note.id, {
      front: recallLog.note.front,
      question: recallLog.note.question,
      subject: recallLog.note.subject,
      difficulty: recallLog.note.difficulty,
      content: recallLog.note.coreAnswer ?? recallLog.note.content,
      coreAnswer: recallLog.note.coreAnswer ?? recallLog.note.content,
      keyPoints: recallLog.note.keyPoints ?? [],
      keywords: nextKeywords,
      examples: recallLog.note.examples,
      commonMistakes: recallLog.note.commonMistakes,
      images: recallLog.note.images,
    });

    if (!updated) return;
    setRecallLog((prev) => (prev ? { ...prev, note: updated } : prev));
    setLogs((prev) => prev.map((log) => (log.note_id === updated.id ? { ...log, note: updated } : log)));
    setKeywordsByNoteId((prev) => ({ ...prev, [updated.id]: updated.keywords ?? [] }));
  };

  const saveInlineEdit = () => {
    if (!recallLog) return;
    const keyPoints = editDraft.keyPointsText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const updated = updateNote(recallLog.note.id, {
      front: recallLog.note.front,
      question: recallLog.note.question,
      subject: recallLog.note.subject,
      difficulty: recallLog.note.difficulty,
      content: editDraft.coreAnswer,
      coreAnswer: editDraft.coreAnswer,
      keyPoints,
      keywords: keywordsByNoteId[recallLog.note.id] ?? recallLog.note.keywords ?? [],
      examples: editDraft.examples,
      commonMistakes: editDraft.commonMistakes,
      images: recallLog.note.images,
    });

    if (!updated) {
      setToast("保存失败，请重试");
      return;
    }

    setRecallLog((prev) => (prev ? { ...prev, note: updated } : prev));
    setLogs((prev) => prev.map((log) => (log.note_id === updated.id ? { ...log, note: updated } : log)));
    setKeywordsByNoteId((prev) => ({ ...prev, [updated.id]: updated.keywords ?? [] }));
    setIsEditing(false);
    setToast("已保存修改");
  };

  return (
    <>
      <div className="page-hero">
        <Link href="/review" className="inline-flex items-center gap-2 mb-4 text-sm font-medium" style={{ color: "var(--accent)" }}>
          ← 返回复习
        </Link>
        <span className="page-kicker">Summary</span>
        <h1 className="page-title">今日复盘 📊</h1>
        <p className="page-desc">
          查看今天复习的完整记录，了解学习进度，也可以重新练习已复习的卡片。
        </p>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="rounded-xl p-4 text-center" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div className="text-3xl font-bold" style={{ color: "var(--text)" }}>{stats.total}</div>
          <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>复习总数</div>
        </div>
        <div className="rounded-xl p-4 text-center" style={{ background: "var(--surface)", border: "1px solid rgba(151, 163, 117, 0.24)" }}>
          <div className="text-3xl font-bold text-green-600">{stats.remembered}</div>
          <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>✓ 记住</div>
        </div>
        <div className="rounded-xl p-4 text-center" style={{ background: "var(--surface)", border: "1px solid rgba(155, 107, 92, 0.22)" }}>
          <div className="text-3xl font-bold text-red-600">{stats.forgotten}</div>
          <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>✗ 忘记</div>
        </div>
        <div className="rounded-xl p-4 text-center" style={{ background: "var(--surface)", border: "1px solid rgba(120, 148, 110, 0.2)" }}>
          <div className="text-3xl font-bold" style={{ color: "var(--accent)" }}>{stats.accuracy}%</div>
          <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>准确率</div>
        </div>
      </div>

      {/* 复习卡片网格 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-lg font-semibold" style={{ color: "var(--text)" }}>复习记录</h3>
          <div className="flex items-center gap-2">
            <Link
              href="/review/summary"
              className="px-3 py-1.5 text-xs rounded-lg border transition-colors"
              style={{
                color: filter === "all" ? "var(--accent)" : "var(--muted)",
                background: filter === "all" ? "var(--accent-soft)" : "var(--surface)",
                borderColor: "var(--border)",
              }}
            >
              全部
            </Link>
            <Link
              href="/review/summary?filter=remembered"
              className="px-3 py-1.5 text-xs rounded-lg border transition-colors"
              style={{
                color: filter === "remembered" ? "var(--success)" : "var(--muted)",
                background: filter === "remembered" ? "var(--success-soft)" : "var(--surface)",
                borderColor: "var(--border)",
              }}
            >
              已记住
            </Link>
            <Link
              href="/review/summary?filter=forgotten"
              className="px-3 py-1.5 text-xs rounded-lg border transition-colors"
              style={{
                color: filter === "forgotten" ? "var(--danger)" : "var(--muted)",
                background: filter === "forgotten" ? "var(--danger-soft)" : "var(--surface)",
                borderColor: "var(--border)",
              }}
            >
              已忘记
            </Link>
          </div>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="empty-state">
            <strong>{logs.length === 0 ? "今天还没有复习" : "当前筛选暂无记录"}</strong>
            <p>{logs.length === 0 ? "去复习页面完成一些卡片，复盘页面会记录所有的复习记录。" : "切换筛选查看其他复习记录。"}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {groupedLogs.map((group) => {
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
                        {group.logs.length} 张
                      </span>
                    </div>
                    <span className="inline-flex items-center gap-1 text-sm text-[var(--muted)]">
                      <span>{isCollapsed ? "展开" : "折叠"}</span>
                      <span
                        className={`inline-block transition-transform duration-200 ${isCollapsed ? "rotate-0" : "rotate-180"}`}
                        aria-hidden
                      >
                        ▾
                      </span>
                    </span>
                  </button>

                  {!isCollapsed && (
                    <>
                      {!virtualReady ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-3">
                          {[1, 2, 3, 4].map((i) => (
                            <div
                              key={`${group.subject}-summary-skeleton-${i}`}
                              className="h-72 rounded-2xl border border-[var(--border)] bg-[var(--surface)] animate-pulse"
                            />
                          ))}
                        </div>
                      ) : (
                        <VirtuosoGrid
                          useWindowScroll
                          totalCount={subjectVisibleCounts[group.subject] ?? Math.min(summaryBatchSize, group.logs.length)}
                          endReached={() => {
                            setSubjectVisibleCounts((prev) => {
                              const current = prev[group.subject] ?? Math.min(summaryBatchSize, group.logs.length);
                              if (current >= group.logs.length) return prev;
                              return {
                                ...prev,
                                [group.subject]: Math.min(group.logs.length, current + summaryBatchSize),
                              };
                            });
                          }}
                          components={{ List: SummaryGridList, Item: SummaryGridItem }}
                          itemContent={(index) => {
                            const log = group.logs[index];
                            const theme = getSubjectTheme(log.note.subject ?? "未分类");
                            const isPracticing = practicing.has(log.note_id);
                            const isFlipped = flipped.has(log.id);

                            return (
                              <button
                                key={`${log.note_id}-${log.id}`}
                                type="button"
                                onClick={() => toggleFlip(log.id)}
                                className="group relative h-72 w-full text-left [perspective:1200px]"
                              >
                                <div
                                  className="relative h-full w-full rounded-2xl transition-transform duration-500 [transform-style:preserve-3d]"
                                  style={{ transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)" }}
                                >
                                  <div
                                    className="absolute inset-0 rounded-2xl border p-4 shadow-sm"
                                    style={{
                                      backfaceVisibility: "hidden",
                                      WebkitBackfaceVisibility: "hidden",
                                      background: "var(--surface)",
                                      borderColor: log.remembered ? "rgba(151, 163, 117, 0.28)" : "rgba(155, 107, 92, 0.24)",
                                      boxShadow: "var(--shadow-card)",
                                    }}
                                  >
                                    <div className="flex flex-wrap items-center gap-2 mb-4 pr-6">
                                      <span
                                        className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-md border"
                                        style={{
                                          background: theme.soft,
                                          color: theme.accent,
                                          borderColor: theme.accent,
                                        }}
                                      >
                                        {log.note.subject ?? "未分类"}
                                      </span>
                                      <span
                                        className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-md"
                                        style={{
                                          background: log.remembered ? "var(--success-soft)" : "var(--danger-soft)",
                                          color: log.remembered ? "var(--success)" : "var(--danger)",
                                        }}
                                      >
                                        {log.remembered ? "记住" : "忘记"}
                                      </span>
                                      <span className="badge badge-muted">{srsStepLabel(log.fromStep)}</span>
                                    </div>

                                    <div className="flex h-[calc(100%-3.9rem)] flex-col items-center justify-center text-center px-2">
                                      <p className="text-lg font-semibold leading-snug" style={{ color: "var(--text)" }}>
                                        <FormulaText text={log.note.front} inline className="review-summary-front-formula" />
                                      </p>
                                      <p className="mt-4 text-xs font-medium tracking-wide uppercase" style={{ color: "var(--muted)" }}>
                                        点击翻开
                                      </p>
                                    </div>
                                  </div>

                                  <div
                                    className="absolute inset-0 rounded-2xl border p-4 shadow-sm"
                                    style={{
                                      transform: "rotateY(180deg)",
                                      backfaceVisibility: "hidden",
                                      WebkitBackfaceVisibility: "hidden",
                                      background: "var(--surface)",
                                      borderColor: "var(--border-strong)",
                                      boxShadow: "var(--shadow-card)",
                                    }}
                                  >
                                    <div className="flex flex-wrap items-center gap-2 mb-3 pr-6">
                                      <span
                                        className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-md border"
                                        style={{
                                          background: theme.soft,
                                          color: theme.accent,
                                          borderColor: theme.accent,
                                        }}
                                      >
                                        {log.note.subject ?? "未分类"}
                                      </span>
                                      <span className="badge badge-muted">{srsStepHint(log.fromStep)}</span>
                                    </div>

                                    <div className="h-[calc(100%-4.9rem)] overflow-y-auto rounded-xl border px-3 py-3 pr-2 mb-3" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                                      <div className="text-sm whitespace-pre-wrap leading-relaxed text-center" style={{ color: "var(--text)" }}>
                                        <FormulaText text={log.note.content} className="review-summary-back-formula" />
                                      </div>
                                    </div>

                                    <div
                                      className="absolute inset-x-3 bottom-3"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {isPracticing ? (
                                        <div className="flex gap-2">
                                          <button
                                            type="button"
                                            onClick={() => handleRepractice(log.note_id, "forgot")}
                                            className="flex-1 px-3 py-2 font-medium text-sm rounded-xl transition-colors"
                                            style={{ background: "var(--danger-soft)", color: "var(--danger)", border: "1px solid rgba(155, 107, 92, 0.22)" }}
                                          >
                                            忘了
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => handleRepractice(log.note_id, "hard")}
                                            className="flex-1 px-3 py-2 font-medium text-sm rounded-xl transition-colors"
                                            style={{ background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" }}
                                          >
                                            模糊
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => handleRepractice(log.note_id, "easy")}
                                            className="flex-1 px-3 py-2 font-medium text-sm rounded-xl transition-colors"
                                            style={{ background: "var(--success-soft)", color: "var(--success)", border: "1px solid rgba(151, 163, 117, 0.24)" }}
                                          >
                                            轻松
                                          </button>
                                        </div>
                                      ) : (
                                        <div className="flex gap-1">
                                          <button
                                            type="button"
                                            onClick={() => setPracticing((prev) => new Set(prev).add(log.note_id))}
                                            className="flex-1 min-w-0 h-7 px-1.5 text-[10px] font-medium rounded-md transition-colors whitespace-nowrap overflow-hidden text-ellipsis"
                                            style={{ background: "var(--accent-soft)", color: "var(--accent)", border: "1px solid rgba(120, 148, 110, 0.2)" }}
                                          >
                                            重新练习
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setRecallLog(log)}
                                            className="flex-1 min-w-0 h-7 px-1.5 text-[10px] font-medium rounded-md transition-colors whitespace-nowrap overflow-hidden text-ellipsis"
                                            style={{ background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" }}
                                          >
                                            回忆
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </button>
                            );
                          }}
                        />
                      )}
                    </>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>

      {recallLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setRecallLog(null)}>
          <div className="absolute inset-0 bg-black/35" aria-hidden />
          <div
            className="relative w-full max-w-3xl rounded-2xl bg-[#FAFAF5] text-slate-800 shadow-[0_18px_50px_rgba(15,23,42,0.22)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-[#E3E4D8] px-6 py-4">
              <div className="min-w-0">
                <h4 className="max-w-[60ch] text-xl sm:text-[1.4rem] font-semibold font-serif leading-relaxed tracking-wide text-slate-700 break-words">
                  <FormulaText
                    text={recallLog.note.question || recallLog.note.front}
                    inline
                    className="recall-title-formula font-serif leading-relaxed tracking-wide text-slate-700"
                  />
                </h4>
              </div>
              <button
                type="button"
                className="shrink-0 rounded-lg border border-[#D4D6C8] px-2.5 py-1 text-xs text-slate-500 hover:bg-[#F1F1E8] font-sans"
                onClick={() => setRecallLog(null)}
                aria-label="关闭"
              >
                x
              </button>
            </div>

            <div className="max-h-[72vh] overflow-y-auto px-6 py-5">
              {!hasDeepStudyInfo(recallLog) ? (
                <p className="text-sm text-slate-500">
                  这张卡片当时还没有记录“深化学习”信息。
                </p>
              ) : (
                <div className="flex flex-col gap-5">
                  <div className="flex justify-end">
                    {isEditing ? (
                      <button
                        type="button"
                        onClick={saveInlineEdit}
                        className="rounded-lg border border-[#B5C59A] bg-[#E9F0DF] px-3 py-1.5 text-xs font-semibold text-[#2A3B2C] font-sans"
                      >
                        保存
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setIsEditing(true)}
                        className="rounded-lg border border-[#D4D6C8] bg-[#F2F2E8] px-3 py-1.5 text-xs font-semibold text-slate-600 font-sans"
                      >
                        ✏️ 编辑
                      </button>
                    )}
                  </div>

                  <section className="grid grid-cols-[minmax(130px,34%)_1fr] items-start gap-4 md:gap-6">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold tracking-widest text-[#7A8B7C] uppercase mb-2">记忆泡泡</p>
                      <div className="flex flex-col gap-2">
                        {recallAnswerLayout.hasFocus && (
                          <span className="inline-flex items-center gap-2 self-start rounded-full border border-[#9BAA95]/55 bg-[#E7ECDF]/85 px-3 py-1.5 text-sm font-semibold font-serif leading-relaxed tracking-wide text-slate-700 shadow-[0_8px_24px_rgb(0,0,0,0.06)] backdrop-blur-sm" style={{ fontFamily: WENKAI_CONTENT_FONT }}>
                            <span aria-hidden>🔖</span>
                            <FormulaText
                              text={recallAnswerLayout.focus ?? ""}
                              className={recallAnswerLayout.focusIsMath ? "memory-focus-math leading-relaxed tracking-wide text-slate-700" : "leading-relaxed tracking-wide text-slate-700"}
                            />
                          </span>
                        )}
                        <KeywordBubbles
                          keywords={activeKeywords}
                          onAdd={(kw) => addKeywordForRecall(kw)}
                          onRemove={removeKeywordForRecall}
                          placeholder="+ 提取关键词..."
                          fontFamily={WENKAI_CONTENT_FONT}
                        />
                      </div>
                    </div>

                    <div className="min-w-0">
                      <p className="inline-block relative z-10 text-sm font-semibold tracking-widest text-[#7A8B7C] uppercase mb-3 mt-2 before:content-[''] before:absolute before:-bottom-1 before:left-0 before:w-full before:h-3 before:bg-[#B96D5C]/35 before:-z-10">核心答案</p>
                      {isEditing ? (
                        <textarea
                          value={editDraft.coreAnswer}
                          onChange={(e) => setEditDraft((prev) => ({ ...prev, coreAnswer: e.target.value }))}
                          className="w-full min-h-[140px] rounded-xl border border-[#DADCCF] bg-[#F6F7EF] p-4 text-[0.97rem] font-serif leading-relaxed tracking-wide text-slate-700 outline-none focus:border-[#A6B29A]"
                          style={{ fontFamily: WENKAI_CONTENT_FONT }}
                        />
                      ) : (
                        <div className="mt-1 text-[0.97rem] font-serif leading-relaxed tracking-wide whitespace-pre-wrap text-slate-700" style={{ fontFamily: WENKAI_CONTENT_FONT }}>
                          {recallAnswerLayout.hasFocus
                            ? (recallAnswerLayout.rest
                                ? renderSegmentsWithCallout(recallAnswerLayout.rest, "summary-recall-answer")
                                : <p className="text-slate-500">已提取核心锚点，无额外推演内容。</p>)
                            : renderSegmentsWithCallout(recallLog.note.coreAnswer ?? "", "summary-recall-answer")}
                        </div>
                      )}
                    </div>
                  </section>

                  {((recallLog.note.keyPoints && recallLog.note.keyPoints.length > 0) || isEditing) && (
                    <section>
                      <p className="inline-block relative z-10 text-sm font-semibold tracking-widest text-[#7A8B7C] uppercase mb-3 mt-6 before:content-[''] before:absolute before:-bottom-1 before:left-0 before:w-full before:h-3 before:bg-[#D4E09B]/50 before:-z-10">关键点</p>
                      {isEditing ? (
                        <textarea
                          value={editDraft.keyPointsText}
                          onChange={(e) => setEditDraft((prev) => ({ ...prev, keyPointsText: e.target.value }))}
                          className="w-full min-h-[110px] rounded-xl border border-[#DADCCF] bg-[#F6F7EF] p-4 text-[0.97rem] font-serif leading-relaxed tracking-wide text-slate-700 outline-none focus:border-[#A6B29A]"
                          style={{ fontFamily: WENKAI_CONTENT_FONT }}
                        />
                      ) : (
                        <ul className="mt-1 list-disc pl-5 text-[0.97rem] font-serif leading-relaxed tracking-wide text-slate-700 marker:text-[#5F7865]" style={{ fontFamily: WENKAI_CONTENT_FONT }}>
                          {(recallLog.note.keyPoints ?? []).map((point, idx) => (
                            <li key={`${idx}-${point}`}><FormulaText text={point} className="note-card-keypoint-formula" /></li>
                          ))}
                        </ul>
                      )}
                    </section>
                  )}

                  {(recallLog.note.examples || isEditing) && (
                    <section>
                      <p className="inline-block relative z-10 text-sm font-semibold tracking-widest text-[#7A8B7C] uppercase mb-3 mt-6 before:content-[''] before:absolute before:-bottom-1 before:left-0 before:w-full before:h-3 before:bg-[#D4E09B]/50 before:-z-10">示例 / 应用场景</p>
                      {isEditing ? (
                        <textarea
                          value={editDraft.examples}
                          onChange={(e) => setEditDraft((prev) => ({ ...prev, examples: e.target.value }))}
                          className="w-full min-h-[100px] rounded-xl border border-[#A6B29A]/50 bg-[#A3B18A]/10 p-4 text-[0.97rem] font-serif leading-relaxed tracking-wide text-slate-700 outline-none focus:border-[#8EA078]"
                          style={{ fontFamily: WENKAI_CONTENT_FONT }}
                        />
                      ) : (
                        <div className="mt-1 text-[0.97rem] font-serif leading-relaxed tracking-wide whitespace-pre-wrap text-slate-700" style={{ fontFamily: WENKAI_CONTENT_FONT }}><FormulaText text={recallLog.note.examples ?? ""} /></div>
                      )}
                    </section>
                  )}

                  {(recallLog.note.commonMistakes || isEditing) && (
                    <section>
                      <p className="inline-block relative z-10 text-sm font-semibold tracking-widest text-[#7A8B7C] uppercase mb-3 mt-6 before:content-[''] before:absolute before:-bottom-1 before:left-0 before:w-full before:h-3 before:bg-[#D4E09B]/50 before:-z-10">易错点 / 常见误区</p>
                      {isEditing ? (
                        <textarea
                          value={editDraft.commonMistakes}
                          onChange={(e) => setEditDraft((prev) => ({ ...prev, commonMistakes: e.target.value }))}
                          className="w-full min-h-[100px] rounded-xl border border-[#E4C7C2] bg-[#FFF1F0] p-4 text-[0.97rem] font-serif leading-relaxed tracking-wide text-slate-700 outline-none focus:border-[#D9A8A1]"
                          style={{ fontFamily: WENKAI_CONTENT_FONT }}
                        />
                      ) : (
                        <div className="mt-1 text-[0.97rem] font-serif leading-relaxed tracking-wide text-slate-700" style={{ fontFamily: WENKAI_CONTENT_FONT }}>
                          {renderSegmentsWithCallout(recallLog.note.commonMistakes ?? "", "summary-recall-mistakes")}
                        </div>
                      )}
                    </section>
                  )}

                  {recallLog.note.images && recallLog.note.images.length > 0 && (
                    <section>
                      <p className="text-sm font-semibold tracking-widest text-[#7A8B7C] uppercase mb-3 mt-6">图片 / 链接</p>
                      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3 justify-items-start sm:justify-items-center">
                        {recallLog.note.images.map((src, idx) => (
                          <div
                            key={`${idx}-${src}`}
                            className="block w-full max-w-sm rounded-lg border border-[#DADCCF] bg-[#F3F4EB] p-2 hover:shadow-sm transition-shadow"
                          >
                            <button
                              type="button"
                              onClick={() => setPreviewImage(src)}
                              className="w-full"
                              title="点击放大查看"
                            >
                              <img
                                src={src}
                                alt={`复盘图片 ${idx + 1}`}
                                className="mx-auto w-full max-h-56 object-contain rounded"
                                loading="lazy"
                                onError={(e) => {
                                  e.currentTarget.style.display = "none";
                                }}
                              />
                            </button>
                            <a
                              href={src}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-2 block truncate text-xs underline"
                              style={{ color: "var(--accent)" }}
                            >
                              打开原图 / 链接
                            </a>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {previewImage && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div className="absolute inset-0 bg-black/70" aria-hidden />
          <div
            className="relative w-full max-w-5xl max-h-[90vh] rounded-xl border border-white/20 bg-black/30 p-2"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="absolute right-2 top-2 z-10 rounded-md bg-black/50 px-2 py-1 text-xs text-white hover:bg-black/70"
              onClick={() => setPreviewImage(null)}
              aria-label="关闭"
            >
              x
            </button>
            <img
              src={previewImage}
              alt="放大预览"
              className="h-full w-full max-h-[85vh] object-contain rounded"
            />
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

export default function SummaryPage() {
  return (
    <Suspense fallback={null}>
      <SummaryPageContent />
    </Suspense>
  );
}
