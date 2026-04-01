"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Virtuoso } from "react-virtuoso";
import { FormulaText } from "../../components/FormulaText";
import { MarkdownMathContent } from "../../components/MarkdownMathContent";
import { NotebookEditor } from "../../components/NotebookEditor";
import KeywordBubbles from "../../components/KeywordBubbles";
import { DebugPanel } from "../../components/DebugPanel";
import {
  getAllFolders,
  getDB,
  getFrameworkReviewQueue,
  getReviewQueue,
  submitReview,
  updateNote,
  getTodayReviewStats,
  type FolderTree,
  type FrameworkReviewItem,
  type ReviewQueueItem,
} from "../../lib/db";
import { getSubjectTheme } from "../../lib/subjectTheme";
import { formatNextReviewHint, srsStepHint, srsStepLabel } from "../../lib/srs";

const REVIEW_BATCH_SIZE = 20;
const WENKAI_CONTENT_FONT = '"LXGW WenKai Screen", "LXGW WenKai", "Kaiti SC", "STKaiti", "Noto Serif SC", serif';

// 计算复习预测数据
function getReviewForecast() {
  const db = getDB();
  if (!db) return { tomorrow: 0, inProgress: 0, mastered: 0 };

  const now = new Date();
  now.setHours(23, 59, 59, 999);

  // 明天的起点和终点
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const tomorrowEnd = new Date(tomorrow);
  tomorrowEnd.setHours(23, 59, 59, 999);

  // 统计明天待复习的卡片
  const tomorrowItems = db.reviews.filter((r) => {
    if (!r.next_review) return false;
    const nextDate = new Date(r.next_review);
    return nextDate > now && nextDate <= tomorrowEnd;
  });

  // 统计正在进行中的卡片（reviewing 阶段）
  const inProgress = db.reviews.filter((r) => r.status === "reviewing").length;

  // 统计已掌握的卡片
  const mastered = db.reviews.filter((r) => r.status === "graduated").length;

  return {
    tomorrow: tomorrowItems.length,
    inProgress,
    mastered,
  };
}

function isFrameworkItem(item: ReviewQueueItem | FrameworkReviewItem): item is FrameworkReviewItem {
  return Array.isArray((item as FrameworkReviewItem).outlinePath);
}

function explainPriority(item: ReviewQueueItem | FrameworkReviewItem): string {
  const m = item.metrics;
  if (!m) return "默认到期排序";
  const lowFamiliarity = (1 - m.familiarity) * 0.5;
  const overdue = Math.min(1, m.overdueRatio) * 0.3;
  const highError = m.errorRate * 0.2;

  if (lowFamiliarity >= overdue && lowFamiliarity >= highError) {
    return "熟悉度偏低";
  }
  if (overdue >= highError) {
    return "已明显逾期";
  }
  return "近期错误偏多";
}

type FocusSplit = {
  focus: string | null;
  rest: string;
};

type CalloutSegment = {
  type: "text" | "caution";
  content: string;
};

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

function hasMathExpression(text: string): boolean {
  if (!text) return false;
  return /\$[^$\n]+\$|\$\$[\s\S]+?\$\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]/.test(text);
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

function renderSegmentsWithCallout(
  text: string,
  keyPrefix: string,
  className?: string,
  renderMarkdown = false
): ReactNode {
  const segments = splitCalloutSegments(text);
  const baseTextClass = className
    ? `whitespace-pre-wrap text-[0.97rem] leading-7 text-[var(--text)] ${className}`
    : "whitespace-pre-wrap text-[0.97rem] leading-7 text-[var(--text)]";
  const markdownTextClass = className
    ? `text-[0.97rem] leading-7 text-[var(--text)] ${className}`
    : "text-[0.97rem] leading-7 text-[var(--text)]";

  if (segments.length === 0) {
    if (renderMarkdown) {
      return <MarkdownMathContent content={text} className={markdownTextClass} />;
    }

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
          {renderMarkdown ? (
            <MarkdownMathContent content={segment.content} className="mt-1" />
          ) : (
            <div className="mt-1 whitespace-pre-wrap">
              <FormulaText text={segment.content} />
            </div>
          )}
        </aside>
      );
    }

    if (renderMarkdown) {
      return <MarkdownMathContent key={`${keyPrefix}-text-${idx}`} content={segment.content} className={markdownTextClass} />;
    }

    return (
      <div key={`${keyPrefix}-text-${idx}`} className={baseTextClass}>
        <FormulaText text={segment.content} />
      </div>
    );
  });
}

// 计算每个节点的掚弱程度（递归包含所有子节点下挂载的卡片）
type NodeStatus = "weak" | "progress" | "mastered" | "empty";

function getNodeStatusMap(
  folder: FolderTree | null
): Map<string, NodeStatus> {
  const map = new Map<string, NodeStatus>();
  if (!folder) return map;
  const db = getDB();
  if (!db) return map;
  const reviewByNoteId = new Map(db.reviews.map((r) => [r.note_id, r]));

  function walk(node: FolderTree["nodes"][number]): NodeStatus {
    const childStatuses = node.children.map(walk);
      const linkedSteps = node.linkedNoteIds
      .map((id) => {
        const review = reviewByNoteId.get(id);
        if (!review) return 1;
        if (review.status === "graduated") return 5;
        if (review.status === "reviewing") return Math.min(4, 2 + review.step);
        return 1;
      }) as number[];
    const childSteps = childStatuses.map((s) => {
      if (s === "mastered") return 5;
      if (s === "progress") return 3;
      if (s === "weak") return 1;
      return 0;
    }).filter((v) => v > 0);
    const steps = [...linkedSteps, ...childSteps];

    let status: NodeStatus = "empty";
    if (steps.length > 0) {
      const avg = steps.reduce((a, b) => a + b, 0) / steps.length;
      if (avg >= 4.5) status = "mastered";
      else if (avg >= 2.5) status = "progress";
      else status = "weak";
    }
    map.set(node.id, status);
    return status;
  }

  folder.nodes.forEach(walk);
  return map;
}

function getNodePathIds(folder: FolderTree | null, targetNodeId: string): Set<string> {
  if (!folder || !targetNodeId) return new Set();

  const dfs = (nodes: FolderTree["nodes"], trail: string[]): string[] | null => {
    for (const node of nodes) {
      const nextTrail = [...trail, node.id];
      if (node.id === targetNodeId) return nextTrail;
      const found = dfs(node.children, nextTrail);
      if (found) return found;
    }
    return null;
  };

  const path = dfs(folder.nodes, []);
  return new Set(path ?? []);
}

const NODE_STATUS_STYLE: Record<NodeStatus, { border: string; dotColor: string; label: string }> = {
  weak:     { border: "#d86f5b", dotColor: "#d14f4f", label: "薄弱" },
  progress: { border: "#d6b26b", dotColor: "#d9ad45", label: "巩固中" },
  mastered: { border: "#8ea57d", dotColor: "#5F8473", label: "已掌握" },
  empty:    { border: "var(--border)", dotColor: "#c9cfc2", label: "无卡片" },
};

function FrameworkTreeNode({
  node,
  depth,
  expandAll,
  nodeStatusMap,
  folderId,
  currentNodeId,
  activePathIds,
}: {
  node: FolderTree["nodes"][number];
  depth: number;
  expandAll: boolean;
  nodeStatusMap: Map<string, NodeStatus>;
  folderId: string;
  currentNodeId: string;
  activePathIds: Set<string>;
}) {
  const hasChildren = node.children.length > 0;
  const [expanded, setExpanded] = useState(true);
  // 全局展开/收起时同步本地状态
  const prevExpandAll = useRef(expandAll);
  useEffect(() => {
    if (prevExpandAll.current !== expandAll) {
      prevExpandAll.current = expandAll;
      setExpanded(expandAll);
    }
  }, [expandAll]);

  const status = nodeStatusMap.get(node.id) ?? "empty";
  const { border, dotColor } = NODE_STATUS_STYLE[status];
  const isActive = currentNodeId === node.id;
  const isInActivePath = activePathIds.has(node.id);

  return (
    <div className="relative space-y-1.5">
      <div className="relative" style={{ marginLeft: `${depth * 14}px` }}>
        {depth > 0 && (
          <>
            <span
              aria-hidden
              className="absolute -left-2.5 top-0 bottom-0 border-l border-dashed"
              style={{ borderColor: isInActivePath ? "rgba(120, 148, 110, 0.55)" : "rgba(163, 177, 138, 0.36)" }}
            />
            <span
              aria-hidden
              className="absolute -left-2.5 top-4 w-2.5 border-t border-dashed"
              style={{ borderColor: isInActivePath ? "rgba(120, 148, 110, 0.55)" : "rgba(163, 177, 138, 0.36)" }}
            />
          </>
        )}

        <div
          className="group flex items-center gap-2 rounded-md border px-2 py-1 transition-colors"
          style={{
            borderColor: isActive ? "var(--accent)" : border,
            background: isActive
              ? "var(--accent-soft)"
              : isInActivePath
                ? "rgba(234, 245, 239, 0.5)"
                : "rgba(255,255,255,0.7)",
          }}
        >
          <button
            type="button"
            onClick={() => hasChildren && setExpanded((v) => !v)}
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-[11px] text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)]"
            style={{ cursor: hasChildren ? "pointer" : "default" }}
            aria-label={hasChildren ? (expanded ? "收起子节点" : "展开子节点") : "无子节点"}
            title={hasChildren ? (expanded ? "收起子节点" : "展开子节点") : "无子节点"}
          >
            {hasChildren ? (expanded ? "▾" : "▸") : "•"}
          </button>

          <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--text)]">{node.title}</span>

          <div className="ml-auto flex shrink-0 items-center gap-1">
            {hasChildren && !expanded && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] px-1.5 text-[10px] text-[var(--muted)]">
                +{node.children.length}
              </span>
            )}

            <span
              className="inline-flex h-5 w-5 items-center justify-center"
              title={NODE_STATUS_STYLE[status].label}
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: dotColor }}
              />
            </span>

            {status !== "empty" && (
              <Link
                href={`/review?mode=framework&folderId=${folderId}&nodeId=${node.id}`}
                className="inline-flex h-5 w-5 items-center justify-center rounded text-[11px] font-semibold transition-colors hover:bg-[var(--surface-2)]"
                style={{ color: isActive ? "var(--accent)" : "var(--muted)" }}
                title="专项复习此节点"
              >
                ▶
              </Link>
            )}
          </div>
        </div>
      </div>

      {hasChildren && expanded && (
        <div className="space-y-1.5">
          {node.children.map((child) => (
            <FrameworkTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              expandAll={expandAll}
              nodeStatusMap={nodeStatusMap}
              folderId={folderId}
              currentNodeId={currentNodeId}
              activePathIds={activePathIds}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewPageContent() {
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode") === "framework" ? "framework" : "normal";
  const folderId = searchParams.get("folderId") ?? "";
  const nodeId = searchParams.get("nodeId") ?? "";
  const [items, setItems] = useState<Array<ReviewQueueItem | FrameworkReviewItem>>([]);
  const [folders, setFolders] = useState<FolderTree[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [flipped, setFlipped] = useState<Set<number>>(() => new Set());
  const [collapsedSubjects, setCollapsedSubjects] = useState<Set<string>>(() => new Set());
  const [forecast, setForecast] = useState({ tomorrow: 0, inProgress: 0, mastered: 0 });
  const [todayStats, setTodayStats] = useState({ total: 0, processed: 0, pending: 0, remembered: 0, forgotten: 0, accuracy: 0 });
  const [treeExpandAll, setTreeExpandAll] = useState(true);
  const [nodeStatusMap, setNodeStatusMap] = useState<Map<string, NodeStatus>>(() => new Map());
  const [subjectVisibleCounts, setSubjectVisibleCounts] = useState<Record<string, number>>({});
  const [virtualReady, setVirtualReady] = useState(false);
  const [recallItem, setRecallItem] = useState<ReviewQueueItem | FrameworkReviewItem | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [highPriorityOnly, setHighPriorityOnly] = useState(false);
  const [keywordsByNoteId, setKeywordsByNoteId] = useState<Record<number, string[]>>({});
  const [keywordDraft, setKeywordDraft] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const recallContentRef = useRef<HTMLDivElement | null>(null);

  const buildSubjectSet = (reviewItems: Array<ReviewQueueItem | FrameworkReviewItem>) => {
    return new Set(reviewItems.map((item) => item.note.subject?.trim() || "未分类"));
  };

  const refresh = useCallback(() => {
    const allFrameworkItems = getFrameworkReviewQueue();
    const nextItems = mode === "framework"
      ? (nodeId
          ? allFrameworkItems.filter((item) => item.nodeId === nodeId)
          : folderId
            ? allFrameworkItems.filter((item) => item.folderId === folderId)
            : allFrameworkItems)
      : getReviewQueue();
    setItems(nextItems);
    // 每次刷新都默认折叠全部科目
    setCollapsedSubjects(buildSubjectSet(nextItems));
    setForecast(getReviewForecast());
    setTodayStats(getTodayReviewStats());
    const allFolders = getAllFolders();
    setFolders(allFolders);
    // 同步节点状态地图
    const folder = allFolders.find((f) => f.id === folderId) ?? null;
    setNodeStatusMap(getNodeStatusMap(folder));
  }, [mode, folderId, nodeId]);

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
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!recallItem && !previewImage) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (previewImage) {
        setPreviewImage(null);
        return;
      }
      setRecallItem(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [recallItem, previewImage]);

  useEffect(() => {
    const root = recallContentRef.current;
    if (!root || !recallItem) return;

    root.querySelectorAll("[data-memory-circle-wrap='1']").forEach((wrapper) => {
      const parent = wrapper.parentNode;
      if (!parent) return;
      while (wrapper.firstChild) {
        parent.insertBefore(wrapper.firstChild, wrapper);
      }
      parent.removeChild(wrapper);
    });

    const circleRegex = /[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]/;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    let currentNode: Node | null = null;

    while ((currentNode = walker.nextNode())) {
      const textNode = currentNode as Text;
      if (textNode.parentElement?.closest(".katex")) continue;
      const text = textNode.textContent ?? "";
      if (!circleRegex.test(text)) continue;
      textNodes.push(textNode);
    }

    textNodes.forEach((textNode) => {
      const text = textNode.textContent ?? "";
      if (!text) return;
      const wrapper = document.createElement("span");
      wrapper.setAttribute("data-memory-circle-wrap", "1");
      wrapper.innerHTML = text.replace(
        /([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳])/g,
        '<span class="memory-circle-badge">$1</span>'
      );
      textNode.parentNode?.replaceChild(wrapper, textNode);
    });
  }, [recallItem]);

  const onReview = (noteId: number, remembered: boolean) => {
    const currentScrollY = window.scrollY;
    const prev = items.find((i) => i.note_id === noteId);
    const finishFour =
      remembered && prev?.status === "reviewing" && prev?.step === 3;
    submitReview(noteId, remembered ? "easy" : "forgot");

    const allFrameworkItems = getFrameworkReviewQueue();
    const nextItems = mode === "framework"
      ? (nodeId
          ? allFrameworkItems.filter((item) => item.nodeId === nodeId)
          : folderId
            ? allFrameworkItems.filter((item) => item.folderId === folderId)
            : allFrameworkItems)
      : getReviewQueue();
    setItems(nextItems);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.scrollTo({ top: currentScrollY, behavior: "auto" });
      });
    });

    if (nextItems.length === 0) {
      // 简单的「撒花」动效：不依赖第三方库。
      burstConfetti();
    }

    if (finishFour) {
      setToast("reviewing 阶段完成 · 已进入 graduated，之后约每 3 个月轻量回顾");
    } else {
      setToast(remembered ? "已记录轻松 · 已推进到下一步" : "已记录忘了 · 已回到 5 分钟重学");
    }
  };

  const onReviewFeedback = (
    noteId: number,
    feedback: "forgot" | "hard" | "easy"
  ) => {
    if (feedback === "hard") {
      const currentScrollY = window.scrollY;
      submitReview(noteId, "hard");

      const allFrameworkItems = getFrameworkReviewQueue();
      const nextItems = mode === "framework"
        ? (nodeId
            ? allFrameworkItems.filter((item) => item.nodeId === nodeId)
            : folderId
              ? allFrameworkItems.filter((item) => item.folderId === folderId)
              : allFrameworkItems)
        : getReviewQueue();
      setItems(nextItems);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.scrollTo({ top: currentScrollY, behavior: "auto" });
        });
      });
      setToast("已记录模糊 · 将在明天或 5 分钟后再次出现");
      return;
    }

    onReview(noteId, feedback === "easy");
  };

  const filteredItems = useMemo(() => {
    if (!highPriorityOnly) return items;
    return items.filter((item) => (item.metrics?.priority ?? 0) >= 0.6);
  }, [items, highPriorityOnly]);

  const total = filteredItems.length;
  const rawTotal = items.length;

  const groupedSubjects = useMemo(() => {
    const grouped = filteredItems.reduce<Record<string, ReviewQueueItem[]>>((acc, item) => {
      const subject = item.note.subject?.trim() || "未分类";
      if (!acc[subject]) acc[subject] = [];
      acc[subject].push(item);
      return acc;
    }, {});

    return Object.entries(grouped)
      .map(([subject, subjectItems]) => ({ subject, items: subjectItems }))
      .sort((a, b) => b.items.length - a.items.length);
  }, [filteredItems]);

  const indexById = useMemo(() => {
    const map = new Map<number, number>();
    filteredItems.forEach((item, idx) => {
      map.set(item.note_id, idx + 1);
    });
    return map;
  }, [filteredItems]);

  useEffect(() => {
    const initialCounts: Record<string, number> = {};
    for (const group of groupedSubjects) {
      initialCounts[group.subject] = Math.min(REVIEW_BATCH_SIZE, group.items.length);
    }
    setSubjectVisibleCounts(initialCounts);
  }, [groupedSubjects]);

  useEffect(() => {
    // 首次进入页面时给虚拟列表一个极短预热窗口；之后不再回退为 skeleton，避免抖动。
    if (virtualReady) return;
    const timer = window.setTimeout(() => setVirtualReady(true), 120);
    return () => window.clearTimeout(timer);
  }, [virtualReady]);

  const selectedFrameworkFolder = useMemo(
    () => folders.find((folder) => folder.id === folderId) ?? null,
    [folders, folderId]
  );

  const activePathIds = useMemo(
    () => getNodePathIds(selectedFrameworkFolder, nodeId),
    [selectedFrameworkFolder, nodeId]
  );

  useEffect(() => {
    if (groupedSubjects.length === 0) return;

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

  const hasDeepStudyInfo = (item: ReviewQueueItem | FrameworkReviewItem) => {
    const note = item.note;
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
    const answer = recallItem?.note.coreAnswer ?? "";
    const content = recallItem?.note.content ?? "";
    const parsedFromAnswer = extractFocusBlock(answer);
    const parsedFromContent = extractFocusBlock(content);
    const parsed = parsedFromAnswer.focus ? parsedFromAnswer : parsedFromContent;
    return {
      ...parsed,
      hasFocus: Boolean(parsed.focus),
      focusIsMath: hasMathExpression(parsed.focus ?? ""),
    };
  }, [recallItem]);

  const activeKeywords = useMemo(() => {
    if (!recallItem) return [];
    return keywordsByNoteId[recallItem.note.id] ?? [];
  }, [recallItem, keywordsByNoteId]);

  useEffect(() => {
    if (!recallItem) {
      setKeywordDraft("");
      setIsEditing(false);
      return;
    }

    setKeywordDraft("");
    setIsEditing(false);

    setKeywordsByNoteId((prev) => {
      if (prev[recallItem.note.id]) return prev;
      const stored = recallItem.note.keywords ?? [];
      if (stored.length === 0) return prev;
      return { ...prev, [recallItem.note.id]: stored };
    });
  }, [recallItem]);

  const addKeywordForRecall = (keyword: string) => {
    if (!recallItem) return;
    const value = keyword.trim();
    if (!value) return;
    const current = keywordsByNoteId[recallItem.note.id] ?? recallItem.note.keywords ?? [];
    if (current.includes(value)) return;
    const nextKeywords = [...current, value];

    const updated = updateNote(recallItem.note.id, {
      front: recallItem.note.front,
      question: recallItem.note.question,
      subject: recallItem.note.subject,
      difficulty: recallItem.note.difficulty,
      content: recallItem.note.coreAnswer ?? recallItem.note.content,
      coreAnswer: recallItem.note.coreAnswer ?? recallItem.note.content,
      keyPoints: recallItem.note.keyPoints ?? [],
      keywords: nextKeywords,
      examples: recallItem.note.examples,
      commonMistakes: recallItem.note.commonMistakes,
      images: recallItem.note.images,
    });

    if (!updated) return;
    setItems((prev) => prev.map((item) => (item.note.id === updated.id ? { ...item, note: updated } : item)));
    setRecallItem((prev) => (prev ? { ...prev, note: updated } : prev));
    setKeywordsByNoteId((prev) => ({ ...prev, [updated.id]: updated.keywords ?? [] }));
    setKeywordDraft("");
  };

  const removeKeywordForRecall = (keyword: string) => {
    if (!recallItem) return;
    const current = keywordsByNoteId[recallItem.note.id] ?? recallItem.note.keywords ?? [];
    const nextKeywords = current.filter((item) => item !== keyword);

    const updated = updateNote(recallItem.note.id, {
      front: recallItem.note.front,
      question: recallItem.note.question,
      subject: recallItem.note.subject,
      difficulty: recallItem.note.difficulty,
      content: recallItem.note.coreAnswer ?? recallItem.note.content,
      coreAnswer: recallItem.note.coreAnswer ?? recallItem.note.content,
      keyPoints: recallItem.note.keyPoints ?? [],
      keywords: nextKeywords,
      examples: recallItem.note.examples,
      commonMistakes: recallItem.note.commonMistakes,
      images: recallItem.note.images,
    });

    if (!updated) return;
    setItems((prev) => prev.map((item) => (item.note.id === updated.id ? { ...item, note: updated } : item)));
    setRecallItem((prev) => (prev ? { ...prev, note: updated } : prev));
    setKeywordsByNoteId((prev) => ({ ...prev, [updated.id]: updated.keywords ?? [] }));
  };

  const saveInlineEdit = (data: Parameters<typeof updateNote>[1]): boolean => {
    if (!recallItem) return false;

    const updated = updateNote(recallItem.note.id, {
      ...data,
      keywords: keywordsByNoteId[recallItem.note.id] ?? recallItem.note.keywords ?? [],
    });

    if (!updated) {
      setToast("保存失败，请重试");
      return false;
    }

    setItems((prev) => prev.map((item) => (item.note.id === updated.id ? { ...item, note: updated } : item)));
    setRecallItem((prev) => (prev ? { ...prev, note: updated } : prev));
    setKeywordsByNoteId((prev) => ({ ...prev, [updated.id]: updated.keywords ?? [] }));
    setIsEditing(false);
    setToast("已保存修改");
    return true;
  };

  function burstConfetti() {
    if (typeof document === "undefined") return;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const colors = ["#78946e", "#97a375", "#b19c7d", "#9b6b5c", "#e8e0b8", "#c8d3ba"];
    const count = prefersReducedMotion
      ? 30
      : Math.min(160, Math.max(72, Math.floor(window.innerWidth * 0.12)));
    const w = window.innerWidth;
    const launchBand = Math.max(180, w * 0.35);
    const center = w / 2;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < count; i++) {
      const el = document.createElement("div");
      const sideBias = i % 2 === 0 ? -1 : 1;
      const left =
        center +
        sideBias * (Math.random() * launchBand * 0.5) +
        (Math.random() - 0.5) * launchBand * 0.2;
      const size = 5 + Math.random() * 8;
      const color = colors[Math.floor(Math.random() * colors.length)];
      const rotate = Math.random() * 360;
      const drift = sideBias * (36 + Math.random() * 180);
      const top = -20 - Math.random() * 40;
      const isCircle = Math.random() > 0.75;

      el.style.position = "fixed";
      el.style.zIndex = "9999";
      el.style.left = `${Math.min(w - 8, Math.max(8, left))}px`;
      el.style.top = `${top}px`;
      el.style.width = `${size}px`;
      el.style.height = `${isCircle ? size : size * 0.62}px`;
      el.style.background = color;
      el.style.borderRadius = isCircle ? "999px" : "2px";
      el.style.pointerEvents = "none";
      el.style.opacity = "0.92";
      el.style.transform = `rotate(${rotate}deg)`;

      frag.appendChild(el);

        const duration = prefersReducedMotion ? 360 : 950 + Math.random() * 850;
        const fallDistance = window.innerHeight + 40 + Math.random() * 90;
        const spin = rotate + 180 + Math.random() * 260;
        const midDrift = drift * (0.45 + Math.random() * 0.3);

      el.animate(
        [
          { transform: `translate(0px, 0px) rotate(${rotate}deg)` },
          {
              offset: 0.58,
              transform: `translate(${midDrift}px, ${fallDistance * 0.55}px) rotate(${spin * 0.66}deg)`,
              opacity: prefersReducedMotion ? 0.5 : 0.88,
            },
            {
              transform: `translate(${drift}px, ${fallDistance}px) rotate(${spin}deg)`,
            opacity: 0,
          },
        ],
          {
            duration,
            easing: prefersReducedMotion ? "linear" : "cubic-bezier(0.18, 0.72, 0.25, 0.98)",
          }
      );
      window.setTimeout(() => {
        el.remove();
      }, duration + 50);
    }
    document.body.appendChild(frag);
  }

  return (
    <>
      <div className="page-hero">
        <span className="page-kicker">Review</span>
        <h1 className="page-title">今日复习</h1>
        <p className="page-desc">
          {mode === "framework"
            ? "框架回顾模式：先看父节点大纲，再回忆细节闪卡。适合建立从框架到细节的提取路径。"
            : "双引擎复习流：learning 阶段走 5 分钟、30 分钟、12 小时；reviewing 阶段走 1、7、14、30 天。忘了会回到 learning 重新巩固。"}
        </p>
      </div>

      <div className="review-toolbar">
        <div className="review-toolbar-meta flex items-center gap-3 flex-wrap">
          {total > 0 ? (
            <span className="pill">
              <span className="pill-dot" aria-hidden />
              队列 {total}{highPriorityOnly ? ` / ${rawTotal}` : ""} 张
            </span>
          ) : (
            <span className="pill">今日队列为空</span>
          )}
          {mode !== "framework" && total > 0 && (
            <span className="pill">智能排序：priority 高到低</span>
          )}
          {mode !== "framework" && rawTotal > 0 && (
            <button
              type="button"
              onClick={() => setHighPriorityOnly((prev) => !prev)}
              className="text-sm font-semibold px-3 py-1 rounded-lg transition-colors"
              style={{
                color: highPriorityOnly ? "var(--accent)" : "var(--muted)",
                background: highPriorityOnly ? "var(--accent-soft)" : "var(--surface-2)",
              }}
            >
              {highPriorityOnly ? "只看高优先级：开" : "只看高优先级：关"}
            </button>
          )}
          {todayStats.total > 0 && (
            <Link
              href="/review/summary"
              className="text-sm font-semibold px-3 py-1 rounded-lg transition-colors"
              style={{
                color: "var(--accent)",
                background: "var(--accent-soft)",
              }}
            >
              📊 复盘 ({todayStats.remembered}✓ {todayStats.forgotten}✗)
            </Link>
          )}
          <Link
            href={mode === "framework" ? "/review" : "/review?mode=framework"}
            className="text-sm font-semibold px-3 py-1 rounded-lg transition-colors"
            style={{
              color: mode === "framework" ? "var(--accent)" : "var(--muted)",
              background: mode === "framework" ? "var(--accent-soft)" : "var(--surface-2)",
            }}
          >
            🧭 框架回顾
          </Link>
          {mode === "framework" && (
            <div className="inline-flex items-center gap-2 flex-wrap">
              <Link
                href="/review?mode=framework"
                className="text-xs px-2.5 py-1 rounded-lg transition-colors"
                style={{
                  color: folderId ? "var(--muted)" : "var(--accent)",
                  background: folderId ? "var(--surface-2)" : "var(--accent-soft)",
                }}
              >
                全部文件夹
              </Link>
              {folders.map((folder) => (
                <Link
                  key={folder.id}
                  href={`/review?mode=framework&folderId=${folder.id}`}
                  className="text-xs px-2.5 py-1 rounded-lg transition-colors"
                  style={{
                    color: folderId === folder.id ? "var(--accent)" : "var(--muted)",
                    background: folderId === folder.id ? "var(--accent-soft)" : "var(--surface-2)",
                  }}
                >
                  {folder.name}
                </Link>
              ))}
              {nodeId && (
                <>
                  <span className="text-xs text-[var(--muted)]">/</span>
                  <span
                    className="text-xs px-2.5 py-1 rounded-lg"
                    style={{ color: "var(--accent)", background: "var(--accent-soft)" }}
                  >
                    📄 节点专项
                  </span>
                  <Link
                    href={`/review?mode=framework&folderId=${folderId}`}
                    className="text-xs px-2 py-1 rounded-lg transition-colors"
                    style={{ color: "var(--muted)", background: "var(--surface-2)" }}
                  >
                    × 退出专项
                  </Link>
                </>
              )}
            </div>
          )}
          <Link
            href="/folders"
            className="text-sm font-semibold px-3 py-1 rounded-lg transition-colors"
            style={{ color: "var(--muted)", background: "var(--surface-2)" }}
          >
            🗂️ 去建树
          </Link>
        </div>
      </div>

      {mode === "framework" && (
        <div className="mt-4 mb-6">
          <div
            className="rounded-xl p-4"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              boxShadow: "var(--shadow-card)",
            }}
          >
            <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
              <h3 className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                🧭 当前框架结构
              </h3>
              <div className="flex items-center gap-2 flex-wrap">
                {selectedFrameworkFolder && selectedFrameworkFolder.nodes.length > 0 && (
                  <span className="flex items-center gap-2 text-[0.65rem] text-[var(--muted)]">
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: NODE_STATUS_STYLE.weak.dotColor }} />
                      薄弱
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: NODE_STATUS_STYLE.progress.dotColor }} />
                      巩固中
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: NODE_STATUS_STYLE.mastered.dotColor }} />
                      已掌握
                    </span>
                  </span>
                )}
                {selectedFrameworkFolder && selectedFrameworkFolder.nodes.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setTreeExpandAll((v) => !v)}
                    className="text-xs px-2.5 py-0.5 rounded-full border transition-colors"
                    style={{
                      color: treeExpandAll ? "var(--muted)" : "var(--accent)",
                      borderColor: treeExpandAll ? "var(--border)" : "var(--accent)",
                      background: treeExpandAll ? "var(--surface-2)" : "var(--accent-soft)",
                    }}
                  >
                    {treeExpandAll ? "一键收起" : "一键展开"}
                  </button>
                )}
                <span className="text-xs" style={{ color: "var(--muted)" }}>
                  {selectedFrameworkFolder ? selectedFrameworkFolder.name : "全部文件夹"}
                </span>
              </div>
            </div>

            {!folderId && (
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                请选择上方某个文件夹，先看该树状大纲，再进入细节卡片回忆。
              </p>
            )}

            {folderId && !selectedFrameworkFolder && (
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                当前文件夹不存在或已删除，请重新选择。
              </p>
            )}

            {selectedFrameworkFolder && selectedFrameworkFolder.nodes.length === 0 && (
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                该文件夹还没有大纲节点，先去建树再回来复习。
              </p>
            )}

            {selectedFrameworkFolder && selectedFrameworkFolder.nodes.length > 0 && (
              <div className="mt-2 max-h-[420px] overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)]/75 p-2 sm:p-3">
                <div className="space-y-2">
                  {selectedFrameworkFolder.nodes.map((node) => (
                    <FrameworkTreeNode
                      key={node.id}
                      node={node}
                      depth={0}
                      expandAll={treeExpandAll}
                      nodeStatusMap={nodeStatusMap}
                      folderId={folderId}
                      currentNodeId={nodeId}
                      activePathIds={activePathIds}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 今日可复习任务卡片 */}
      <div className="mt-6 mb-6">
        <div
          className="rounded-xl p-5"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            boxShadow: "var(--shadow-card)",
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold" style={{ color: "var(--text)" }}>
              📋 今日任务
            </h3>
            {todayStats.total > 0 && (
              <span className="text-xs font-medium" style={{ color: "var(--muted)" }}>
                {todayStats.processed} / {todayStats.total} 已处理
              </span>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            {/* 待复习 */}
            <button
              type="button"
              onClick={() => {
                document.getElementById("review-subject-sections")?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                });
              }}
              className="flex flex-col items-center p-3 rounded-lg bg-spring-bg hover:brightness-[0.98] transition"
            >
              <div className="text-2xl font-bold text-spring-green mb-1">{todayStats.pending}</div>
              <div className="text-xs text-center" style={{ color: "var(--text)" }}>
                待复习
              </div>
              <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                点击查看
              </div>
            </button>

            {/* 已记住 */}
            <Link
              href="/review/summary?filter=remembered"
              className="flex flex-col items-center p-3 rounded-lg transition-colors"
              style={{
                background: "var(--accent-soft)",
                border: "1px solid var(--border)",
              }}
            >
              <div className="text-2xl font-bold mb-1" style={{ color: "var(--accent)" }}>{todayStats.remembered}</div>
              <div className="text-xs text-center" style={{ color: "var(--text)" }}>
                已记住
              </div>
              <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                点击复盘
              </div>
            </Link>

            {/* 已遗忘 */}
            <Link
              href="/review/summary?filter=forgotten"
              className="flex flex-col items-center p-3 rounded-lg"
              style={{
                background: "var(--danger-soft)",
                border: "1px solid var(--border)",
              }}
            >
              <div className="text-2xl font-bold mb-1" style={{ color: "var(--danger)" }}>{todayStats.forgotten}</div>
              <div className="text-xs text-center" style={{ color: "var(--text)" }}>
                已遗忘
              </div>
              <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                点击查看
              </div>
            </Link>
          </div>

          {/* 进度条 */}
          {todayStats.total > 0 && (
            <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium" style={{ color: "var(--muted)" }}>
                  今日完成度
                </span>
                <span className="text-xs font-semibold" style={{ color: "var(--accent)" }}>
                  {Math.round((todayStats.processed / todayStats.total) * 100)}%
                </span>
              </div>
              <div
                className="w-full h-3 rounded-full overflow-hidden"
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                }}
              >
                <div
                  className="h-full transition-all duration-300"
                  style={{
                    width: `${todayStats.processed > 0 ? Math.max((todayStats.processed / todayStats.total) * 100, 4) : 0}%`,
                    background: "linear-gradient(90deg, var(--accent), var(--success))",
                  }}
                />
              </div>
              <div className="mt-1 text-[11px]" style={{ color: "var(--muted)" }}>
                已完成 {todayStats.processed} / {todayStats.total}
              </div>
            </div>
          )}
        </div>
      </div>

      {total === 0 && (
        <div className="mt-8 space-y-6">
          {/* 主空状态卡片 */}
          <div className="px-4 sm:px-6 lg:px-8">
            <div
              className="rounded-2xl p-8 sm:p-10"
              style={{
                background: "linear-gradient(135deg, var(--accent-soft) 0%, var(--surface) 100%)",
                border: "1px solid var(--border-strong)",
              }}
            >
              {/* 标题 */}
              <div className="text-center mb-6">
                <div className="text-5xl sm:text-6xl mb-4">🧠</div>
                <h3 className="text-xl sm:text-2xl font-bold mb-3" style={{ color: "var(--text)" }}>
                  太棒了！海马体今日整理中 ☕
                </h3>
              </div>

              {/* 描述 */}
              <p
                className="text-sm sm:text-base text-center mb-8 max-w-lg mx-auto leading-relaxed"
                style={{ color: "var(--text)" }}
              >
                今天所有短期记忆都已安排妥当，大脑正在后台将它们转化为长期记忆。你可以随时新增知识点，并在当天立即进入复习。
              </p>

              {/* 操作按钮 */}
              <div className="flex flex-col sm:flex-row gap-3 justify-center mb-6">
                <Link
                  href="/notes"
                  className="inline-flex items-center justify-center px-8 py-4 bg-[var(--accent)] text-white font-semibold rounded-xl hover:brightness-105 hover:shadow-md hover:-translate-y-1 active:translate-y-0 transition-all shadow-md min-h-12"
                >
                  ✨ 添加新知识点
                </Link>
                <Link
                  href="/calendar"
                  className="inline-flex items-center justify-center px-8 py-4 font-semibold rounded-xl border transition-all shadow-sm min-h-12"
                  style={{
                    background: "var(--surface)",
                    color: "var(--text)",
                    borderColor: "var(--border-strong)",
                  }}
                >
                  📅 查看日历
                </Link>
              </div>

              {/* 辅助文案 */}
              <p className="text-xs sm:text-sm text-center" style={{ color: "var(--muted)" }}>
                💡 每张知识点遵循双引擎：5 分钟 → 30 分钟 → 12 小时 → 1/7/14/30 天 → 长期巡航。
              </p>
            </div>
          </div>

          {/* 复习预测面板 */}
          <div className="px-4 sm:px-6 lg:px-8">
            <div className="space-y-3 sm:grid sm:grid-cols-3 sm:gap-4 sm:space-y-0">
              {/* 明天预计 */}
              <Link href="/review/tomorrow" className="block">
                <div
                  className="rounded-xl p-5 hover:shadow-md transition-all cursor-pointer active:shadow-sm"
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border-strong)",
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div className="text-4xl flex-shrink-0">📩</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: "var(--muted)" }}>
                        明天到期
                      </p>
                      <p className="text-3xl font-bold" style={{ color: "var(--accent)" }}>
                        {forecast.tomorrow}
                      </p>
                      <p className="text-xs mt-2 line-clamp-2" style={{ color: "var(--muted)" }}>
                        {forecast.tomorrow > 0
                          ? `${forecast.tomorrow} 张卡需复习`
                          : "无计划"}
                      </p>
                    </div>
                  </div>
                </div>
              </Link>

              {/* 进行中 */}
              <Link href="/review/progress" className="block">
                <div
                  className="rounded-xl p-5 hover:shadow-md transition-all cursor-pointer active:shadow-sm"
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border-strong)",
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div className="text-4xl flex-shrink-0">🚀</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: "var(--muted)" }}>
                        在前进中
                      </p>
                      <p className="text-3xl font-bold" style={{ color: "var(--danger)" }}>
                        {forecast.inProgress}
                      </p>
                      <p className="text-xs mt-2 line-clamp-2" style={{ color: "var(--muted)" }}>
                        {forecast.inProgress > 0
                          ? `reviewing 阶段`
                          : "正在路上"}
                      </p>
                    </div>
                  </div>
                </div>
              </Link>

              {/* 已掌握 */}
              <Link href="/review/mastered" className="block">
                <div
                  className="rounded-xl p-5 hover:shadow-md transition-all cursor-pointer active:shadow-sm"
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border-strong)",
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div className="text-4xl flex-shrink-0">🎖️</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: "var(--muted)" }}>
                        已掌握
                      </p>
                      <p className="text-3xl font-bold" style={{ color: "var(--mastered)" }}>
                        {forecast.mastered}
                      </p>
                      <p className="text-xs mt-2 line-clamp-2" style={{ color: "var(--muted)" }}>
                        {forecast.mastered > 0 ? "长期仓库" : "待突破"}
                      </p>
                    </div>
                  </div>
                </div>
              </Link>
            </div>
          </div>
        </div>
      )}

      <div id="review-subject-sections" className="space-y-4">
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
                <div className="review-list mt-3">
                  {/** 防止筛选切换后的旧计数导致出现空白占位项 */}
                  {(() => {
                    const visibleCount = Math.min(
                      subjectVisibleCounts[group.subject] ?? Math.min(REVIEW_BATCH_SIZE, group.items.length),
                      group.items.length
                    );

                    return !virtualReady ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <div
                          key={`${group.subject}-review-skeleton-${i}`}
                          className="h-24 rounded-xl border border-[var(--border)] bg-[var(--surface)] animate-pulse"
                        />
                      ))}
                    </div>
                  ) : (
                    <Virtuoso
                      key={`${group.subject}-${highPriorityOnly ? "hp" : "all"}`}
                      useWindowScroll
                      totalCount={visibleCount}
                      endReached={() => {
                        setSubjectVisibleCounts((prev) => {
                          const current = prev[group.subject] ?? Math.min(REVIEW_BATCH_SIZE, group.items.length);
                          if (current >= group.items.length) return prev;
                          return {
                            ...prev,
                            [group.subject]: Math.min(group.items.length, current + REVIEW_BATCH_SIZE),
                          };
                        });
                      }}
                      itemContent={(index) => {
                        const item = group.items[index];
                        if (!item || !item.note) {
                          return null;
                        }
                        const isFlipped = flipped.has(item.note_id);
                        const questionText = item.note.question?.trim() || item.note.front;
                        const answerText =
                          item.note.coreAnswer?.trim() || item.note.content || "";
                        const cardAnswerLayout = extractFocusBlock(answerText);
                        const answerHasFocus = Boolean(cardAnswerLayout.focus);
                        const answerFocusIsMath = hasMathExpression(cardAnswerLayout.focus ?? "");
                        const theme = getSubjectTheme(item.note.subject ?? "未分类");
                        return (
                      <div key={item.note_id} className="pb-3">
                      <article className="card card-anki relative mb-0" style={{ background: "var(--surface)" }}>
                        <span className="review-card-index">
                          {indexById.get(item.note_id)} / {total}
                        </span>
                        {isFlipped && (
                          <button
                            type="button"
                            title="重新看题目"
                            className="absolute top-2.5 right-12 flex items-center justify-center w-7 h-7 rounded-full text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)] transition-colors text-base leading-none"
                            onClick={() => toggleFlip(item.note_id)}
                          >
                            ↩
                          </button>
                        )}
                        <div className="card-meta font-sans">
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
                          {item.metrics && (
                            <>
                              <span className="badge badge-muted">
                                P{Math.round(item.metrics.priority * 100)}
                              </span>
                              <span className="badge badge-muted">
                                {explainPriority(item)}
                              </span>
                            </>
                          )}
                          <button
                            type="button"
                            className="btn btn-ghost btn-icon btn-meta-soft"
                            onClick={(e) => {
                              e.stopPropagation();
                              setRecallItem(item);
                            }}
                          >
                            回忆
                          </button>
                        </div>
                        {/* 面包屑导航 */}
                        <div className="flex items-center gap-1 text-xs mb-2 flex-wrap font-sans" style={{ color: "var(--muted)" }}>
                          {isFrameworkItem(item) && item.outlinePath.length > 0 ? (
                            <>
                              <span>🧭</span>
                              <span className="font-medium">{item.folderName}</span>
                              <span className="opacity-40">›</span>
                              <span>{item.outlinePath.join(" / ")}</span>
                            </>
                          ) : (
                            <>
                              <span>🧠</span>
                              <span className="font-medium">{item.note.subject ?? "未分类"}</span>
                              {isFlipped && item.note.keyPoints?.[0] && (
                                <>
                                  <span className="opacity-40">›</span>
                                      <span><FormulaText text={item.note.keyPoints[0]} inline className="review-card-meta-formula" /></span>
                                </>
                              )}
                              {isFlipped && item.note.keyPoints?.[1] && (
                                <>
                                  <span className="opacity-40">›</span>
                                      <span><FormulaText text={item.note.keyPoints[1]} inline className="review-card-meta-formula" /></span>
                                </>
                              )}
                            </>
                          )}
                        </div>
                        {!isFlipped ? (
                          <div className="note-body note-body-front text-left font-serif leading-relaxed tracking-wide text-[var(--text)]">
                            <FormulaText
                              text={questionText}
                              className="review-card-front-formula font-serif leading-relaxed tracking-wide text-[var(--text)]"
                              inline
                            />
                          </div>
                        ) : (
                          <div className="mt-1 text-left">
                            {answerHasFocus ? (
                              <div className="grid grid-cols-1 md:grid-cols-[35%_1px_1fr] gap-0">
                                <div className="min-w-0 bg-[var(--surface-2)] p-4 md:p-6 flex items-center justify-center text-center">
                                  <div
                                    className="w-full max-w-full text-lg md:text-xl font-bold font-serif leading-relaxed tracking-wide text-[var(--text)] whitespace-pre-wrap break-words [overflow-wrap:anywhere] [&_.formula-text]:w-full [&_.formula-text]:max-w-full [&_.formula-text]:whitespace-pre-wrap [&_.formula-text]:break-words [&_.formula-text]:[overflow-wrap:anywhere] [&_.katex-display]:text-2xl [&_.katex-display]:overflow-x-auto [&_.katex-display]:my-0"
                                  >
                                    <FormulaText
                                      text={cardAnswerLayout.focus ?? ""}
                                      className={answerFocusIsMath ? "memory-focus-math font-serif leading-relaxed tracking-wide text-[var(--text)]" : "font-serif leading-relaxed tracking-wide text-[var(--text)]"}
                                    />
                                  </div>
                                </div>
                                <div className="hidden md:block border-r border-dashed border-[var(--border-strong)]" aria-hidden />
                                <div className="min-w-0 p-4 md:p-6 text-left text-[0.97rem] font-serif leading-relaxed tracking-wide text-[var(--text)]">
                                  {cardAnswerLayout.rest
                                    ? renderSegmentsWithCallout(cardAnswerLayout.rest, `review-card-answer-${item.note_id}`)
                                    : <p className="text-[var(--muted)]">已提取核心锚点，无额外推演内容。</p>}
                                </div>
                              </div>
                            ) : (
                              <div className="text-left text-[0.97rem] font-serif leading-relaxed tracking-wide text-[var(--text)]">
                                {renderSegmentsWithCallout(answerText, `review-card-answer-${item.note_id}`)}
                              </div>
                            )}
                          </div>
                        )}
                        <div className="card-actions card-actions-anki mt-4 font-sans">
                          <>
                            <button
                              type="button"
                              className="btn btn-forget font-sans"
                              onClick={() => onReviewFeedback(item.note_id, "forgot")}
                            >
                              忘了
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost font-sans"
                              onClick={() => onReviewFeedback(item.note_id, "hard")}
                            >
                              模糊
                            </button>
                            <button
                              type="button"
                              className="btn btn-remember font-sans"
                              onClick={() => onReviewFeedback(item.note_id, "easy")}
                            >
                              轻松
                            </button>
                          </>
                        </div>
                      </article>
                      </div>
                        );
                      }}
                    />
                  );
                  })()}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {recallItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setRecallItem(null)}>
          <div className="absolute inset-0 bg-black/35" aria-hidden />
          <div
            className="relative w-full max-w-3xl rounded-2xl bg-[var(--surface)] text-[var(--text)] shadow-[0_18px_50px_rgba(15,23,42,0.22)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-6 py-4">
              <div className="min-w-0">
                <h4 className="max-w-[60ch] text-xl sm:text-[1.4rem] font-semibold font-serif leading-relaxed tracking-wide text-[var(--text)] break-words" style={{ fontFamily: WENKAI_CONTENT_FONT }}>
                  <FormulaText
                    text={recallItem.note.question || recallItem.note.front}
                    inline
                    className="recall-title-formula font-serif leading-relaxed tracking-wide text-[var(--text)]"
                  />
                </h4>
              </div>
              <button
                type="button"
                className="shrink-0 rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--muted)] hover:bg-[var(--surface-hover)] font-sans"
                onClick={() => setRecallItem(null)}
                aria-label="关闭"
              >
                x
              </button>
            </div>

            <div ref={recallContentRef} className="max-h-[72vh] overflow-y-auto px-6 py-5">
              {isEditing ? (
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 sm:p-5">
                  <NotebookEditor
                    initialData={{
                      front: recallItem.note.front,
                      content: recallItem.note.coreAnswer ?? recallItem.note.content,
                      subject: recallItem.note.subject,
                      difficulty: recallItem.note.difficulty,
                      question: recallItem.note.question ?? recallItem.note.front,
                      coreAnswer: recallItem.note.coreAnswer ?? recallItem.note.content,
                      keyPoints: recallItem.note.keyPoints,
                      commonMistakes: recallItem.note.commonMistakes,
                      examples: recallItem.note.examples,
                      images: recallItem.note.images,
                    }}
                    initialMode="advanced"
                    onSubmit={saveInlineEdit}
                    onCancel={() => setIsEditing(false)}
                    submitLabel="保存深化记忆"
                  />
                </div>
              ) : !hasDeepStudyInfo(recallItem) ? (
                <div className="space-y-4">
                  <p className="text-sm text-[var(--muted)]">
                    这张卡片当时还没有记录“深化学习”信息。
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-semibold text-[var(--text)] font-sans hover:bg-[var(--surface-hover)]"
                  >
                    补充深化记忆
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-5">
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setIsEditing(true)}
                      className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-semibold text-[var(--text)] font-sans hover:bg-[var(--surface-hover)]"
                    >
                      ✏️ 编辑
                    </button>
                  </div>

                  <section className="grid grid-cols-[minmax(130px,34%)_1fr] items-start gap-4 md:gap-6">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold tracking-widest text-[var(--muted)] uppercase mb-2">记忆泡泡</p>
                      <div className="flex flex-col gap-2">
                        {recallAnswerLayout.hasFocus && (
                          <span
                            className="inline-flex items-center gap-2 self-start rounded-full border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 py-1.5 text-sm font-semibold font-serif leading-relaxed tracking-wide text-[var(--text)] shadow-[0_8px_24px_rgb(0,0,0,0.06)] backdrop-blur-sm"
                            style={{ fontFamily: WENKAI_CONTENT_FONT }}
                          >
                            <span aria-hidden>🔖</span>
                            <FormulaText
                              text={recallAnswerLayout.focus ?? ""}
                              className={recallAnswerLayout.focusIsMath ? "memory-focus-math leading-relaxed tracking-wide text-[var(--text)]" : "leading-relaxed tracking-wide text-[var(--text)]"}
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
                      <p className="inline-block relative z-10 text-sm font-semibold tracking-widest text-[var(--muted)] uppercase mb-3 mt-2 before:content-[''] before:absolute before:-bottom-1 before:left-0 before:w-full before:h-3 before:bg-[#B96D5C]/35 before:-z-10">核心答案</p>
                      <div className="mt-1 text-[0.97rem] font-serif leading-relaxed tracking-wide whitespace-pre-wrap text-justify text-[var(--text)] recall-derivation-zone" style={{ fontFamily: WENKAI_CONTENT_FONT }}>
                        {recallAnswerLayout.hasFocus
                          ? (recallAnswerLayout.rest
                              ? renderSegmentsWithCallout(recallAnswerLayout.rest, "recall-answer", undefined, true)
                              : <p className="text-[var(--muted)]">已提取核心锚点，无额外推演内容。</p>)
                          : renderSegmentsWithCallout(recallItem.note.coreAnswer ?? "", "recall-answer", undefined, true)}
                      </div>
                    </div>
                  </section>

                  {recallItem.note.keyPoints && recallItem.note.keyPoints.length > 0 && (
                    <section>
                      <p className="inline-block relative z-10 text-sm font-semibold tracking-widest text-[var(--muted)] uppercase mb-3 mt-6 before:content-[''] before:absolute before:-bottom-1 before:left-0 before:w-full before:h-3 before:bg-[#D4E09B]/50 before:-z-10">关键点</p>
                      <ul className="mt-1 list-disc pl-5 text-[0.97rem] font-serif leading-relaxed tracking-wide text-justify text-[var(--text)] marker:text-[var(--accent)]" style={{ fontFamily: WENKAI_CONTENT_FONT }}>
                        {(recallItem.note.keyPoints ?? []).map((point, idx) => (
                          <li key={`${idx}-${point}`}><FormulaText text={point} className="note-card-keypoint-formula" /></li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {recallItem.note.examples && (
                    <section>
                      <p className="inline-block relative z-10 text-sm font-semibold tracking-widest text-[var(--muted)] uppercase mb-3 mt-6 before:content-[''] before:absolute before:-bottom-1 before:left-0 before:w-full before:h-3 before:bg-[#D4E09B]/50 before:-z-10">示例 / 应用场景</p>
                      <div className="mt-1 text-[0.97rem] font-serif leading-relaxed tracking-wide text-justify text-[var(--text)]" style={{ fontFamily: WENKAI_CONTENT_FONT }}>
                        <MarkdownMathContent content={recallItem.note.examples ?? ""} />
                      </div>
                    </section>
                  )}

                  {recallItem.note.commonMistakes && (
                    <section>
                      <p className="inline-block relative z-10 text-sm font-semibold tracking-widest text-[var(--muted)] uppercase mb-3 mt-6 before:content-[''] before:absolute before:-bottom-1 before:left-0 before:w-full before:h-3 before:bg-[#D4E09B]/50 before:-z-10">易错点 / 常见误区</p>
                      <div className="mt-1 text-[0.97rem] font-serif leading-relaxed tracking-wide text-justify text-[var(--text)]" style={{ fontFamily: WENKAI_CONTENT_FONT }}>
                        {renderSegmentsWithCallout(recallItem.note.commonMistakes ?? "", "recall-mistakes", undefined, true)}
                      </div>
                    </section>
                  )}

                  {recallItem.note.images && recallItem.note.images.length > 0 && (
                    <section>
                      <p className="text-sm font-semibold tracking-widest text-[var(--muted)] uppercase mb-3 mt-6">图片 / 链接</p>
                      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3 justify-items-start sm:justify-items-center">
                        {recallItem.note.images.map((src, idx) => (
                          <div
                            key={`${idx}-${src}`}
                            className="block w-full max-w-sm rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2 hover:shadow-sm transition-shadow"
                          >
                            <button
                              type="button"
                              onClick={() => setPreviewImage(src)}
                              className="w-full"
                              title="点击放大查看"
                            >
                              <img
                                src={src}
                                alt={`回忆图片 ${idx + 1}`}
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
      
      {/* 调试面板 - 仅用于开发测试 */}
      <DebugPanel />
    </>
  );
}

export default function ReviewPage() {
  return (
    <Suspense fallback={null}>
      <ReviewPageContent />
    </Suspense>
  );
}
