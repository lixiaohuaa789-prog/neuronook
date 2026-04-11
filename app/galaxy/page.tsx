"use client";

import "katex/dist/katex.min.css";

import {
  Cosmograph,
  CosmographConfig,
  CosmographInputData,
  type CosmographRef,
} from "@cosmograph/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  getKnowledgeGalaxyData,
  type KnowledgeGalaxyData,
  type KnowledgeGalaxyNode,
} from "../../lib/db";
import { FormulaTextClient } from "../../components/FormulaTextClient";

type FamiliarityLevel = 1 | 2 | 3 | 4 | 5;

type PreparedPointType = "note" | "hub";

type PreparedPoint = {
  id: string;
  idx: number;
  rawId: number | null;
  label: string;
  shortLabel: string;
  subject: string;
  folderName: string;
  pointType: PreparedPointType;
  status: string;
  familiarity: number;
  priority: number;
  errorRate: number;
  level: FamiliarityLevel;
  size: number;
  color: string;
  labelWeight: number;
};

type PreparedLink = {
  source: string;
  target: string;
  sourceIdx: number;
  targetIdx: number;
  width: number;
  strength: number;
  color: string;
  kind: "outline" | "gravity";
};

type PreparedDataset = {
  points: CosmographInputData;
  links: CosmographInputData;
  cosmographConfig: Omit<CosmographConfig, "points" | "links">;
};

type GraphRuntimeDebug = {
  rawPointsCount: number;
  rawLinksCount: number;
  pointsCount: number;
  linksCount: number;
  firstPointPosition: [number, number] | null;
  zoomLevel: number | null;
  prepareMode: "idle" | "prepared" | "fallback" | "failed";
  prepareError: string | null;
};

type GalaxyColorMode = "risk" | "status";

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function toRiskLevel(node: KnowledgeGalaxyNode): FamiliarityLevel {
  const familiarity = clamp01(node.familiarity ?? 0);
  if (node.status === "isolated") return 1;
  if (node.status === "mastered" && familiarity >= 0.8) return 4;
  if (node.priority >= 0.7 || (node.status !== "mastered" && node.errorRate > 0.35)) return 5;
  if (familiarity >= 0.7) return 4;
  if (familiarity >= 0.5) return 3;
  if (familiarity >= 0.3) return 2;
  return 1;
}

function toStatusLevel(node: KnowledgeGalaxyNode): FamiliarityLevel {
  const status = (node.status || "").toLowerCase();
  if (status === "isolated") return 1;
  if (status === "mastered") return 4;
  if (status === "progress") {
    if (node.srsStep >= 4) return 3;
    return 2;
  }
  return 2;
}

function levelByMode(node: KnowledgeGalaxyNode, mode: GalaxyColorMode): FamiliarityLevel {
  return mode === "status" ? toStatusLevel(node) : toRiskLevel(node);
}

function levelVisual(level: FamiliarityLevel): { color: string; size: number; glow: number } {
  if (level === 1) return { color: "#64748B", size: 2.7, glow: 0.2 };
  if (level === 2) return { color: "#A855F7", size: 3.2, glow: 0.4 };
  if (level === 3) return { color: "#10B981", size: 3.7, glow: 0.55 };
  if (level === 4) return { color: "#F59E0B", size: 4.4, glow: 1.0 };
  return { color: "#EF4444", size: 4.1 * 1.5, glow: 0.75 };
}

function stageLabel(node: KnowledgeGalaxyNode): string {
  const status = (node.status || "").toLowerCase();
  if (status === "mastered") return "长期记忆（已掌握）";
  if (status === "progress") return `复习中（第 ${node.srsStep} 阶段）`;
  if (status === "isolated") return "孤立知识点（未建树）";
  return "学习中";
}

function normalizeSubject(subject?: string): string {
  return subject?.trim() || "未分类";
}

function normalizeFolderName(folderName?: string): string {
  return folderName?.trim() || "未分类";
}

function truncateLabel(text: string, maxLen: number): string {
  if (!text) return "未命名";
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}...`;
}

export default function GalaxyPage() {
  const isDev = process.env.NODE_ENV !== "production";
  const router = useRouter();
  const graphRef = useRef<CosmographRef>(undefined);
  const graphPanelRef = useRef<HTMLDivElement | null>(null);
  const graphWrapRef = useRef<HTMLDivElement | null>(null);

  const [data, setData] = useState<KnowledgeGalaxyData>({
    nodes: [],
    edges: [],
    stats: { total: 0, isolated: 0, progress: 0, mastered: 0 },
  });
  const [graphSize, setGraphSize] = useState({ width: 1100, height: 560 });
  const [preparedDataset, setPreparedDataset] = useState<PreparedDataset | null>(null);
  const [isPreparingGraph, setIsPreparingGraph] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(null);
  const [popupPos, setPopupPos] = useState<{ x: number; y: number } | null>(null);
  const [graphRuntimeDebug, setGraphRuntimeDebug] = useState<GraphRuntimeDebug>({
    rawPointsCount: 0,
    rawLinksCount: 0,
    pointsCount: 0,
    linksCount: 0,
    firstPointPosition: null,
    zoomLevel: null,
    prepareMode: "idle",
    prepareError: null,
  });

  const [preparedPoints, setPreparedPoints] = useState<PreparedPoint[]>([]);
  const [preparedLinks, setPreparedLinks] = useState<PreparedLink[]>([]);
  const [colorMode, setColorMode] = useState<GalaxyColorMode>("risk");
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const refresh = () => setData(getKnowledgeGalaxyData());
    refresh();
    window.addEventListener("study-app-changed", refresh);
    return () => window.removeEventListener("study-app-changed", refresh);
  }, []);

  useEffect(() => {
    const el = graphWrapRef.current;
    if (!el) return;

    const resize = () => {
      const width = Math.max(340, el.clientWidth);
      const fullscreenActive = typeof document !== "undefined" && document.fullscreenElement === graphPanelRef.current;
      const height = fullscreenActive
        ? Math.max(520, window.innerHeight - 8)
        : width < 640
          ? 460
          : width < 1024
            ? 520
            : 560;
      setGraphSize({ width, height });
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    window.addEventListener("fullscreenchange", resize);
    return () => {
      observer.disconnect();
      window.removeEventListener("fullscreenchange", resize);
    };
  }, []);

  useEffect(() => {
    const syncFullscreenState = () => {
      setIsFullscreen(document.fullscreenElement === graphPanelRef.current);
    };

    document.addEventListener("fullscreenchange", syncFullscreenState);
    syncFullscreenState();
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreenState);
    };
  }, []);

  const toggleFullscreen = async () => {
    const panel = graphPanelRef.current;
    if (!panel) return;

    try {
      if (document.fullscreenElement === panel) {
        await document.exitFullscreen();
      } else {
        await panel.requestFullscreen();
      }
    } catch {
      // Ignore fullscreen errors to avoid interrupting graph interactions.
    }
  };

  const selectedNode = useMemo(() => {
    if (selectedNodeId == null) return null;
    return data.nodes.find((n) => n.id === selectedNodeId) ?? null;
  }, [data.nodes, selectedNodeId]);

  const diagnosticIdSet = useMemo(() => {
    if (selectedNodeId == null) return new Set<string>();

    const center = String(selectedNodeId);
    const set = new Set<string>([center]);

    for (const edge of data.edges) {
      const source = String(edge.source);
      const target = String(edge.target);
      if (source === center || target === center) {
        set.add(source);
        set.add(target);
      }
    }

    const selectedNodeData = data.nodes.find((n) => n.id === selectedNodeId);
    for (const prereqId of selectedNodeData?.prerequisiteIds ?? []) {
      set.add(String(prereqId));
    }

    return set;
  }, [data.edges, data.nodes, selectedNodeId]);

  const selectedPrereqNodes = useMemo(() => {
    if (!selectedNode) return [] as KnowledgeGalaxyNode[];
    const byId = new Map<number, KnowledgeGalaxyNode>();
    data.nodes.forEach((n) => byId.set(n.id, n));
    return (selectedNode.prerequisiteIds ?? [])
      .map((id) => byId.get(id))
      .filter((node): node is KnowledgeGalaxyNode => !!node);
  }, [data.nodes, selectedNode]);

  const basePreparedPoints = useMemo<PreparedPoint[]>(() => {
    const notePoints = data.nodes.map((node) => {
      const level = levelByMode(node, colorMode);
      const visual = levelVisual(level);
      const folderName = normalizeFolderName(node.folderName);

      return {
        id: String(node.id),
        idx: -1,
        rawId: node.id,
        label: node.label || "未命名",
        shortLabel: truncateLabel(node.label || "未命名", 15),
        subject: normalizeSubject(node.subject),
        folderName,
        pointType: "note" as const,
        status: node.status,
        familiarity: clamp01(node.familiarity),
        priority: clamp01(node.priority),
        errorRate: clamp01(node.errorRate),
        level,
        size: visual.size,
        color: visual.color,
        labelWeight: 0.35 + clamp01(node.familiarity) * 0.65,
      };
    });

    const folderNames = Array.from(new Set(notePoints.map((point) => point.folderName)));
    const hubPoints = folderNames.map((folderName) => ({
      id: `folder-${folderName}`,
      idx: -1,
      rawId: null,
      label: folderName,
      shortLabel: folderName,
      subject: "文件夹星系",
      folderName,
      pointType: "hub" as const,
      status: "folder-hub",
      familiarity: 1,
      priority: 0,
      errorRate: 0,
      level: 4 as FamiliarityLevel,
      size: 13,
      color: "#1E90FF",
      labelWeight: 1,
    }));

    return [...notePoints, ...hubPoints].map((point, idx) => ({
      ...point,
      idx,
    }));
  }, [colorMode, data.nodes]);

  const basePreparedLinks = useMemo<PreparedLink[]>(() => {
    const pointIndexById = new Map<string, number>();
    basePreparedPoints.forEach((point, idx) => {
      pointIndexById.set(point.id, idx);
    });

    const outlineLinks: PreparedLink[] = data.edges.flatMap((edge) => {
      const source = String(edge.source);
      const target = String(edge.target);
      const sourceIdx = pointIndexById.get(source);
      const targetIdx = pointIndexById.get(target);
      if (sourceIdx == null || targetIdx == null) return [];

      return [{
        source,
        target,
        sourceIdx,
        targetIdx,
        width: 1,
        strength: 0.75,
        color: "rgba(156, 176, 206, 0.22)",
        kind: "outline",
      }];
    });

    const gravityLinks: PreparedLink[] = basePreparedPoints
      .filter((point) => point.pointType === "note")
      .flatMap((point) => {
        const hubId = `folder-${point.folderName}`;
        const sourceIdx = pointIndexById.get(point.id);
        const targetIdx = pointIndexById.get(hubId);
        if (sourceIdx == null || targetIdx == null) return [];

        return [{
          source: point.id,
          target: hubId,
          sourceIdx,
          targetIdx,
          width: 0.45,
          strength: 1.25,
          color: "rgba(255,255,255,0.02)",
          kind: "gravity",
        }];
      });

    return [...outlineLinks, ...gravityLinks];
  }, [basePreparedPoints, data.edges]);

  useEffect(() => {
    setIsPreparingGraph(true);
    setPreparedPoints(basePreparedPoints);
    setPreparedLinks(basePreparedLinks);

    setPreparedDataset({
      points: basePreparedPoints,
      links: basePreparedLinks,
      cosmographConfig: {
        pointIdBy: "id",
        pointIndexBy: "idx",
        pointLabelBy: "label",
        pointLabelWeightBy: "labelWeight",
        pointColorBy: "color",
        pointSizeBy: "size",
        linkSourceBy: "source",
        linkTargetBy: "target",
        linkSourceIndexBy: "sourceIdx",
        linkTargetIndexBy: "targetIdx",
        linkColorBy: "color",
        linkWidthBy: "width",
        linkStrengthBy: "strength",
      },
    });

    setGraphRuntimeDebug((current) => ({
      ...current,
      rawPointsCount: basePreparedPoints.length,
      rawLinksCount: basePreparedLinks.length,
      prepareMode: "fallback",
      prepareError: null,
    }));

    setIsPreparingGraph(false);
  }, [basePreparedLinks, basePreparedPoints]);

  const graphConfig = useMemo<Partial<CosmographConfig>>(() => {
    if (!preparedDataset) return {};

    return {
      ...preparedDataset.cosmographConfig,
      points: preparedDataset.points,
      links: preparedDataset.links,
      backgroundColor: "#020713",
      curvedLinks: true,
      linkDefaultArrows: true,
      pointGreyoutOpacity: selectedNodeId == null ? 0.3 : 0.05,
      linkGreyoutOpacity: selectedNodeId == null ? 0.22 : 0.02,
      pointOpacity: 1,
      linkOpacity: selectedNodeId == null ? 0.8 : 0.96,
      pointSizeScale: 1.06,
      simulationRepulsion: 2.45,
      simulationLinkSpring: 0.72,
      simulationLinkDistance: 18,
      simulationGravity: 0.12,
      simulationDecay: 5200,
      renderHoveredPointRing: true,
      hoveredPointRingColor: "#98fcd5",
      focusedPointRingColor: "#39ff8f",
      focusPointOnClick: false,
      selectPointOnClick: false,
      statusIndicatorMode: "text",
      pointColorStrategy: "direct",
      linkColorByFn: (value: unknown, idx?: number) => {
        const link = typeof idx === "number" ? preparedLinks[idx] : undefined;
        if (link?.kind === "gravity") return "rgba(255,255,255,0.02)";
        if (typeof value === "string") return value;
        return "rgba(156, 176, 206, 0.22)";
      },
      linkWidthByFn: (value: unknown, idx?: number) => {
        const link = typeof idx === "number" ? preparedLinks[idx] : undefined;
        if (link?.kind === "gravity") return 0.4;
        if (typeof value === "number") return value;
        return 1;
      },
      pointLabelFn: (value: unknown, idx?: number) => {
        if (typeof idx !== "number") return typeof value === "string" ? value : "";
        const point = preparedPoints[idx];
        if (!point) return typeof value === "string" ? value : "";
        return point.pointType === "hub" ? point.label : point.shortLabel;
      },
      showLabels: true,
      showDynamicLabels: true,
      showDynamicLabelsLimit: 24,
      showTopLabels: false,
      showHoveredPointLabel: true,
      showSelectedLabels: true,
      showUnselectedPointLabels: false,
      selectedPointLabelsLimit: 32,
      pointLabelFontSize: 11,
      pointLabelColor: "#DDE7F2",
      onGraphRebuilt: (stats) => {
        const graph = graphRef.current;
        if (selectedPointIndex == null) {
          graph?.fitView(500, 55);
        }

        requestAnimationFrame(() => {
          const firstPointPosition = graph?.getPointPositionByIndex(0) ?? null;
          const zoomLevel = graph?.getZoomLevel() ?? null;

          setGraphRuntimeDebug((current) => ({
            ...current,
            pointsCount: stats.pointsCount,
            linksCount: stats.linksCount,
            firstPointPosition,
            zoomLevel,
          }));
        });
      },
    };
  }, [preparedDataset, preparedLinks, preparedPoints, selectedNodeId, selectedPointIndex]);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;

    if (selectedPointIndex == null) {
      graph.unselectAllPoints();
      graph.setFocusedPoint(undefined);
      return;
    }

    graph.setFocusedPoint(selectedPointIndex);

    const selectedPoint = preparedPoints[selectedPointIndex];
    if (!selectedPoint) {
      graph.selectPoint(selectedPointIndex, false, true);
      graph.zoomToPoint(selectedPointIndex, 520, 2.4, true);
      return;
    }

    const diagnosticIndices: number[] = [];
    for (let i = 0; i < preparedPoints.length; i++) {
      const point = preparedPoints[i];
      if (diagnosticIdSet.has(point.id)) diagnosticIndices.push(i);
    }

    if (diagnosticIndices.length > 0) {
      graph.selectPoints(diagnosticIndices);
    } else {
      graph.selectPoint(selectedPointIndex, false, true);
    }

    graph.zoomToPoint(selectedPointIndex, 520, 2.7, true);
  }, [diagnosticIdSet, preparedPoints, selectedPointIndex]);

  const popupStyle = useMemo(() => {
    if (!popupPos) return null;

    const width = 330;
    const height = 260;
    const margin = 12;
    const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
    const vh = typeof window !== "undefined" ? window.innerHeight : 720;

    let left = popupPos.x + 18;
    let top = popupPos.y - 18;

    if (left + width > vw - margin) {
      left = Math.max(margin, popupPos.x - width - 18);
    }
    if (top + height > vh - margin) {
      top = Math.max(margin, vh - height - margin);
    }
    if (top < margin) {
      top = margin;
    }

    return {
      position: "fixed" as const,
      left,
      top,
      zIndex: 60,
    };
  }, [popupPos]);

  const handlePointClick = (index: number, _spacePos: [number, number], event: MouseEvent) => {
    const point = preparedPoints[index];
    if (!point) return;

    if (point.pointType === "hub") {
      setSelectedNodeId(null);
      setSelectedPointIndex(index);
      setPopupPos(null);
      return;
    }

    if (point.rawId != null && selectedNodeId === point.rawId) {
      setSelectedNodeId(null);
      setSelectedPointIndex(null);
      setPopupPos(null);
      return;
    }

    setSelectedNodeId(point.rawId);
    setSelectedPointIndex(index);
    setPopupPos({ x: event.clientX, y: event.clientY });
  };

  const handleBackgroundClick = () => {
    setSelectedNodeId(null);
    setSelectedPointIndex(null);
    setPopupPos(null);
  };

  return (
    <>
      <div className="page-hero">
        <span className="page-kicker">Galaxy</span>
        <h1 className="page-title">知识星图</h1>
        <p className="page-desc">WebGL 星图已启用：缩放/平移更丝滑，点击节点进入诊断链路模式。</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-center">
          <p className="text-xs" style={{ color: "var(--muted)" }}>总知识点（SRS）</p>
          <p className="text-2xl font-bold" style={{ color: "var(--text)" }}>{data.stats.total}</p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-center">
          <p className="text-xs" style={{ color: "var(--muted)" }}>孤立节点（SRS）</p>
          <p className="text-2xl font-bold text-slate-500">{data.stats.isolated}</p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-center">
          <p className="text-xs" style={{ color: "var(--muted)" }}>复习中（SRS）</p>
          <p className="text-2xl font-bold text-emerald-600">{data.stats.progress}</p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-center">
          <p className="text-xs" style={{ color: "var(--muted)" }}>长期记忆（SRS）</p>
          <p className="text-2xl font-bold text-cyan-500">{data.stats.mastered}</p>
        </div>
      </div>

      <div className="mb-3 rounded-xl border border-[#D6C7B1] bg-[#FFFCF5] px-3 py-2 text-xs text-[#73624C]">
        上方是记忆状态统计（SRS）；星图节点颜色可切换为“风险等级（复习优先）”或“状态等级（长期记忆）”。
      </div>

      {selectedNodeId != null && (
        <div className="mb-3 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
          诊断模式：非相关节点/连线已降噪，目标节点及其前后链路已提升为高亮荧光绿。
        </div>
      )}

      <div
        ref={graphPanelRef}
        className={isFullscreen
          ? "relative h-full w-full overflow-hidden bg-[#020713]"
          : "mb-4 rounded-lg border border-[#A3B18A] bg-[#FBF9F6] p-2 shadow-[0_8px_20px_rgba(79,98,66,0.15)]"
        }
        style={isFullscreen
          ? {
            margin: 0,
            padding: 0,
          }
          : {
            backgroundImage:
              "radial-gradient(rgba(42,59,44,0.12) 0.5px, transparent 0.5px), radial-gradient(rgba(143,161,116,0.10) 0.5px, transparent 0.5px), linear-gradient(180deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.05) 100%)",
            backgroundSize: "4px 4px, 7px 7px, 100% 100%",
            backgroundPosition: "0 0, 1px 2px, 0 0",
          }
        }
      >
        <div className={isFullscreen
          ? "h-full w-full overflow-hidden"
          : "w-full overflow-hidden rounded-lg border border-[#2A3B2C]/25 shadow-[inset_0_0_0_1px_rgba(220,229,207,0.5)]"
        }>
          <div
            ref={graphWrapRef}
            className={isFullscreen ? "relative h-full w-full overflow-hidden" : "relative w-full overflow-hidden"}
            style={{
              height: isFullscreen ? "100%" : graphSize.height,
              background:
                "radial-gradient(circle at 12% 18%, rgba(25,53,92,0.45) 0%, rgba(6,14,26,0.94) 38%, rgba(3,8,18,1) 100%)",
            }}
          >
          <div className="absolute right-3 top-3 z-30 flex items-center gap-2">
            <div className="inline-flex items-center gap-1 rounded-md border border-slate-500/45 bg-slate-900/55 p-1 text-[11px] text-slate-200 backdrop-blur">
              <button
                type="button"
                className={`rounded px-2 py-1 transition ${colorMode === "risk" ? "bg-emerald-500/30 text-emerald-100" : "text-slate-200 hover:bg-slate-800/70"}`}
                onClick={() => setColorMode("risk")}
              >
                风险着色
              </button>
              <button
                type="button"
                className={`rounded px-2 py-1 transition ${colorMode === "status" ? "bg-cyan-500/30 text-cyan-100" : "text-slate-200 hover:bg-slate-800/70"}`}
                onClick={() => setColorMode("status")}
              >
                状态着色
              </button>
            </div>
            <button
              type="button"
              className="rounded-md border border-slate-500/50 bg-slate-900/50 px-2 py-1 text-[11px] text-slate-200 backdrop-blur hover:bg-slate-800/70"
              onClick={() => graphRef.current?.fitView(500, 55)}
            >
              全景
            </button>
            <button
              type="button"
              className="rounded-md border border-slate-500/50 bg-slate-900/50 px-2 py-1 text-[11px] text-slate-200 backdrop-blur hover:bg-slate-800/70"
              onClick={toggleFullscreen}
            >
              {isFullscreen ? "退出全屏" : "全屏"}
            </button>
          </div>

          {isDev && (
            <div className="absolute bottom-3 left-3 z-30 rounded-md border border-white/10 bg-slate-950/60 px-3 py-2 text-[11px] text-slate-200 backdrop-blur">
              <div>原始节点: {graphRuntimeDebug.rawPointsCount} / 原始连线: {graphRuntimeDebug.rawLinksCount}</div>
              <div>缓存节点: {preparedPoints.length} / 缓存连线: {preparedLinks.length}</div>
              <div>渲染节点: {graphRuntimeDebug.pointsCount} / 渲染连线: {graphRuntimeDebug.linksCount}</div>
              <div>数据模式: {graphRuntimeDebug.prepareMode}</div>
              <div>
                首点坐标: {graphRuntimeDebug.firstPointPosition
                  ? `${graphRuntimeDebug.firstPointPosition[0].toFixed(2)}, ${graphRuntimeDebug.firstPointPosition[1].toFixed(2)}`
                  : "无"}
              </div>
              <div>缩放级别: {graphRuntimeDebug.zoomLevel != null ? graphRuntimeDebug.zoomLevel.toFixed(2) : "无"}</div>
              {graphRuntimeDebug.prepareError && (
                <div className="mt-1 max-w-[280px] text-amber-200">{graphRuntimeDebug.prepareError}</div>
              )}
            </div>
          )}

          <Cosmograph
            ref={graphRef}
            {...graphConfig}
            onPointClick={handlePointClick}
            onBackgroundClick={handleBackgroundClick}
            style={{ width: "100%", height: isFullscreen ? "100%" : graphSize.height }}
          />

          {isPreparingGraph && (
            <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-slate-950/12 backdrop-blur-[1px]">
              <div className="rounded-full border border-white/15 bg-slate-950/55 px-3 py-1.5 text-xs text-slate-200">
                正在初始化 WebGL 星图...
              </div>
            </div>
          )}

          {selectedNode && popupStyle && (
            <div
              className="pointer-events-auto max-w-xs rounded-lg border border-emerald-300/40 bg-slate-950/90 px-3 py-3 shadow-2xl backdrop-blur"
              style={popupStyle}
            >
              <div className="mb-1 flex items-start justify-between gap-2">
                <div
                  className="text-sm font-semibold text-slate-100 whitespace-normal break-words [overflow-wrap:anywhere]"
                  style={{ lineHeight: "1.4", textAlign: "justify" }}
                >
                  <FormulaTextClient text={selectedNode.label} inline={true} />
                </div>
                <button
                  type="button"
                  className="rounded border border-slate-600 px-1.5 py-0.5 text-[10px] text-slate-300 hover:bg-slate-800"
                  onClick={() => {
                    setSelectedNodeId(null);
                    setSelectedPointIndex(null);
                    setPopupPos(null);
                  }}
                >
                  x
                </button>
              </div>
              <p className="text-[11px] text-slate-300">科目：{normalizeSubject(selectedNode.subject)}</p>
              <p className="mt-0.5 text-[11px] text-slate-300">状态：{stageLabel(selectedNode)}</p>
              <p className="mt-0.5 text-[11px] text-slate-300">熟悉度：{Math.round(clamp01(selectedNode.familiarity) * 100)}%</p>
              <p className="mt-0.5 text-[11px] text-slate-300">错误率：{Math.round(clamp01(selectedNode.errorRate) * 100)}%</p>
              <p className="mt-0.5 text-[11px] text-slate-300">优先级：{Math.round(clamp01(selectedNode.priority) * 100)}%</p>

              {selectedPrereqNodes.length > 0 && (
                <div className="mt-2 rounded-md border border-amber-300/30 bg-amber-100/5 px-2 py-1.5">
                  <p className="text-[11px] text-amber-200">前置依赖：{selectedPrereqNodes.length} 个</p>
                  <div className="mt-1 space-y-1">
                    {selectedPrereqNodes.slice(0, 4).map((node) => (
                      <button
                        key={node.id}
                        type="button"
                        onClick={async () => {
                          const graph = graphRef.current;
                          if (!graph) return;

                          const indices = await graph.getPointIndicesByIds([String(node.id)]);
                          const idx = indices?.[0];
                          if (typeof idx !== "number") return;

                          setSelectedNodeId(node.id);
                          setSelectedPointIndex(idx);
                        }}
                        className="block w-full truncate rounded border border-amber-300/25 bg-amber-50/5 px-2 py-1 text-left text-[11px] text-amber-100 hover:bg-amber-50/10"
                        title={`定位：${node.label}`}
                      >
                        ↗ {node.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => router.push(`/notes?focusNote=${selectedNode.id}`)}
                className="mt-2 w-full rounded-md border border-emerald-300/35 bg-emerald-400/10 px-2 py-1 text-xs text-emerald-100 hover:bg-emerald-400/20"
              >
                打开原笔记
              </button>
            </div>
          )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[#D6C7B1] bg-[#FFFCF5] p-4 shadow-[0_10px_28px_rgba(96,76,50,0.14)]">
        <p className="text-sm font-semibold text-[#5E4E3A]">💡交互提示</p>
        <p className="mt-1 text-sm leading-6 text-[#73624C]">
          单击节点进入诊断模式，再次点击同一节点可退出。双指缩放和拖拽在 iPad 下可直接使用。
        </p>
        <p className="mt-1 text-xs leading-5 text-[#8A745A]">
          当前节点颜色：{colorMode === "risk" ? "风险等级（复习优先）" : "状态等级（长期记忆）"}。
        </p>
          <div className="mt-2 flex flex-wrap gap-3 text-xs font-medium">
            <span className="inline-flex items-center justify-center gap-2 rounded-md border border-[#A3B18A] bg-[#FBF9F6] px-3 py-1.5 text-[#2A3B2C]"><span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: "#64748B" }}></span>Lv.1 {colorMode === "risk" ? "陌生" : "孤立"}</span>
            <span className="inline-flex items-center justify-center gap-2 rounded-md border border-[#A3B18A] bg-[#FBF9F6] px-3 py-1.5 text-[#2A3B2C]"><span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: "#A855F7" }}></span>Lv.2 {colorMode === "risk" ? "模糊" : "学习中"}</span>
            <span className="inline-flex items-center justify-center gap-2 rounded-md border border-[#A3B18A] bg-[#FBF9F6] px-3 py-1.5 text-[#2A3B2C]"><span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: "#10B981" }}></span>Lv.3 {colorMode === "risk" ? "熟悉" : "复习中"}</span>
            <span className="inline-flex items-center justify-center gap-2 rounded-md border border-[#A3B18A] bg-[#FBF9F6] px-3 py-1.5 text-[#2A3B2C]"><span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: "#F59E0B" }}></span>Lv.4 {colorMode === "risk" ? "精通" : "长期记忆"}</span>
            <span className="inline-flex items-center justify-center gap-2 rounded-md border border-[#A3B18A] bg-[#FBF9F6] px-3 py-1.5 text-[#2A3B2C]"><span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: "#EF4444" }}></span>Lv.5 {colorMode === "risk" ? "需复习" : "高风险复习"}</span>
        </div>
      </div>
    </>
  );
}
