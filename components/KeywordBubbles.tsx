"use client";

import { useState, useRef, KeyboardEvent, type CSSProperties } from "react";
import { FormulaText } from "./FormulaText";

interface KeywordBubblesProps {
  /** 受控模式：外部传入关键词列表 */
  keywords: string[];
  /** 添加关键词回调 */
  onAdd: (keyword: string) => void;
  /** 删除关键词回调 */
  onRemove: (keyword: string) => void;
  /** 输入框 placeholder，默认 "+ 提取关键词..." */
  placeholder?: string;
  /** 是否禁用输入（只读模式） */
  readOnly?: boolean;
  /** 可选内容字体 */
  fontFamily?: CSSProperties["fontFamily"];
}

/**
 * 果冻泡泡标签输入器
 * 每个标签拥有毛玻璃质感 + CSS spring 弹出动效。
 * 无需 framer-motion，纯 Tailwind + CSS keyframes 实现。
 */
export default function KeywordBubbles({
  keywords,
  onAdd,
  onRemove,
  placeholder = "+ 提取关键词...",
  readOnly = false,
  fontFamily,
}: KeywordBubblesProps) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const contentStyle = fontFamily ? { fontFamily } : undefined;

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      const trimmed = draft.trim();
      if (trimmed && !keywords.includes(trimmed)) {
        onAdd(trimmed);
      }
      setDraft("");
    }
    // Backspace on empty input removes last bubble
    if (e.key === "Backspace" && draft === "" && keywords.length > 0) {
      onRemove(keywords[keywords.length - 1]);
    }
  }

  return (
    <>
      {/* Inject keyframes once via a style tag */}
      <style>{`
        @keyframes bubblePop {
          0%   { transform: scale(0.45); opacity: 0; }
          55%  { transform: scale(1.12); opacity: 1; }
          75%  { transform: scale(0.96); }
          90%  { transform: scale(1.03); }
          100% { transform: scale(1);   opacity: 1; }
        }
        .bubble-pop {
          animation: bubblePop 0.38s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
      `}</style>

      {/* Wrapper — click anywhere to focus the hidden input */}
      <div
        className="flex flex-wrap items-center gap-2 cursor-text font-sans"
        onClick={() => inputRef.current?.focus()}
      >
        {/* Rendered bubbles */}
        {keywords.map((kw) => (
          <span
            key={kw}
            className="bubble-pop inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full
              bg-[#F3F4ED]/80 backdrop-blur-md
              border border-[#8B7D6B]/45
              shadow-[0_4px_12px_rgb(0,0,0,0.05)]
              text-sm font-medium text-[#4A5568] font-sans
              select-none"
            style={contentStyle}
          >
            <FormulaText text={kw} inline className="whitespace-pre-wrap break-words" />
            {!readOnly && (
              <button
                type="button"
                aria-label={`删除 ${kw}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(kw);
                }}
                className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full
                  text-[#4A5568]/50 hover:bg-[#4A5568]/10 hover:text-[#4A5568]
                  transition-colors duration-150 leading-none text-xs"
              >
                ×
              </button>
            )}
          </span>
        ))}

        {/* Ghost input */}
        {!readOnly && (
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={keywords.length === 0 ? placeholder : ""}
            className="min-w-[9rem] flex-1 bg-transparent text-sm text-[#4A5568] font-sans
              placeholder:text-[#4A5568]/35 outline-none border-none
              py-1.5 caret-[#9BAA95]"
            style={contentStyle}
          />
        )}
      </div>
    </>
  );
}
