export type TokenKind =
  | "plain"
  | "keyword"
  | "string"
  | "number"
  | "comment"
  | "property"
  | "flag"
  | "func"
  | "punct";

export interface CodeToken {
  text: string;
  kind: TokenKind;
}

export type SnippetLanguage = "shell" | "python" | "javascript";

/*
 * 只服务落地页那三段固定示例，所以刻意手写一个极小的分词器，而不是引入
 * react-syntax-highlighter —— 后者在本仓库被打进 790KB 的 vendor-markdown chunk，
 * 为了首屏一个代码块把它拉进来并不划算。规则覆盖不到的内容一律降级为 plain，
 * 不会渲染错，只是没有颜色。
 */

const KEYWORDS: Record<SnippetLanguage, readonly string[]> = {
  shell: ["curl", "export"],
  python: ["from", "import", "os"],
  javascript: ["import", "from", "const", "await", "new", "process", "env"],
};

/** 依次尝试的匹配规则；顺序即优先级，字符串必须先于其它规则消费。 */
const RULES: readonly { kind: TokenKind; pattern: RegExp }[] = [
  { kind: "comment", pattern: /^(#[^\n]*|\/\/[^\n]*)/ },
  { kind: "string", pattern: /^("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/ },
  // shell 的长/短选项：-H、--data
  { kind: "flag", pattern: /^(--?[A-Za-z][\w-]*)/ },
  // $VAR 与 ${VAR}
  { kind: "property", pattern: /^(\$\{?[A-Za-z_][\w]*\}?)/ },
  { kind: "number", pattern: /^(\d+(?:\.\d+)?)/ },
  { kind: "punct", pattern: /^([{}[\]().,:;=\\|])/ },
  { kind: "plain", pattern: /^(\s+)/ },
  { kind: "plain", pattern: /^([A-Za-z_][\w./:-]*)/ },
];

export function highlightSnippet(code: string, language: SnippetLanguage): CodeToken[][] {
  const keywords = new Set(KEYWORDS[language]);

  return code.split("\n").map((line) => {
    const tokens: CodeToken[] = [];
    let rest = line;

    while (rest.length > 0) {
      let matched = false;

      for (const rule of RULES) {
        const found = rule.pattern.exec(rest);
        if (!found) continue;

        const text = found[1];
        let kind = rule.kind;
        if (kind === "plain" && keywords.has(text)) {
          kind = "keyword";
        } else if (kind === "plain" && /^[A-Za-z_]\w*$/.test(text) && rest[text.length] === "(") {
          // 紧跟左括号的标识符按函数名着色，chat.completions.create 这类链式调用才有层次。
          kind = "func";
        }

        // 相邻同类 token 合并，减少一半以上的 DOM 节点。
        const previous = tokens[tokens.length - 1];
        if (previous && previous.kind === kind) previous.text += text;
        else tokens.push({ text, kind });

        rest = rest.slice(text.length);
        matched = true;
        break;
      }

      // 兜底：没有规则命中时吞掉一个字符，保证循环一定收敛。
      if (!matched) {
        const previous = tokens[tokens.length - 1];
        if (previous && previous.kind === "plain") previous.text += rest[0];
        else tokens.push({ text: rest[0], kind: "plain" });
        rest = rest.slice(1);
      }
    }

    return tokens;
  });
}

/** IDE 深色配色。代码块在两种主题下都用深底，作为版面里稳定的「终端」意象。 */
export const TOKEN_CLASS: Record<TokenKind, string> = {
  plain: "text-slate-300",
  keyword: "text-violet-400",
  string: "text-emerald-400",
  number: "text-amber-300",
  comment: "text-slate-500",
  property: "text-sky-300",
  flag: "text-rose-300",
  func: "text-blue-300",
  punct: "text-slate-500",
};
