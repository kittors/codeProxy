import type { MaskFinder } from "@code-proxy/api-client";

/**
 * 被脱敏的值按类目上色，整页只有这四种颜色加两种处理方式的颜色：
 * - 密钥（API 密钥、私钥、令牌、密码、机密）紫色，脱敏的主角；
 * - 个人信息（邮箱、手机号、证件号……）天蓝；
 * - 脱敏词琥珀；
 * - 用户自己的规则靛蓝（类型名是用户起的，认不出的类型都归这里）。
 * 「提醒」（原样发出）用琥珀，「拦截」用玫红，与全站的告警色一致。颜色只用来认出类目，数字本身
 * 保持墨色。
 */
export type MaskCategory = "secret" | "personal" | "word" | "rule";

const SECRET_KINDS = new Set(["API_KEY", "PRIVATE_KEY", "TOKEN", "PASSWORD", "SECRET", "JWT"]);
const PERSONAL_KINDS = new Set([
  "EMAIL",
  "PHONE",
  "ID_CARD",
  "BANK_CARD",
  "SSN",
  "PASSPORT",
  "IBAN",
  "BIRTHDAY",
  "MAC",
  "SERIAL",
  "USERNAME",
  "HOSTNAME",
  "IP",
  "BUCKET",
]);

export function maskCategory(kind: string): MaskCategory {
  if (SECRET_KINDS.has(kind)) return "secret";
  if (PERSONAL_KINDS.has(kind)) return "personal";
  if (kind === "TERM") return "word";
  return "rule";
}

/** 内置的类型名有译文，用户规则的类型名原样显示。 */
export const KNOWN_KINDS = [...SECRET_KINDS, ...PERSONAL_KINDS, "TERM"];

/**
 * 能逐类选处理方式（脱敏 / 提醒 / 拦截）的类型：密钥五类，以及打开「个人信息」后固定一起遮的四类。
 * 控制台的设置页和门户的「生效的规则」共用，两边列出的类型才一致。
 */
export const ACTION_SECRET_KINDS = ["API_KEY", "PRIVATE_KEY", "TOKEN", "PASSWORD", "SECRET"];
export const ACTION_PERSONAL_KINDS = ["EMAIL", "PHONE", "ID_CARD", "BANK_CARD"];

/** 打开「个人信息」后另有的类别：前六个默认开，后四个噪声大（agent 每个请求都带）默认关。 */
export const PERSONAL_CATEGORIES: Array<{ id: string; on: boolean }> = [
  { id: "ssn", on: true },
  { id: "passport", on: true },
  { id: "iban", on: true },
  { id: "birthday", on: true },
  { id: "mac", on: true },
  { id: "serial", on: true },
  { id: "home", on: false },
  { id: "userhost", on: false },
  { id: "ip", on: false },
  { id: "bucket", on: false },
];

type CategoryStyle = {
  /** 小圆点 */
  dot: string;
  /** 类型标签（淡底 + 同色字） */
  chip: string;
  /** 正文里占位符的高亮 */
  mark: string;
  /** 流向图、柱条用的颜色值（SVG 只认颜色值） */
  stroke: string;
};

export const CATEGORY_STYLE: Record<MaskCategory, CategoryStyle> = {
  secret: {
    dot: "bg-violet-500 dark:bg-violet-400",
    chip: "bg-violet-500/10 text-violet-700 dark:bg-violet-400/15 dark:text-violet-200",
    mark: "bg-violet-500/12 text-violet-700 ring-1 ring-violet-500/25 dark:bg-violet-400/18 dark:text-violet-200 dark:ring-violet-300/25",
    stroke: "#8b5cf6",
  },
  personal: {
    dot: "bg-sky-500 dark:bg-sky-400",
    chip: "bg-sky-500/10 text-sky-700 dark:bg-sky-400/15 dark:text-sky-200",
    mark: "bg-sky-500/12 text-sky-700 ring-1 ring-sky-500/25 dark:bg-sky-400/18 dark:text-sky-200 dark:ring-sky-300/25",
    stroke: "#0ea5e9",
  },
  word: {
    dot: "bg-amber-500 dark:bg-amber-400",
    chip: "bg-amber-500/10 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200",
    mark: "bg-amber-500/14 text-amber-800 ring-1 ring-amber-500/25 dark:bg-amber-400/18 dark:text-amber-200 dark:ring-amber-300/25",
    stroke: "#f59e0b",
  },
  rule: {
    dot: "bg-indigo-500 dark:bg-indigo-400",
    chip: "bg-indigo-500/10 text-indigo-700 dark:bg-indigo-400/15 dark:text-indigo-200",
    mark: "bg-indigo-500/12 text-indigo-700 ring-1 ring-indigo-500/25 dark:bg-indigo-400/18 dark:text-indigo-200 dark:ring-indigo-300/25",
    stroke: "#6366f1",
  },
};

export const kindStyle = (kind: string) => CATEGORY_STYLE[maskCategory(kind)];

/** 处理方式的标签：提醒琥珀、拦截玫红。 */
export const ACTION_CHIP = {
  warn: "bg-amber-500/10 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200",
  block: "bg-rose-500/10 text-rose-700 dark:bg-rose-400/15 dark:text-rose-200",
} as const;

/** 客户端：显示名与图标用的厂商（VendorIcon 认厂商名）。 */
const CLIENTS: Record<string, { label: string; vendor?: string }> = {
  codex: { label: "Codex", vendor: "openai" },
  "claude-code": { label: "Claude Code", vendor: "claude" },
  "gemini-cli": { label: "Gemini CLI", vendor: "gemini" },
  opencode: { label: "OpenCode", vendor: "opencode" },
  cursor: { label: "Cursor", vendor: "cursor" },
  cline: { label: "Cline" },
  "roo-code": { label: "Roo Code" },
  "kilo-code": { label: "Kilo Code" },
};

/** 客户端的显示名；认不出的（other）由调用方翻译。 */
export function clientMeta(client: string): { label: string | null; vendor?: string } {
  const known = CLIENTS[client];
  return known ? known : { label: null };
}

export const FINDER_KEYS: Record<MaskFinder, string> = {
  rule: "privacy_masking.finder.rule",
  yours: "privacy_masking.finder.yours",
  word: "privacy_masking.finder.word",
  known: "privacy_masking.finder.known",
};

/**
 * 值的样子：开头几个字符加省略号，例如「sk-…」。原值从不出现在面板里，长度另外显示。
 */
export const valueShape = (head: string | undefined) => (head ? `${head}…` : "…");
