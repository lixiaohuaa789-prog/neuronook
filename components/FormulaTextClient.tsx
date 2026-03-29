"use client";

import { memo, useState, useEffect, type ReactNode } from "react";
import katex from "katex";

export interface FormulaTextProps {
  text: string;
  inline?: boolean;
  className?: string;
}

/**
 * Sanitise raw text before it is fed to the math parser.
 *
 * Defence layers (targeting iPad / WebKit ITP & SSR serialisation edge-cases):
 *  1. Strip null-bytes and BOM that survive database round-trips.
 *  2. Normalise CRLF → LF so multi-line display blocks parse correctly.
 *  3. Drop lone surrogate code-units (U+D800–U+DFFF); unpaired surrogates are
 *     invalid in DOMString and can cause WebKit's TextDecoder to silently eat
 *     adjacent characters, corrupting backslash sequences.
 *  4. Replace visually-ambiguous full-width / CJK-layout characters that some
 *     IMEs or paste operations introduce instead of ASCII equivalents.
 */
function sanitizeMathInput(input: string): string {
  if (!input) return "";

  let s = input;

  // 1. Null-bytes + BOM
  s = s.replace(/\0/g, "").replace(/\uFEFF/g, "");

  // 2. Line-ending normalisation
  s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // 2.5. WebKit backslash guard
  // Some iOS transport/serialisation paths can mutate escaped sequences.
  // We first apply the safe-pair amplification pattern, then normalise back
  // to canonical TeX tokens for this custom parser.
  s = s.replace(/\\\\/g, "\\\\\\\\");
  s = s.replace(/\\\\\\\\([\[\]()])/g, "\\$1");
  s = s.replace(/\\\\\\\\(?=[a-zA-Z])/g, "\\");
  s = s.replace(/\\\\\\\\/g, "\\\\");

  // 3. Lone surrogates
  // Keep valid surrogate pairs so emoji and other astral symbols survive.
  // eslint-disable-next-line no-control-regex
  s = s.replace(/(?:[\uD800-\uDBFF](?![\uDC00-\uDFFF]))|(?:(?<![\uD800-\uDBFF])[\uDC00-\uDFFF])/g, "");

  // 4. Full-width / look-alike character substitution
  s = s
    .replace(/[¥￥]/g, "\\")   // ¥ YEN SIGN / ￥ FULLWIDTH YEN SIGN  → backslash
    .replace(/＄/g, "$")        // ＄ FULLWIDTH DOLLAR SIGN             → dollar
    .replace(/｛/g, "{")        // ｛ FULLWIDTH LEFT CURLY BRACKET      → {
    .replace(/｝/g, "}")        // ｝ FULLWIDTH RIGHT CURLY BRACKET     → }
    .replace(/（/g, "(")        // （ FULLWIDTH LEFT PARENTHESIS        → (
    .replace(/）/g, ")");       // ） FULLWIDTH RIGHT PARENTHESIS      → )

  // 5. Normalize common Unicode math glyphs to TeX commands so KaTeX can
  // render them consistently across mixed CJK/Latin content.
  s = s
    .replace(/≠/g, "\\neq")
    .replace(/[≢≭≰≱⋠⋡]/g, "\\neq")
    .replace(/\uFFFD/g, "\\neq")
    .replace(/≤/g, "\\le")
    .replace(/≥/g, "\\ge")
    .replace(/∩/g, "\\cap")
    .replace(/∪/g, "\\cup")
    .replace(/∈/g, "\\in")
    .replace(/∉/g, "\\notin")
    .replace(/[∅⌀⊘]/g, "\\varnothing");

  // 6. OCR/IME corruption guard for not-equal in math context.
  // Some inputs store "\\neq" as a CJK glyph like "目". Only rewrite it
  // when surrounded by math-looking tokens to avoid touching normal Chinese text.
  s = s
    .replace(/([A-Za-z0-9_}\\)])\s*目\s*([A-Za-z0-9_{\\(])/g, "$1 \\neq $2")
    .replace(/([A-Za-z0-9_}\\)])\s*目\s*([∅⌀⊘])/g, "$1 \\neq $2");

  return s;
}

type Segment =
  | { type: "text"; content: string }
  | { type: "math"; content: string; display: boolean };

const LATEX_COMMAND_START = /\\[a-zA-Z]/;
const LATEX_TERMINATOR = /[\n\r，。；！？、]/;
const MATH_WINDOW_TERMINATOR = /[\n\r，。；！？、：:]/;

function isCjkChar(ch: string): boolean {
  return /[\u3400-\u9FFF]/.test(ch);
}

function findEndOfMath(delimiter: string, text: string, startIndex: number): number {
  let index = startIndex;
  let braceLevel = 0;
  const delimiterLength = delimiter.length;

  while (index < text.length) {
    if (braceLevel <= 0 && text.slice(index, index + delimiterLength) === delimiter) {
      return index;
    }

    if (text[index] === "\\") {
      index += 2;
      continue;
    }

    if (text[index] === "{") braceLevel += 1;
    else if (text[index] === "}") braceLevel -= 1;

    index += 1;
  }

  return -1;
}

function parseMathSegments(rawInput: string): Segment[] {
  const input = sanitizeMathInput(rawInput);
  const segments: Segment[] = [];
  let index = 0;
  let textStart = 0;

  while (index < input.length) {
    if (input[index] === "$" && input[index + 1] === "$") {
      if (index > textStart) {
        segments.push({ type: "text", content: input.slice(textStart, index) });
      }

      const end = findEndOfMath("$$", input, index + 2);
      if (end === -1) {
        segments.push({ type: "text", content: input.slice(index) });
        return segments;
      }

      segments.push({ type: "math", content: input.slice(index + 2, end), display: true });
      index = end + 2;
      textStart = index;
      continue;
    }

    if (input[index] === "\\" && input[index + 1] === "[") {
      if (index > textStart) {
        segments.push({ type: "text", content: input.slice(textStart, index) });
      }

      const end = findEndOfMath("\\]", input, index + 2);
      if (end === -1) {
        segments.push({ type: "text", content: input.slice(index) });
        return segments;
      }

      segments.push({ type: "math", content: input.slice(index + 2, end), display: true });
      index = end + 2;
      textStart = index;
      continue;
    }

    if (input[index] === "$") {
      if (index > textStart) {
        segments.push({ type: "text", content: input.slice(textStart, index) });
      }

      const end = findEndOfMath("$", input, index + 1);
      if (end === -1) {
        segments.push({ type: "text", content: input.slice(index) });
        return segments;
      }

      segments.push({ type: "math", content: input.slice(index + 1, end), display: false });
      index = end + 1;
      textStart = index;
      continue;
    }

    if (input[index] === "\\" && input[index + 1] === "(") {
      if (index > textStart) {
        segments.push({ type: "text", content: input.slice(textStart, index) });
      }

      const end = findEndOfMath("\\)", input, index + 2);
      if (end === -1) {
        // Tolerate common input typo: starts with \( but ends with plain )
        // instead of \). If this fallback still fails, keep original text.
        const fallbackEnd = input.indexOf(")", index + 2);
        if (fallbackEnd === -1) {
          segments.push({ type: "text", content: input.slice(index) });
          return segments;
        }

        segments.push({ type: "math", content: input.slice(index + 2, fallbackEnd), display: false });
        index = fallbackEnd + 1;
        textStart = index;
        continue;
      }

      segments.push({ type: "math", content: input.slice(index + 2, end), display: false });
      index = end + 2;
      textStart = index;
      continue;
    }

    index += 1;
  }

  if (textStart < input.length) {
    segments.push({ type: "text", content: input.slice(textStart) });
  }

  return segments;
}

function renderSegment(segment: Segment, index: number, forceInline: boolean): ReactNode {
  if (segment.type === "text") {
    const bareMathNodes = renderTextWithBareMath(segment.content, index);
    if (!bareMathNodes) {
      return <span key={index}>{segment.content}</span>;
    }
    return <span key={index}>{bareMathNodes}</span>;
  }

  try {
    const displayMode = forceInline ? false : segment.display;
    const html = katex.renderToString(segment.content, {
      displayMode,
      throwOnError: false,
      strict: false,
    });

    return <span key={index} dangerouslySetInnerHTML={{ __html: html }} />;
  } catch {
    return <span key={index}>{segment.content}</span>;
  }
}

function renderTextWithBareMath(text: string, indexSeed: number): ReactNode[] | null {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let probe = 0;
  let renderedAnyMath = false;

  while (probe < text.length) {
    const anchor = findNextMathAnchor(text, probe);
    if (!anchor) break;

    const { start, type } = anchor;

    const defaultRawCandidate =
      type === "command" ? sliceBareMathCandidate(text, start) : "";
    if (!defaultRawCandidate) {
      if (type === "command") {
        probe = start + 1;
        continue;
      }
    }

    let candidateStart = start;
    let rawCandidate = defaultRawCandidate;

    const window = expandMathWindow(text, start, cursor);
    if (window && type === "power") {
      const expandedRawCandidate = text.slice(window.start, window.end);
      const normalizedExpandedCandidate = normalizeLoosePowerSyntax(expandedRawCandidate.trim());

      if (normalizedExpandedCandidate.length > 0) {
        try {
          katex.renderToString(normalizedExpandedCandidate, {
            displayMode: false,
            throwOnError: true,
            strict: false,
          });
          candidateStart = window.start;
          rawCandidate = expandedRawCandidate;
        } catch {
          probe = start + 1;
          continue;
        }
      }
    } else if (type === "power") {
      probe = start + 1;
      continue;
    } else if (window) {
      const expandedRawCandidate = text.slice(window.start, window.end);
      const expandedCandidate = expandedRawCandidate.trim();

      if (expandedCandidate.length > defaultRawCandidate.trim().length && expandedCandidate.length > 0) {
        try {
          katex.renderToString(expandedCandidate, {
            displayMode: false,
            throwOnError: true,
            strict: false,
          });
          candidateStart = window.start;
          rawCandidate = expandedRawCandidate;
        } catch {
          // Keep default command-based candidate when expanded window is not valid math.
        }
      }
    }

    if (candidateStart > cursor) {
      nodes.push(
        <span key={`text-${indexSeed}-${candidateStart}`}>{text.slice(cursor, candidateStart)}</span>
      );
    }

    const leading = rawCandidate.match(/^\s*/)?.[0] ?? "";
    const withoutLeading = rawCandidate.slice(leading.length);
    const candidate = normalizeLoosePowerSyntax(withoutLeading.replace(/\s+$/g, ""));
    const trailing = withoutLeading.slice(candidate.length);

    if (leading) {
      nodes.push(
        <span key={`lead-${indexSeed}-${candidateStart}`}>{leading}</span>
      );
    }

    if (!candidate) {
      nodes.push(
        <span key={`raw-${indexSeed}-${candidateStart}`}>{rawCandidate}</span>
      );
      cursor = candidateStart + rawCandidate.length;
      probe = cursor;
      continue;
    }

    try {
      const html = katex.renderToString(candidate, {
        displayMode: false,
        throwOnError: true,
        strict: false,
      });
      nodes.push(
        <span
          key={`math-${indexSeed}-${candidateStart}`}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
      renderedAnyMath = true;
    } catch {
      nodes.push(
        <span key={`fallback-${indexSeed}-${candidateStart}`}>{candidate}</span>
      );
    }

    if (trailing) {
      nodes.push(
        <span key={`trail-${indexSeed}-${candidateStart}`}>{trailing}</span>
      );
    }

    cursor = candidateStart + rawCandidate.length;
    probe = cursor;
  }

  if (!renderedAnyMath) return null;

  if (cursor < text.length) {
    nodes.push(
      <span key={`tail-${indexSeed}`}>{text.slice(cursor)}</span>
    );
  }

  return nodes;
}

function findNextMathAnchor(input: string, from: number): { start: number; type: "command" | "power" } | null {
  const commandStart = findNextCommandStart(input, from);
  const powerStart = findNextPowerAnchor(input, from);

  if (commandStart < 0 && powerStart < 0) return null;
  if (commandStart < 0) return { start: powerStart, type: "power" };
  if (powerStart < 0) return { start: commandStart, type: "command" };

  return commandStart <= powerStart
    ? { start: commandStart, type: "command" }
    : { start: powerStart, type: "power" };
}

function findNextPowerAnchor(input: string, from: number): number {
  for (let i = from + 1; i < input.length - 1; i++) {
    if (input[i] !== "^") continue;

    const left = input[i - 1];
    const right = input[i + 1];

    if (!left || !right) continue;
    if (!/[A-Za-z0-9∞)}\]]/.test(left)) continue;
    if (!/[A-Za-z0-9∞({\\]/.test(right)) continue;

    return i;
  }

  return -1;
}

function normalizeLoosePowerSyntax(input: string): string {
  if (!input) return input;

  // Fallback for notes written as "1 \infty, \infty 0" without explicit ^.
  return input.replace(
    /(^|[\s(（,，])([A-Za-z0-9∞\\]+)\s+(\\infty|∞|[A-Za-z0-9])(?=\s*[),），,，]|$)/g,
    (_, lead: string, base: string, exponent: string) => `${lead}${base}^{${exponent}}`
  );
}

function expandMathWindow(input: string, anchor: number, minStart: number): { start: number; end: number } | null {
  let start = anchor;
  let end = anchor;

  while (start > minStart) {
    const prev = input[start - 1];
    if (MATH_WINDOW_TERMINATOR.test(prev) || isCjkChar(prev)) break;
    start -= 1;
  }

  while (end < input.length) {
    const ch = input[end];
    if (MATH_WINDOW_TERMINATOR.test(ch) || isCjkChar(ch)) break;
    end += 1;
  }

  if (start >= end) return null;
  return { start, end };
}

function findNextCommandStart(input: string, from: number): number {
  for (let i = from; i < input.length - 1; i++) {
    if (LATEX_COMMAND_START.test(input.slice(i, i + 2))) return i;
  }
  return -1;
}

function sliceBareMathCandidate(input: string, start: number): string {
  let i = start;
  let braceDepth = 0;

  while (i < input.length) {
    const ch = input[i];
    const next = input[i + 1] ?? "";

    if (ch === "\\") {
      if (next && /[a-zA-Z]/.test(next)) {
        i += 2;
        while (i < input.length && /[a-zA-Z]/.test(input[i])) i++;
        continue;
      }

      if (next) {
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }

    if (ch === "{") {
      braceDepth += 1;
      i += 1;
      continue;
    }

    if (ch === "}") {
      if (braceDepth > 0) braceDepth -= 1;
      i += 1;
      continue;
    }

    if (braceDepth === 0 && (LATEX_TERMINATOR.test(ch) || isCjkChar(ch))) {
      break;
    }

    i += 1;
  }

  return input.slice(start, i);
}

export const FormulaTextClient = memo(
  function FormulaTextClient({ text, inline = false, className = "" }: FormulaTextProps) {
    // ── Requirement 1: pure client-side rendering ────────────────────────────
    // Next.js SSR + React hydration can cause DOM mismatches on iPad / WebKit
    // because server-rendered katex HTML never exactly matches what the client
    // produces (different UA, font metrics, CSS load order).  By deferring all
    // katex work until after useEffect we guarantee:
    //   • SSR emits only raw text  →  no diff for React to complain about.
    //   • katex runs exclusively on the client where fonts are guaranteed to
    //     have loaded via the locally-bundled  katex/dist/katex.min.css.
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
      setMounted(true);
    }, []);

    const Tag = inline ? "span" : "div";
    const combinedClassName = `${inline ? "formula-inline" : "formula-text"} ${className}`.trim();

    // First pass (SSR + first hydration tick): emit unstyled raw text so the
    // server-rendered and client-rendered DOM trees are identical.
    if (!mounted) {
      return (
        <Tag className={combinedClassName} suppressHydrationWarning>
          {text}
        </Tag>
      );
    }

    // Second pass (client only): full katex parse + render.
    const segments = parseMathSegments(text ?? "");

    return (
      <Tag className={combinedClassName} data-formula-renderer="katex" suppressHydrationWarning>
        {segments.map((segment, index) => renderSegment(segment, index, inline))}
      </Tag>
    );
  },
  (prevProps, nextProps) =>
    prevProps.text === nextProps.text &&
    prevProps.inline === nextProps.inline &&
    prevProps.className === nextProps.className
);