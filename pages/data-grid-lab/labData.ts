/**
 * 表格演示页的假请求日志。全部是本地生成的确定性数据，不连任何后端。
 *
 * 形状按线上请求日志的真实特征来造（见计划 104 与「合并前回放线上响应」的教训）：
 * - 渠道名有 OAuth 邮箱这种长名字，用来检查截断与 tooltip；
 * - 输入 token 长尾很重（Agent 客户端的上下文动辄 10 万+），缓存命中率大多很高；
 * - 首字、总耗时有分钟级的长尾，失败、重试后成功、客户端取消各占一小撮。
 */

export type LabStatus = "success" | "failed" | "retried" | "cancelled";
export type LabAuthType = "oauth" | "api";

export interface LabUser {
  id: string;
  name: string;
  key: string;
  /** 头像底色，取面板色相注册表（theme/hues）里的名字。 */
  hue: "blue" | "teal" | "amber" | "fuchsia" | "rose" | "lime";
}

export interface LabChannel {
  id: string;
  name: string;
  provider: string;
  auth: LabAuthType;
}

export interface LabLogRow {
  id: string;
  timestampMs: number;
  user: LabUser;
  /**
   * 原始 User-Agent 与来源 IP。线上它们只在每条请求的「请求详情」里（request_log_content.detail_content
   * 的 client.headers / client.ip），列表接口 /usage/logs 不返回。所以演示页只在展开详情里用，
   * 列表、tooltip、搜索都不碰它们，也没有「Agent」列（要后端先加字段，见计划 104 第 5 节）。
   */
  userAgent: string;
  ip: string;
  model: string;
  upstreamModel: string;
  thinking: "" | "low" | "medium" | "high";
  channel: LabChannel;
  streaming: boolean;
  inputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  firstTokenMs: number;
  latencyMs: number;
  cost: { input: number; output: number; cache: number; total: number };
  status: LabStatus;
  httpStatus: number;
  retries: number;
  errorMessage: string;
}

export const LAB_USERS: readonly LabUser[] = [
  { id: "u-chen", name: "陈雨桐", key: "sk-cp-7f3a2c91d0e44b8c9c2d", hue: "blue" },
  { id: "u-kevin", name: "Kevin Zhou", key: "sk-cp-41be08aa77f2c9d1a05e", hue: "teal" },
  { id: "u-ops", name: "ops-bot", key: "sk-cp-0c9d1e2f3a4b5c6d7e8f", hue: "amber" },
  { id: "u-li", name: "李娜（数据平台）", key: "sk-cp-9a8b7c6d5e4f3a2b1c0d", hue: "fuchsia" },
  { id: "u-wang", name: "王磊", key: "sk-cp-5e5e5e5e1234abcd9876", hue: "rose" },
  {
    id: "u-pipeline",
    name: "nightly-eval-pipeline",
    key: "sk-cp-feedfacecafebeef0042",
    hue: "lime",
  },
];

export const LAB_CHANNELS: readonly LabChannel[] = [
  {
    id: "c-claude-max",
    name: "alice.chen@studio-north.example.com",
    provider: "claude",
    auth: "oauth",
  },
  {
    id: "c-codex-03",
    name: "codex.ops+pool03@relay-mail.example.org",
    provider: "codex",
    auth: "oauth",
  },
  { id: "c-gemini", name: "Gemini API · 主账号", provider: "gemini", auth: "api" },
  { id: "c-antigravity", name: "bob@lab.example", provider: "antigravity", auth: "oauth" },
  { id: "c-vertex", name: "Vertex 东京", provider: "vertex", auth: "api" },
  { id: "c-openrouter", name: "OpenRouter 备用", provider: "openai", auth: "api" },
];

interface ModelSpec {
  model: string;
  upstream: string;
  channels: readonly string[];
  /** 每百万 token 的美元价：输入、输出、缓存读、缓存写。 */
  price: [number, number, number, number];
  thinking: readonly LabLogRow["thinking"][];
  speed: [number, number];
  weight: number;
}

const MODELS: readonly ModelSpec[] = [
  {
    model: "claude-opus-5-5",
    upstream: "claude-opus-5-5-20261001",
    channels: ["c-claude-max", "c-vertex"],
    price: [5, 25, 0.5, 6.25],
    thinking: ["high", "medium", ""],
    speed: [55, 110],
    weight: 26,
  },
  {
    model: "claude-sonnet-5-5",
    upstream: "claude-sonnet-5-5-20260915",
    channels: ["c-claude-max", "c-openrouter"],
    price: [3, 15, 0.3, 3.75],
    thinking: ["medium", ""],
    speed: [70, 150],
    weight: 18,
  },
  {
    model: "gpt-5.6-codex",
    upstream: "gpt-5.6-codex",
    channels: ["c-codex-03"],
    price: [1.25, 10, 0.125, 0],
    thinking: ["high", "medium", "low"],
    speed: [60, 140],
    weight: 22,
  },
  {
    model: "gemini-3.8-flash-high",
    upstream: "gemini-3.8-flash",
    channels: ["c-gemini", "c-antigravity"],
    price: [0.3, 2.5, 0.03, 0],
    thinking: ["medium", "high"],
    speed: [120, 260],
    weight: 20,
  },
  {
    model: "gemini-3.1-pro",
    upstream: "gemini-3.1-pro-preview",
    channels: ["c-antigravity", "c-vertex"],
    price: [1.25, 10, 0.125, 0],
    thinking: [""],
    speed: [50, 120],
    weight: 8,
  },
  {
    model: "claude-haiku-5-5",
    upstream: "claude-haiku-5-5",
    channels: ["c-openrouter"],
    price: [1, 5, 0.1, 1.25],
    thinking: [""],
    speed: [140, 260],
    weight: 6,
  },
];

/** 造数据用的调用方：决定输入长短（Agent 类客户端上下文长）和请求详情里的 User-Agent。 */
const CALLERS = [
  { agentic: true, userAgent: "claude-cli/2.1.32 (external, cli)" },
  { agentic: true, userAgent: "codex_cli_rs/0.58.0 (Mac OS 15.1.0; arm64) iTerm.app/3.5.10" },
  { agentic: true, userAgent: "opencode/1.0.25 ai-sdk/provider-utils/3.0.9" },
  { agentic: false, userAgent: "CherryStudio/1.6.5 Electron/37.2.3" },
  { agentic: false, userAgent: "Cursor/1.7.38 (darwin arm64)" },
] as const;
const CURL_CALLER = { agentic: false, userAgent: "curl/8.7.1" } as const;

const ERRORS: readonly { status: number; message: string }[] = [
  {
    status: 429,
    message: "upstream rate limited: Too many requests for this account (retry after 12s)",
  },
  { status: 529, message: "server_is_overloaded: the upstream model is temporarily overloaded" },
  { status: 500, message: "upstream stream closed before message_stop (unexpected EOF)" },
  {
    status: 400,
    message: "invalid_request_error: prompt is too long: 412308 tokens > 400000 maximum",
  },
];

/** mulberry32：固定种子、可复现的伪随机。 */
function createRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const pickWeighted = <T extends { weight: number }>(items: readonly T[], roll: number): T => {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let cursor = roll * total;
  for (const item of items) {
    cursor -= item.weight;
    if (cursor <= 0) return item;
  }
  return items[items.length - 1];
};

/** 对数均匀：在 [min, max] 之间按数量级均匀取值，造出长尾。 */
const logUniform = (roll: number, min: number, max: number) =>
  Math.round(Math.exp(Math.log(min) + roll * (Math.log(max) - Math.log(min))));

export function generateLabLogs(count: number, now: number, seed = 20261117): LabLogRow[] {
  const random = createRandom(seed);
  const rows: LabLogRow[] = [];
  const span = 20 * 3600 * 1000;
  let timestamp = now - 4_000;
  const step = span / count;
  for (let index = 0; index < count; index += 1) {
    timestamp -= Math.max(800, step * (0.35 + random() * 1.3));
    const spec = pickWeighted(MODELS, random());
    const channelId = spec.channels[Math.floor(random() * spec.channels.length)];
    const channel = LAB_CHANNELS.find((item) => item.id === channelId) ?? LAB_CHANNELS[0];
    const user = LAB_USERS[Math.floor(random() * LAB_USERS.length)];
    const caller =
      user.id === "u-pipeline" ? CURL_CALLER : CALLERS[Math.floor(random() * CALLERS.length)];
    const agentic = caller.agentic;
    const inputTokens = agentic
      ? logUniform(random(), 18_000, 420_000)
      : logUniform(random(), 300, 24_000);
    const cacheRatio = agentic ? Math.min(0.995, 0.55 + random() * 0.45) : random() * 0.35;
    const cacheReadTokens = Math.round(inputTokens * cacheRatio);
    const cacheWriteTokens =
      spec.price[3] > 0 ? Math.round((inputTokens - cacheReadTokens) * (0.2 + random() * 0.6)) : 0;
    const roll = random();
    const status: LabStatus =
      roll < 0.019 ? "failed" : roll < 0.031 ? "retried" : roll < 0.039 ? "cancelled" : "success";
    const thinking = spec.thinking[Math.floor(random() * spec.thinking.length)];
    const outputTokens =
      status === "failed" ? 0 : logUniform(random(), 6, thinking === "high" ? 9_000 : 4_500);
    const reasoningTokens = thinking ? Math.round(outputTokens * (0.15 + random() * 0.5)) : 0;
    const firstTokenMs = Math.round(
      logUniform(random(), 380, thinking === "high" ? 38_000 : 9_000),
    );
    const speed = spec.speed[0] + random() * (spec.speed[1] - spec.speed[0]);
    const generationMs = outputTokens > 0 ? (outputTokens / speed) * 1000 : 0;
    const latencyMs =
      status === "cancelled"
        ? Math.round(firstTokenMs + generationMs * random())
        : Math.round(
            firstTokenMs + generationMs + (status === "retried" ? 2_500 + random() * 6_000 : 0),
          );
    const uncached = Math.max(0, inputTokens - cacheReadTokens - cacheWriteTokens);
    const inputCost = (uncached * spec.price[0]) / 1e6;
    const cacheCost = (cacheReadTokens * spec.price[2] + cacheWriteTokens * spec.price[3]) / 1e6;
    const outputCost = (outputTokens * spec.price[1]) / 1e6;
    const error = ERRORS[Math.floor(random() * ERRORS.length)];
    rows.push({
      id: String(1_001_709_206 - index * 7 - Math.floor(random() * 5)),
      timestampMs: Math.round(timestamp),
      user,
      userAgent: caller.userAgent,
      ip: `198.51.100.${10 + Math.floor(random() * 200)}`,
      model: spec.model,
      upstreamModel: random() < 0.08 ? `${spec.upstream}-fallback` : spec.upstream,
      thinking,
      channel,
      streaming: caller !== CURL_CALLER || random() < 0.3,
      inputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      outputTokens,
      reasoningTokens,
      firstTokenMs: status === "failed" ? 0 : firstTokenMs,
      latencyMs: status === "failed" ? Math.round(300 + random() * 4_000) : latencyMs,
      cost:
        status === "failed"
          ? { input: 0, output: 0, cache: 0, total: 0 }
          : {
              input: inputCost,
              output: outputCost,
              cache: cacheCost,
              total: inputCost + outputCost + cacheCost,
            },
      status,
      httpStatus: status === "failed" ? error.status : status === "cancelled" ? 499 : 200,
      retries: status === "retried" ? 1 + Math.floor(random() * 3) : 0,
      errorMessage: status === "failed" ? error.message : "",
    });
  }
  return rows;
}

export interface LabSummary {
  total: number;
  success: number;
  failed: number;
  retried: number;
  cancelled: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cost: number;
  medianFirstTokenMs: number;
}

export function summarizeLabLogs(rows: readonly LabLogRow[]): LabSummary {
  const summary: LabSummary = {
    total: rows.length,
    success: 0,
    failed: 0,
    retried: 0,
    cancelled: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cost: 0,
    medianFirstTokenMs: 0,
  };
  const firstTokens: number[] = [];
  for (const row of rows) {
    summary[row.status] += 1;
    summary.inputTokens += row.inputTokens;
    summary.outputTokens += row.outputTokens;
    summary.cacheReadTokens += row.cacheReadTokens;
    summary.cost += row.cost.total;
    if (row.firstTokenMs > 0) firstTokens.push(row.firstTokenMs);
  }
  firstTokens.sort((a, b) => a - b);
  summary.medianFirstTokenMs = firstTokens.length
    ? firstTokens[Math.floor(firstTokens.length / 2)]
    : 0;
  return summary;
}

export interface LabThroughput {
  tokensPerSecond: number;
  outputTokens: number;
  /** 作为分母的时间（毫秒）。 */
  ms: number;
  /**
   * generation：总耗时减首字（流式且记录了首字）；
   * total：非流式或没有首字时间，按总耗时；
   * burst：首字后几乎立刻结束（缓冲后一次性写出），减首字会得出几千 tok/s 的假尖峰，按总耗时。
   */
  basis: "generation" | "total" | "burst";
}

/**
 * 吞吐（输出 tok/s），和请求日志现有的 computeOutputTokensPerSecond 同一个算法
 * （features/request-log-viewer/requestLogMetrics.ts），只是多返回分母和口径给 tooltip 用。
 * 后端监控中心的「生成速度」也是输出 token ÷（总耗时 − 首字），推理 token 不另加。
 * 没有输出、或分母为 0 时返回 null，单元格显示「—」，不会出现 0 或 Infinity。
 */
export function labThroughput(row: LabLogRow): LabThroughput | null {
  if (!(row.outputTokens > 0) || !(row.latencyMs > 0)) return null;
  let ms = row.latencyMs;
  let basis: LabThroughput["basis"] = "total";
  if (row.streaming && row.firstTokenMs > 0 && row.firstTokenMs < row.latencyMs) {
    const generation = row.latencyMs - row.firstTokenMs;
    const burst = generation < 200 || (row.firstTokenMs / row.latencyMs >= 0.9 && generation < 500);
    if (burst) {
      basis = "burst";
    } else {
      ms = generation;
      basis = "generation";
    }
  }
  const tokensPerSecond = row.outputTokens / (ms / 1000);
  return Number.isFinite(tokensPerSecond) && tokensPerSecond > 0
    ? { tokensPerSecond, outputTokens: row.outputTokens, ms, basis }
    : null;
}

export function labCacheRatio(row: LabLogRow): number {
  return row.inputTokens > 0 ? row.cacheReadTokens / row.inputTokens : 0;
}

/** 脱敏后的 Key：前 6 后 4，和线上 maskRequestLogApiKey 同一个形状。 */
export function maskLabKey(key: string): string {
  return key.length > 10 ? `${key.slice(0, 6)}***${key.slice(-4)}` : "***";
}
