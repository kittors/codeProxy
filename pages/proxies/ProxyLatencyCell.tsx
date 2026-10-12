import { useTranslation } from "react-i18next";
import { HoverTooltip } from "@code-proxy/ui";
import {
  proxyLatencyTone,
  type ProxyCheckStateEntry,
  type ProxyLatencyTone,
} from "@features/proxy-pool/proxy-utils";

/**
 * 延迟分档。简约风格只用语义色：快是绿、慢是琥珀、失败是红；中等延迟（300ms–1s）属于正常范围，
 * 中性标签 + 数字就够了。多彩风格下中等叠回琥珀、慢叠回橙色，每一档都有自己的颜色。
 */
const latencyToneClasses: Record<ProxyLatencyTone, string> = {
  none: "bg-ink/[0.05] text-ink-2 dark:bg-white/[0.07]",
  fast: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  medium:
    "bg-ink/[0.05] text-ink-2 dark:bg-white/[0.07] colorful:bg-amber-50 colorful:text-amber-700 colorful:dark:bg-amber-950/30 colorful:dark:text-amber-200",
  slow: "bg-amber-500/10 text-amber-700 dark:text-amber-300 colorful:bg-orange-50 colorful:text-orange-700 colorful:dark:bg-orange-950/30 colorful:dark:text-orange-200",
  failed: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
};

/**
 * 代理池表格里的「服务器延迟」单元格：自有代理和平台共享代理同一套展示。检测都在服务端按 ID
 * 做（共享代理的地址不下发），结果的提示里写明目标是当前部署的服务器。
 */
export function ProxyLatencyCell({ result }: { result?: ProxyCheckStateEntry }) {
  const { t } = useTranslation();
  if (!result || typeof result.ok !== "boolean") {
    return (
      <span className="text-xs text-ink-3">
        {result?.checking ? t("common.loading_ellipsis") : "--"}
      </span>
    );
  }

  const tone = proxyLatencyTone(result);
  const badgeLabel = result.ok
    ? typeof result.latencyMs === "number"
      ? `${result.latencyMs} ms`
      : t("proxies.latency_unknown")
    : typeof result.statusCode === "number" && result.statusCode > 0
      ? `HTTP ${result.statusCode}`
      : t("proxies.check_failed");

  const lines = [
    `${t("proxies.tooltip_status")}: ${result.ok ? t("proxies.check_ok") : t("proxies.check_failed")}`,
    `${t("proxies.tooltip_target")}: ${t("proxies.tooltip_target_server")}`,
  ];
  if (typeof result.latencyMs === "number") {
    lines.push(`${t("proxies.tooltip_latency")}: ${result.latencyMs} ms`);
  }
  if (typeof result.statusCode === "number" && result.statusCode > 0) {
    lines.push(`${t("proxies.tooltip_http_status")}: ${result.statusCode}`);
  }
  if (result.message) {
    lines.push(`${t("proxies.tooltip_error")}: ${result.message}`);
  }
  const tooltipContent = lines.join("\n");

  return (
    <HoverTooltip content={tooltipContent} disabled={!tooltipContent} className="max-w-full">
      <span
        data-latency-tone={tone}
        className={[
          "inline-flex max-w-full rounded-full px-2 py-0.5 text-xs font-semibold",
          latencyToneClasses[tone],
        ].join(" ")}
      >
        <span className="truncate">{badgeLabel}</span>
      </span>
    </HoverTooltip>
  );
}
