type CcSwitchUsageScriptLanguage = "zh-CN" | "en";

const normalizeUsageScriptLanguage = (language: string | undefined): CcSwitchUsageScriptLanguage =>
  String(language ?? "")
    .trim()
    .toLowerCase()
    .startsWith("en")
    ? "en"
    : "zh-CN";

/**
 * The usage query CC Switch runs for an imported provider: one POST to the public usage
 * summary, answered with today's call count and cost. `{{baseUrl}}` is the link's
 * `usageBaseUrl` (the API root): the preset's route path does not serve /v0/management.
 */
export function buildCcSwitchUsageScript(language?: string): string {
  const labels =
    normalizeUsageScriptLanguage(language) === "en"
      ? {
          planName: "Today's usage",
          invalidMessage: "API Key not found",
          unit: "times",
          costPrefix: "Today's cost:",
        }
      : {
          planName: "今日用量",
          invalidMessage: "API Key 未找到",
          unit: "次",
          costPrefix: "今日消耗：",
        };

  return `({
  request: {
    url: "{{baseUrl}}/v0/management/public/usage/summary",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: "{{apiKey}}", days: 1 })
  },
  extractor: function(response) {
    var stats = response && response.stats ? response.stats : {};
    var calls = Number(stats.total_calls || 0) || 0;
    var cost = Number(stats.quota_cost || 0) || 0;
    return {
      planName: "${labels.planName}",
      isValid: response && response.found === false ? false : true,
      invalidMessage: response && response.found === false ? "${labels.invalidMessage}" : null,
      used: calls,
      remaining: null,
      unit: "${labels.unit}",
      extra: "${labels.costPrefix}" + cost.toFixed(4) + "$"
    };
  }
})`;
}

const isLoopbackHostname = (hostname: string): boolean => {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host === "::1") return true;
  // Rust's Ipv4Addr::is_loopback: the whole 127.0.0.0/8 block.
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
};

/**
 * Whether CC Switch would run a usage script against this root.
 *
 * CC Switch only sends usage requests over HTTPS, with localhost / loopback addresses as
 * the one exception (`usage_script::validate_base_url` and `validate_request_url`). A link
 * that carries the script for a plain-HTTP deployment imports a provider whose usage query
 * fails on every refresh, so such links leave the usage parameters out.
 */
export function canCcSwitchQueryUsage(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && isLoopbackHostname(url.hostname);
  } catch {
    return false;
  }
}
