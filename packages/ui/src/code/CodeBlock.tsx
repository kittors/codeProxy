import { useMemo, type ReactNode } from "react";
import { highlightSnippet, TOKEN_CLASS, type SnippetLanguage } from "./highlightSnippet";

/**
 * Dark, syntax-highlighted code block.
 *
 * Shared by the landing page and the media-model pages so a curl example reads the
 * same everywhere. The tokenizer is the tiny hand-written one in highlightSnippet:
 * pulling in react-syntax-highlighter for these fixed snippets would drag the
 * 790KB vendor-markdown chunk into pages that need one code block.
 */
export function CodeBlock({
  code,
  language = "shell",
  label,
  action,
  className,
}: {
  code: string;
  language?: SnippetLanguage;
  /** Small caption in the block header, e.g. "curl". */
  label?: ReactNode;
  /** Optional trailing control, typically a copy button. */
  action?: ReactNode;
  className?: string;
}) {
  const highlighted = useMemo(() => highlightSnippet(code, language), [code, language]);

  return (
    <div
      className={[
        // 代码块在浅色和深色模式里都是深底：语法高亮只调了一套深色配色。深色模式下压得比
        // 卡片（#18181c）更深一档，读起来是「凹进去的一块」；轮廓交给伪元素细边，不画 border。
        "cp-edge overflow-hidden rounded-2xl bg-[#171717] dark:bg-[#0d0d10]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {label || action ? (
        <div className="flex items-center justify-between gap-3 border-b border-white/8 px-4 py-2">
          <span className="font-mono text-2xs uppercase tracking-wider text-white/45">
            {label}
          </span>
          {action}
        </div>
      ) : null}
      <pre data-code-block className="overflow-x-auto px-4 py-3 text-sm leading-6">
        <code className="font-mono">
          {highlighted.map((tokens, lineIndex) => (
            <span key={lineIndex} className="block">
              {/* An empty line has no tokens; a zero-width space keeps its height. */}
              {tokens.length === 0 ? "​" : null}
              {tokens.map((token, tokenIndex) => (
                <span key={tokenIndex} className={TOKEN_CLASS[token.kind]}>
                  {token.text}
                </span>
              ))}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}
