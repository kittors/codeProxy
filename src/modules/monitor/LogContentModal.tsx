import { useCallback, useEffect, useState, type ReactNode } from "react";
import { usageApi } from "@/lib/http/apis";
import { createPortal } from "react-dom";
import {
    Loader2,
    FileInput,
    FileOutput,
    ChevronDown,
    X,
    Settings,
    ClipboardList,
    User,
    Bot,
    Wrench,
    Zap,
    Upload,
    MessageSquare,
} from "lucide-react";
import Markdown from "react-markdown";

/* ========================================================================== */
/*  Types                                                                     */
/* ========================================================================== */

interface LogContentModalProps {
    open: boolean;
    logId: number | null;
    initialTab?: "input" | "output";
    onClose: () => void;
}

type Msg = { role: string; content: string };

/* ========================================================================== */
/*  Role config                                                               */
/* ========================================================================== */

const ROLE_STYLES: Record<
    string,
    { label: string; icon: ReactNode; border: string; headerBg: string; headerText: string }
> = {
    system: {
        label: "系统提示词",
        icon: <Settings size={15} />,
        border: "border-violet-500/25 dark:border-violet-400/20",
        headerBg: "bg-violet-50 dark:bg-violet-500/10",
        headerText: "text-violet-700 dark:text-violet-300",
    },
    developer: {
        label: "开发者指令",
        icon: <Settings size={15} />,
        border: "border-violet-500/25 dark:border-violet-400/20",
        headerBg: "bg-violet-50 dark:bg-violet-500/10",
        headerText: "text-violet-700 dark:text-violet-300",
    },
    instructions: {
        label: "指令 (Instructions)",
        icon: <ClipboardList size={15} />,
        border: "border-indigo-500/25 dark:border-indigo-400/20",
        headerBg: "bg-indigo-50 dark:bg-indigo-500/10",
        headerText: "text-indigo-700 dark:text-indigo-300",
    },
    user: {
        label: "用户消息",
        icon: <User size={15} />,
        border: "border-sky-500/25 dark:border-sky-400/20",
        headerBg: "bg-sky-50 dark:bg-sky-500/10",
        headerText: "text-sky-700 dark:text-sky-300",
    },
    assistant: {
        label: "模型回复",
        icon: <Bot size={15} />,
        border: "border-emerald-500/25 dark:border-emerald-400/20",
        headerBg: "bg-emerald-50 dark:bg-emerald-500/10",
        headerText: "text-emerald-700 dark:text-emerald-300",
    },
    tool: {
        label: "工具结果",
        icon: <Wrench size={15} />,
        border: "border-amber-500/25 dark:border-amber-400/20",
        headerBg: "bg-amber-50 dark:bg-amber-500/10",
        headerText: "text-amber-700 dark:text-amber-300",
    },
    function_call: {
        label: "函数调用",
        icon: <Zap size={15} />,
        border: "border-orange-500/25 dark:border-orange-400/20",
        headerBg: "bg-orange-50 dark:bg-orange-500/10",
        headerText: "text-orange-700 dark:text-orange-300",
    },
    function_call_output: {
        label: "函数返回",
        icon: <Upload size={15} />,
        border: "border-teal-500/25 dark:border-teal-400/20",
        headerBg: "bg-teal-50 dark:bg-teal-500/10",
        headerText: "text-teal-700 dark:text-teal-300",
    },
};

const DEFAULT_STYLE = {
    label: "消息",
    icon: <MessageSquare size={15} />,
    border: "border-slate-300/50 dark:border-neutral-700",
    headerBg: "bg-slate-50 dark:bg-neutral-800/60",
    headerText: "text-slate-700 dark:text-slate-300",
};

/* ========================================================================== */
/*  MarkdownContent                                                           */
/* ========================================================================== */

/** Clean content: strip \r, normalize whitespace */
function cleanContent(raw: string): string {
    return raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/* ---- Prose wrapper for Markdown rendering ---- */
const PROSE_CLASSES = `prose prose-sm dark:prose-invert max-w-none break-words leading-relaxed
  prose-headings:mt-4 prose-headings:mb-2 prose-headings:font-semibold
  prose-h1:text-lg prose-h2:text-base prose-h3:text-sm
  prose-p:my-2 prose-p:leading-relaxed
  prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5
  prose-code:rounded-md prose-code:bg-slate-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[13px] prose-code:font-mono prose-code:text-slate-700 prose-code:before:content-none prose-code:after:content-none
  dark:prose-code:bg-neutral-800 dark:prose-code:text-slate-300
  prose-pre:rounded-lg prose-pre:bg-slate-900 prose-pre:text-xs dark:prose-pre:bg-neutral-900
  prose-strong:font-semibold
  prose-blockquote:border-l-2 prose-blockquote:border-slate-300 dark:prose-blockquote:border-neutral-600`;

function MarkdownBlock({ text }: { text: string }) {
    return (
        <div className={PROSE_CLASSES}>
            <Markdown>{text}</Markdown>
        </div>
    );
}

/* ---- Inline badge for short XML-tagged values ---- */

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

/* ---- Collapsible section for long XML-like tagged blocks ---- */

function TagSection({ name, content, defaultExpanded = false }: { name: string; content: string; defaultExpanded?: boolean }) {
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

/* ---- Parse content into segments: plain text + tagged blocks ---- */

type Segment = { type: "text"; content: string } | { type: "tag"; name: string; content: string };

// Sentinel placeholders for angle brackets inside backtick code spans
const LT_PLACEHOLDER = "\x00LT\x00";
const GT_PLACEHOLDER = "\x00GT\x00";

/** Mask angle brackets inside backtick code spans so they aren't parsed as tags */
function maskBacktickRegions(raw: string): string {
    // Mask fenced code blocks (```)
    let result = raw.replace(/```[\s\S]*?```/g, (m) =>
        m.replace(/</g, LT_PLACEHOLDER).replace(/>/g, GT_PLACEHOLDER),
    );
    // Mask inline code spans (`)
    result = result.replace(/`[^`]+`/g, (m) =>
        m.replace(/</g, LT_PLACEHOLDER).replace(/>/g, GT_PLACEHOLDER),
    );
    return result;
}

/** Restore masked angle brackets back to real characters */
function unmask(s: string): string {
    return s.replaceAll(LT_PLACEHOLDER, "<").replaceAll(GT_PLACEHOLDER, ">");
}

/**
 * Find matching XML-like tags. Skips tags inside backtick code spans.
 * Uses greedy (lastIndexOf) closing-tag search to handle inner references.
 */
function parseContentSegments(raw: string): Segment[] {
    const masked = maskBacktickRegions(raw);
    const segments: Segment[] = [];
    let remaining = masked;

    while (remaining.length > 0) {
        // Find the next opening tag
        const openMatch = remaining.match(/<([\w][\w\s]*?)>\s*\n?/);
        if (!openMatch || openMatch.index === undefined) {
            const text = unmask(remaining).trim();
            if (text) segments.push({ type: "text", content: text });
            break;
        }

        const tagName = openMatch[1].trim();
        const openEnd = openMatch.index + openMatch[0].length;

        // Text before this tag
        if (openMatch.index > 0) {
            const text = unmask(remaining.slice(0, openMatch.index)).trim();
            if (text) segments.push({ type: "text", content: text });
        }

        // Find the LAST occurrence of the closing tag (greedy strategy)
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
            // No valid closing tag — treat the opening tag as plain text
            const text = unmask(remaining.slice(0, openEnd)).trim();
            if (text) segments.push({ type: "text", content: text });
            remaining = remaining.slice(openEnd);
        }
    }

    return segments;
}

/** Check if content is "short" (single value, not worth collapsing) */
function isShortContent(content: string): boolean {
    const lines = content.split("\n").filter((l) => l.trim().length > 0);
    return lines.length <= 2 && content.length <= 150;
}

/* ---- MarkdownContent: auto-detects XML tags and renders appropriately ---- */

function MarkdownContent({ content }: { content: string }) {
    const cleaned = cleanContent(content);
    const segments = parseContentSegments(cleaned);

    // No tags found — render as plain markdown
    if (segments.length <= 1 && (segments.length === 0 || segments[0].type === "text")) {
        return <MarkdownBlock text={cleaned} />;
    }

    return (
        <div className="space-y-2">
            {segments.map((seg, idx) => {
                if (seg.type === "text") {
                    return <MarkdownBlock key={idx} text={seg.content} />;
                }
                // Short tags → colored badge
                if (isShortContent(seg.content)) {
                    return <TagBadge key={idx} name={seg.name} content={seg.content} />;
                }
                // Long tags → collapsible section
                return <TagSection key={idx} name={seg.name} content={seg.content} />;
            })}
        </div>
    );
}

/* ========================================================================== */
/*  MessageBlock: collapsible, with Markdown rendering                        */
/* ========================================================================== */

function MessageBlock({ role, content, defaultExpanded = true }: { role: string; content: string; defaultExpanded?: boolean }) {
    const [expanded, setExpanded] = useState(defaultExpanded);
    const style = ROLE_STYLES[role] || DEFAULT_STYLE;

    return (
        <div className={`overflow-hidden rounded-xl border ${style.border} transition-colors`}>
            {/* Header — always visible, acts as toggle */}
            <button
                type="button"
                onClick={() => setExpanded((prev) => !prev)}
                className={`flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-semibold transition-colors ${style.headerBg} ${style.headerText} hover:brightness-95 dark:hover:brightness-110`}
            >
                <span className="shrink-0 flex items-center">{style.icon}</span>
                <span className="flex-1 truncate">{style.label}</span>
                <ChevronDown
                    size={16}
                    className={`shrink-0 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
                />
            </button>
            {/* Body — collapsible */}
            {expanded && (
                <div className="border-t border-inherit px-4 py-3 text-sm text-slate-800 dark:text-slate-200">
                    <MarkdownContent content={content} />
                </div>
            )}
        </div>
    );
}

/* ========================================================================== */
/*  Content extraction helpers                                                */
/* ========================================================================== */

function extractText(content: unknown): string {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
        return content
            .map((p: Record<string, unknown>) => {
                if (typeof p.text === "string") return p.text;
                if (typeof p.content === "string") return p.content;
                return "";
            })
            .filter(Boolean)
            .join("\n");
    }
    if (content && typeof content === "object") return JSON.stringify(content, null, 2);
    return String(content ?? "");
}

/* ========================================================================== */
/*  Input parsers                                                             */
/* ========================================================================== */

function parseOpenAIMessages(data: Record<string, unknown>): Msg[] | null {
    const msgs = data.messages;
    if (!Array.isArray(msgs)) return null;
    const result = msgs
        .filter((m: Record<string, unknown>) => m.role && m.content !== undefined)
        .map((m: Record<string, unknown>) => ({
            role: String(m.role),
            content: extractText(m.content),
        }));
    return result.length > 0 ? result : null;
}

function parseCodexInput(data: Record<string, unknown>): Msg[] | null {
    const input = data.input;
    if (!Array.isArray(input)) return null;

    const result: Msg[] = [];
    if (typeof data.instructions === "string" && data.instructions.trim()) {
        result.push({ role: "instructions", content: data.instructions.trim() });
    }

    for (const item of input as Record<string, unknown>[]) {
        const itemType = String(item.type || "");
        if (itemType === "message" || (!itemType && item.role && item.content !== undefined)) {
            const role = String(item.role || "user");
            const text = extractText(item.content);
            if (text) result.push({ role, content: text });
        } else if (itemType === "function_call") {
            const name = String(item.name || "");
            const args = typeof item.arguments === "string" ? item.arguments : JSON.stringify(item.arguments ?? "");
            result.push({ role: "function_call", content: `${name}(${args})` });
        } else if (itemType === "function_call_output") {
            const output = typeof item.output === "string" ? item.output : JSON.stringify(item.output ?? "");
            result.push({ role: "function_call_output", content: output });
        } else {
            const text = extractText(item.content ?? item.text ?? "");
            if (text) result.push({ role: String(item.role || itemType || "unknown"), content: text });
        }
    }

    return result.length > 0 ? result : null;
}

function decodeEscaped(s: string): string {
    return s
        .replace(/\\r\\n/g, "\n")
        .replace(/\\r/g, "")
        .replace(/\\n/g, "\n")
        .replace(/\\t/g, "\t")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
}

function parseInputMessages(raw: string): Msg[] | null {
    // 1. Try valid JSON
    try {
        const data = JSON.parse(raw);
        const codex = parseCodexInput(data);
        if (codex) return codex;
        const openai = parseOpenAIMessages(data);
        if (openai) return openai;
        return null;
    } catch {
        // JSON truncated — recovery below
    }

    // 2. Recovery for truncated JSON
    const result: Msg[] = [];

    const instrMatch = raw.match(/"instructions"\s*:\s*"((?:[^"\\]|\\.)*)"/s);
    if (instrMatch) {
        result.push({ role: "instructions", content: decodeEscaped(instrMatch[1]) });
    }

    const inputMatch = raw.match(/"input"\s*:\s*\[(.+)/s);
    if (inputMatch) {
        const textRegex = /"type"\s*:\s*"input_text"\s*,\s*"text"\s*:\s*"((?:[^"\\]|\\.)*)"/gs;
        let match;
        const texts: string[] = [];
        while ((match = textRegex.exec(inputMatch[1])) !== null) {
            texts.push(decodeEscaped(match[1]));
        }
        if (texts.length > 0) result.push({ role: "user", content: texts.join("\n\n") });
    }

    if (result.length === 0) {
        const messagesMatch = raw.match(/"messages"\s*:\s*\[(.+)/s);
        if (messagesMatch) {
            const rcRegex = /"role"\s*:\s*"(\w+)"\s*,\s*"content"\s*:\s*"((?:[^"\\]|\\.)*)"/gs;
            let match;
            while ((match = rcRegex.exec(messagesMatch[1])) !== null) {
                result.push({ role: match[1], content: decodeEscaped(match[2]) });
            }
        }
    }

    if (result.length > 0) {
        result.push({ role: "system", content: "⚠️ 注意：原始内容因超过大小限制被截断，部分消息可能不完整。" });
        return result;
    }

    return null;
}

/* ========================================================================== */
/*  Output parsers                                                            */
/* ========================================================================== */

function parseSSEOutput(raw: string): string | null {
    const lines = raw.split("\n");
    const textParts: string[] = [];

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const jsonStr = trimmed.slice(5).trim();
        if (jsonStr === "[DONE]") continue;

        try {
            const data = JSON.parse(jsonStr);
            if (data.choices?.[0]?.delta?.content) { textParts.push(data.choices[0].delta.content); continue; }
            if (data.type === "response.output_text.delta" && typeof data.delta === "string") { textParts.push(data.delta); continue; }
            if (data.type === "content_block_delta" && data.delta?.text) { textParts.push(data.delta.text); continue; }
            if (data.type === "response.completed" && data.response?.output) {
                const outs = data.response.output;
                if (Array.isArray(outs) && textParts.length === 0) {
                    for (const o of outs) {
                        if (o.type === "message" && Array.isArray(o.content)) {
                            for (const p of o.content) {
                                if (typeof p.text === "string") textParts.push(p.text);
                            }
                        }
                    }
                }
            }
        } catch { /* skip */ }
    }
    return textParts.length > 0 ? textParts.join("") : null;
}

function parseNonStreamOutput(raw: string): string | null {
    try {
        const data = JSON.parse(raw);
        if (data.choices?.[0]?.message?.content) return extractText(data.choices[0].message.content);
        if (Array.isArray(data.content)) return extractText(data.content);
        const output = data.response?.output || data.output;
        if (Array.isArray(output)) {
            const texts: string[] = [];
            for (const item of output) {
                if (item.type === "message" && Array.isArray(item.content)) {
                    for (const p of item.content) { if (typeof p.text === "string") texts.push(p.text); }
                }
            }
            if (texts.length > 0) return texts.join("\n");
        }
        return null;
    } catch { return null; }
}

function parseOutputMessages(raw: string): string | null {
    if (raw.includes("data:")) { const sse = parseSSEOutput(raw); if (sse) return sse; }
    return parseNonStreamOutput(raw);
}

/* ========================================================================== */
/*  Modal (self-contained for layout control)                                 */
/* ========================================================================== */

const ANIMATION_MS = 180;

function ContentModal({
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
    const [mounted, setMounted] = useState(open);
    const [visible, setVisible] = useState(open);

    useEffect(() => {
        if (open) {
            setMounted(true);
            const raf = requestAnimationFrame(() => setVisible(true));
            return () => cancelAnimationFrame(raf);
        }
        setVisible(false);
        const t = setTimeout(() => setMounted(false), ANIMATION_MS);
        return () => clearTimeout(t);
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose, open]);

    if (!mounted) return null;

    return createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            {/* Backdrop */}
            <button
                type="button"
                onClick={() => open && onClose()}
                aria-label="关闭弹窗"
                className={[
                    "absolute inset-0 cursor-default bg-slate-900/40 backdrop-blur-sm dark:bg-black/50",
                    "transition-opacity duration-200",
                    visible ? "opacity-100" : "opacity-0",
                ].join(" ")}
            />

            {/* Dialog */}
            <div
                role="dialog"
                aria-modal="true"
                className={[
                    "relative z-10 flex w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-neutral-800 dark:bg-neutral-950",
                    "max-h-[85vh] transition-all duration-200",
                    visible ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-2 scale-95",
                ].join(" ")}
            >
                {/* Header */}
                <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-neutral-800">
                    <div className="min-w-0">
                        <h2 className="truncate text-base font-semibold tracking-tight text-slate-900 dark:text-white">
                            消息内容{model ? ` · ${model}` : ""}
                        </h2>
                        <p className="mt-1 text-sm text-slate-500 dark:text-white/50">请求/响应的消息详情</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={!open}
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white/70 text-slate-700 shadow-sm transition hover:bg-white dark:border-neutral-800 dark:bg-neutral-950/60 dark:text-slate-200 dark:hover:bg-neutral-950/80"
                        aria-label="关闭"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Sticky tabs */}
                <div className="shrink-0 border-b border-slate-100 bg-white px-5 py-2 dark:border-neutral-800/60 dark:bg-neutral-950">
                    {tabs}
                </div>

                {/* Scrollable content */}
                <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">
                    {children}
                </div>
            </div>
        </div>,
        document.body,
    );
}

/* ========================================================================== */
/*  LogContentModal                                                           */
/* ========================================================================== */

export function LogContentModal({ open, logId, initialTab = "input", onClose }: LogContentModalProps) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [inputContent, setInputContent] = useState("");
    const [outputContent, setOutputContent] = useState("");
    const [model, setModel] = useState("");
    const [activeTab, setActiveTab] = useState<"input" | "output">(initialTab);

    useEffect(() => { setActiveTab(initialTab); }, [initialTab, logId]);

    const fetchContent = useCallback(async (id: number) => {
        setLoading(true);
        setError(null);
        try {
            const result = await usageApi.getLogContent(id);
            setInputContent(result.input_content || "");
            setOutputContent(result.output_content || "");
            setModel(result.model || "");
        } catch (err) {
            setError(err instanceof Error ? err.message : "加载失败");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { if (open && logId) fetchContent(logId); }, [open, logId, fetchContent]);

    /* ---- Tab bar ---- */
    const tabBar = (
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-neutral-900">
            {(
                [
                    { key: "input" as const, label: "输入消息", Icon: FileInput },
                    { key: "output" as const, label: "输出内容", Icon: FileOutput },
                ] as const
            ).map(({ key, label, Icon }) => (
                <button
                    key={key}
                    type="button"
                    onClick={() => setActiveTab(key)}
                    className={[
                        "flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all",
                        activeTab === key
                            ? "bg-white text-slate-900 shadow-sm dark:bg-neutral-800 dark:text-white"
                            : "text-slate-500 hover:text-slate-700 dark:text-white/40 dark:hover:text-white/60",
                    ].join(" ")}
                >
                    <Icon size={15} />
                    {label}
                </button>
            ))}
        </div>
    );

    /* ---- Render input ---- */
    const renderInput = () => {
        if (!inputContent) {
            return (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400 dark:text-white/25">
                    <FileInput size={40} className="mb-3 opacity-40" />
                    <p className="text-sm">暂无输入内容记录</p>
                </div>
            );
        }
        const messages = parseInputMessages(inputContent);
        if (messages && messages.length > 0) {
            return (
                <div className="space-y-3">
                    {messages.map((msg, idx) => (
                        <MessageBlock key={idx} role={msg.role} content={msg.content} />
                    ))}
                </div>
            );
        }
        // Fallback
        try {
            const fmt = JSON.stringify(JSON.parse(inputContent), null, 2);
            return <pre className="whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed dark:border-neutral-800 dark:bg-neutral-900 dark:text-slate-200">{fmt}</pre>;
        } catch {
            return <pre className="whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed dark:border-neutral-800 dark:bg-neutral-900 dark:text-slate-200">{inputContent}</pre>;
        }
    };

    /* ---- Render output ---- */
    const renderOutput = () => {
        if (!outputContent) {
            return (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400 dark:text-white/25">
                    <FileOutput size={40} className="mb-3 opacity-40" />
                    <p className="text-sm">暂无输出内容记录</p>
                </div>
            );
        }
        const text = parseOutputMessages(outputContent);
        if (text) {
            return (
                <div className="space-y-3">
                    <MessageBlock role="assistant" content={text} />
                </div>
            );
        }
        try {
            const fmt = JSON.stringify(JSON.parse(outputContent), null, 2);
            return <pre className="whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed dark:border-neutral-800 dark:bg-neutral-900 dark:text-slate-200">{fmt}</pre>;
        } catch {
            return <pre className="whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed dark:border-neutral-800 dark:bg-neutral-900 dark:text-slate-200">{outputContent}</pre>;
        }
    };

    return (
        <ContentModal open={open} model={model} onClose={onClose} tabs={tabBar}>
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 size={24} className="animate-spin text-slate-400 dark:text-white/40" />
                    <span className="ml-3 text-sm text-slate-500 dark:text-white/50">加载中…</span>
                </div>
            ) : error ? (
                <div className="flex flex-col items-center justify-center py-16">
                    <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
                </div>
            ) : (
                <div className="min-h-[200px]">
                    {activeTab === "input" ? renderInput() : renderOutput()}
                </div>
            )}
        </ContentModal>
    );
}
