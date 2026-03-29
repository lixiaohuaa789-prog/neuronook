"use client";

import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { NewNoteInput, Note } from "@/lib/db";
import { FormulaText } from "@/components/FormulaText";

export interface NotebookEditorProps {
  initialData?: NewNoteInput;
  onSubmit: (data: NewNoteInput) => void;
  onBatchImport?: (items: NewNoteInput[]) => void;
  onCancel?: () => void;
  submitLabel?: string;
  showClearButton?: boolean;
  initialMode?: EditorMode;
}

type EditorMode = "basic" | "preview" | "advanced";

const FOCUS_TEMPLATE = [
  ":::focus",
  "$\\lim(1+\\alpha)^{1/\\alpha}=e$",
  ":::",
  "",
].join("\n");

const CAUTION_TEMPLATE = [
  "> [!CAUTION]",
  "> 这里填写易错点，例如：如果题目里没有\"1\"，先凑 (1+(u-1)) 再套公式。",
].join("\n");

const CIRCLED_NUM_PREFIX = /^[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]\s*/;

function cleanMarkdownInline(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

function normalizeBulletLine(line: string): string {
  return cleanMarkdownInline(line)
    .replace(CIRCLED_NUM_PREFIX, "")
    .replace(/^[-*•]\s+/, "")
    .replace(/^\d+[.)、]\s+/, "")
    .replace(/^\s+/, "")
    .trim();
}

function extractFocusBlock(text: string): { focus: string | null; rest: string } {
  if (!text.trim()) return { focus: null, rest: "" };
  const match = text.match(/:::focus[^\n]*\n([\s\S]*?)\n:::\s*/);
  if (!match || match.index === undefined) {
    return { focus: null, rest: text.trim() };
  }
  const focus = (match[1] || "").trim();
  const before = text.slice(0, match.index);
  const after = text.slice(match.index + match[0].length);
  return { focus: focus || null, rest: `${before}${after}`.trim() };
}

function hasMathExpression(text: string): boolean {
  if (!text) return false;
  return /\$[^$\n]+\$|\$\$[\s\S]+?\$\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]/.test(text);
}

// 压缩图片：最大边 1200px，JPEG 质量 0.72，减少 localStorage 占用
function compressImageDataUrl(dataUrl: string): Promise<string> {
  const MAX_SIDE = 1200;
  const QUALITY = 0.72;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > MAX_SIDE || height > MAX_SIDE) {
        if (width >= height) {
          height = Math.round((height * MAX_SIDE) / width);
          width = MAX_SIDE;
        } else {
          width = Math.round((width * MAX_SIDE) / height);
          height = MAX_SIDE;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(dataUrl); return; }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", QUALITY));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

type FlashcardImportResult = {
  question: string;
  coreAnswer: string;
  keyPoints: string[];
  commonMistakes: string;
  examples: string;
};

const FLASHCARD_FIELD_HEADER = /(^###\s*\d+\.\s*(核心问题|核心答案|关键点|易错点\s*\/\s*常见误区|示例\s*\/\s*应用场景))|(^\*\*题目[：:])|(^###\s*核心解析)/m;

function stripCodeFence(raw: string): string {
  const text = raw.trim();
  const match = text.match(/^```[\w-]*\n([\s\S]*?)\n```$/);
  return match ? match[1].trim() : text;
}

function parseFlashcardTemplate(raw: string): FlashcardImportResult {
  const text = stripCodeFence(raw);
  const sections: Record<string, string> = {};
  const sectionRegex = /###\s*\d+\.\s*(核心问题|核心答案|关键点|易错点\s*\/\s*常见误区|示例\s*\/\s*应用场景)\s*\n([\s\S]*?)(?=\n###\s*\d+\.|$)/g;

  let match: RegExpExecArray | null = null;
  while ((match = sectionRegex.exec(text)) !== null) {
    const title = match[1].replace(/\s+/g, "");
    sections[title] = (match[2] || "").trim();
  }

  // 兼容新版模板：
  // **题目：...** + :::focus + ### 核心解析 + **💡 通俗理解：** + > [!CAUTION]
  if (Object.keys(sections).length === 0) {
    const questionMatch =
      text.match(/\*\*题目[：:]\s*(.+?)\*\*/) ||
      text.match(/\*\*题目[：:]\s*([^\n]+)/) ||
      text.match(/^题目[：:]\s*([^\n]+)/m);
    const question = cleanMarkdownInline(questionMatch?.[1] || "");

    const focusMatch = text.match(/:::focus[^\n]*\n([\s\S]*?)\n:::\s*/);
    const focusBlock = focusMatch
      ? `:::focus\n${(focusMatch[1] || "").trim()}\n:::`
      : "";

    const analysisMatch = text.match(
      /###\s*核心解析\s*\n([\s\S]*?)(?=\n\*\*💡\s*通俗理解[：:]\*\*|\n>\s*\[!CAUTION\]|\n-{3,}\n|$)/
    );
    const analysisRaw = (analysisMatch?.[1] || "").trim();
    const analysisLines = analysisRaw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const keyPoints = analysisLines
      .filter((line) => CIRCLED_NUM_PREFIX.test(line) || /^\d+[.)、]/.test(line) || /^[-*•]/.test(line))
      .map(normalizeBulletLine)
      .filter(Boolean)
      .slice(0, 8);

    const coreAnalysis = analysisLines
      .map((line) => cleanMarkdownInline(line))
      .filter(Boolean)
      .join("\n");

    const plainExplainMatch = text.match(
      /\*\*💡\s*通俗理解[：:]\*\*\s*\n([\s\S]*?)(?=\n>\s*\[!CAUTION\]|\n-{3,}\n|$)/
    );
    const plainExplain = cleanMarkdownInline((plainExplainMatch?.[1] || "").trim());

    const cautionMatch = text.match(/>\s*\[!CAUTION\]\s*\n([\s\S]*?)$/);
    const commonMistakes = (cautionMatch?.[1] || "")
      .split(/\r?\n/)
      .map((line) => line.replace(/^>\s?/, "").trim())
      .filter(Boolean)
      .join("\n");

    return {
      question,
      coreAnswer: focusBlock,
      keyPoints,
      commonMistakes,
      examples: plainExplain,
    };
  }

  const question = sections["核心问题"] || "";
  const coreAnswer = sections["核心答案"] || "";
  const keyPointsRaw = sections["关键点"] || "";
  const commonMistakes = sections["易错点/常见误区"] || "";
  const examples = sections["示例/应用场景"] || "";

  const keyPoints = keyPointsRaw
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*•\d.\)\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 8);

  return {
    question,
    coreAnswer,
    keyPoints,
    commonMistakes,
    examples,
  };
}

function splitFlashcardChunks(raw: string): string[] {
  const text = stripCodeFence(raw).replace(/\r\n/g, "\n");
  if (!text.trim()) return [];

  // 优先按 ======== 分隔（用户常用格式）
  const byDivider = text
    .split(/\n={5,}\n/g)
    .map((chunk) => chunk.trim())
    .filter((chunk) => FLASHCARD_FIELD_HEADER.test(chunk));

  if (byDivider.length > 1) return byDivider;

  // 兼容按 --- 分隔的新模板
  const byDashDivider = text
    .split(/\n-{3,}\n/g)
    .map((chunk) => chunk.trim())
    .filter((chunk) => FLASHCARD_FIELD_HEADER.test(chunk));

  if (byDashDivider.length > 1) return byDashDivider;

  // 兼容无分隔线：按重复出现的“### 1. 核心问题”切片
  const anchors = [...text.matchAll(/(^|\n)###\s*1\.\s*核心问题\s*\n/g)];
  // 兼容新版模板：按“**题目：”切片
  const titleAnchors = [...text.matchAll(/(^|\n)\*\*题目[：:]/g)];

  if (anchors.length <= 1 && titleAnchors.length <= 1) return [text.trim()];

  const chosenAnchors = anchors.length > 1 ? anchors : titleAnchors;

  const chunks: string[] = [];
  for (let i = 0; i < chosenAnchors.length; i++) {
    const anchor = chosenAnchors[i];
    const start = (anchor.index ?? 0) + (anchor[1] ? anchor[1].length : 0);
    const end = i + 1 < chosenAnchors.length
      ? ((chosenAnchors[i + 1].index ?? text.length) + (chosenAnchors[i + 1][1] ? chosenAnchors[i + 1][1].length : 0))
      : text.length;
    const chunk = text.slice(start, end).trim();
    if (chunk && FLASHCARD_FIELD_HEADER.test(chunk)) chunks.push(chunk);
  }

  return chunks.length > 0 ? chunks : [text.trim()];
}

function parseFlashcardTemplates(raw: string): FlashcardImportResult[] {
  return splitFlashcardChunks(raw)
    .map((chunk) => parseFlashcardTemplate(chunk))
    .filter((item) =>
      Boolean(item.question || item.coreAnswer || item.keyPoints.length > 0 || item.commonMistakes || item.examples)
    );
}

export function NotebookEditor({
  initialData,
  onSubmit,
  onBatchImport,
  onCancel,
  submitLabel = "保存知识点",
  showClearButton = false,
  initialMode = "basic",
}: NotebookEditorProps) {
  const [mode, setMode] = useState<EditorMode>(initialMode);
  const [submitState, setSubmitState] = useState<"idle" | "saving" | "saved">("idle");

  const [question, setQuestion] = useState(initialData?.question || "");
  const [coreAnswer, setCoreAnswer] = useState(initialData?.coreAnswer || "");
  const [subject, setSubject] = useState(initialData?.subject || "未分类");
  const [difficulty, setDifficulty] = useState<"easy" | "normal" | "hard">(
    initialData?.difficulty || "normal"
  );

  const [keyPoints, setKeyPoints] = useState<string[]>(
    initialData?.keyPoints || [""]
  );
  const [commonMistakes, setCommonMistakes] = useState(
    initialData?.commonMistakes || ""
  );
  const [examples, setExamples] = useState(initialData?.examples || "");
  const [images, setImages] = useState<string[]>(initialData?.images || [""]);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  const deferredQuestion = useDeferredValue(question);
  const deferredCoreAnswer = useDeferredValue(coreAnswer);
  const deferredKeyPoints = useDeferredValue(keyPoints);
  const deferredCommonMistakes = useDeferredValue(commonMistakes);
  const deferredExamples = useDeferredValue(examples);
  const deferredImages = useDeferredValue(images);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const submitResetTimerRef = useRef<number | null>(null);

  const SUBJECT_PRESETS = ["数学", "英语", "专业课", "通识", "未分类"] as const;
  const [customSubject, setCustomSubject] = useState(() => {
    const initial = initialData?.subject?.trim() || "";
    return SUBJECT_PRESETS.includes(initial as (typeof SUBJECT_PRESETS)[number]) ? "" : initial;
  });
  const [showCustomSubjectInput, setShowCustomSubjectInput] = useState(() => Boolean(initialData?.subject?.trim() && !SUBJECT_PRESETS.includes((initialData.subject || "") as (typeof SUBJECT_PRESETS)[number])));
  const [historySubjects, setHistorySubjects] = useState<string[]>([]);
  const [showImportPanel, setShowImportPanel] = useState(false);
  const [importText, setImportText] = useState("");
  const [pendingImportItems, setPendingImportItems] = useState<FlashcardImportResult[]>([]);

  const removeHistorySubject = (subjectToRemove: string) => {
    const updated = historySubjects.filter((s) => s !== subjectToRemove);
    setHistorySubjects(updated);
    localStorage.setItem("customSubjects", JSON.stringify(updated));
    if (subject === subjectToRemove) {
      setSubject("未分类");
      setCustomSubject("");
    }
  };

  useEffect(() => {
    // 从localStorage读取历史自定义科目
    try {
      const saved = localStorage.getItem("customSubjects");
      if (saved) {
        setHistorySubjects(JSON.parse(saved));
      }
    } catch {}
  }, []);

  const handleKeyPointChange = (index: number, value: string) => {
    const next = [...keyPoints];
    next[index] = value;
    setKeyPoints(next);
  };

  const addKeyPoint = () => setKeyPoints([...keyPoints, ""]);
  const removeKeyPoint = (index: number) => {
    if (keyPoints.length <= 1) return;
    setKeyPoints(keyPoints.filter((_, i) => i !== index));
  };

  const handleImageChange = (index: number, value: string) => {
    setImages((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const addImageUrl = () => setImages((prev) => [...prev, ""]);
  const removeImageUrl = (index: number) => {
    setImages((prev) => {
      if (prev.length <= 1) return [""];
      const next = prev.filter((_, i) => i !== index);
      return next.length > 0 ? next : [""];
    });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const raw = event.target?.result as string;
        compressImageDataUrl(raw).then((dataUrl) => {
          startTransition(() => {
            setImages((prev) => [...prev.filter((img) => img.trim()), dataUrl]);
          });
        });
      };
      reader.readAsDataURL(file);
    });

    e.target.value = "";
  };

  const handleImagePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const items = Array.from(e.clipboardData.items || []);
    const imageItems = items.filter((item) => item.type.startsWith("image/"));
    if (imageItems.length === 0) return;

    e.preventDefault();
    imageItems.forEach((item) => {
      const file = item.getAsFile();
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const raw = event.target?.result as string;
        compressImageDataUrl(raw).then((dataUrl) => {
          startTransition(() => {
            setImages((prev) => [...prev.filter((img) => img.trim()), dataUrl]);
          });
        });
      };
      reader.readAsDataURL(file);
    });
  };

  const imageEntries = useMemo(
    () => deferredImages
      .map((img, idx) => ({ img, idx }))
      .filter((item) => item.img.trim()),
    [deferredImages]
  );

  const previewKeyPoints = useMemo(
    () => deferredKeyPoints.filter((p) => p.trim()),
    [deferredKeyPoints]
  );

  const coreAnswerFocusPreview = useMemo(() => {
    const parsed = extractFocusBlock(deferredCoreAnswer);
    return {
      ...parsed,
      hasFocus: Boolean(parsed.focus),
      focusIsMath: hasMathExpression(parsed.focus ?? ""),
    };
  }, [deferredCoreAnswer]);

  useEffect(() => {
    if (!previewImageUrl) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewImageUrl(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewImageUrl]);

  useEffect(() => {
    return () => {
      if (submitResetTimerRef.current) {
        window.clearTimeout(submitResetTimerRef.current);
      }
    };
  }, []);

  const handleSubmit = () => {
    if (submitState !== "idle") return;

    if (!coreAnswer.trim()) {
      alert("请输入核心答案");
      return;
    }

    const finalFront = question.trim() || "未命名";
    const finalContent = coreAnswer.trim();
    const finalSubject = subject.trim() || "未分类";

    // 如果使用了自定义科目，保存到历史
    if (customSubject.trim() && !SUBJECT_PRESETS.includes(customSubject.trim() as any)) {
      const updated = [customSubject.trim(), ...historySubjects.filter(s => s !== customSubject.trim())].slice(0, 10);
      setHistorySubjects(updated);
      localStorage.setItem("customSubjects", JSON.stringify(updated));
    }

    setSubmitState("saving");

    try {
      onSubmit({
        front: finalFront,
        content: finalContent,
        subject: finalSubject,
        difficulty,
        question: question.trim() || undefined,
        coreAnswer: finalContent,
        keyPoints:
          keyPoints.filter((p) => p.trim()).length > 0
            ? keyPoints.filter((p) => p.trim())
            : undefined,
        commonMistakes: commonMistakes.trim() || undefined,
        examples: examples.trim() || undefined,
        images:
          images.filter((img) => img.trim()).length > 0
            ? images.filter((img) => img.trim())
            : undefined,
      });

      setSubmitState("saved");
      if (submitResetTimerRef.current) {
        window.clearTimeout(submitResetTimerRef.current);
      }
      submitResetTimerRef.current = window.setTimeout(() => {
        setSubmitState("idle");
      }, 1200);
    } catch (error) {
      console.error("[NotebookEditor] submit failed", error);
      const msg = error instanceof Error ? error.message : "保存失败，请重试";
      alert(msg);
      setSubmitState("idle");
    }
  };

  const handleClearForm = () => {
    if (!confirm("确定要清空当前输入内容吗？")) return;

    setQuestion("");
    setCoreAnswer("");
    setSubject("未分类");
    setDifficulty("normal");
    setKeyPoints([""]);
    setCommonMistakes("");
    setExamples("");
    setImages([""]);
    setCustomSubject("");
    setShowCustomSubjectInput(false);
    setPreviewImageUrl(null);
    setMode(initialMode);
    setSubmitState("idle");
  };

  const handleInsertFocusTemplate = () => {
    setCoreAnswer((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return FOCUS_TEMPLATE;
      if (trimmed.includes(":::focus") && trimmed.includes(":::")) return prev;
      return `${FOCUS_TEMPLATE}${prev.startsWith("\n") ? "" : "\n"}${prev}`.trim();
    });
  };

  const handleInsertCautionTemplate = () => {
    setCommonMistakes((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return CAUTION_TEMPLATE;
      if (trimmed.includes("> [!CAUTION]")) return prev;
      return `${trimmed}\n\n${CAUTION_TEMPLATE}`;
    });
  };

  const handleImportFlashcard = () => {
    const source = (importText.trim() || coreAnswer.trim());
    if (!source) {
      alert("请先粘贴闪卡模板内容后再导入");
      return;
    }

    const parsedList = parseFlashcardTemplates(source);

    if (parsedList.length === 0) {
      alert("未识别到模板字段，请检查是否包含“### 1. 核心问题”到“### 5. 示例 / 应用场景”");
      return;
    }

    const toInput = (parsed: FlashcardImportResult): NewNoteInput => {
      const finalQuestion = parsed.question.trim();
      const finalCoreAnswer = parsed.coreAnswer.trim();
      return {
        front: finalQuestion || "未命名",
        content: finalCoreAnswer,
        subject: subject.trim() || "未分类",
        difficulty,
        question: finalQuestion || undefined,
        coreAnswer: finalCoreAnswer || undefined,
        keyPoints: parsed.keyPoints.length > 0 ? parsed.keyPoints : undefined,
        commonMistakes: parsed.commonMistakes.trim() || undefined,
        examples: parsed.examples.trim() || undefined,
        images: undefined,
      };
    };

    if (parsedList.length > 1) {
      setPendingImportItems(parsedList);
      return;
    }

    const parsed = parsedList[0];

    if (parsed.question) setQuestion(parsed.question);
    if (parsed.coreAnswer) setCoreAnswer(parsed.coreAnswer);
    if (parsed.keyPoints.length > 0) setKeyPoints(parsed.keyPoints);
    if (parsed.commonMistakes) setCommonMistakes(parsed.commonMistakes);
    if (parsed.examples) setExamples(parsed.examples);

    setMode("basic");
    setShowImportPanel(false);
    setImportText("");
    setPendingImportItems([]);
    alert("已完成导入：字段已自动填充");
  };

  const handleApplyFirstPendingImport = () => {
    const first = pendingImportItems[0];
    if (!first) return;

    if (first.question) setQuestion(first.question);
    if (first.coreAnswer) setCoreAnswer(first.coreAnswer);
    if (first.keyPoints.length > 0) setKeyPoints(first.keyPoints);
    if (first.commonMistakes) setCommonMistakes(first.commonMistakes);
    if (first.examples) setExamples(first.examples);

    setMode("basic");
    setPendingImportItems([]);
    setShowImportPanel(false);
    setImportText("");
    alert("已导入第 1 条到表单，请检查后再保存。");
  };

  const handleCreateAllPendingImports = () => {
    if (!onBatchImport || pendingImportItems.length === 0) return;

    const inputs: NewNoteInput[] = pendingImportItems.map((parsed) => {
      const finalQuestion = parsed.question.trim();
      const finalCoreAnswer = parsed.coreAnswer.trim();
      return {
        front: finalQuestion || "未命名",
        content: finalCoreAnswer,
        subject: subject.trim() || "未分类",
        difficulty,
        question: finalQuestion || undefined,
        coreAnswer: finalCoreAnswer || undefined,
        keyPoints: parsed.keyPoints.length > 0 ? parsed.keyPoints : undefined,
        commonMistakes: parsed.commonMistakes.trim() || undefined,
        examples: parsed.examples.trim() || undefined,
        images: undefined,
      };
    });

    onBatchImport(inputs);
    setPendingImportItems([]);
    setShowImportPanel(false);
    setImportText("");
    setSubmitState("saved");
    if (submitResetTimerRef.current) window.clearTimeout(submitResetTimerRef.current);
    submitResetTimerRef.current = window.setTimeout(() => setSubmitState("idle"), 1200);
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="flex gap-2 mb-6 border-b border-[var(--border)]">
        <button
          type="button"
          onClick={() => startTransition(() => setMode("basic"))}
          className={`px-4 py-2 font-medium text-sm transition-colors ${
            mode === "basic"
              ? "text-[var(--accent)] border-b-2 border-[var(--accent)]"
              : "text-[var(--muted)] hover:text-[var(--text)]"
          }`}
        >
          📝 基本信息
        </button>
        <button
          type="button"
          onClick={() => startTransition(() => setMode("advanced"))}
          className={`px-4 py-2 font-medium text-sm transition-colors ${
            mode === "advanced"
              ? "text-[var(--accent)] border-b-2 border-[var(--accent)]"
              : "text-[var(--muted)] hover:text-[var(--text)]"
          }`}
        >
          ⭐ 深化学习
        </button>
        <button
          type="button"
          onClick={() => startTransition(() => setMode("preview"))}
          className={`px-4 py-2 font-medium text-sm transition-colors ${
            mode === "preview"
              ? "text-[var(--accent)] border-b-2 border-[var(--accent)]"
              : "text-[var(--muted)] hover:text-[var(--text)]"
          }`}
        >
          👁️ 预览
        </button>
      </div>

      {mode === "basic" && (
        <div className="space-y-5 mb-6">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-[var(--text)]">📥 一键导入闪卡模板</p>
                <p className="text-xs text-[var(--muted)]">粘贴含 5 个字段的模板文本，自动填入对应输入框</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowImportPanel((v) => !v)}
                  className="px-3 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-hover)]"
                >
                  {showImportPanel ? "收起导入框" : "打开导入框"}
                </button>
                <button
                  type="button"
                  onClick={handleImportFlashcard}
                  className="px-3 py-1.5 text-xs rounded-lg border border-[#A3B18A]/40 bg-[#F3F4ED] text-[#5e6a54] hover:bg-[#eaede0]"
                >
                  一键导入
                </button>
              </div>
            </div>

            {showImportPanel && (
              <div className="mt-3">
                <textarea
                  value={importText}
                  onChange={(e) => {
                    setImportText(e.target.value);
                    if (pendingImportItems.length > 0) setPendingImportItems([]);
                  }}
                  placeholder="把完整闪卡模板粘贴到这里（支持 ``` 代码框包裹）"
                  rows={8}
                  className="w-full px-3 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] resize-y"
                />
                <p className="mt-2 text-xs text-[var(--muted)]">
                  提示：如果导入框为空，会尝试从“核心答案”框当前文本解析。
                </p>

                {pendingImportItems.length > 1 && (
                  <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-3">
                    <p className="text-sm font-medium text-amber-900">
                      检测到 {pendingImportItems.length} 个知识点，请先确认后再创建
                    </p>
                    <div className="max-h-48 overflow-y-auto rounded border border-amber-200 bg-white px-2 py-2">
                      <ol className="space-y-1.5 text-xs text-[var(--text)]">
                        {pendingImportItems.map((item, idx) => (
                          <li key={`${idx}-${item.question}`} className="leading-relaxed">
                            <span className="mr-1 text-[var(--muted)]">{idx + 1}.</span>
                            <span>{item.question || "（未识别核心问题）"}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {onBatchImport && (
                        <button
                          type="button"
                          onClick={handleCreateAllPendingImports}
                          className="px-3 py-1.5 text-xs rounded-lg border border-amber-400 bg-white text-amber-800 hover:bg-amber-100"
                        >
                          批量创建全部
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleApplyFirstPendingImport}
                        className="px-3 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-hover)]"
                      >
                        仅导入第 1 条到表单
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingImportItems([])}
                        className="px-3 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:bg-[var(--surface-hover)]"
                      >
                        取消本次解析
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-[var(--text)]">📚 科目</label>
            <div className="flex gap-2 flex-wrap">
              {SUBJECT_PRESETS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setSubject(s);
                    setCustomSubject("");
                    setShowCustomSubjectInput(false);
                  }}
                  className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                    subject === s
                      ? "bg-[var(--accent)] text-white shadow-md"
                      : "bg-[var(--surface-2)] text-[var(--text)] hover:border-[var(--accent)] border border-transparent"
                  }`}
                >
                  {s}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setShowCustomSubjectInput((v) => !v)}
                aria-expanded={showCustomSubjectInput}
                className={`px-4 py-2 rounded-lg font-medium text-sm transition-all border ${
                  showCustomSubjectInput
                    ? "bg-amber-50 border-amber-300 text-amber-700"
                    : "bg-[var(--surface-2)] border-transparent text-[var(--text)] hover:border-[var(--accent)]"
                }`}
              >
                {showCustomSubjectInput ? "收起自定义科目" : "+ 自定义科目"}
              </button>
            </div>
            {historySubjects.length > 0 && (
              <div className="mt-3 pt-2 border-t border-[var(--border)]">
                <p className="text-xs text-[var(--muted)] mb-2">📌 最近使用</p>
                <div className="flex gap-2 flex-wrap">
                  {historySubjects.map((s) => (
                    <div key={s} className="relative inline-flex">
                      <button
                        type="button"
                        onClick={() => {
                          setSubject(s);
                          setCustomSubject("");
                          setShowCustomSubjectInput(false);
                        }}
                        className={`px-4 py-2 pr-7 rounded-lg font-medium text-sm transition-all ${
                          subject === s
                            ? "bg-[var(--accent)] text-white shadow-md"
                            : "bg-[var(--surface-2)] text-[var(--text)] hover:border-[var(--accent)] border border-transparent"
                        }`}
                      >
                        {s}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeHistorySubject(s);
                        }}
                        aria-label={`删除科目 ${s}`}
                        title={`删除 ${s}`}
                        className={`absolute right-1 top-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] leading-none transition-colors ${
                          subject === s
                            ? "bg-white/25 text-white hover:bg-white/35"
                            : "bg-gray-200 text-gray-500 hover:bg-gray-300 hover:text-gray-700"
                        }`}
                      >
                        x
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {showCustomSubjectInput && (
              <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                <p className="mb-2 text-xs text-amber-700">仅填写科目名（建议 2-8 字）</p>
                <input
                  type="text"
                  value={customSubject}
                  maxLength={12}
                  onChange={(e) => {
                    const v = e.target.value;
                    setCustomSubject(v);
                    setSubject(v.trim() || "未分类");
                  }}
                  placeholder="如：法学 / 编程 / 心理学"
                  className="w-full max-w-full sm:w-[22rem] px-4 py-2.5 bg-[var(--surface)] border border-amber-300 rounded-lg text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-amber-300 transition-all"
                />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-[var(--text)]">🎚️ 难度等级</label>
            <div className="flex gap-2">
              {(
                [
                  { value: "easy", label: "简单", icon: "🟢" },
                  { value: "normal", label: "中等", icon: "🟡" },
                  { value: "hard", label: "困难", icon: "🔴" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDifficulty(opt.value)}
                  className={`px-4 py-2 rounded-lg font-medium text-sm transition-all inline-flex items-center gap-2 ${
                    difficulty === opt.value
                      ? "bg-[var(--accent)] text-white shadow-md"
                      : "bg-[var(--surface-2)] text-[var(--text)] hover:border-[var(--accent)] border border-transparent"
                  }`}
                >
                  <span aria-hidden>{opt.icon}</span>
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="question" className="block text-sm font-medium text-[var(--text)]">
              💭 核心问题（必填）
            </label>
            <p className="text-xs text-[var(--muted)]">
              这是复习时要回忆的问题。建议用"是什么""怎样""为什么"开头
            </p>
            <input
              id="question"
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="例：什么是费曼学习法？"
              className="w-full px-4 py-3 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] transition-all"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="coreAnswer" className="block text-sm font-medium text-[var(--text)]">
              ✅ 核心答案（必填）
            </label>
            <p className="text-xs text-[var(--muted)]">
              最核心、最必须记住的内容。保持简洁明确，2-5 句话最佳
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleInsertFocusTemplate}
                className="px-3 py-1.5 text-xs rounded-lg border border-[#A3B18A]/40 bg-[#F3F4ED] text-[#5e6a54] hover:bg-[#eaede0] transition-colors"
              >
                + 插入 :::focus 锚点模板
              </button>
              <span className="text-xs self-center text-[var(--muted)]">
                用于生成“左锚点 + 右推演”回忆卡片
              </span>
            </div>
            <textarea
              id="coreAnswer"
              value={coreAnswer}
              onChange={(e) => setCoreAnswer(e.target.value)}
              placeholder="输入最关键的答案或解释..."
              rows={4}
              className="w-full px-4 py-3 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] resize-none transition-all"
            />
            <p className="text-xs text-[var(--muted)]">字数：{coreAnswer.length} / 500（建议 50-200 字）</p>
          </div>
        </div>
      )}

      {mode === "advanced" && (
        <div className="space-y-6 mb-6">
          <div className="space-y-3 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div>
              <label className="block text-sm font-medium text-[var(--text)]">🔑 关键点（可选）</label>
              <p className="text-xs text-[var(--muted)]">将复杂内容分解为 3-5 个要点</p>
            </div>
            <div className="space-y-2">
              {keyPoints.map((point, idx) => (
                <div key={idx} className="flex gap-2">
                  <span className="text-sm font-medium text-[var(--muted)] min-w-fit pt-3">{idx + 1}.</span>
                  <input
                    type="text"
                    value={point}
                    onChange={(e) => handleKeyPointChange(idx, e.target.value)}
                    placeholder={`关键点 ${idx + 1}...`}
                    className="flex-1 px-3 py-2 bg-white border border-[var(--border)] rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                  <button
                    type="button"
                    onClick={() => removeKeyPoint(idx)}
                    className="px-2 py-2 text-[var(--muted)] hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addKeyPoint}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium px-3 py-2 rounded hover:bg-blue-100 transition-colors"
            >
              ➕ 添加关键点
            </button>
          </div>

          <div className="space-y-2 bg-orange-50 border border-orange-200 rounded-lg p-4">
            <label htmlFor="mistakes" className="block text-sm font-medium text-[var(--text)]">
              ⚠️ 易错点 / 常见误区（可选）
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleInsertCautionTemplate}
                className="px-3 py-1.5 text-xs rounded-lg border border-orange-300 bg-white text-orange-700 hover:bg-orange-100 transition-colors"
              >
                + 插入 [!CAUTION] 模板
              </button>
              <span className="text-xs self-center text-orange-700/80">
                该标记会在回忆卡片中渲染成复古红框提示
              </span>
            </div>
            <textarea
              id="mistakes"
              value={commonMistakes}
              onChange={(e) => setCommonMistakes(e.target.value)}
              placeholder="经常与什么混淆？常见错误是什么？"
              rows={3}
              className="w-full px-3 py-2 bg-white border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
            />
          </div>

          <div className="space-y-2 bg-green-50 border border-green-200 rounded-lg p-4">
            <label htmlFor="examples" className="block text-sm font-medium text-[var(--text)]">
              💡 示例 / 应用场景（可选）
            </label>
            <textarea
              id="examples"
              value={examples}
              onChange={(e) => setExamples(e.target.value)}
              placeholder="真实案例或具体应用场景..."
              rows={3}
              className="w-full px-3 py-2 bg-white border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-400 resize-none"
            />
          </div>

          <div
            className="space-y-3 bg-purple-50 border border-purple-200 rounded-lg p-4"
            onPaste={handleImagePaste}
          >
            <label className="block text-sm font-medium text-[var(--text)]">🖼️ 图片（可选）</label>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full px-4 py-2 bg-purple-300 text-purple-900 rounded-lg font-medium text-sm hover:bg-purple-400 transition-colors"
            >
              📤 上传图片
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageUpload}
              className="hidden"
            />

            <div className="space-y-2">
              {images.map((img, idx) => (
                <div key={idx} className="flex gap-2">
                  <input
                    type="text"
                    value={img}
                    onChange={(e) => handleImageChange(idx, e.target.value)}
                    placeholder="图片 URL..."
                    className="flex-1 px-3 py-2 bg-white border border-[var(--border)] rounded text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                  />
                  <button
                    type="button"
                    onClick={() => removeImageUrl(idx)}
                    className="px-2 py-2 text-[var(--muted)] hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <p className="text-xs text-purple-700">支持粘贴上传：在此区域按 Ctrl+V 可直接添加剪贴板图片</p>

            {imageEntries.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {imageEntries.map(({ img, idx }) => (
                    <div
                      key={idx}
                      className="rounded-lg border border-purple-200 bg-white p-2"
                    >
                      <img
                        src={img}
                        alt={`预览图片 ${idx + 1}`}
                        className="w-full max-h-60 object-contain rounded"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    </div>
                  ))}
              </div>
            )}
            <button
              type="button"
              onClick={addImageUrl}
              className="text-sm text-purple-600 hover:text-purple-700 font-medium px-3 py-2 rounded hover:bg-purple-100 transition-colors"
            >
              🔗 添加 URL
            </button>
          </div>
        </div>
      )}

      {mode === "preview" && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 space-y-5 mb-6">
          <div className="flex items-start justify-between gap-4 pb-4 border-b border-[var(--border)]">
            <div className="flex-1">
              <div className="flex gap-2 mb-3">
                <span className="inline-block px-3 py-1 bg-[var(--accent)] text-white text-xs font-medium rounded-full">
                  {subject}
                </span>
                <span className="inline-block px-3 py-1 bg-[var(--surface-2)] text-[var(--text)] text-xs font-medium rounded-full">
                  {difficulty === "easy" ? "🟢 简单" : difficulty === "hard" ? "🔴 困难" : "🟡 中等"}
                </span>
              </div>
              <h3 className="text-lg font-semibold text-[var(--text)]"><FormulaText text={deferredQuestion || "未命名"} inline /></h3>
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-[var(--muted)] mb-2 uppercase">✅ 核心答案</p>
            {coreAnswerFocusPreview.hasFocus ? (
              <div className="grid grid-cols-1 md:grid-cols-[38%_1px_1fr] rounded-xl overflow-hidden border border-[#A3B18A]/25">
                <div className="relative bg-[#F3F4ED] px-3 py-4 overflow-x-auto">
                  <span className="memory-focus-stamp">核心</span>
                  <div className={`memory-focus-anchor text-center ${coreAnswerFocusPreview.focusIsMath ? "text-3xl" : "text-base"}`}>
                    <FormulaText
                      text={coreAnswerFocusPreview.focus ?? ""}
                      className={coreAnswerFocusPreview.focusIsMath ? "memory-focus-math" : undefined}
                    />
                  </div>
                </div>
                <div className="hidden md:block border-r border-dashed border-[#A3B18A]/50" aria-hidden />
                <div className="px-3 py-3 bg-[var(--surface)] text-[var(--text)] leading-relaxed whitespace-pre-wrap">
                  <FormulaText text={coreAnswerFocusPreview.rest} />
                </div>
              </div>
            ) : (
              <div className="text-[var(--text)] leading-relaxed whitespace-pre-wrap"><FormulaText text={deferredCoreAnswer} /></div>
            )}
          </div>

          {previewKeyPoints.length > 0 && (
            <div>
              <p className="text-xs font-medium text-[var(--muted)] mb-2 uppercase">🔑 关键点</p>
              <ul className="space-y-2">
                {previewKeyPoints.map((p, idx) => (
                    <li key={idx} className="flex gap-3">
                      <span className="text-[var(--accent)] font-semibold min-w-fit">{idx + 1}.</span>
                      <span className="text-[var(--text)] flex-1"><FormulaText text={p} className="note-card-keypoint-formula" /></span>
                    </li>
                  ))}
              </ul>
            </div>
          )}

          {deferredCommonMistakes.trim() && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
              <p className="text-xs font-medium text-orange-900 mb-2">⚠️ 易错点</p>
              <div className="text-sm text-orange-900 whitespace-pre-wrap"><FormulaText text={deferredCommonMistakes} /></div>
            </div>
          )}

          {deferredExamples.trim() && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-xs font-medium text-green-900 mb-2">💡 示例</p>
              <div className="text-sm text-green-900 whitespace-pre-wrap"><FormulaText text={deferredExamples} /></div>
            </div>
          )}

          {imageEntries.length > 0 && (
            <div>
              <p className="text-xs font-medium text-[var(--muted)] mb-2 uppercase">🖼️ 参考图片</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {imageEntries.map(({ img, idx }, listIndex) => (
                  <div
                    key={`${idx}-${listIndex}`}
                    className="relative rounded-lg border border-[var(--border)] bg-white p-2"
                  >
                    <button
                      type="button"
                      onClick={() => setPreviewImageUrl(img)}
                      className="block w-full"
                    >
                      <img
                        src={img}
                        alt={`预览图片 ${listIndex + 1}`}
                        className="w-full max-h-64 object-contain rounded"
                        loading="lazy"
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeImageUrl(idx)}
                      className="absolute top-3 right-3 inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-red-600 transition-colors"
                      title="删除这张图片"
                      aria-label="删除这张图片"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {previewImageUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/70 p-4 sm:p-8 flex items-center justify-center"
          onClick={() => setPreviewImageUrl(null)}
        >
          <div className="relative max-w-5xl max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setPreviewImageUrl(null)}
              className="absolute -top-3 -right-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-[var(--text)] shadow hover:bg-[var(--surface-2)]"
              aria-label="关闭大图预览"
              title="关闭"
            >
              ✕
            </button>
            <img
              src={previewImageUrl}
              alt="图片大图预览"
              className="max-w-full max-h-[90vh] object-contain rounded-xl bg-white"
            />
          </div>
        </div>
      )}

      <div className="flex gap-3 justify-end">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-6 py-2 text-[var(--text)] hover:bg-[var(--surface-2)] rounded-lg font-medium transition-colors border border-[var(--border)]"
          >
            ✕ 取消
          </button>
        )}
        {showClearButton && (
          <button
            type="button"
            onClick={handleClearForm}
            disabled={submitState === "saving"}
            className="px-6 py-2 text-[var(--text)] hover:bg-[var(--surface-2)] rounded-lg font-medium transition-colors border border-[var(--border)] disabled:cursor-not-allowed disabled:opacity-70"
          >
            🧹 一键清空
          </button>
        )}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitState !== "idle"}
          className="px-6 py-2 bg-[var(--accent)] text-white rounded-lg font-medium hover:opacity-90 active:scale-95 transition-all shadow-md disabled:cursor-not-allowed disabled:opacity-70 disabled:active:scale-100"
        >
          {submitState === "saving" ? "保存中..." : submitState === "saved" ? "✅ 已保存" : submitLabel}
        </button>
      </div>
    </div>
  );
}
