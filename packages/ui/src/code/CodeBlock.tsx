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
        "overflow-hidden rounded-2xl border border-slate-900/10 bg-neutral-950 dark:border-white/10",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {label || action ? (
        <div className="flex items-center justify-between gap-3 border-b border-white/8 px-4 py-2">
          <span className="font-mono text-2xs uppercase tracking-[0.18em] text-slate-400">
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
