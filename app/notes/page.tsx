"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Virtuoso } from "react-virtuoso";
import { addNote, addNotesBatch, getAllFolders, getAllNotes, deleteNote, deleteNotesBatch, linkNodeToNote, linkNodeToNotes, toggleNodeNoteLink, updateNote, type BatchProgress, type FolderNode, type FolderTree, type NewNoteInput, type Note } from "@/lib/db";
import { NotebookEditor } from "@/components/NotebookEditor";
import { NoteCard } from "@/components/NoteCard";
import { FormulaText } from "@/components/FormulaText";

const NOTES_BATCH_SIZE = 24;

type BulkActionProgress = BatchProgress & {
  action: "import" | "delete";
};

type NodeOption = {
  id: string;
  label: string;
  title: string;
  prefix: string;
  isRoot: boolean;
};

function buildNodeOptions(nodes: FolderNode[]): NodeOption[] {
  const options: NodeOption[] = [];
  const walk = (items: FolderNode[], pathSoFar: string[], linePrefix: string) => {
    for (let i = 0; i < items.length; i++) {
      const node = items[i];
      const isLast = i === items.length - 1;
      const isRoot = linePrefix === "";
      const nextPath = [...pathSoFar, node.title];
      const ownPrefix = isRoot ? "" : linePrefix + (isLast ? "└─ " : "├─ ");
      const childLinePrefix = isRoot ? "   " : linePrefix + (isLast ? "    " : "│   ");
      options.push({
        id: node.id,
        label: nextPath.join(" / "),
        title: node.title,
        prefix: ownPrefix,
        isRoot,
      });
      walk(node.children, nextPath, childLinePrefix);
    }
  };
  walk(nodes, [], "");
  return options;
}

function findFirstLinkedNodeForNote(
  folderTrees: FolderTree[],
  noteId: number
): { folderId: string; nodeId: string } | null {
  for (const folder of folderTrees) {
    const stack = [...folder.nodes];
    while (stack.length > 0) {
      const node = stack.pop();
      if (!node) continue;
      if (node.linkedNoteIds.includes(noteId)) {
        return { folderId: folder.id, nodeId: node.id };
      }
      if (node.children.length > 0) stack.push(...node.children);
    }
  }
  return null;
}

function collectLinkedNodesForNote(
  folderTrees: FolderTree[],
  noteId: number
): Array<{ folderId: string; nodeId: string }> {
  const links: Array<{ folderId: string; nodeId: string }> = [];
  for (const folder of folderTrees) {
    const stack = [...folder.nodes];
    while (stack.length > 0) {
      const node = stack.pop();
      if (!node) continue;
      if (node.linkedNoteIds.includes(noteId)) {
        links.push({ folderId: folder.id, nodeId: node.id });
      }
      if (node.children.length > 0) stack.push(...node.children);
    }
  }
  return links;
}

function scrollToElement(element: HTMLDivElement | null) {
  if (!element) return;

  window.requestAnimationFrame(() => {
    element.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function NotesPageContent() {
  const searchParams = useSearchParams();
  const focusNoteId = Number(searchParams.get("focusNote") || 0);
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<FolderTree[]>([]);
  const [showList, setShowList] = useState(false);
  const [expandedNote, setExpandedNote] = useState<number | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string>("");
  const [selectedNodeId, setSelectedNodeId] = useState<string>("");
  const [showNodeTree, setShowNodeTree] = useState(false);
  const [editingSelectedFolderId, setEditingSelectedFolderId] = useState<string>("");
  const [editingSelectedNodeId, setEditingSelectedNodeId] = useState<string>("");
  const [showEditingNodeTree, setShowEditingNodeTree] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [batchDeleteMode, setBatchDeleteMode] = useState(false);
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<number>>(() => new Set());
  const [groupVisibleCounts, setGroupVisibleCounts] = useState<Record<string, number>>({});
  const [listReady, setListReady] = useState(false);
  const [lastBatchImportedIds, setLastBatchImportedIds] = useState<number[]>([]);
  const [bulkProgress, setBulkProgress] = useState<BulkActionProgress | null>(null);
  const editingPanelRef = useRef<HTMLDivElement | null>(null);
  const listSectionRef = useRef<HTMLDivElement | null>(null);
  const shouldScrollToListRef = useRef(false);
  const addNoteLockRef = useRef(false);

  // 加载笔记列表
  useEffect(() => {
    setNotes(getAllNotes());
    setFolders(getAllFolders());

    // 监听数据变化
    const handleChange = () => {
      setNotes(getAllNotes());
      setFolders(getAllFolders());
    };
    window.addEventListener("study-app-changed", handleChange);
    return () => window.removeEventListener("study-app-changed", handleChange);
  }, []);

  const selectedFolder = useMemo(
    () => folders.find((f) => f.id === selectedFolderId) ?? null,
    [folders, selectedFolderId]
  );

  const currentFolderNodeOptions = useMemo(() => {
    if (!selectedFolder) return [] as NodeOption[];
    return buildNodeOptions(selectedFolder.nodes);
  }, [selectedFolder]);

  const selectedNodeOption = useMemo(
    () => currentFolderNodeOptions.find((o) => o.id === selectedNodeId) ?? null,
    [currentFolderNodeOptions, selectedNodeId]
  );

  const editingSelectedFolder = useMemo(
    () => folders.find((f) => f.id === editingSelectedFolderId) ?? null,
    [folders, editingSelectedFolderId]
  );

  const editingCurrentFolderNodeOptions = useMemo(() => {
    if (!editingSelectedFolder) return [] as NodeOption[];
    return buildNodeOptions(editingSelectedFolder.nodes);
  }, [editingSelectedFolder]);

  const editingSelectedNodeOption = useMemo(
    () => editingCurrentFolderNodeOptions.find((o) => o.id === editingSelectedNodeId) ?? null,
    [editingCurrentFolderNodeOptions, editingSelectedNodeId]
  );

  const groupedNotes = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    const filtered = !keyword
      ? notes
      : notes.filter((note) => {
          const haystack = [
            note.subject,
            note.question,
            note.front,
            note.coreAnswer,
            note.content,
            note.commonMistakes,
            note.examples,
            ...(note.keyPoints || []),
          ]
            .filter(Boolean)
            .join("\n")
            .toLowerCase();
          return haystack.includes(keyword);
        });

    const map = new Map<string, Note[]>();
    for (const note of filtered) {
      const subject = note.subject?.trim() || "未分类";
      const list = map.get(subject);
      if (list) list.push(note);
      else map.set(subject, [note]);
    }
    return Array.from(map.entries()).map(([subject, items]) => ({ subject, items }));
  }, [notes, searchQuery]);

  const filteredCount = useMemo(
    () => groupedNotes.reduce((sum, group) => sum + group.items.length, 0),
    [groupedNotes]
  );

  const filteredNoteIds = useMemo(
    () => groupedNotes.flatMap((group) => group.items.map((note) => note.id)),
    [groupedNotes]
  );

  const selectedFilteredCount = useMemo(
    () => filteredNoteIds.reduce((count, id) => count + (selectedNoteIds.has(id) ? 1 : 0), 0),
    [filteredNoteIds, selectedNoteIds]
  );

  const allFilteredSelected = filteredNoteIds.length > 0 && selectedFilteredCount === filteredNoteIds.length;

  const visibleRows = useMemo(() => {
    const rows: Array<
      | { type: "header"; subject: string; total: number }
      | { type: "note"; subject: string; note: Note }
    > = [];

    for (const group of groupedNotes) {
      rows.push({ type: "header", subject: group.subject, total: group.items.length });
      const visibleCount = Math.min(
        groupVisibleCounts[group.subject] ?? Math.min(NOTES_BATCH_SIZE, group.items.length),
        group.items.length
      );
      for (let i = 0; i < visibleCount; i++) {
        rows.push({ type: "note", subject: group.subject, note: group.items[i] });
      }
    }

    return rows;
  }, [groupVisibleCounts, groupedNotes]);

  const hasMoreRows = useMemo(
    () => groupedNotes.some((group) => (groupVisibleCounts[group.subject] ?? Math.min(NOTES_BATCH_SIZE, group.items.length)) < group.items.length),
    [groupVisibleCounts, groupedNotes]
  );

  const focusTarget = useMemo(() => {
    if (!focusNoteId || !Number.isFinite(focusNoteId)) return null;
    const targetGroup = groupedNotes.find((group) =>
      group.items.some((note) => note.id === focusNoteId)
    );
    if (!targetGroup) return null;
    const index = targetGroup.items.findIndex((note) => note.id === focusNoteId);
    if (index < 0) return null;
    return { subject: targetGroup.subject, index };
  }, [focusNoteId, groupedNotes]);

  const focusRowIndex = useMemo(() => {
    if (!focusTarget) return null;
    return visibleRows.findIndex((row) => row.type === "note" && row.note.id === focusNoteId);
  }, [focusNoteId, focusTarget, visibleRows]);

  useEffect(() => {
    const initialCounts: Record<string, number> = {};
    for (const group of groupedNotes) {
      initialCounts[group.subject] = Math.min(NOTES_BATCH_SIZE, group.items.length);
    }
    setGroupVisibleCounts(initialCounts);
    setListReady(false);
    const timer = window.setTimeout(() => setListReady(true), 120);
    return () => window.clearTimeout(timer);
  }, [groupedNotes]);

  useEffect(() => {
    if (!focusTarget) return;
    // Destructure here so the functional updater captures primitives, not the
    // memoised object reference (guards against React 18 concurrent-mode stale closures).
    const { subject, index } = focusTarget;
    setGroupVisibleCounts((prev) => ({
      ...prev,
      [subject]: Math.max(prev[subject] ?? 0, index + 1),
    }));
  }, [focusTarget]);

  useEffect(() => {
    if (!currentFolderNodeOptions.some((option) => option.id === selectedNodeId)) {
      setSelectedNodeId("");
    }
  }, [currentFolderNodeOptions, selectedNodeId]);

  useEffect(() => {
    if (!editingCurrentFolderNodeOptions.some((option) => option.id === editingSelectedNodeId)) {
      setEditingSelectedNodeId("");
    }
  }, [editingCurrentFolderNodeOptions, editingSelectedNodeId]);

  useEffect(() => {
    if (!focusTarget) return;
    const exists = notes.some((note) => note.id === focusNoteId);
    if (!exists) return;

    shouldScrollToListRef.current = true;
    setShowList(true);
    setExpandedNote(focusNoteId);
  }, [focusTarget, focusNoteId, notes]);

  useEffect(() => {
    if (!showList || !shouldScrollToListRef.current) return;
    if (!listSectionRef.current) return;

    scrollToElement(listSectionRef.current);
    shouldScrollToListRef.current = false;
  }, [showList, listReady, visibleRows.length]);

  useEffect(() => {
    setSelectedNoteIds((prev) => {
      if (prev.size === 0) return prev;
      const valid = new Set(filteredNoteIds);
      const next = new Set<number>();
      prev.forEach((id) => {
        if (valid.has(id)) next.add(id);
      });
      if (next.size === prev.size) return prev;
      return next;
    });
  }, [filteredNoteIds]);

  useEffect(() => {
    if (!toast) return;
    const timeoutMs = toast.startsWith("⚠️") ? 3600 : 2200;
    const timer = window.setTimeout(() => setToast(null), timeoutMs);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const handleAddNote = (data: NewNoteInput): boolean => {
    if (addNoteLockRef.current) {
      setToast("⏳ 正在保存，请勿重复点击");
      return false;
    }

    addNoteLockRef.current = true;
    try {
      const created = addNote(data);

      if (selectedFolderId && selectedNodeId) {
        const linked = linkNodeToNote(selectedFolderId, selectedNodeId, created.id);
        setToast(linked ? "✅ 保存成功" : "✅ 保存成功，关联失败（请检查节点）");
      } else {
        setToast("✅ 保存成功");
      }

      setNotes(getAllNotes());
      return true;
    } catch (error) {
      console.error("[notes] addNote failed", error);
      setToast("❌ 保存失败：本地存储异常，请稍后重试");
      return false;
    } finally {
      window.setTimeout(() => {
        addNoteLockRef.current = false;
      }, 800);
    }
  };

  const handleBatchImportNotes = async (items: NewNoteInput[]) => {
    if (!items || items.length === 0) return;

    try {
      setBulkProgress({ action: "import", phase: "processing", processed: 0, total: items.length });

      const created = await addNotesBatch(items, {
        onProgress: (progress) => {
          setBulkProgress({ ...progress, action: "import" });
        },
      });
      setLastBatchImportedIds(created.map((note) => note.id));

      if (selectedFolderId && selectedNodeId) {
        const linkedCount = linkNodeToNotes(selectedFolderId, selectedNodeId, created.map((note) => note.id));
        setToast(`✅ 批量导入 ${created.length} 条，关联成功 ${linkedCount} 条`);
      } else {
        setToast(`✅ 已批量导入 ${created.length} 条知识点`);
      }

      setNotes(getAllNotes());
      setFolders(getAllFolders());
      if (!showList) setShowList(true);
    } catch (error) {
      console.error("[notes] batch import failed", error);
      setToast("❌ 批量导入失败：请检查模板格式后重试");
    } finally {
      setBulkProgress(null);
    }
  };

  const handleUndoBatchImport = async () => {
    if (lastBatchImportedIds.length === 0) return;
    if (bulkProgress) return;

    const shouldUndo = confirm(`确定要撤销最近一次批量导入吗？\n将删除 ${lastBatchImportedIds.length} 条知识点。`);
    if (!shouldUndo) return;

    try {
      setBulkProgress({ action: "delete", phase: "processing", processed: 0, total: lastBatchImportedIds.length });
      const removedCount = await deleteNotesBatch(lastBatchImportedIds, {
        onProgress: (progress) => {
          setBulkProgress({ ...progress, action: "delete" });
        },
      });
      const after = getAllNotes();

      setLastBatchImportedIds([]);
      setNotes(after);
      setFolders(getAllFolders());
      setToast(`↩️ 已撤销批量导入，删除 ${removedCount} 条`);
    } catch (error) {
      console.error("[notes] undo batch import failed", error);
      setToast("❌ 撤销失败：请稍后重试");
    } finally {
      setBulkProgress(null);
    }
  };

  const handleDelete = (noteId: number) => {
    if (confirm("确定要删除这个知识点吗？这个操作无法撤销。")) {
      deleteNote(noteId);
      setNotes(getAllNotes());
      setSelectedNoteIds((prev) => {
        if (!prev.has(noteId)) return prev;
        const next = new Set(prev);
        next.delete(noteId);
        return next;
      });
      if (editingNoteId === noteId) {
        setEditingNoteId(null);
      }
      setExpandedNote(null);
      setToast("🗑️ 已删除");
    }
  };

  const handleToggleNoteSelection = (noteId: number) => {
    setSelectedNoteIds((prev) => {
      const next = new Set(prev);
      if (next.has(noteId)) next.delete(noteId);
      else next.add(noteId);
      return next;
    });
  };

  const handleToggleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      setSelectedNoteIds((prev) => {
        const next = new Set(prev);
        filteredNoteIds.forEach((id) => next.delete(id));
        return next;
      });
      return;
    }

    setSelectedNoteIds((prev) => {
      const next = new Set(prev);
      filteredNoteIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const handleClearSelection = () => {
    if (selectedNoteIds.size === 0) return;
    setSelectedNoteIds(new Set());
  };

  const handleBatchDelete = async () => {
    if (bulkProgress) return;

    const targetIds = filteredNoteIds.filter((id) => selectedNoteIds.has(id));
    if (targetIds.length === 0) {
      setToast("⚠️ 请先勾选要删除的知识点");
      return;
    }

    const shouldDelete = confirm(`确定要批量删除 ${targetIds.length} 条知识点吗？此操作无法撤销。`);
    if (!shouldDelete) return;

    try {
      setBulkProgress({ action: "delete", phase: "processing", processed: 0, total: targetIds.length });
      const removedCount = await deleteNotesBatch(targetIds, {
        onProgress: (progress) => {
          setBulkProgress({ ...progress, action: "delete" });
        },
      });

      if (editingNoteId && targetIds.includes(editingNoteId)) {
        setEditingNoteId(null);
      }
      if (expandedNote && targetIds.includes(expandedNote)) {
        setExpandedNote(null);
      }

      setSelectedNoteIds((prev) => {
        const next = new Set(prev);
        targetIds.forEach((id) => next.delete(id));
        return next;
      });
      setBatchDeleteMode(false);
      setNotes(getAllNotes());
      setFolders(getAllFolders());
      setToast(`🗑️ 已批量删除 ${removedCount} 条`);
    } catch (error) {
      console.error("[notes] batch delete failed", error);
      setToast("❌ 批量删除失败：请稍后重试");
    } finally {
      setBulkProgress(null);
    }
  };

  const editingNote = useMemo(
    () => notes.find((n) => n.id === editingNoteId) ?? null,
    [notes, editingNoteId]
  );

  useEffect(() => {
    if (!editingNote) {
      setEditingSelectedFolderId("");
      setEditingSelectedNodeId("");
      setShowEditingNodeTree(false);
      return;
    }
    const existingLink = findFirstLinkedNodeForNote(folders, editingNote.id);
    if (existingLink) {
      setEditingSelectedFolderId(existingLink.folderId);
      setEditingSelectedNodeId(existingLink.nodeId);
    } else {
      setEditingSelectedFolderId("");
      setEditingSelectedNodeId("");
    }
    setShowEditingNodeTree(false);
  }, [editingNote, folders]);

  const handleEditSave = (data: NewNoteInput): boolean => {
    if (!editingNoteId) return false;

    if (editingSelectedFolderId && !editingSelectedNodeId) {
      setShowEditingNodeTree(true);
      setToast("⚠️ 已选择文件夹，请再选择一个节点后保存，或改为不关联文件夹");
      return false;
    }

    const updated = updateNote(editingNoteId, data);
    if (!updated) {
      setToast("❌ 保存失败：未找到知识点");
      return false;
    }

    let linkedInEdit = false;
    let toastMessage = "✅ 知识点已更新";

    // 仅在两种情况下修改关联：
    // 1) 明确选择了“不关联文件夹” -> 清空关联
    // 2) 明确选择了目标节点 -> 迁移到该节点
    // 若只选了文件夹未选节点，默认保留原有关联，避免误清空。
    if (!editingSelectedFolderId || editingSelectedNodeId) {
      const existingLinks = collectLinkedNodesForNote(getAllFolders(), editingNoteId);
      for (const link of existingLinks) {
        toggleNodeNoteLink(link.folderId, link.nodeId, editingNoteId);
      }

      if (editingSelectedFolderId && editingSelectedNodeId) {
        linkedInEdit = linkNodeToNote(editingSelectedFolderId, editingSelectedNodeId, editingNoteId);
        toastMessage = linkedInEdit
          ? "✅ 知识点与关联已更新"
          : "✅ 知识点已更新，关联失败（请检查节点）";
      } else {
        toastMessage = "✅ 知识点已更新（已取消节点关联）";
      }
    }

    setNotes(getAllNotes());
    setFolders(getAllFolders());
    setEditingNoteId(null);
    setExpandedNote(updated.id);
    setToast(toastMessage);
    return true;
  };

  useEffect(() => {
    if (!editingNote) return;
    window.setTimeout(() => {
      scrollToElement(editingPanelRef.current);
    }, 60);
  }, [editingNote]);

  const handleToggleList = () => {
    if (showList) {
      shouldScrollToListRef.current = false;
      setShowList(false);
      setBatchDeleteMode(false);
      setSelectedNoteIds(new Set());
      return;
    }

    shouldScrollToListRef.current = true;
    setShowList(true);
  };

  const handleToggleBatchDeleteMode = () => {
    setBatchDeleteMode((prev) => {
      if (prev) {
        setSelectedNoteIds(new Set());
        return false;
      }
      return true;
    });
  };

  return (
    <>
      <div className="page-hero">
        <span className="page-kicker">Capture</span>
        <h1 className="page-title">知识点</h1>
        <p className="page-desc">
          💡结构化输入 → 科学化复习。基于双引擎：learning（5 分钟/30 分钟/12 小时）+ reviewing（1/7/14/30 天），进入 graduated 后做低频轻量回顾。
        </p>
      </div>

      <div className="flex items-center justify-between mb-6">
        <p className="section-label">📝 新建知识点</p>
        {notes.length > 0 && (
          <button
            type="button"
            onClick={handleToggleList}
            aria-expanded={showList}
            className="text-sm font-medium text-blue-600 hover:text-blue-700 px-3 py-1 rounded-lg hover:bg-blue-50 transition-colors"
          >
            {showList ? "✕ 关闭列表" : `📚 查看列表 (${notes.length})`}
          </button>
        )}
      </div>

      <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <p className="text-sm font-medium mb-3" style={{ color: "var(--text)" }}>
          🗂️ 可选：保存时直接挂到大纲节点
        </p>
        <div className="space-y-3">
          {/* 步骤一：选文件夹 */}
          <select
            value={selectedFolderId}
            onChange={(e) => {
              setSelectedFolderId(e.target.value);
              setSelectedNodeId("");
              setShowNodeTree(false);
            }}
            className="w-full px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-sm"
          >
            <option value="">不关联文件夹</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>

          {/* 步骤二：树形节点选择 */}
          {!selectedFolderId ? (
            <p className="px-3 py-2 text-sm text-[var(--muted)] italic">先选择上方文件夹，再关联节点</p>
          ) : currentFolderNodeOptions.length === 0 ? (
            <p className="px-3 py-2 text-sm text-[var(--muted)] italic">该文件夹暂无节点</p>
          ) : (
            <>
              {/* 折叠态：显示已选节点 + 展开按钮 */}
              {!showNodeTree ? (
                <button
                  type="button"
                  onClick={() => setShowNodeTree(true)}
                  className="w-full flex items-center justify-between px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-sm hover:bg-[var(--surface-2)] transition-colors"
                >
                  <span className={selectedNodeOption ? "text-blue-700 font-medium truncate pr-2" : "text-[var(--muted)] italic"}>
                    {selectedNodeOption ? `✓ ${selectedNodeOption.label}` : "点击选择节点（可选）"}
                  </span>
                  <span className="text-[var(--muted)] shrink-0">▾</span>
                </button>
              ) : (
                <div className="border border-[var(--border)] rounded-lg bg-[var(--surface)] overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setSelectedNodeId("")}
                    className={`w-full text-left px-3 py-1.5 text-sm border-b border-[var(--border)] transition-colors ${
                      !selectedNodeId
                        ? "bg-blue-50 text-blue-600 font-medium"
                        : "text-[var(--muted)] italic hover:bg-[var(--surface-2)]"
                    }`}
                  >
                    不关联节点
                  </button>
                  <div className="max-h-52 overflow-y-auto">
                    {currentFolderNodeOptions.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setSelectedNodeId(item.id === selectedNodeId ? "" : item.id);
                          setShowNodeTree(false);
                        }}
                        className={`w-full text-left px-3 py-1.5 text-sm border-b border-[var(--border)] last:border-b-0 transition-colors ${
                          selectedNodeId === item.id
                            ? "bg-blue-50 text-blue-700 font-medium"
                            : "hover:bg-[var(--surface-2)] text-[var(--text)]"
                        }`}
                      >
                        <span className="font-mono text-[var(--muted)] whitespace-pre" aria-hidden>{item.prefix}</span>
                        {item.isRoot && <span className="mr-1">📘</span>}
                        <span>{item.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Main Editor Card */}
      {bulkProgress && (
        <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
          <div className="mb-2 flex items-center justify-between text-xs text-blue-800">
            <span>
              {bulkProgress.action === "import" ? "批量创建" : "批量删除"}
              {bulkProgress.phase === "saving" ? "：正在写入存储..." : "：正在处理..."}
            </span>
            <span>
              {bulkProgress.processed}/{bulkProgress.total}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-blue-100">
            <div
              className="h-full bg-blue-500 transition-all duration-150"
              style={{
                width: `${Math.max(
                  4,
                  bulkProgress.total > 0
                    ? (bulkProgress.processed / bulkProgress.total) * 100
                    : 0
                )}%`,
              }}
              aria-hidden
            />
          </div>
        </div>
      )}

      {lastBatchImportedIds.length > 0 && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-amber-800">
            已批量导入 {lastBatchImportedIds.length} 条，若发现格式有误可一键回滚。
          </p>
          <button
            type="button"
            onClick={handleUndoBatchImport}
            disabled={!!bulkProgress}
            className="px-3 py-1.5 text-sm rounded-lg border border-amber-400 bg-white text-amber-800 hover:bg-amber-100 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          >
            ↩️ 撤销本次导入
          </button>
        </div>
      )}

      <div className="mb-8 bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 sm:p-8 shadow-sm">
        <NotebookEditor
          onSubmit={handleAddNote}
          onBatchImport={handleBatchImportNotes}
          submitLabel="保存"
          showClearButton
        />
      </div>

      {editingNote && (
        <div ref={editingPanelRef} className="mb-8 bg-[var(--surface)] border border-blue-200 rounded-2xl p-6 sm:p-8 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-base sm:text-lg font-semibold text-[var(--text)]">✏️ 编辑知识点</h3>
            <button
              type="button"
              onClick={() => setEditingNoteId(null)}
              className="px-3 py-1.5 text-sm rounded-lg border border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface-2)]"
            >
              取消编辑
            </button>
          </div>
          <p className="mb-4 text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
            正在编辑：<FormulaText text={editingNote.question || editingNote.front} inline />
          </p>
          <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="text-sm font-medium mb-3" style={{ color: "var(--text)" }}>
              🗂️ 可选：更新该知识点的大纲节点关联
            </p>
            <div className="space-y-3">
              <select
                value={editingSelectedFolderId}
                onChange={(e) => {
                  setEditingSelectedFolderId(e.target.value);
                  setEditingSelectedNodeId("");
                  setShowEditingNodeTree(false);
                }}
                className="w-full px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-sm"
              >
                <option value="">不关联文件夹</option>
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>

              {!editingSelectedFolderId ? (
                <p className="px-3 py-2 text-sm text-[var(--muted)] italic">先选择上方文件夹，再关联节点</p>
              ) : editingCurrentFolderNodeOptions.length === 0 ? (
                <p className="px-3 py-2 text-sm text-[var(--muted)] italic">该文件夹暂无节点</p>
              ) : (
                <>
                  {!showEditingNodeTree ? (
                    <button
                      type="button"
                      onClick={() => setShowEditingNodeTree(true)}
                      className="w-full flex items-center justify-between px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-sm hover:bg-[var(--surface-2)] transition-colors"
                    >
                      <span className={editingSelectedNodeOption ? "text-blue-700 font-medium truncate pr-2" : "text-[var(--muted)] italic"}>
                        {editingSelectedNodeOption ? `✓ ${editingSelectedNodeOption.label}` : "点击选择节点（可选）"}
                      </span>
                      <span className="text-[var(--muted)] shrink-0">▾</span>
                    </button>
                  ) : (
                    <div className="border border-[var(--border)] rounded-lg bg-[var(--surface)] overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setEditingSelectedNodeId("")}
                        className={`w-full text-left px-3 py-1.5 text-sm border-b border-[var(--border)] transition-colors ${
                          !editingSelectedNodeId
                            ? "bg-blue-50 text-blue-600 font-medium"
                            : "text-[var(--muted)] italic hover:bg-[var(--surface-2)]"
                        }`}
                      >
                        不关联节点
                      </button>
                      <div className="max-h-52 overflow-y-auto">
                        {editingCurrentFolderNodeOptions.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              setEditingSelectedNodeId(item.id === editingSelectedNodeId ? "" : item.id);
                              setShowEditingNodeTree(false);
                            }}
                            className={`w-full text-left px-3 py-1.5 text-sm border-b border-[var(--border)] last:border-b-0 transition-colors ${
                              editingSelectedNodeId === item.id
                                ? "bg-blue-50 text-blue-700 font-medium"
                                : "hover:bg-[var(--surface-2)] text-[var(--text)]"
                            }`}
                          >
                            <span className="font-mono text-[var(--muted)] whitespace-pre" aria-hidden>{item.prefix}</span>
                            {item.isRoot && <span className="mr-1">📘</span>}
                            <span>{item.title}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
          <NotebookEditor
            initialData={{
              front: editingNote.front,
              content: editingNote.content,
              subject: editingNote.subject,
              difficulty: editingNote.difficulty || "normal",
              question: editingNote.question,
              coreAnswer: editingNote.coreAnswer,
              keyPoints: editingNote.keyPoints,
              commonMistakes: editingNote.commonMistakes,
              examples: editingNote.examples,
              images: editingNote.images,
            }}
            onSubmit={handleEditSave}
            onCancel={() => setEditingNoteId(null)}
            submitLabel="💾 保存修改"
          />
        </div>
      )}

      {/* Notes List */}
      {showList && notes.length > 0 && (
        <div ref={listSectionRef} className="mb-8 note-list-unified-font">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-lg font-semibold text-[var(--text)]">已添加的知识点</h3>
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索科目/问题/答案..."
                className="w-full sm:w-72 px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="shrink-0 px-2.5 py-2 text-sm rounded-lg border border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface-2)]"
                >
                  清空
                </button>
              )}
              <span className="shrink-0 text-sm text-[var(--muted)]">
                {searchQuery ? `${filteredCount}/${notes.length}` : `${notes.length}`} 个
              </span>
              <button
                type="button"
                onClick={handleToggleBatchDeleteMode}
                className={`shrink-0 px-2.5 py-2 text-sm rounded-lg border transition-colors ${
                  batchDeleteMode
                    ? "border-red-300 text-red-700 bg-red-50 hover:bg-red-100"
                    : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface-2)]"
                }`}
              >
                {batchDeleteMode ? "退出批量删除" : "批量删除"}
              </button>
            </div>
          </div>

          {batchDeleteMode && filteredCount > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
              <button
                type="button"
                onClick={handleToggleSelectAllFiltered}
                className="px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border)] text-[var(--text)] hover:bg-[var(--surface-2)]"
              >
                {allFilteredSelected ? "取消全选当前结果" : "全选当前结果"}
              </button>
              <button
                type="button"
                onClick={handleBatchDelete}
                disabled={selectedFilteredCount === 0 || !!bulkProgress}
                className="px-2.5 py-1.5 text-xs rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                确认删除（{selectedFilteredCount}）
              </button>
              <button
                type="button"
                onClick={handleClearSelection}
                disabled={selectedNoteIds.size === 0}
                className="px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface-2)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                清空勾选
              </button>
              <span className="text-xs text-[var(--muted)]">
                已勾选 {selectedFilteredCount}/{filteredCount}
              </span>
            </div>
          )}

          {filteredCount === 0 ? (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-6 text-center text-sm text-[var(--muted)]">
              未找到匹配“{searchQuery}”的知识点
            </div>
          ) : (
            !listReady ? (
              <div className="space-y-5">
                {groupedNotes.map((group) => (
                  <section key={group.subject} className="space-y-3">
                    <div className="flex items-center justify-between px-1">
                      <h4 className="text-sm font-semibold text-[var(--text)]">{group.subject}</h4>
                      <span className="text-xs text-[var(--muted)]">{group.items.length} 个</span>
                    </div>
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <div
                          key={`${group.subject}-skeleton-${i}`}
                          className="h-24 rounded-xl border border-[var(--border)] bg-[var(--surface)] animate-pulse"
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <Virtuoso
                key={focusRowIndex !== null && focusRowIndex >= 0 ? `focus-row-${focusRowIndex}` : "notes-default"}
                useWindowScroll
                {...(focusRowIndex !== null && focusRowIndex >= 0
                  ? { initialTopMostItemIndex: focusRowIndex }
                  : {})}
                totalCount={visibleRows.length}
                endReached={() => {
                  if (!hasMoreRows) return;
                  setGroupVisibleCounts((prev) => {
                    const next = { ...prev };
                    for (const group of groupedNotes) {
                      const current = prev[group.subject] ?? Math.min(NOTES_BATCH_SIZE, group.items.length);
                      if (current < group.items.length) {
                        next[group.subject] = Math.min(group.items.length, current + NOTES_BATCH_SIZE);
                      }
                    }
                    return next;
                  });
                }}
                itemContent={(index) => {
                  const row = visibleRows[index];
                  if (!row) return null;

                  if (row.type === "header") {
                    return (
                      <section className="pt-2 pb-1">
                        <div className="flex items-center justify-between px-1">
                          <h4 className="text-sm font-semibold text-[var(--text)]">{row.subject}</h4>
                          <span className="text-xs text-[var(--muted)]">{row.total} 个</span>
                        </div>
                      </section>
                    );
                  }

                  const note = row.note;
                  return (
                    <div key={note.id} id={`note-${note.id}`} className="mb-3">
                      {batchDeleteMode && (
                        <div className="mb-1 flex justify-end">
                          <label className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)] px-2 py-1 rounded-md border border-[var(--border)] bg-[var(--surface)]">
                            <input
                              type="checkbox"
                              checked={selectedNoteIds.has(note.id)}
                              onChange={() => handleToggleNoteSelection(note.id)}
                              className="accent-[var(--accent)]"
                            />
                            勾选
                          </label>
                        </div>
                      )}
                      <NoteCard
                        note={note}
                        highlightQuery={searchQuery}
                        expanded={expandedNote === note.id}
                        onToggleExpand={(id) =>
                          setExpandedNote(expandedNote === id ? null : id)
                        }
                        onEdit={(id) => {
                          setEditingNoteId(id);
                          setExpandedNote(id);
                          setToast("✏️ 已进入编辑模式");
                        }}
                        onDelete={handleDelete}
                      />
                    </div>
                  );
                }}
              />
            )
          )}
        </div>
      )}

      {/* Empty State */}
      {notes.length === 0 && !showList && (
        <div className="text-center py-12 text-[var(--muted)]">
          <p className="text-lg font-medium mb-2">📭 还没有添加知识点</p>
          <p className="text-sm">填写上方表单开始记录你的第一个知识点吧！</p>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-4 right-4 px-4 py-3 bg-green-500 text-white rounded-lg shadow-lg text-sm font-medium animate-bounce">
          {toast}
        </div>
      )}
    </>
  );
}

export default function NotesPage() {
  return (
    <Suspense fallback={null}>
      <NotesPageContent />
    </Suspense>
  );
}
