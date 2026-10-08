import {
  forwardRef,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

type HighlightConfig = {
  query: string;
  positions: number[];
  activeIndex: number;
};

type Token = {
  text: string;
  className: string;
  globalStart: number;
};

const safeActiveIndex = (activeIndex: number, total: number): number => {
  if (!total) return -1;
  const safe = ((activeIndex % total) + total) % total;
  return safe;
};

const findCommentIndex = (line: string): number => {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    if (ch === '"' && !inSingle) inDouble = !inDouble;
    if (ch === "#" && !inSingle && !inDouble) {
      if (i === 0) return 0;
      const prev = line[i - 1];
      if (prev === " " || prev === "\t") return i;
    }
  }
  return -1;
};

const classifyValue = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return "text-ink-2";
  if (trimmed.startsWith("#")) return "text-ink-3";
  if (trimmed.startsWith('"') || trimmed.startsWith("'"))
    return "text-emerald-700 dark:text-emerald-300";
  if (/^(true|false|null|~)\b/i.test(trimmed)) return "text-ink";
  if (/^[+-]?\d+(\.\d+)?\b/.test(trimmed)) return "text-amber-700 dark:text-amber-300";
  if (/^\[.*\]$/.test(trimmed) || /^\{.*\}$/.test(trimmed)) return "text-ink-2";
  return "text-ink-2";
};

const tokenizeYamlLine = (line: string, lineGlobalStart: number): Token[] => {
  if (!line)
    return [
      { text: "", className: "text-ink-2", globalStart: lineGlobalStart },
    ];

  const commentIndex = findCommentIndex(line);
  const body = commentIndex >= 0 ? line.slice(0, commentIndex) : line;
  const comment = commentIndex >= 0 ? line.slice(commentIndex) : "";

  const tokens: Token[] = [];
  let cursor = 0;

  const push = (text: string, className: string) => {
    tokens.push({ text, className, globalStart: lineGlobalStart + cursor });
    cursor += text.length;
  };

  const trimmedBody = body.replace(/\s+$/, "");
  const leading = body.match(/^\s*/)?.[0] ?? "";
  push(leading, "text-ink-3");

  let rest = body.slice(leading.length);
  if (rest.startsWith("- ")) {
    push("- ", "text-ink-3");
    rest = rest.slice(2);
  }

  const colonIndex = rest.indexOf(":");
  const hasKey =
    colonIndex > 0 &&
    (rest[colonIndex + 1] === " " ||
      rest[colonIndex + 1] === "\t" ||
      rest[colonIndex + 1] === undefined) &&
    rest.slice(0, colonIndex).trim().length > 0;

  if (hasKey) {
    const key = rest.slice(0, colonIndex);
    const afterColon = rest.slice(colonIndex + 1);
    const keyTrimmed = key.replace(/\s+$/, "");
    const keyPadding = key.slice(keyTrimmed.length);

    push(keyTrimmed, "text-sky-700 dark:text-sky-300 font-semibold");
    push(keyPadding, "text-ink-3");
    push(":", "text-ink-3");
    const valueText = afterColon;
    push(valueText, classifyValue(valueText));
  } else {
    const meta = trimmedBody.trim();
    if (meta === "---" || meta === "..." || meta.startsWith("!")) {
      push(rest, "text-ink font-semibold");
    } else {
      push(rest, classifyValue(rest));
    }
  }

  if (comment) {
    push(comment, "text-ink-3");
  }

  return tokens;
};

const buildLineStarts = (lines: string[]): number[] => {
  const starts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    starts.push(offset);
    offset += line.length + 1;
  }
  return starts;
};

const buildMatchRanges = (
  highlight: HighlightConfig | null,
): { activeStart: number; len: number } => {
  if (!highlight?.query.trim()) return { activeStart: -1, len: 0 };
  const len = highlight.query.length;
  const total = highlight.positions.length;
  const safe = safeActiveIndex(highlight.activeIndex, total);
  const activeStart = safe >= 0 ? highlight.positions[safe] : -1;
  return { activeStart, len };
};

const clipRangesToSegment = (
  segmentGlobalStart: number,
  segmentText: string,
  highlight: HighlightConfig | null,
  matchLen: number,
  activeStart: number,
  matchPtrRef: { current: number },
): ReactNode[] => {
  if (!highlight?.query.trim() || !highlight.positions.length || !matchLen) return [segmentText];

  const segmentStart = segmentGlobalStart;
  const segmentEnd = segmentGlobalStart + segmentText.length;
  const positions = highlight.positions;

  let ptr = matchPtrRef.current;
  while (ptr > 0 && positions[ptr - 1] >= segmentStart) {
    ptr -= 1;
  }
  while (ptr < positions.length && positions[ptr] + matchLen <= segmentStart) {
    ptr += 1;
  }

  const pieces: ReactNode[] = [];
  let localCursor = 0;

  const addPlain = (text: string) => {
    if (!text) return;
    pieces.push(text);
  };

  const addHit = (text: string, isActive: boolean) => {
    if (!text) return;
    pieces.push(
      <span
        key={`${segmentGlobalStart}:${localCursor}:${text.length}:${isActive ? "a" : "n"}`}
        className={[
          "rounded-sm",
          isActive
            ? "bg-amber-300/70 ring-1 ring-amber-500/30 dark:bg-amber-400/25"
            : "bg-amber-200/60 dark:bg-amber-400/15",
        ].join(" ")}
      >
        {text}
      </span>,
    );
  };

  for (; ptr < positions.length; ptr += 1) {
    const start = positions[ptr];
    const end = start + matchLen;
    if (start >= segmentEnd) break;
    if (end <= segmentStart) continue;

    const intersectStart = Math.max(segmentStart, start);
    const intersectEnd = Math.min(segmentEnd, end);
    const beforeLen = Math.max(0, intersectStart - segmentStart - localCursor);
    const hitOffset = intersectStart - segmentStart;
    const hitLen = Math.max(0, intersectEnd - intersectStart);

    if (beforeLen) {
      addPlain(segmentText.slice(localCursor, localCursor + beforeLen));
      localCursor += beforeLen;
    } else if (hitOffset > localCursor) {
      addPlain(segmentText.slice(localCursor, hitOffset));
      localCursor = hitOffset;
    }

    if (hitLen) {
      const isActive = activeStart === start;
      addHit(segmentText.slice(localCursor, localCursor + hitLen), isActive);
      localCursor += hitLen;
    }
  }

  if (localCursor < segmentText.length) {
    addPlain(segmentText.slice(localCursor));
  }

  matchPtrRef.current = ptr;
  return pieces;
};

export const YamlCodeEditor = forwardRef<
  HTMLTextAreaElement,
  {
    value: string;
    onChange: (next: string) => void;
    disabled?: boolean;
    highlight?: HighlightConfig | null;
    ariaLabel?: string;
    heightClassName?: string;
    indentText?: string;
  }
>(function YamlCodeEditor(
  {
    value,
    onChange,
    disabled = false,
    highlight = null,
    ariaLabel,
    heightClassName,
    indentText = "  ",
  },
  ref,
) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const preRef = useRef<HTMLPreElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const [cursorOffset, setCursorOffset] = useState(0);

  const mergedRef = useCallback(
    (node: HTMLTextAreaElement | null) => {
      textareaRef.current = node;
      if (!ref) return;
      if (typeof ref === "function") ref(node);
      else ref.current = node;
    },
    [ref],
  );

  const lines = useMemo(() => value.split("\n"), [value]);
  const lineStarts = useMemo(() => buildLineStarts(lines), [lines]);

  const { activeStart, len: matchLen } = useMemo(() => buildMatchRanges(highlight), [highlight]);

  const activeLineIndex = useMemo(() => {
    if (!lineStarts.length) return 0;
    const target = Math.max(0, Math.min(cursorOffset, value.length));
    let low = 0;
    let high = lineStarts.length - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      const start = lineStarts[mid] ?? 0;
      const nextStart =
        mid + 1 < lineStarts.length ? (lineStarts[mid + 1] ?? value.length + 1) : value.length + 1;
      if (target >= start && target < nextStart) return mid;
      if (target < start) high = mid - 1;
      else low = mid + 1;
    }
    return 0;
  }, [cursorOffset, lineStarts, value.length]);

  const highlighted = useMemo(() => {
    const matchPtrRef = { current: 0 };
    return lines.map((line, idx) => {
      const lineStart = lineStarts[idx] ?? 0;
      const tokens = tokenizeYamlLine(line, lineStart);
      return (
        <div
          key={`l-${idx}`}
          className={[
            "h-6 whitespace-pre",
            idx === activeLineIndex ? "bg-hover" : null,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {tokens.map((token, tokenIdx) => (
            <span key={`t-${idx}-${tokenIdx}`} className={token.className}>
              {clipRangesToSegment(
                token.globalStart,
                token.text,
                highlight,
                matchLen,
                activeStart,
                matchPtrRef,
              )}
            </span>
          ))}
        </div>
      );
    });
  }, [activeStart, highlight, lineStarts, lines, matchLen]);

  const lineNumbers = useMemo(() => {
    const count = Math.max(1, lines.length);
    return Array.from({ length: count }, (_, i) => (
      <div
        key={`n-${i}`}
        className={["h-6", i === activeLineIndex ? "text-ink-2" : null]
          .filter(Boolean)
          .join(" ")}
      >
        {i + 1}
      </div>
    ));
  }, [activeLineIndex, lines.length]);

  const syncScroll = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    if (preRef.current) {
      preRef.current.scrollTop = ta.scrollTop;
      preRef.current.scrollLeft = ta.scrollLeft;
    }
    if (gutterRef.current) {
      gutterRef.current.scrollTop = ta.scrollTop;
    }
  }, []);

  const onScroll = useCallback(() => syncScroll(), [syncScroll]);

  const syncCursor = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    setCursorOffset(ta.selectionStart ?? 0);
  }, []);

  const onTextChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.currentTarget.value);
    },
    [onChange],
  );

  const applyValueAndSelection = useCallback(
    (next: string, selectionStart: number, selectionEnd: number) => {
      onChange(next);
      const ta = textareaRef.current;
      if (!ta) return;
      window.requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(selectionStart, selectionEnd);
        syncCursor();
        syncScroll();
      });
    },
    [onChange, syncCursor, syncScroll],
  );

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      if (disabled) return;
      const ta = textareaRef.current;
      if (!ta) return;

      if (e.key === "Tab") {
        e.preventDefault();
        const start = ta.selectionStart ?? 0;
        const end = ta.selectionEnd ?? 0;

        const isOutdent = e.shiftKey;
        const text = value;
        if (start === end) {
          if (isOutdent) {
            const lineStart = text.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
            const slice = text.slice(
              lineStart,
              Math.min(text.length, lineStart + indentText.length),
            );
            if (slice === indentText) {
              const next = text.slice(0, lineStart) + text.slice(lineStart + indentText.length);
              applyValueAndSelection(next, start - indentText.length, start - indentText.length);
            }
            return;
          }
          const next = text.slice(0, start) + indentText + text.slice(end);
          applyValueAndSelection(next, start + indentText.length, start + indentText.length);
          return;
        }

        const selectionStart = Math.min(start, end);
        const selectionEnd = Math.max(start, end);
        const before = text.slice(0, selectionStart);
        const after = text.slice(selectionEnd);

        const beforeLineStart = before.lastIndexOf("\n") + 1;
        const selectedWithLeading = text.slice(beforeLineStart, selectionEnd);
        const selectedLines = selectedWithLeading.split("\n");

        if (isOutdent) {
          let removedTotal = 0;
          const outdented = selectedLines.map((line) => {
            if (line.startsWith(indentText)) {
              removedTotal += indentText.length;
              return line.slice(indentText.length);
            }
            return line;
          });
          const nextText = text.slice(0, beforeLineStart) + outdented.join("\n") + after;
          const nextStart =
            selectionStart -
            Math.min(
              indentText.length,
              text.slice(beforeLineStart, selectionStart).startsWith(indentText)
                ? indentText.length
                : 0,
            );
          const nextEnd = selectionEnd - removedTotal;
          applyValueAndSelection(
            nextText,
            Math.max(beforeLineStart, nextStart),
            Math.max(beforeLineStart, nextEnd),
          );
          return;
        }

        const indented = selectedLines.map((line) => indentText + line);
        const nextText = text.slice(0, beforeLineStart) + indented.join("\n") + after;
        const added = indentText.length * selectedLines.length;
        applyValueAndSelection(nextText, selectionStart + indentText.length, selectionEnd + added);
        return;
      }

      if (e.key === "Enter") {
        const start = ta.selectionStart ?? 0;
        const end = ta.selectionEnd ?? 0;
        const text = value;
        const lineStart = text.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
        const linePrefix = text.slice(lineStart, start);
        const indentMatch = linePrefix.match(/^\s*/)?.[0] ?? "";
        if (!indentMatch) return;

        e.preventDefault();
        const next = text.slice(0, start) + "\n" + indentMatch + text.slice(end);
        const caret = start + 1 + indentMatch.length;
        applyValueAndSelection(next, caret, caret);
      }
    },
    [applyValueAndSelection, disabled, indentText, value],
  );

  const heightClass = heightClassName ?? "h-[60vh]";

  return (
    <div
      className={[
        // 编辑器就是一个大输入框：和其它输入框同一种阴影描边，聚焦时换成强调色描边，不画 border。
        "overflow-hidden rounded-2xl bg-field shadow-control transition-[box-shadow] focus-within:shadow-control-focus",
        heightClass,
      ].join(" ")}
    >
      <div className="flex h-full">
        <div
          ref={gutterRef}
          aria-hidden="true"
          className={[
            // 行号栏靠更深一档的淡底和代码区分开，不画竖线。
            "scrollbar-hidden w-14 shrink-0 overflow-y-scroll overflow-x-hidden bg-subtle px-3 py-3 text-right font-mono text-xs leading-6 text-ink-3",
            "pointer-events-none",
          ].join(" ")}
        >
          {lineNumbers}
        </div>

        <div className="relative min-w-0 flex-1">
          <pre
            ref={preRef}
            aria-hidden="true"
            className={[
              "scrollbar-hidden absolute inset-0 overflow-auto px-4 py-3 font-mono text-xs leading-6",
              "text-ink",
              "pointer-events-none",
            ].join(" ")}
          >
            {highlighted}
          </pre>

          <textarea
            ref={mergedRef}
            value={value}
            onChange={onTextChange}
            onScroll={onScroll}
            onKeyDown={onKeyDown}
            wrap="off"
            onKeyUp={() => {
              syncCursor();
              syncScroll();
            }}
            onMouseUp={() => {
              syncCursor();
              syncScroll();
            }}
            onFocus={() => {
              syncCursor();
              syncScroll();
            }}
            spellCheck={false}
            disabled={disabled}
            aria-label={ariaLabel}
            className={[
              "absolute inset-0 resize-none overflow-auto bg-transparent px-4 py-3 font-mono text-xs leading-6 outline-none",
              "[scrollbar-color:#C7C7C7_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-corner]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#C7C7C7] [&::-webkit-scrollbar-track]:bg-transparent",
              "text-transparent caret-ink",
              // 选区：简约风格跟随强调色，多彩风格是浅天蓝。
              "selection:bg-accent/20 dark:selection:bg-accent/30 colorful:selection:bg-sky-200/60 colorful:dark:selection:bg-white/15",
              disabled ? "cursor-not-allowed" : null,
            ]
              .filter(Boolean)
              .join(" ")}
          />
        </div>
      </div>
    </div>
  );
});
