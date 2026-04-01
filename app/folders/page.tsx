"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { FormulaText } from "../../components/FormulaText";
import { MarkdownMathContent } from "../../components/MarkdownMathContent";
import {
  addFolder,
  addFolderNode,
  deleteFolder,
  deleteFolderNode,
  getAllFolders,
  getAllNotes,
  moveFolder,
  moveFolderNode,
  renameFolder,
  toggleNodeNoteLink,
  updateFolderNode,
  type FolderNode,
  type FolderTree,
  type Note,
} from "../../lib/db";

type NodeTreeProps = {
  folderId: string;
  node: FolderNode;
  depth: number;
  notes: Note[];
  noteById: Map<number, Note>;
  selectedNodeId: string | null;
  collapseSignal: number;
  onSelectNode: (nodeId: string, folderId: string) => void;
  onMoveNode: (folderId: string, nodeId: string, direction: "up" | "down") => void;
  onRefresh: () => void;
};

type FoundNode = {
  folder: FolderTree;
  node: FolderNode;
  path: string[];
};

const SCROLL_AREA_STYLE: CSSProperties = {
  scrollbarWidth: "none",
  msOverflowStyle: "none",
};

const WENKAI_CONTENT_FONT = '"LXGW WenKai Screen", "LXGW WenKai", serif';
const PINNED_FOLDERS_KEY = "study_app_pinned_folders";
const FOLDER_ACTION_REVEAL = 144;

function findNodeInTree(nodes: FolderNode[], targetId: string, path: string[] = []): { node: FolderNode; path: string[] } | null {
  for (const current of nodes) {
    const nextPath = [...path, current.title];
    if (current.id === targetId) {
      return { node: current, path: nextPath };
    }
    const inChild = findNodeInTree(current.children, targetId, nextPath);
    if (inChild) return inChild;
  }
  return null;
}

function countTreeNodes(nodes: FolderNode[]): number {
  let count = 0;
  for (const node of nodes) {
    count += 1;
    count += countTreeNodes(node.children);
  }
  return count;
}

function OutlineTreeNode({
  folderId,
  node,
  depth,
  notes,
  noteById,
  selectedNodeId,
  collapseSignal,
  onSelectNode,
  onMoveNode,
  onRefresh,
}: NodeTreeProps) {
  const [expanded, setExpanded] = useState(false);
  const [showLinkPanel, setShowLinkPanel] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(node.title);
  const [linkId, setLinkId] = useState<string>("");

  const linkedNotes = node.linkedNoteIds.map((id) => noteById.get(id)).filter((n): n is Note => Boolean(n));
  const hasChildren = node.children.length > 0;
  const isSelected = selectedNodeId === node.id;

  useEffect(() => {
    if (!isEditingTitle) setDraftTitle(node.title);
  }, [isEditingTitle, node.title]);

  useEffect(() => {
    setExpanded(false);
    setShowActions(false);
    setShowLinkPanel(false);
    setIsEditingTitle(false);
  }, [collapseSignal]);

  const handleAddChild = () => {
    const title = window.prompt("输入子节点标题", "新知识点");
    if (!title?.trim()) return;
    addFolderNode(folderId, title.trim(), node.id);
    setShowActions(false);
    onRefresh();
  };

  const handleRenameSave = () => {
    const title = draftTitle.trim();
    if (!title) return;
    if (title === node.title) {
      setIsEditingTitle(false);
      return;
    }
    updateFolderNode(folderId, node.id, title);
    setIsEditingTitle(false);
    setShowActions(false);
    onRefresh();
  };

  const handleRenameCancel = () => {
    setDraftTitle(node.title);
    setIsEditingTitle(false);
  };

  const handleDelete = () => {
    if (!window.confirm("删除该节点及全部子节点？")) return;
    deleteFolderNode(folderId, node.id);
    setShowActions(false);
    onRefresh();
  };

  const handleLink = () => {
    const noteId = Number(linkId);
    if (!Number.isFinite(noteId) || noteId <= 0) return;
    toggleNodeNoteLink(folderId, node.id, noteId);
    setLinkId("");
    setShowActions(false);
    onRefresh();
  };

  return (
    <div className="space-y-1">
      <div className="relative" style={{ marginLeft: `${depth * 12}px` }}>
        {depth > 0 && (
          <span
            aria-hidden
            className="absolute -left-2.5 top-0 bottom-0 border-l border-dashed"
            style={{ borderColor: "rgba(163, 177, 138, 0.4)" }}
          />
        )}

        <div
          className={`group/node rounded-md px-1.5 py-1 transition-colors ${isSelected ? "font-semibold text-[#2A3B2C]" : "text-[var(--text)]"}`}
          style={{
            background: isSelected ? "#EAF5EF" : "transparent",
          }}
        >
          <div className="flex items-center gap-1.5">
            {hasChildren ? (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] text-[var(--muted)] hover:bg-[var(--surface-2)]"
                title={expanded ? "收起子节点" : "展开子节点"}
                aria-label={expanded ? "收起子节点" : "展开子节点"}
              >
                {expanded ? "▾" : "▸"}
              </button>
            ) : (
              <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] text-[var(--muted)]">•</span>
            )}

            {isEditingTitle ? (
              <input
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRenameSave();
                  if (e.key === "Escape") handleRenameCancel();
                }}
                className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-white px-2 py-1 text-xs"
                autoFocus
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  onSelectNode(node.id, folderId);
                  if (hasChildren) setExpanded((v) => !v);
                }}
                onDoubleClick={() => setIsEditingTitle(true)}
                className="min-w-0 flex-1 truncate text-left text-[12px] leading-6"
                title={node.title}
              >
                {node.title}
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowActions((v) => !v)}
              className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[13px] transition-opacity group-hover/node:opacity-100 group-focus-within/node:opacity-100 ${
                showActions || isSelected ? "text-[#2A3B2C]" : "text-[var(--muted)]"
              }`}
              style={{
                background: showActions || isSelected ? "rgba(234, 245, 239, 0.85)" : "transparent",
                opacity: showActions || isSelected ? 1 : 0,
              }}
              title={showActions ? "收起操作" : "显示操作"}
              aria-label={showActions ? "收起操作" : "显示操作"}
            >
              ⋯
            </button>
          </div>

          {showActions && (
            <div className="relative">
              <div className="absolute right-0 z-20 mt-1 w-40 rounded-xl border border-[rgba(163,177,138,0.38)] bg-[rgba(255,255,255,0.96)] p-1.5 shadow-[0_12px_24px_rgba(60,85,65,0.14)] backdrop-blur">
                <button
                  type="button"
                  onClick={handleAddChild}
                  className="w-full rounded-lg px-2.5 py-1.5 text-left text-[11px] text-[var(--accent)] hover:bg-[var(--accent-soft)]"
                >
                  + 添加子节点
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onMoveNode(folderId, node.id, "up");
                    setShowActions(false);
                  }}
                  className="w-full rounded-lg px-2.5 py-1.5 text-left text-[11px] text-[var(--text)] hover:bg-[var(--surface-2)]"
                >
                  上移
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onMoveNode(folderId, node.id, "down");
                    setShowActions(false);
                  }}
                  className="w-full rounded-lg px-2.5 py-1.5 text-left text-[11px] text-[var(--text)] hover:bg-[var(--surface-2)]"
                >
                  下移
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsEditingTitle(true);
                    setShowActions(false);
                  }}
                  className="w-full rounded-lg px-2.5 py-1.5 text-left text-[11px] text-[var(--text)] hover:bg-[var(--surface-2)]"
                >
                  编辑节点标题
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowLinkPanel((v) => !v);
                    setShowActions(false);
                  }}
                  className="w-full rounded-lg px-2.5 py-1.5 text-left text-[11px] text-[#5a7f98] hover:bg-[rgba(102,143,178,0.12)]"
                >
                  {showLinkPanel ? "收起关联卡片" : "关联记忆卡片"}
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="w-full rounded-lg px-2.5 py-1.5 text-left text-[11px] text-[#9b6b5c] hover:bg-[rgba(155,107,92,0.12)]"
                >
                  删除节点
                </button>
              </div>
            </div>
          )}

          {isEditingTitle && (
            <div className="mt-2 flex items-center gap-1">
              <button
                type="button"
                onClick={handleRenameSave}
                className="rounded-md border border-[var(--border)] bg-white px-2 py-1 text-[10px]"
              >
                保存
              </button>
              <button
                type="button"
                onClick={handleRenameCancel}
                className="rounded-md border border-[var(--border)] bg-white px-2 py-1 text-[10px] text-[var(--muted)]"
              >
                取消
              </button>
            </div>
          )}

          <div className={`grid transition-all duration-200 ${showLinkPanel ? "mt-1.5 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
            <div className="min-h-0 overflow-hidden">
              <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)]/60 p-2">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center">
                  <select
                    value={linkId}
                    onChange={(e) => setLinkId(e.target.value)}
                    className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-white px-2 py-1 text-[11px]"
                  >
                    <option value="">关联闪卡...</option>
                    {notes.map((note) => (
                      <option key={note.id} value={String(note.id)}>
                        {note.subject || "未分类"} · {note.front}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleLink}
                    className="rounded-md border border-[var(--border)] bg-white px-2 py-1 text-[11px]"
                  >
                    关联
                  </button>
                </div>

                {linkedNotes.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {linkedNotes.map((note) => (
                      <div key={note.id} className="relative rounded-full border border-[var(--border)] bg-white pr-5">
                        <span className="block max-w-[220px] truncate px-2 py-0.5 text-[10px]" title={note.front}>
                          <FormulaText text={note.front} inline />
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            if (!window.confirm("确认取消这张闪卡与当前节点的关联？")) return;
                            toggleNodeNoteLink(folderId, node.id, note.id);
                            onRefresh();
                          }}
                          className="absolute right-1 top-1/2 inline-flex h-3 w-3 -translate-y-1/2 items-center justify-center rounded-full text-[10px] text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-red-600"
                          aria-label="取消关联"
                          title="取消关联"
                        >
                          x
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {hasChildren && expanded && (
        <div className="space-y-1">
          {node.children.map((child) => (
            <OutlineTreeNode
              key={child.id}
              folderId={folderId}
              node={child}
              depth={depth + 1}
              notes={notes}
              noteById={noteById}
              selectedNodeId={selectedNodeId}
              collapseSignal={collapseSignal}
              onSelectNode={onSelectNode}
              onMoveNode={onMoveNode}
              onRefresh={onRefresh}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function FoldersPage() {
  const [folders, setFolders] = useState<FolderTree[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string>("");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(() => new Set());
  const [collapseSignal, setCollapseSignal] = useState(0);
  const [pinnedFolderIds, setPinnedFolderIds] = useState<Set<string>>(() => new Set());
  const [pinHydrated, setPinHydrated] = useState(false);
  const [supportsCoarsePointer, setSupportsCoarsePointer] = useState(false);
  const [openFolderActionsId, setOpenFolderActionsId] = useState<string | null>(null);
  const [draggingFolderId, setDraggingFolderId] = useState<string | null>(null);
  const [folderSwipeOffset, setFolderSwipeOffset] = useState(0);
  const [expandedDetailNoteIds, setExpandedDetailNoteIds] = useState<Set<number>>(() => new Set());
  const [folderName, setFolderName] = useState("");
  const [rootTitle, setRootTitle] = useState("");
  const [detailLinkId, setDetailLinkId] = useState<string>("");
  const [toast, setToast] = useState<string | null>(null);

  const refresh = () => {
    setFolders(getAllFolders());
    setNotes(getAllNotes());
  };

  const folderPointerStateRef = useRef<{ folderId: string; startX: number; startY: number; active: boolean } | null>(null);
  const openFolderActionsRef = useRef<HTMLDivElement | null>(null);
  const openFolderSwipeActionsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    refresh();
    const onChanged = () => refresh();
    window.addEventListener("study-app-changed", onChanged);
    return () => window.removeEventListener("study-app-changed", onChanged);
  }, []);

  useEffect(() => {
    if (folders.length === 0) {
      setSelectedFolderId("");
      setSelectedNodeId(null);
      return;
    }
    if (!selectedFolderId || !folders.some((f) => f.id === selectedFolderId)) {
      setSelectedFolderId(folders[0].id);
    }
  }, [folders, selectedFolderId]);

  useEffect(() => {
    if (!selectedNodeId) return;
    const exists = folders.some((folder) => Boolean(findNodeInTree(folder.nodes, selectedNodeId)));
    if (!exists) setSelectedNodeId(null);
  }, [folders, selectedNodeId]);

  useEffect(() => {
    setExpandedFolderIds((prev) => {
      if (folders.length === 0) return prev.size === 0 ? prev : new Set();
      const validIds = new Set(folders.map((folder) => folder.id));
      const next = new Set<string>();
      prev.forEach((id) => {
        if (validIds.has(id)) next.add(id);
      });
      return next;
    });
  }, [folders]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 1800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(pointer: coarse)");
    const update = () => setSupportsCoarsePointer(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (supportsCoarsePointer || !openFolderActionsId) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (openFolderActionsRef.current?.contains(target)) return;
      closeFolderActions();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeFolderActions();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [supportsCoarsePointer, openFolderActionsId]);

  useEffect(() => {
    if (!supportsCoarsePointer || !openFolderActionsId) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (openFolderSwipeActionsRef.current?.contains(target)) return;
      closeFolderActions();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [supportsCoarsePointer, openFolderActionsId]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PINNED_FOLDERS_KEY);
      if (!raw) {
        setPinHydrated(true);
        return;
      }
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const ids = parsed.filter((id): id is string => typeof id === "string");
        setPinnedFolderIds(new Set(ids));
      }
    } catch {
      // ignore invalid local cache
    } finally {
      setPinHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!pinHydrated) return;
    const ids = Array.from(pinnedFolderIds);
    window.localStorage.setItem(PINNED_FOLDERS_KEY, JSON.stringify(ids));
  }, [pinHydrated, pinnedFolderIds]);

  useEffect(() => {
    setExpandedDetailNoteIds(new Set());
  }, [selectedNodeId]);

  useEffect(() => {
    setPinnedFolderIds((prev) => {
      if (folders.length === 0) return prev;
      const validIds = new Set(folders.map((folder) => folder.id));
      const next = new Set<string>();
      prev.forEach((id) => {
        if (validIds.has(id)) next.add(id);
      });
      return next;
    });
  }, [folders]);

  const selectedFolder = folders.find((f) => f.id === selectedFolderId) ?? null;

  const noteById = useMemo(() => {
    const map = new Map<number, Note>();
    notes.forEach((note) => map.set(note.id, note));
    return map;
  }, [notes]);

  const selectedNodeContext = useMemo<FoundNode | null>(() => {
    if (!selectedNodeId) return null;
    for (const folder of folders) {
      const found = findNodeInTree(folder.nodes, selectedNodeId);
      if (found) {
        return { folder, node: found.node, path: found.path };
      }
    }
    return null;
  }, [folders, selectedNodeId]);

  const selectedLinkedNotes = useMemo(() => {
    if (!selectedNodeContext) return [] as Note[];
    return selectedNodeContext.node.linkedNoteIds.map((id) => noteById.get(id)).filter((n): n is Note => Boolean(n));
  }, [noteById, selectedNodeContext]);

  const renderedFolders = useMemo(() => {
    const pinned: FolderTree[] = [];
    const normal: FolderTree[] = [];
    for (const folder of folders) {
      if (pinnedFolderIds.has(folder.id)) pinned.push(folder);
      else normal.push(folder);
    }
    return [...pinned, ...normal];
  }, [folders, pinnedFolderIds]);

  const createFolder = () => {
    if (!folderName.trim()) return;
    const folder = addFolder(folderName.trim());
    setFolderName("");
    refresh();
    if (folder) setSelectedFolderId(folder.id);
    setToast("已创建文件夹");
  };

  const createRootNode = () => {
    if (!selectedFolder) return;
    if (!rootTitle.trim()) return;
    addFolderNode(selectedFolder.id, rootTitle.trim());
    setRootTitle("");
    refresh();
    setToast("已添加大纲节点");
  };

  const renameCurrentFolder = (folder: FolderTree) => {
    const nextName = window.prompt("重命名文件夹", folder.name);
    if (!nextName?.trim()) return;
    renameFolder(folder.id, nextName.trim());
    refresh();
  };

  const removeCurrentFolder = (folder: FolderTree) => {
    if (!window.confirm("删除整个文件夹和其中大纲？")) return;
    deleteFolder(folder.id);
    if (selectedFolderId === folder.id) setSelectedFolderId("");
    refresh();
    setToast("文件夹已删除");
  };

  const handleSelectNode = (nodeId: string, folderId: string) => {
    setSelectedFolderId(folderId);
    setSelectedNodeId(nodeId);
  };

  const handleDetailLink = () => {
    if (!selectedNodeContext) return;
    const noteId = Number(detailLinkId);
    if (!Number.isFinite(noteId) || noteId <= 0) return;
    toggleNodeNoteLink(selectedNodeContext.folder.id, selectedNodeContext.node.id, noteId);
    setDetailLinkId("");
    refresh();
  };

  const handleCollapseAll = () => {
    setExpandedFolderIds(new Set());
    setCollapseSignal((v) => v + 1);
    setOpenFolderActionsId(null);
    setDraggingFolderId(null);
    setFolderSwipeOffset(0);
  };

  const handleMoveNode = (folderId: string, nodeId: string, direction: "up" | "down") => {
    const moved = moveFolderNode(folderId, nodeId, direction);
    if (!moved) {
      setToast(direction === "up" ? "已经在最上方" : "已经在最下方");
      return;
    }
    refresh();
    setToast(direction === "up" ? "已上移" : "已下移");
  };

  const handleMoveFolder = (folderId: string, direction: "up" | "down") => {
    const moved = moveFolder(folderId, direction);
    if (!moved) {
      setToast(direction === "up" ? "科目已经在最上方" : "科目已经在最下方");
      return;
    }
    refresh();
    setToast(direction === "up" ? "科目已上移" : "科目已下移");
  };

  const handleToggleFolderPin = (folderId: string) => {
    setPinnedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
        setToast("已取消置顶");
      } else {
        next.add(folderId);
        setToast("已置顶科目");
      }
      return next;
    });
    setOpenFolderActionsId(null);
    setDraggingFolderId(null);
    setFolderSwipeOffset(0);
  };

  const closeFolderActions = () => {
    setOpenFolderActionsId(null);
    setDraggingFolderId(null);
    setFolderSwipeOffset(0);
  };

  const handleFolderPointerDown = (folderId: string, clientX: number, clientY: number) => {
    if (!supportsCoarsePointer) return;
    folderPointerStateRef.current = { folderId, startX: clientX, startY: clientY, active: true };
    setDraggingFolderId(folderId);
    setFolderSwipeOffset(openFolderActionsId === folderId ? -FOLDER_ACTION_REVEAL : 0);
  };

  const handleFolderPointerMove = (clientX: number, clientY: number) => {
    const state = folderPointerStateRef.current;
    if (!supportsCoarsePointer || !state?.active) return;
    const deltaX = clientX - state.startX;
    const deltaY = clientY - state.startY;
    if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 10) {
      folderPointerStateRef.current = null;
      setDraggingFolderId(null);
      setFolderSwipeOffset(0);
      return;
    }
    const nextOffset = Math.max(-FOLDER_ACTION_REVEAL, Math.min(0, deltaX + (openFolderActionsId === state.folderId ? -FOLDER_ACTION_REVEAL : 0)));
    setFolderSwipeOffset(nextOffset);
  };

  const handleFolderPointerUp = () => {
    const state = folderPointerStateRef.current;
    if (!supportsCoarsePointer || !state) return;
    const shouldOpen = folderSwipeOffset <= -48;
    setOpenFolderActionsId(shouldOpen ? state.folderId : null);
    setDraggingFolderId(null);
    setFolderSwipeOffset(0);
    folderPointerStateRef.current = null;
  };

  const toggleDetailNoteExpand = (noteId: number) => {
    setExpandedDetailNoteIds((prev) => {
      const next = new Set(prev);
      if (next.has(noteId)) next.delete(noteId);
      else next.add(noteId);
      return next;
    });
  };

  return (
    <>
      <div className="page-hero mb-4">
        <span className="page-kicker">Folders</span>
        <h1 className="page-title">文件夹建树</h1>
        <p className="page-desc">左侧是知识森林总树，右侧是当前节点的大纲详情与记忆卡片。</p>
      </div>

      <div className="h-[calc(100vh-64px)] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-page)] p-2 md:p-3">
        <div className="grid h-full grid-cols-1 gap-3 md:grid-cols-[300px_1fr]">
          <aside className="h-full overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
            <div
              className="h-full overflow-y-auto p-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              style={SCROLL_AREA_STYLE}
            >
              <section className="mb-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2.5">
                <p className="mb-1.5 text-xs font-semibold text-[var(--muted)]">新建文件夹</p>
                <input
                  value={folderName}
                  onChange={(e) => setFolderName(e.target.value)}
                  placeholder="例如：高等数学"
                  className="w-full rounded-md border border-[var(--border)] bg-white px-2.5 py-1.5 text-xs"
                />
                <button
                  type="button"
                  onClick={createFolder}
                  className="mt-2 w-full rounded-md border px-2.5 py-1.5 text-xs font-semibold"
                  style={{ background: "var(--accent-soft)", color: "var(--accent)", borderColor: "rgba(120, 148, 110, 0.25)" }}
                >
                  + 新建文件夹
                </button>
              </section>

              <section className="mb-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2.5">
                <p className="mb-1.5 text-xs font-semibold text-[var(--muted)]">给当前文件夹添加一级节点</p>
                <input
                  value={rootTitle}
                  onChange={(e) => setRootTitle(e.target.value)}
                  placeholder={selectedFolder ? `添加到 ${selectedFolder.name}` : "先选择文件夹"}
                  className="w-full rounded-md border border-[var(--border)] bg-white px-2.5 py-1.5 text-xs"
                  disabled={!selectedFolder}
                />
                <button
                  type="button"
                  onClick={createRootNode}
                  disabled={!selectedFolder}
                  className="mt-2 w-full rounded-md border px-2.5 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ background: "var(--accent-soft)", color: "var(--accent)", borderColor: "rgba(120, 148, 110, 0.25)" }}
                >
                  + 添加一级节点
                </button>
                <button
                  type="button"
                  onClick={handleCollapseAll}
                  className="mt-2 w-full rounded-md border border-[var(--border)] bg-white px-2.5 py-1.5 text-xs font-semibold text-[var(--muted)] hover:bg-[var(--surface-2)]"
                >
                  一键收起
                </button>
              </section>

              <div className="space-y-1.5">
                {renderedFolders.map((folder) => {
                  const isActiveFolder = selectedFolderId === folder.id;
                  const isFolderExpanded = expandedFolderIds.has(folder.id);
                  const isPinnedFolder = pinnedFolderIds.has(folder.id);
                  const folderNodeCount = countTreeNodes(folder.nodes);
                  const isFolderActionsOpen = openFolderActionsId === folder.id;
                  const isFolderDragging = draggingFolderId === folder.id;
                  const translateX = isFolderDragging
                    ? folderSwipeOffset
                    : isFolderActionsOpen && supportsCoarsePointer
                      ? -FOLDER_ACTION_REVEAL
                      : 0;
                  return (
                    <div
                      key={folder.id}
                      className={`group/folder relative rounded-md px-1 py-1 ${
                        !supportsCoarsePointer && isFolderActionsOpen ? "z-30" : "z-0"
                      }`}
                    >
                      <div
                        ref={supportsCoarsePointer && isFolderActionsOpen ? openFolderSwipeActionsRef : null}
                        className={`relative rounded-lg ${supportsCoarsePointer ? "overflow-hidden" : "overflow-visible"}`}
                      >
                        {supportsCoarsePointer && (
                          <div className="absolute inset-y-0 right-0 flex w-[144px] items-center justify-end gap-0.5 bg-[rgba(248,249,244,0.96)] px-1.5">
                            <button
                              type="button"
                              onClick={() => handleToggleFolderPin(folder.id)}
                              className="inline-flex h-6 min-w-[40px] items-center justify-center rounded-md border border-[var(--border)] bg-white px-1 text-[10px] font-medium text-[var(--muted)]"
                            >
                              {isPinnedFolder ? "取消顶" : "置顶"}
                            </button>
                            <button
                              type="button"
                              onClick={() => renameCurrentFolder(folder)}
                              className="inline-flex h-6 min-w-[40px] items-center justify-center rounded-md border border-[var(--border)] bg-white px-1 text-[10px] font-medium text-[var(--muted)]"
                            >
                              改名
                            </button>
                            <button
                              type="button"
                              onClick={() => removeCurrentFolder(folder)}
                              className="inline-flex h-6 min-w-[40px] items-center justify-center rounded-md border bg-white px-1 text-[10px] font-medium"
                              style={{ borderColor: "rgba(155, 107, 92, 0.3)", color: "#9b6b5c" }}
                            >
                              删除
                            </button>
                          </div>
                        )}

                        <div
                          className="mb-0.5 flex items-center gap-1.5 rounded-lg bg-[var(--surface)] transition-transform"
                          style={{
                            transform: supportsCoarsePointer ? `translateX(${translateX}px)` : undefined,
                            touchAction: supportsCoarsePointer ? "pan-y" : undefined,
                          }}
                          onPointerDown={(e) => handleFolderPointerDown(folder.id, e.clientX, e.clientY)}
                          onPointerMove={(e) => handleFolderPointerMove(e.clientX, e.clientY)}
                          onPointerUp={handleFolderPointerUp}
                          onPointerCancel={handleFolderPointerUp}
                        >
                          <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-[10px] text-[var(--muted)]">
                            {isFolderExpanded ? "▾" : "▸"}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              closeFolderActions();
                              setSelectedFolderId(folder.id);
                              setSelectedNodeId(null);
                              setExpandedFolderIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(folder.id)) next.delete(folder.id);
                                else next.add(folder.id);
                                return next;
                              });
                            }}
                            className={`min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-left text-xs font-semibold ${
                              isActiveFolder ? "text-[#2A3B2C]" : "text-[var(--text)]"
                            }`}
                            style={{ background: isActiveFolder ? "#EAF5EF" : "transparent" }}
                            title={folder.name}
                          >
                            {folder.name}
                          </button>
                          <div className="ml-auto flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleToggleFolderPin(folder.id)}
                              className={`inline-flex shrink-0 items-center justify-center rounded-md leading-none text-[var(--muted)] hover:bg-[var(--surface-2)] ${
                                supportsCoarsePointer ? "h-5 w-5 text-[11px]" : "h-6 w-6 text-[13px]"
                              }`}
                              title={isPinnedFolder ? "取消置顶" : "置顶科目"}
                              aria-label={isPinnedFolder ? "取消置顶" : "置顶科目"}
                            >
                              <span className="block leading-none">{isPinnedFolder ? "★" : "☆"}</span>
                            </button>
                            <span className={`inline-flex shrink-0 items-center justify-center rounded-full bg-[rgba(163,177,138,0.2)] text-[10px] leading-none text-[var(--muted)] ${
                              supportsCoarsePointer ? "h-5 w-8" : "h-6 w-9"
                            }`}>
                              {folderNodeCount}
                            </span>
                            {!supportsCoarsePointer && (
                              <div
                                ref={isFolderActionsOpen ? openFolderActionsRef : null}
                                className="relative"
                              >
                                <button
                                  type="button"
                                  onClick={() => setOpenFolderActionsId((prev) => (prev === folder.id ? null : folder.id))}
                                  className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[13px] leading-none transition-opacity group-hover/folder:opacity-100 group-focus-within/folder:opacity-100 ${
                                    isActiveFolder || isFolderActionsOpen ? "text-[#2A3B2C] opacity-100" : "text-[var(--muted)] opacity-0"
                                  }`}
                                  style={{ background: isFolderActionsOpen ? "rgba(234, 245, 239, 0.85)" : "transparent" }}
                                  aria-label={isFolderActionsOpen ? "收起科目操作" : "显示科目操作"}
                                  title={isFolderActionsOpen ? "收起科目操作" : "显示科目操作"}
                                >
                                  <span className="translate-y-[-0.5px]">⋯</span>
                                </button>

                                {isFolderActionsOpen && (
                                  <div className="absolute right-0 z-20 mt-1 w-36 rounded-xl border border-[rgba(163,177,138,0.38)] bg-[rgba(255,255,255,0.96)] p-1.5 shadow-[0_12px_24px_rgba(60,85,65,0.14)] backdrop-blur">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        handleMoveFolder(folder.id, "up");
                                        closeFolderActions();
                                      }}
                                      className="w-full rounded-lg px-2.5 py-1.5 text-left text-[11px] text-[var(--text)] hover:bg-[var(--surface-2)]"
                                    >
                                      上移
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        handleMoveFolder(folder.id, "down");
                                        closeFolderActions();
                                      }}
                                      className="w-full rounded-lg px-2.5 py-1.5 text-left text-[11px] text-[var(--text)] hover:bg-[var(--surface-2)]"
                                    >
                                      下移
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        renameCurrentFolder(folder);
                                        closeFolderActions();
                                      }}
                                      className="w-full rounded-lg px-2.5 py-1.5 text-left text-[11px] text-[var(--text)] hover:bg-[var(--surface-2)]"
                                    >
                                      改名
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        removeCurrentFolder(folder);
                                        closeFolderActions();
                                      }}
                                      className="w-full rounded-lg px-2.5 py-1.5 text-left text-[11px] text-[#9b6b5c] hover:bg-[rgba(155,107,92,0.12)]"
                                    >
                                      删除
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {isFolderExpanded && (
                        <div className="ml-4 space-y-0.5 border-l border-dashed border-[rgba(163,177,138,0.35)] pl-1.5">
                          {folder.nodes.length === 0 ? (
                            <p className="px-1 text-[11px] text-[var(--muted)]">暂无节点</p>
                          ) : (
                            folder.nodes.map((node) => (
                              <OutlineTreeNode
                                key={node.id}
                                folderId={folder.id}
                                node={node}
                                depth={1}
                                notes={notes}
                                noteById={noteById}
                                selectedNodeId={selectedNodeId}
                                collapseSignal={collapseSignal}
                                onSelectNode={handleSelectNode}
                                onMoveNode={handleMoveNode}
                                onRefresh={refresh}
                              />
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {folders.length === 0 && (
                  <p className="rounded-lg border border-dashed border-[var(--border)] px-3 py-6 text-center text-xs text-[var(--muted)]">
                    先创建一个文件夹，知识森林才会生长。
                  </p>
                )}
              </div>
            </div>
          </aside>

          <section className="h-full overflow-hidden rounded-xl border border-[rgba(163,177,138,0.3)] bg-[#FAFAF5]">
            <div
              className="h-full overflow-y-auto p-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              style={SCROLL_AREA_STYLE}
            >
              {!selectedNodeContext ? (
                <div className="flex h-full min-h-[300px] items-center justify-center">
                  <div className="rounded-2xl border border-[rgba(163,177,138,0.35)] bg-[rgba(255,255,255,0.6)] px-7 py-8 text-center shadow-[0_8px_28px_rgba(120,148,110,0.1)]">
                    <p className="text-sm text-[var(--muted)]">在左侧知识森林中选择一片叶子开始</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <header className="rounded-xl border border-[rgba(163,177,138,0.3)] bg-white/70 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Detail</p>
                    <h2 className="mt-1 text-xl font-semibold text-[#2A3B2C]">{selectedNodeContext.node.title}</h2>
                    <p className="mt-1 text-xs text-[var(--muted)]">所属文件夹：{selectedNodeContext.folder.name}</p>
                    <p className="mt-2 text-xs text-[var(--muted)]">路径：{selectedNodeContext.path.join(" / ")}</p>
                  </header>

                  <section className="rounded-xl border border-[rgba(163,177,138,0.3)] bg-white/70 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-[#2A3B2C]">关联闪卡列表</h3>
                      <span className="rounded-full bg-[rgba(163,177,138,0.2)] px-2 py-0.5 text-[11px] text-[#4a5c4f]">
                        {selectedLinkedNotes.length} 张
                      </span>
                    </div>

                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                      <select
                        value={detailLinkId}
                        onChange={(e) => setDetailLinkId(e.target.value)}
                        className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-white px-2.5 py-2 text-xs"
                      >
                        <option value="">给当前节点关联闪卡...</option>
                        {notes.map((note) => (
                          <option key={note.id} value={String(note.id)}>
                            {note.subject || "未分类"} · {note.front}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={handleDetailLink}
                        className="rounded-md border px-3 py-2 text-xs font-semibold"
                        style={{ background: "var(--accent-soft)", color: "var(--accent)", borderColor: "rgba(120, 148, 110, 0.25)" }}
                      >
                        关联闪卡
                      </button>
                    </div>

                    {selectedLinkedNotes.length === 0 ? (
                      <p className="mt-4 text-xs text-[var(--muted)]">当前节点还没有关联闪卡，可以从上方快速挂接。</p>
                    ) : (
                      <div className="mt-4 space-y-2">
                        {selectedLinkedNotes.map((note) => {
                          const isExpanded = expandedDetailNoteIds.has(note.id);
                          const displayQuestion = note.question || note.front;
                          const displayAnswer = note.coreAnswer || note.content;
                          return (
                            <article
                              key={note.id}
                              className={`overflow-hidden rounded-xl border border-[rgba(163,177,138,0.3)] bg-[rgba(255,255,255,0.75)] ${
                                isExpanded
                                  ? "border-l-4 border-l-[#9BAD83] shadow-[inset_0_0_0_1px_rgba(94,125,79,0.15)]"
                                  : ""
                              }`}
                            >
                              <div className="flex items-center gap-2 px-3 py-2.5">
                                <button
                                  type="button"
                                  onClick={() => toggleDetailNoteExpand(note.id)}
                                  className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-[11px] text-[var(--muted)] hover:bg-[var(--surface-2)]"
                                  aria-label={isExpanded ? "收起内容" : "展开内容"}
                                  title={isExpanded ? "收起内容" : "展开内容"}
                                >
                                  {isExpanded ? "▾" : "▸"}
                                </button>

                                <button
                                  type="button"
                                  onClick={() => toggleDetailNoteExpand(note.id)}
                                  className="min-w-0 flex-1 text-left"
                                >
                                  <p className="text-[11px] text-[var(--muted)]">{note.subject || "未分类"}</p>
                                  <p
                                    className={`text-sm font-medium leading-6 text-[#2f3f32] ${
                                      isExpanded ? "whitespace-normal break-words" : "truncate"
                                    }`}
                                  >
                                    <FormulaText text={displayQuestion} inline />
                                  </p>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!window.confirm("确认取消这张闪卡与当前节点的关联？")) return;
                                    toggleNodeNoteLink(selectedNodeContext.folder.id, selectedNodeContext.node.id, note.id);
                                    refresh();
                                  }}
                                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-red-700"
                                  title="取消关联"
                                  aria-label="取消关联"
                                >
                                  x
                                </button>
                              </div>

                              <div className={`grid transition-all duration-200 ${isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                                <div className="min-h-0 overflow-hidden">
                                  <div className="space-y-2 border-t border-[var(--border)] bg-[rgba(250,250,245,0.9)] px-3 py-3">
                                    {displayAnswer && (
                                      <section className="rounded-lg border border-[var(--border)] bg-white p-2.5">
                                        <p className="mb-1">
                                          <span className="inline-flex rounded-full border border-[rgba(120,148,110,0.25)] bg-[rgba(120,148,110,0.12)] px-2 py-0.5 text-[11px] font-semibold text-[var(--accent)]">
                                            核心答案
                                          </span>
                                        </p>
                                        <div
                                          className="min-w-0 break-words [overflow-wrap:anywhere] text-justify text-sm leading-relaxed text-[var(--text)]"
                                          style={{ fontFamily: WENKAI_CONTENT_FONT }}
                                        >
                                          <MarkdownMathContent content={displayAnswer} className="review-card-back-formula" />
                                        </div>
                                      </section>
                                    )}

                                    {note.keyPoints && note.keyPoints.length > 0 && (
                                      <section className="rounded-lg border border-[var(--border)] bg-white p-2.5">
                                        <p className="mb-1.5">
                                          <span className="inline-flex rounded-full border border-[rgba(120,148,110,0.25)] bg-[rgba(120,148,110,0.12)] px-2 py-0.5 text-[11px] font-semibold text-[var(--accent)]">
                                            关键点
                                          </span>
                                        </p>
                                        <ul className="space-y-1.5">
                                          {note.keyPoints.map((point, idx) => (
                                            <li key={`${note.id}-kp-${idx}`} className="flex min-w-0 gap-2 text-sm text-[var(--text)]">
                                              <span className="min-w-4 font-semibold text-[var(--accent)]">{idx + 1}.</span>
                                              <span
                                                className="min-w-0 flex-1 break-words [overflow-wrap:anywhere] text-justify"
                                                style={{ fontFamily: WENKAI_CONTENT_FONT }}
                                              >
                                                <span className="block max-w-full overflow-x-auto">
                                                  <MarkdownMathContent content={point} className="note-card-keypoint-formula" />
                                                </span>
                                              </span>
                                            </li>
                                          ))}
                                        </ul>
                                      </section>
                                    )}

                                    {note.commonMistakes && (
                                      <section className="rounded-lg border border-[var(--border)] bg-white p-2.5">
                                        <p className="mb-1">
                                          <span className="inline-flex rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-orange-900">
                                            易错点
                                          </span>
                                        </p>
                                        <div
                                          className="min-w-0 break-words [overflow-wrap:anywhere] text-justify text-sm leading-relaxed text-[var(--text)]"
                                          style={{ fontFamily: WENKAI_CONTENT_FONT }}
                                        >
                                          <MarkdownMathContent content={note.commonMistakes} className="note-card-mistakes-formula" />
                                        </div>
                                      </section>
                                    )}

                                    {note.examples && (
                                      <section className="rounded-lg border border-[var(--border)] bg-white p-2.5">
                                        <p className="mb-1">
                                          <span className="inline-flex rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-900">
                                            示例应用
                                          </span>
                                        </p>
                                        <div
                                          className="min-w-0 break-words [overflow-wrap:anywhere] text-justify text-sm leading-relaxed text-[var(--text)]"
                                          style={{ fontFamily: WENKAI_CONTENT_FONT }}
                                        >
                                          <MarkdownMathContent content={note.examples} />
                                        </div>
                                      </section>
                                    )}

                                    {note.keywords && note.keywords.length > 0 && (
                                      <section className="rounded-lg border border-[var(--border)] bg-white p-2.5">
                                        <p className="mb-1.5">
                                          <span className="inline-flex rounded-full border border-[rgba(120,148,110,0.25)] bg-[rgba(120,148,110,0.12)] px-2 py-0.5 text-[11px] font-semibold text-[var(--accent)]">
                                            关键词
                                          </span>
                                        </p>
                                        <div className="flex flex-wrap gap-1.5">
                                          {note.keywords.map((keyword, idx) => (
                                            <span
                                              key={`${note.id}-kw-${idx}`}
                                              className="rounded-full border border-[rgba(120,148,110,0.25)] bg-[rgba(120,148,110,0.1)] px-2 py-0.5 text-[11px] text-[#4b6352]"
                                              style={{ fontFamily: WENKAI_CONTENT_FONT }}
                                            >
                                              {keyword}
                                            </span>
                                          ))}
                                        </div>
                                      </section>
                                    )}

                                    {note.images && note.images.length > 0 && (
                                      <section className="rounded-lg border border-[var(--border)] bg-white p-2.5">
                                        <p className="mb-2 text-[11px] font-semibold text-[var(--muted)]">图片资料</p>
                                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                          {note.images.map((img, idx) => (
                                            <img
                                              key={`${note.id}-img-${idx}`}
                                              src={img}
                                              alt={`图片 ${idx + 1}`}
                                              className="max-h-48 w-full rounded-md border border-[var(--border)] bg-[var(--surface-2)] object-contain p-1"
                                              onError={(e) => {
                                                e.currentTarget.style.display = "none";
                                              }}
                                            />
                                          ))}
                                        </div>
                                      </section>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </section>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {toast && <div className="toast" style={{ left: "1rem", right: "auto" }}>{toast}</div>}
    </>
  );
}
