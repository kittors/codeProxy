import { Suspense, lazy, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Bot,
  Brain,
  ChevronDown,
  ClipboardList,
  MessageSquare,
  ScrollText,
  Settings,
  Upload,
  User,
  Wrench,
  Zap,
} from "lucide-react";
import { Modal, surface } from "@code-proxy/ui";

const LARGE_TEXT_CHAR_THRESHOLD = 50_000;
const LARGE_TEXT_LINE_THRESHOLD = 400;
const VIRTUAL_TEXT_CHUNK_SIZE = 4_000;
const VIRTUAL_MESSAGE_COUNT_THRESHOLD = 80;
const VIRTUAL_MESSAGE_CONTENT_THRESHOLD = 48_000;
const VIRTUAL_MESSAGE_ITEM_CONTENT_THRESHOLD = 18_000;
const VIRTUAL_MESSAGE_OVERSCAN = 12;

type LogMessage = { role: string; content: string };

const LazyRichMarkdown = lazy(() =>
  import("./rendering-markdown").then((mod) => ({ default: mod.RichMarkdown })),
);

/**
 * 角色色（多彩风格）：标题行的淡底与文字色；标题行里的图标和展开箭头基础类是弱化墨色，
 * 多彩时跟着角色色走。悬停时基础类的 hover:bg-hover 会盖掉淡底，所以多彩下悬停重申同一层淡底、
 * 只压暗一点。
 */
type RoleTint = { header: string; icon: string };

const ROLE_TINT_HOVER = "colorful:hover:brightness-95 colorful:dark:hover:brightness-110";

const ROLE_TINTS = {
  sky: {
    header:
      "colorful:bg-sky-50 colorful:text-sky-700 colorful:hover:bg-sky-50 colorful:dark:bg-sky-500/10 colorful:dark:text-sky-300 colorful:dark:hover:bg-sky-500/10",
    icon: "colorful:text-sky-700 colorful:dark:text-sky-300",
  },
  emerald: {
    header:
      "colorful:bg-emerald-50 colorful:text-emerald-700 colorful:hover:bg-emerald-50 colorful:dark:bg-emerald-500/10 colorful:dark:text-emerald-300 colorful:dark:hover:bg-emerald-500/10",
    icon: "colorful:text-emerald-700 colorful:dark:text-emerald-300",
  },
  amber: {
    header:
      "colorful:bg-amber-50 colorful:text-amber-700 colorful:hover:bg-amber-50 colorful:dark:bg-amber-500/10 colorful:dark:text-amber-300 colorful:dark:hover:bg-amber-500/10",
    icon: "colorful:text-amber-700 colorful:dark:text-amber-300",
  },
  orange: {
    header:
      "colorful:bg-orange-50 colorful:text-orange-700 colorful:hover:bg-orange-50 colorful:dark:bg-orange-500/10 colorful:dark:text-orange-300 colorful:dark:hover:bg-orange-500/10",
    icon: "colorful:text-orange-700 colorful:dark:text-orange-300",
  },
  teal: {
    header:
      "colorful:bg-teal-50 colorful:text-teal-700 colorful:hover:bg-teal-50 colorful:dark:bg-teal-500/10 colorful:dark:text-teal-300 colorful:dark:hover:bg-teal-500/10",
    icon: "colorful:text-teal-700 colorful:dark:text-teal-300",
  },
} satisfies Record<string, RoleTint>;

/**
 * 消息角色的基础形态（简约风格）只靠图标和名称区分。多彩风格下按角色给标题行上色：
 * 用户天蓝、助手绿、工具琥珀、函数调用橙、函数返回青；系统 / 开发者 / 指令 / 思考保持中性。
 */
const ROLE_STYLES: Record<string, { labelKey: string; icon: ReactNode; tint?: RoleTint }> = {
  system: { labelKey: "log_content.role_system", icon: <Settings size={15} /> },
  developer: { labelKey: "log_content.role_developer", icon: <Settings size={15} /> },
  instructions: { labelKey: "log_content.role_instructions", icon: <ClipboardList size={15} /> },
  user: { labelKey: "log_content.role_user", icon: <User size={15} />, tint: ROLE_TINTS.sky },
  assistant: {
    labelKey: "log_content.role_assistant",
    icon: <Bot size={15} />,
    tint: ROLE_TINTS.emerald,
  },
  tool: { labelKey: "log_content.role_tool", icon: <Wrench size={15} />, tint: ROLE_TINTS.amber },
  function_call: {
    labelKey: "log_content.role_function_call",
    icon: <Zap size={15} />,
    tint: ROLE_TINTS.orange,
  },
  function_call_output: {
    labelKey: "log_content.role_function_return",
    icon: <Upload size={15} />,
    tint: ROLE_TINTS.teal,
  },
  thinking: { labelKey: "log_content.role_thinking", icon: <Brain size={15} /> },
  tool_use: {
    labelKey: "log_content.role_tool_use",
    icon: <Wrench size={15} />,
    tint: ROLE_TINTS.amber,
  },
};

const DEFAULT_STYLE: { labelKey: string; icon: ReactNode; tint?: RoleTint } = {
  labelKey: "log_content.role_message",
  icon: <MessageSquare size={15} />,
};

function cleanContent(raw: string): string {
  return raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

const PROSE_CLASSES = `prose prose-sm dark:prose-invert max-w-none break-words leading-relaxed
  prose-headings:mt-4 prose-headings:mb-2 prose-headings:font-semibold
  prose-h1:text-lg prose-h2:text-base prose-h3:text-sm
  prose-p:my-2 prose-p:leading-relaxed
  prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5
  prose-code:rounded-md prose-code:bg-selected prose-code:px-1.5 prose-code:py-0.5 prose-code:text-sm prose-code:font-mono prose-code:text-ink-2 prose-code:before:content-none prose-code:after:content-none
  prose-pre:rounded-lg prose-pre:bg-slate-900 prose-pre:text-xs dark:prose-pre:bg-neutral-900
  prose-strong:font-semibold
  prose-blockquote:border-l-2 prose-blockquote:border-line-strong
  prose-table:border-collapse prose-table:text-sm prose-table:w-full
  prose-th:border prose-th:border-line prose-th:bg-subtle prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:font-semibold
  prose-td:border prose-td:border-line prose-td:px-3 prose-td:py-2`;

function MarkdownBlock({ text }: { text: string }) {
  return (
    <Suspense fallback={<PlainPre text={text} />}>
      <LazyRichMarkdown proseClasses={PROSE_CLASSES} text={text} />
    </Suspense>
  );
}

/*
 * 消息正文里的 XML 标签段（<context>…</context> 这类）：消息本身已经是一块淡底，标签段再叠一层
 * 半透明的墨色 / 白色，比所在的块深（浅色）或亮（深色）一档，不描边。
 */
const TAG_BLOCK = "rounded-lg bg-ink/[0.04] dark:bg-white/[0.05]";

function TagBadge({ name, content }: { name: string; content: string }) {
  return (
    <div className={`flex items-baseline gap-2 px-3 py-2 ${TAG_BLOCK}`}>
      <code className="shrink-0 rounded bg-selected px-1.5 py-0.5 font-mono text-xs text-ink-3">
        {name}
      </code>
      <span className="text-sm text-ink-2">{content}</span>
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
    <div className={`overflow-hidden ${TAG_BLOCK}`}>
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-xs font-medium text-ink-3 transition-colors hover:bg-hover"
      >
        <code className="shrink-0 rounded bg-selected px-1.5 py-0.5 font-mono text-xs text-ink-2">
          {name}
        </code>
        <span className="flex-1" />
        <ChevronDown
          size={14}
          className={`shrink-0 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
        />
      </button>
      {expanded && (
        <div className="px-3.5 pb-3 text-sm text-ink">
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
    () =>
      cleaned.length > LARGE_TEXT_CHAR_THRESHOLD
        ? null
        : mayContainXmlLikeTags(cleaned)
          ? parseContentSegments(cleaned)
          : null,
    [cleaned],
  );

  if (cleaned.length > LARGE_TEXT_CHAR_THRESHOLD) {
    return <PlainPre text={cleaned} />;
  }

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
  const tint = style.tint;

  // 一条消息是弹窗里的一块淡底（不描边），标题行与正文之间靠留白分开，不画分隔线。
  // 多彩风格下有角色色的标题行是一条色带，正文补回上边距，不贴着色带。
  return (
    <div className="overflow-hidden rounded-xl bg-subtle [contain:layout_paint]">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className={`flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-semibold text-ink transition-colors hover:bg-hover ${tint ? `${tint.header} ${ROLE_TINT_HOVER}` : ""}`}
      >
        <span className={`flex shrink-0 items-center text-ink-3 ${tint?.icon ?? ""}`}>
          {style.icon}
        </span>
        <span className="flex-1 truncate">{t(style.labelKey)}</span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-ink-3 transition-transform duration-200 ${tint?.icon ?? ""} ${expanded ? "rotate-180" : ""}`}
        />
      </button>
      {expanded && (
        <div className={`px-4 pb-3 text-sm text-ink ${tint ? "colorful:pt-3" : ""}`}>
          <MarkdownContent content={content} />
        </div>
      )}
    </div>
  );
}

export function PlainPre({ text }: { text: string }) {
  const rows = useMemo(() => buildVirtualTextRows(text), [text]);
  const shouldVirtualize =
    text.length > LARGE_TEXT_CHAR_THRESHOLD || rows.length > LARGE_TEXT_LINE_THRESHOLD;

  if (shouldVirtualize) {
    return <VirtualPlainPre rows={rows} />;
  }

  return (
    <pre className={[surface({ tone: "inset", radius: "xl" }), "whitespace-pre-wrap break-words p-4 text-xs leading-relaxed font-mono text-ink"].join(" ")}>
      {text}
    </pre>
  );
}

function buildVirtualTextRows(text: string): string[] {
  const rows: string[] = [];
  const lines = text.split("\n");

  for (const line of lines) {
    if (line.length <= VIRTUAL_TEXT_CHUNK_SIZE) {
      rows.push(line);
      continue;
    }

    for (let start = 0; start < line.length; start += VIRTUAL_TEXT_CHUNK_SIZE) {
      rows.push(line.slice(start, start + VIRTUAL_TEXT_CHUNK_SIZE));
    }
  }

  return rows.length > 0 ? rows : [""];
}

function VirtualPlainPre({ rows }: { rows: string[] }) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 22,
    overscan: 24,
    useAnimationFrameWithResizeObserver: true,
  });
  const virtualRows = virtualizer.getVirtualItems();

  return (
    <div
      ref={parentRef}
      className={[surface({ tone: "inset", radius: "xl" }), "h-[min(58vh,620px)] overflow-y-auto overscroll-contain text-xs leading-relaxed font-mono [contain:layout_paint] text-ink"].join(" ")}
    >
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualRows.map((virtualRow) => (
          <div
            key={virtualRow.key}
            data-index={virtualRow.index}
            ref={virtualizer.measureElement}
            className="absolute left-0 top-0 w-full whitespace-pre-wrap break-words px-4 py-0.5"
            style={{ transform: `translateY(${virtualRow.start}px)` }}
          >
            {rows[virtualRow.index] || "\u00A0"}
          </div>
        ))}
      </div>
    </div>
  );
}

function shouldVirtualizeMessages(messages: LogMessage[]) {
  if (messages.length > VIRTUAL_MESSAGE_COUNT_THRESHOLD) return true;

  let totalLength = 0;
  for (const message of messages) {
    const length = message.content.length;
    if (length > VIRTUAL_MESSAGE_ITEM_CONTENT_THRESHOLD) return true;
    totalLength += length;
    if (totalLength > VIRTUAL_MESSAGE_CONTENT_THRESHOLD) return true;
  }

  return false;
}

export function MessageList({ messages }: { messages: LogMessage[] }) {
  if (!shouldVirtualizeMessages(messages)) {
    return (
      <div className="space-y-3">
        {messages.map((msg, idx) => (
          <MessageBlock key={idx} role={msg.role} content={msg.content} />
        ))}
      </div>
    );
  }

  return <VirtualMessageList messages={messages} />;
}

function VirtualMessageList({ messages }: { messages: { role: string; content: string }[] }) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 220,
    overscan: VIRTUAL_MESSAGE_OVERSCAN,
    useAnimationFrameWithResizeObserver: true,
  });
  const virtualRows = virtualizer.getVirtualItems();

  return (
    <div
      ref={parentRef}
      className="h-[min(62vh,660px)] overflow-y-auto overscroll-contain pr-1 [contain:layout_paint]"
    >
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualRows.map((virtualRow) => {
          const msg = messages[virtualRow.index];
          if (!msg) return null;

          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className="absolute left-0 top-0 w-full pb-3"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              <MessageBlock role={msg.role} content={msg.content} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * 请求内容查看器的外壳：通用 Modal（叠层、焦点、进退场与全站一致，不再自己监听 Esc）。
 *
 * 请求内容动辄是长 JSON 或几十轮消息，宽度用编辑器档（2xl，与原来的 1040px 相当）；
 * 面板高度固定，切换页签、加载前后不跳动，内容区在里面自己滚动。页签条放在正文顶部。
 */
export function ContentModal({
  open,
  model,
  onClose,
  children,
  tabs,
  description,
}: {
  open: boolean;
  model: string;
  onClose: () => void;
  children: ReactNode;
  tabs?: ReactNode;
  description?: string;
}) {
  const { t } = useTranslation();
  return (
    <Modal
      open={open}
      title={model ? `${t("log_content.message_content")} · ${model}` : t("log_content.message_content")}
      description={description || t("log_content.title")}
      icon={<ScrollText />}
      size="2xl"
      panelClassName="h-[min(82dvh,760px)]"
      bodyHeightClassName="flex-1"
      bodyOverflowClassName="overflow-hidden"
      bodyClassName="flex flex-col gap-4"
      onClose={onClose}
    >
      {tabs ? <div className="shrink-0">{tabs}</div> : null}
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </Modal>
  );
}
