/**
 * 请求日志的 Agent（调用方客户端）。
 *
 * 后端（request-log-clients）给每行三个字段：client_name 是归一化的客户端 ID，认得的客户端是固定 ID
 * （claude-code、codex-desktop…，见 CliRelay internal/clientident），认不得但带了 User-Agent 的是 UA
 * 第一个产品名的小写（okhttp、python-requests），没带 UA 或旧数据是空串；client_version 是版本；
 * user_agent 是原始 UA（最多 256 字符）。显示名与图标只在前端维护：后端新认出一个客户端，
 * 这里没登记时也照样显示它的 ID，不会显示成「未知」。
 */

/** 筛选里代表「没有客户端名」的取值，和后端 ClientNameUnknown 一致；client_name 本身永远不会是它。 */
export const UNKNOWN_REQUEST_LOG_CLIENT = "__unknown__";

export interface RequestLogClientDisplay {
  /** 品牌名不翻译；未登记的 ID 原样显示。 */
  label: string;
  /** 不是品牌名、需要翻译的（浏览器）给 i18n 键。 */
  labelKey?: string;
  /** VendorIcon 认得的名字；没有品牌图标的客户端用 glyph。 */
  vendor?: string;
  glyph?: "terminal" | "browser" | "package";
}

const KNOWN_CLIENTS: Record<string, RequestLogClientDisplay> = {
  "claude-code": { label: "Claude Code", vendor: "claude" },
  "claude-agent-sdk": { label: "Claude Agent SDK", vendor: "claude" },
  "anthropic-sdk": { label: "Anthropic SDK", vendor: "anthropic" },
  "codex-cli": { label: "Codex CLI", vendor: "codex" },
  "codex-exec": { label: "Codex Exec", vendor: "codex" },
  "codex-vscode": { label: "Codex IDE", vendor: "codex" },
  "codex-desktop": { label: "Codex App", vendor: "codex" },
  "codex-sdk": { label: "Codex SDK", vendor: "codex" },
  "openai-sdk": { label: "OpenAI SDK", vendor: "openai" },
  "gemini-cli": { label: "Gemini CLI", vendor: "gemini-cli" },
  "qwen-code": { label: "Qwen Code", vendor: "qwen" },
  antigravity: { label: "Antigravity", vendor: "antigravity" },
  opencode: { label: "OpenCode", vendor: "opencode" },
  cline: { label: "Cline", vendor: "cline" },
  "roo-code": { label: "Roo Code", glyph: "terminal" },
  "kilo-code": { label: "Kilo Code", glyph: "terminal" },
  "cherry-studio": { label: "Cherry Studio", glyph: "package" },
  cursor: { label: "Cursor", glyph: "terminal" },
  curl: { label: "curl", glyph: "terminal" },
  browser: { label: "Browser", labelKey: "request_logs.client_browser", glyph: "browser" },
};

/** 已登记客户端的显示方式；未登记的 ID 原样显示、用通用图标。空串返回 null（显示「未知」）。 */
export function describeRequestLogClient(name: string): RequestLogClientDisplay | null {
  const id = name.trim().toLowerCase();
  if (!id || id === UNKNOWN_REQUEST_LOG_CLIENT) return null;
  return KNOWN_CLIENTS[id] ?? { label: id, glyph: "package" };
}

/** 这批数据来自带调用方字段的后端吗：后端保证三个键每行都有（值可以是空串），旧后端一个都没有。 */
export function itemsCarryClientFields(items: readonly object[]): boolean {
  return items.some((item) => typeof (item as { client_name?: unknown }).client_name === "string");
}
