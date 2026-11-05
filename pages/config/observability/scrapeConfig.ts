/**
 * 指标接口的抓取地址与 Prometheus 配置片段。
 *
 * 地址取面板正在连的后端（apiBase），不是面板页面自己的地址：面板可以连别的服务器。
 * 后端挂在子路径下时（反向代理把 /relay 转给它），metrics_path 要带上这段前缀。
 */

/**
 * 片段里令牌文件的建议位置。令牌只在生成时显示一次，片段里永远不放明文：
 * Prometheus 配置常进版本库，credentials_file 让令牌只留在抓取机上。
 */
export const CREDENTIALS_FILE = "/etc/prometheus/clirelay-metrics.token";

export interface ScrapeTarget {
  scheme: "http" | "https";
  /** host[:port]，Prometheus static_configs 的 target。 */
  host: string;
  /** 带子路径前缀的完整抓取路径，例如 /metrics 或 /relay/metrics。 */
  metricsPath: string;
  /** 完整地址，给人看和复制。 */
  url: string;
}

export function scrapeTarget(apiBase: string, path: string): ScrapeTarget | null {
  const metricsSuffix = path.startsWith("/") ? path : `/${path}`;
  try {
    const url = new URL(apiBase);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const prefix = url.pathname.replace(/\/+$/, "");
    const metricsPath = `${prefix}${metricsSuffix}`;
    return {
      scheme: url.protocol === "https:" ? "https" : "http",
      host: url.host,
      metricsPath,
      url: `${url.protocol}//${url.host}${metricsPath}`,
    };
  } catch {
    return null;
  }
}

/** YAML 双引号字符串；路径和主机名不会含引号，转义只是防御。 */
const quoted = (value: string) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/** Prometheus 的 scrape_configs 片段，令牌从 credentialsFile 读取。 */
export function prometheusScrapeConfig(target: ScrapeTarget, credentialsFile: string) {
  return [
    "scrape_configs:",
    "  - job_name: clirelay",
    `    scheme: ${target.scheme}`,
    `    metrics_path: ${quoted(target.metricsPath)}`,
    "    authorization:",
    "      type: Bearer",
    `      credentials_file: ${quoted(credentialsFile)}`,
    "    static_configs:",
    `      - targets: [${quoted(target.host)}]`,
  ].join("\n");
}
