import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy } from "lucide-react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

function shouldShowLineNumbers(text: string): boolean {
  let newlines = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) {
      newlines += 1;
      if (newlines > 5) return true;
    }
  }
  return false;
}

function CodeBlock({ language, children }: { language: string; children: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(children).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const displayLang = language || "text";
  const normalized = children.endsWith("\n") ? children.slice(0, -1) : children;

  return (
    <div className="my-3 overflow-hidden rounded-xl" style={{ border: "1px solid #3e4451" }}>
      <div
        className="flex items-center justify-between px-4 py-1.5"
        style={{ backgroundColor: "#282c34" }}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-full bg-[#FF5F57]" />
            <span className="inline-block h-3 w-3 rounded-full bg-[#FEBC2E]" />
            <span className="inline-block h-3 w-3 rounded-full bg-[#28C840]" />
          </div>
          <span className="text-xs font-medium text-slate-400">{displayLang}</span>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-400 transition-colors hover:bg-white/10 hover:text-slate-200"
        >
          {copied ? (
            <>
              <Check size={13} className="text-emerald-400" />
              <span className="text-emerald-400">{t("common.copied")}</span>
            </>
          ) : (
            <>
              <Copy size={13} />
              <span>{t("log_content.copy")}</span>
            </>
          )}
        </button>
      </div>
      <SyntaxHighlighter
        language={displayLang}
        style={oneDark}
        customStyle={{
          margin: 0,
          borderRadius: 0,
          fontSize: "13px",
          lineHeight: "1.6",
          padding: "10px 16px 16px 16px",
        }}
        showLineNumbers={shouldShowLineNumbers(normalized)}
        wrapLongLines
      >
        {normalized}
      </SyntaxHighlighter>
    </div>
  );
}

const markdownComponents: Partial<Components> = {
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || "");
    const code = String(children).replace(/\n$/, "");
    if (match || code.includes("\n")) {
      return <CodeBlock language={match?.[1] || ""}>{code}</CodeBlock>;
    }
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
  pre({ children }) {
    return <>{children}</>;
  },
};

export function RichMarkdown({
  proseClasses,
  text,
}: {
  proseClasses: string;
  text: string;
}) {
  return (
    <div className={proseClasses}>
      <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {text}
      </Markdown>
    </div>
  );
}
