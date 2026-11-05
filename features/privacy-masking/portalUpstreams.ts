import type { MaskCount, MaskRecord, MaskSummary } from "@code-proxy/api-client";

/**
 * 门户不显示渠道是谁：codeProxy 83d6e00d 起门户的请求日志就去掉了渠道列和渠道筛选，渠道名常是
 * 内部号池名或 OAuth 账号邮箱。门户的脱敏接口目前仍带着渠道名（CliRelay 的 privacy_masking_portal.go
 * 沿用了控制台的查询），这里在显示前换成渠道的上游厂商：流向图右边按厂商合并，记录里的渠道换成厂商名。
 *
 * provider 是渠道的类型（CliRelay 执行器的 Identifier）。OpenAI 兼容渠道的 provider 是运营方自己起的
 * 名字，同样可能认出是谁，所以只认下面这些，其余一律归「其他上游」，不原样显示。
 */
const UPSTREAMS: Record<string, { label: string; vendor?: string }> = {
  codex: { label: "OpenAI", vendor: "openai" },
  openai: { label: "OpenAI", vendor: "openai" },
  claude: { label: "Claude", vendor: "claude" },
  gemini: { label: "Gemini", vendor: "gemini" },
  "gemini-cli": { label: "Gemini", vendor: "gemini" },
  aistudio: { label: "Gemini", vendor: "gemini" },
  vertex: { label: "Vertex AI", vendor: "vertex" },
  antigravity: { label: "Antigravity", vendor: "antigravity" },
  bedrock: { label: "Amazon Bedrock" },
  qwen: { label: "Qwen", vendor: "qwen" },
  kimi: { label: "Kimi", vendor: "kimi" },
  iflow: { label: "iFlow", vendor: "iflow" },
  kiro: { label: "Kiro", vendor: "kiro" },
  xai: { label: "xAI", vendor: "xai" },
  "opencode-go": { label: "OpenCode Go", vendor: "opencode-go" },
  "ollama-cloud": { label: "Ollama", vendor: "ollama" },
  cline: { label: "Cline", vendor: "cline" },
};

/** 一个渠道在门户里显示成的上游：认不出的 label 是 other（调用方传进来的译文）。 */
export function upstreamOf(
  provider: string | undefined,
  other: string,
): { label: string; vendor?: string } {
  return UPSTREAMS[(provider ?? "").trim().toLowerCase()] ?? { label: other };
}

/** 汇总里的渠道按上游厂商合并。 */
export function summaryByUpstream(summary: MaskSummary, other: string): MaskSummary {
  const merged = new Map<string, MaskCount>();
  for (const channel of summary.channels) {
    const upstream = upstreamOf(channel.vendor, other);
    const seen = merged.get(upstream.label);
    merged.set(
      upstream.label,
      seen
        ? {
            ...seen,
            places: seen.places + channel.places,
            requests: seen.requests + channel.requests,
          }
        : {
            name: upstream.label,
            places: channel.places,
            requests: channel.requests,
            vendor: upstream.vendor,
          },
    );
  }
  return { ...summary, channels: [...merged.values()] };
}

/**
 * 记录里的渠道换成上游厂商。按 provider 换，不看渠道名有没有：以后服务器不再给门户渠道名，照样显示
 * 厂商。拦下没发的（blocked）原样返回，界面显示「未发出」。
 */
export function recordByUpstream<T extends MaskRecord>(record: T, other: string): T {
  if (record.blocked || (!record.channel && !record.provider)) return record;
  const upstream = upstreamOf(record.provider, other);
  return { ...record, channel: upstream.label, provider: upstream.vendor };
}
