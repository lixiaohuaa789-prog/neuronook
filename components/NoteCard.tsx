"use client";

import { Fragment, type ReactNode } from "react";
import type { Note } from "@/lib/db";
import { FormulaText } from "@/components/FormulaText";

export interface NoteCardProps {
  note: Note;
  onDelete?: (noteId: number) => void;
  onEdit?: (noteId: number) => void;
  highlightQuery?: string;
  expanded?: boolean;
  onToggleExpand?: (noteId: number) => void;
}

/**
 * 知识点卡片组件（Notion风格）
 * 支持折叠/展开，显示所有结构化字段
 */
export function NoteCard({
  note,
  onDelete,
  onEdit,
  highlightQuery = "",
  expanded = false,
  onToggleExpand,
}: NoteCardProps) {
  const question = note.question || note.front;
  const coreAnswer = note.coreAnswer || note.content;
  const hasAdvancedFields =
    note.keyPoints ||
    note.commonMistakes ||
    note.examples ||
    note.images;

  const difficultyStyles = {
    easy: "bg-green-100 text-green-800",
    normal: "bg-yellow-100 text-yellow-800",
    hard: "bg-red-100 text-red-800",
  };

  const difficultyEmoji = {
    easy: "🟢",
    normal: "🟡",
    hard: "🔴",
  };

  const difficulty = note.difficulty || "normal";

  const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const renderHighlighted = (text: string, formulaClassName: string, inline = true): ReactNode => {
    const keyword = highlightQuery.trim();
    if (!keyword) return <FormulaText text={text} inline={inline} className={formulaClassName} />;

    const regex = new RegExp(`(${escapeRegExp(keyword)})`, "ig");
    const parts = text.split(regex);

    return parts.map((part, idx) => {
      if (part.toLowerCase() === keyword.toLowerCase()) {
        return (
          <mark
            key={`${part}-${idx}`}
            className="rounded bg-yellow-200/80 px-0.5 text-[inherit]"
          >
            <FormulaText text={part} inline={inline} className={formulaClassName} />
          </mark>
        );
      }
      return (
        <Fragment key={`${part}-${idx}`}>
          <FormulaText text={part} inline={inline} className={formulaClassName} />
        </Fragment>
      );
    });
  };

  const renderSmartText = (text: string, formulaClassName: string, inline = true) => {
    return renderHighlighted(text, formulaClassName, inline);
  };

  return (
    <div className="bg-white border border-[var(--border)] rounded-xl overflow-hidden hover:shadow-md transition-shadow">
      {/* Card Header - Always Visible */}
      <button
        type="button"
        onClick={() => onToggleExpand?.(note.id)}
        className="w-full text-left p-4 sm:p-5 hover:bg-[var(--surface-2)] transition-colors cursor-pointer group"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {/* Meta Tags */}
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="inline-block px-2.5 py-0.5 bg-[var(--accent)] text-white text-xs font-medium rounded-full">
                {note.subject}
              </span>
              <span
                className={`inline-block px-2.5 py-0.5 text-xs font-medium rounded-full ${
                  difficultyStyles[difficulty]
                }`}
              >
                {difficultyEmoji[difficulty]} {["easy", "normal", "hard"].includes(difficulty) ? ["简单", "中等", "困难"][["easy", "normal", "hard"].indexOf(difficulty as any)] : "未设置"}
              </span>
              <span className="text-xs text-[var(--muted)]">
                {new Date(note.created_at).toLocaleDateString("zh-CN")}
              </span>
            </div>

            {/* Question/Title */}
            <h3 className="font-normal text-[var(--text)] group-hover:text-[var(--accent)] transition-colors truncate text-base sm:text-lg">
              {renderSmartText(question, "note-card-title-formula", true)}
            </h3>

            {/* Core Answer Preview */}
            <p className="text-sm text-[var(--muted)] mt-2 line-clamp-2">
              {renderSmartText(coreAnswer, "note-card-preview-formula", true)}
            </p>
          </div>

          {/* Expand/Collapse Icon */}
          <span className="text-lg text-[var(--muted)] flex-shrink-0 group-hover:text-[var(--accent)] transition-colors">
            {expanded ? "▼" : "▶"}
          </span>
        </div>
      </button>

      {/* Expanded Content */}
      {expanded && (
        <div className="border-t border-[var(--border)] px-4 sm:px-5 py-4 sm:py-5 space-y-5 bg-[var(--surface)]">
          {/* Core Answer Section */}
          {coreAnswer && (
            <div>
              <p className="text-xs font-medium text-[var(--muted)] uppercase mb-2">
                ✅ 核心答案
              </p>
              <div className="text-sm text-[var(--text)] leading-relaxed whitespace-pre-wrap">
                {renderSmartText(coreAnswer, "note-card-core-formula", true)}
              </div>
            </div>
          )}

          {/* Key Points Section */}
          {note.keyPoints && note.keyPoints.length > 0 && (
            <div>
              <p className="text-xs font-medium text-[var(--muted)] uppercase mb-2">
                🔑 关键点
              </p>
              <ul className="space-y-2">
                {note.keyPoints.map((point, idx) => (
                  <li key={idx} className="flex gap-2 text-sm text-[var(--text)]">
                    <span className="text-[var(--accent)] font-semibold min-w-fit">
                      {idx + 1}.
                    </span>
                    <span className="flex-1"><FormulaText text={point} className="note-card-keypoint-formula" /></span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Common Mistakes Section */}
          {note.commonMistakes && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 sm:p-4">
              <p className="text-xs font-medium text-orange-900 mb-2">⚠️ 易错点</p>
              <div className="text-sm text-orange-900 whitespace-pre-wrap leading-relaxed">
                <FormulaText text={note.commonMistakes} inline className="note-card-mistakes-formula" />
              </div>
            </div>
          )}

          {/* Examples Section */}
          {note.examples && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 sm:p-4">
              <p className="text-xs font-medium text-green-900 mb-2">💡 示例</p>
              <div className="text-sm text-green-900 whitespace-pre-wrap leading-relaxed">
                <FormulaText text={note.examples} />
              </div>
            </div>
          )}

          {/* Images Section */}
          {note.images && note.images.length > 0 && (
            <div>
              <p className="text-xs font-medium text-[var(--muted)] uppercase mb-3">
                🖼️ 图片
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {note.images.map((img, idx) => (
                  <img
                    key={idx}
                    src={img}
                    alt={`图片 ${idx + 1}`}
                    className="w-full max-h-72 object-contain rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-1"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          {(onEdit || onDelete) && (
            <div className="grid grid-cols-2 gap-2">
              {onEdit ? (
                <button
                  type="button"
                  onClick={() => onEdit(note.id)}
                  className="px-4 py-2.5 bg-blue-50 text-blue-600 font-medium text-sm rounded-lg hover:bg-blue-100 active:bg-blue-200 transition-colors border border-blue-200"
                >
                  ✏️ 编辑
                </button>
              ) : (
                <div />
              )}
              {onDelete ? (
                <button
                  type="button"
                  onClick={() => onDelete(note.id)}
                  className="px-4 py-2.5 bg-red-50 text-red-600 font-medium text-sm rounded-lg hover:bg-red-100 active:bg-red-200 transition-colors border border-red-200"
                >
                  🗑️ 删除
                </button>
              ) : (
                <div />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
