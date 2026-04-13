import { createPortal } from "react-dom";
import { Suspense, lazy, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Bot,
  Brain,
  ChevronDown,
  ClipboardList,
  MessageSquare,
  Settings,
  Upload,
  User,
  Wrench,
  X,
  Zap,
} from "lucide-react";
const ANIMATION_MS = 180;
const LazyRichMarkdown = lazy(() =>
  import("./rendering-markdown").then((mod) => ({ default: mod.RichMarkdown })),
);

const ROLE_STYLES: Record<
  string,
  { labelKey: string; icon: ReactNode; border: string; headerBg: string; headerText: string }
> = {
  system: {
    labelKey: "log_content.role_system",
    icon: <Settings size={15} />,
    border: "border-violet-500/25 dark:border-violet-400/20",
    headerBg: "bg-violet-50 dark:bg-violet-500/10",
    headerText: "text-violet-700 dark:text-violet-300",
  },
  developer: {
    labelKey: "log_content.role_developer",
    icon: <Settings size={15} />,
    border: "border-violet-500/25 dark:border-violet-400/20",
    headerBg: "bg-violet-50 dark:bg-violet-500/10",
    headerText: "text-violet-700 dark:text-violet-300",
  },
  instructions: {
    labelKey: "log_content.role_instructions",
    icon: <ClipboardList size={15} />,
    border: "border-indigo-500/25 dark:border-indigo-400/20",
    headerBg: "bg-indigo-50 dark:bg-indigo-500/10",
    headerText: "text-indigo-700 dark:text-indigo-300",
  },
  user: {
    labelKey: "log_content.role_user",
    icon: <User size={15} />,
    border: "border-sky-500/25 dark:border-sky-400/20",
    headerBg: "bg-sky-50 dark:bg-sky-500/10",
    headerText: "text-sky-700 dark:text-sky-300",
  },
  assistant: {
    labelKey: "log_content.role_assistant",
    icon: <Bot size={15} />,
    border: "border-emerald-500/25 dark:border-emerald-400/20",
    headerBg: "bg-emerald-50 dark:bg-emerald-500/10",
    headerText: "text-emerald-700 dark:text-emerald-300",
  },
  tool: {
    labelKey: "log_content.role_tool",
    icon: <Wrench size={15} />,
    border: "border-amber-500/25 dark:border-amber-400/20",
    headerBg: "bg-amber-50 dark:bg-amber-500/10",
    headerText: "text-amber-700 dark:text-amber-300",
  },
  function_call: {
    labelKey: "log_content.role_function_call",
    icon: <Zap size={15} />,
    border: "border-orange-500/25 dark:border-orange-400/20",
    headerBg: "bg-orange-50 dark:bg-orange-500/10",
    headerText: "text-orange-700 dark:text-orange-300",
  },
  function_call_output: {
    labelKey: "log_content.role_function_return",
    icon: <Upload size={15} />,
    border: "border-teal-500/25 dark:border-teal-400/20",
    headerBg: "bg-teal-50 dark:bg-teal-500/10",
    headerText: "text-teal-700 dark:text-teal-300",
  },
  thinking: {
    labelKey: "log_content.role_thinking",
    icon: <Brain size={15} />,
    border: "border-purple-500/25 dark:border-purple-400/20",
    headerBg: "bg-purple-50 dark:bg-purple-500/10",
    headerText: "text-purple-700 dark:text-purple-300",
  },
  tool_use: {
    labelKey: "log_content.role_tool_use",
    icon: <Wrench size={15} />,
    border: "border-amber-500/25 dark:border-amber-400/20",
    headerBg: "bg-amber-50 dark:bg-amber-500/10",
    headerText: "text-amber-700 dark:text-amber-300",
  },
};

const DEFAULT_STYLE = {
  labelKey: "log_content.role_message",
  icon: <MessageSquare size={15} />,
  border: "border-slate-300/50 dark:border-neutral-700",
  headerBg: "bg-slate-50 dark:bg-neutral-800/60",
  headerText: "text-slate-700 dark:text-slate-300",
};

function cleanContent(raw: string): string {
  return raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

const PROSE_CLASSES = `prose prose-sm dark:prose-invert max-w-none break-words leading-relaxed
  prose-headings:mt-4 prose-headings:mb-2 prose-headings:font-semibold
  prose-h1:text-lg prose-h2:text-base prose-h3:text-sm
  prose-p:my-2 prose-p:leading-relaxed
  prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5
  prose-code:rounded-md prose-code:bg-slate-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[13px] prose-code:font-mono prose-code:text-slate-700 prose-code:before:content-none prose-code:after:content-none
  dark:prose-code:bg-neutral-800 dark:prose-code:text-slate-300
  prose-pre:rounded-lg prose-pre:bg-slate-900 prose-pre:text-xs dark:prose-pre:bg-neutral-900
  prose-strong:font-semibold
  prose-blockquote:border-l-2 prose-blockquote:border-slate-300 dark:prose-blockquote:border-neutral-600
  prose-table:border-collapse prose-table:text-sm prose-table:w-full
  prose-th:border prose-th:border-slate-300 prose-th:bg-slate-100 prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:font-semibold
  dark:prose-th:border-neutral-700 dark:prose-th:bg-neutral-800
  prose-td:border prose-td:border-slate-300 prose-td:px-3 prose-td:py-2
  dark:prose-td:border-neutral-700`;

function MarkdownBlock({ text }: { text: string }) {
  return (
    <Suspense fallback={<PlainPre text={text} />}>
      <LazyRichMarkdown proseClasses={PROSE_CLASSES} text={text} />
    </Suspense>
  );
}

function TagBadge({ name, content }: { name: string; content: string }) {
  return (
    <div className="flex items-baseline gap-2 rounded-lg bg-slate-50 px-3 py-2 dark:bg-neutral-800/50">
      <code className="shrink-0 rounded bg-slate-200/70 px-1.5 py-0.5 font-mono text-[11px] text-slate-500 dark:bg-neutral-700 dark:text-slate-400">
        {name}
      </code>
      <span className="text-sm text-slate-700 dark:text-slate-200">{content}</span>
    </div>
  );
}

function TagSection({
  name,
  content,
  defaultExpanded = false,
}: {
  name: string;
  content: string;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200/80 dark:border-neutral-700/60">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center gap-2 bg-slate-50 px-3.5 py-2 text-left text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 dark:bg-neutral-800/50 dark:text-slate-400 dark:hover:bg-neutral-800/80"
      >
        <code className="shrink-0 rounded bg-slate-200/70 px-1.5 py-0.5 font-mono text-[11px] text-slate-600 dark:bg-neutral-700 dark:text-slate-300">
          {name}
        </code>
        <span className="flex-1" />
        <ChevronDown
          size={14}
          className={`shrink-0 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
        />
      </button>
      {expanded && (
        <div className="border-t border-inherit px-3.5 py-3 text-sm text-slate-800 dark:text-slate-200">
          <MarkdownContent content={content} />
        </div>
      )}
    </div>
  );
}

type Segment = { type: "text"; content: string } | { type: "tag"; name: string; content: string };
const LT_PLACEHOLDER = "\x00LT\x00";
const GT_PLACEHOLDER = "\x00GT\x00";

function maskBacktickRegions(raw: string): string {
  let result = raw.replace(/```[\s\S]*?```/g, (m) =>
    m.replace(/</g, LT_PLACEHOLDER).replace(/>/g, GT_PLACEHOLDER),
  );
  result = result.replace(/`[^`]+`/g, (m) =>
    m.replace(/</g, LT_PLACEHOLDER).replace(/>/g, GT_PLACEHOLDER),
  );
  return result;
}

function unmask(s: string): string {
  return s.replaceAll(LT_PLACEHOLDER, "<").replaceAll(GT_PLACEHOLDER, ">");
}

function parseContentSegments(raw: string): Segment[] {
  const masked = maskBacktickRegions(raw);
  const segments: Segment[] = [];
  let remaining = masked;

  while (remaining.length > 0) {
    const openMatch = remaining.match(/<([\w][\w\s-]*?)>\s*\n?/);
    if (!openMatch || openMatch.index === undefined) {
      const text = unmask(remaining).trim();
      if (text) segments.push({ type: "text", content: text });
      break;
    }

    const tagName = openMatch[1].trim();
    const openEnd = openMatch.index + openMatch[0].length;

    if (openMatch.index > 0) {
      const text = unmask(remaining.slice(0, openMatch.index)).trim();
      if (text) segments.push({ type: "text", content: text });
    }

    const closePattern = `</${tagName}>`;
    const closePatternAlt = `</ ${tagName}>`;
    const lastCloseIdx = Math.max(
      remaining.lastIndexOf(closePattern),
      remaining.lastIndexOf(closePatternAlt),
    );

    if (lastCloseIdx > openEnd) {
      const innerContent = unmask(remaining.slice(openEnd, lastCloseIdx)).trim();
      segments.push({ type: "tag", name: tagName, content: innerContent });
      remaining = remaining.slice(lastCloseIdx + closePattern.length);
    } else {
      remaining = remaining.slice(openEnd);
    }
  }

  return segments;
}

function isShortContent(content: string): boolean {
  const lines = content.split("\n").filter((l) => l.trim().length > 0);
  return lines.length <= 2 && content.length <= 150;
}

function mayContainXmlLikeTags(raw: string): boolean {
  return raw.includes("<");
}

function MarkdownContent({ content }: { content: string }) {
  const cleaned = useMemo(() => cleanContent(content), [content]);
  const segments = useMemo(
    () => (mayContainXmlLikeTags(cleaned) ? parseContentSegments(cleaned) : null),
    [cleaned],
  );

  if (!segments) return <MarkdownBlock text={cleaned} />;
  if (segments.length <= 1 && (segments.length === 0 || segments[0].type === "text")) {
    return <MarkdownBlock text={cleaned} />;
  }

  return (
    <div className="space-y-2">
      {segments.map((seg, idx) => {
        if (seg.type === "text") {
          return <MarkdownBlock key={idx} text={seg.content} />;
        }
        if (isShortContent(seg.content)) {
          return <TagBadge key={idx} name={seg.name} content={seg.content} />;
        }
        return <TagSection key={idx} name={seg.name} content={seg.content} />;
      })}
    </div>
  );
}

export function MessageBlock({
  role,
  content,
  defaultExpanded = true,
}: {
  role: string;
  content: string;
  defaultExpanded?: boolean;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const style = ROLE_STYLES[role] || DEFAULT_STYLE;

  return (
    <div
      className={`overflow-hidden rounded-xl border ${style.border} transition-colors`}
      style={{ contentVisibility: "auto", containIntrinsicSize: "240px" }}
    >
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className={`flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-semibold transition-colors ${style.headerBg} ${style.headerText} hover:brightness-95 dark:hover:brightness-110`}
      >
        <span className="shrink-0 flex items-center">{style.icon}</span>
        <span className="flex-1 truncate">{t(style.labelKey)}</span>
        <ChevronDown
          size={16}
          className={`shrink-0 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
        />
      </button>
      {expanded && (
        <div className="border-t border-inherit px-4 py-3 text-sm text-slate-800 dark:text-slate-200">
          <MarkdownContent content={content} />
        </div>
      )}
    </div>
  );
}

export function PlainPre({ text }: { text: string }) {
  return (
    <pre
      className="whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed font-mono dark:border-neutral-800 dark:bg-neutral-900 dark:text-slate-200"
      style={{ contentVisibility: "auto", containIntrinsicSize: "800px" }}
    >
      {text}
    </pre>
  );
}

export function ContentModal({
  open,
  model,
  onClose,
  children,
  tabs,
}: {
  open: boolean;
  model: string;
  onClose: () => void;
  children: React.ReactNode;
  tabs: React.ReactNode;
}) {
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const raf = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(raf);
    }
    setVisible(false);
    const timer = setTimeout(() => setMounted(false), ANIMATION_MS);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, open]);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <button
        type="button"
        onClick={() => open && onClose()}
        aria-label={t("common.close")}
        className={[
          "absolute inset-0 cursor-default bg-slate-900/40 backdrop-blur-sm dark:bg-black/50",
          "transition-opacity duration-200",
          visible ? "opacity-100" : "opacity-0",
        ].join(" ")}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={[
          "relative z-10 flex w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-neutral-800 dark:bg-neutral-950",
          "max-h-[85vh] transition-all duration-200",
          visible ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-2 scale-95",
        ].join(" ")}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-neutral-800">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold tracking-tight text-slate-900 dark:text-white">
              {t("log_content.message_content")}
              {model ? ` · ${model}` : ""}
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-white/50">{t("log_content.title")}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={!open}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white/70 text-slate-700 shadow-sm transition hover:bg-white dark:border-neutral-800 dark:bg-neutral-950/60 dark:text-slate-200 dark:hover:bg-neutral-950/80"
            aria-label={t("common.close")}
          >
            <X size={16} />
          </button>
        </div>
        <div className="shrink-0 border-b border-slate-100 bg-white px-5 py-2 dark:border-neutral-800/60 dark:bg-neutral-950">
          {tabs}
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
