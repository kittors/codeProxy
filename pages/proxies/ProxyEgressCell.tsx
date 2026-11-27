import { useTranslation } from "react-i18next";
import { HoverTooltip, StatusTag } from "@code-proxy/ui";
import type { ProxyEgressStatus } from "@code-proxy/api-client/endpoints/proxies";

/** 表格里只要能对上时间线的「14:03」，悬停时再给带日期的完整时间。时区跟随浏览器。 */
const formatTime = (iso: string, locale: string, full = false): string => {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "--";
  return new Intl.DateTimeFormat(
    locale,
    full
      ? { dateStyle: "medium", timeStyle: "medium", hourCycle: "h23" }
      : { hour: "2-digit", minute: "2-digit", hourCycle: "h23" },
  ).format(new Date(ms));
};

const KNOWN_FAULTS = new Set(["auth_rejected", "unreachable"]);

/**
 * 代理池表格里的「出口状态」单元格（自有代理和平台共享代理同一套）。
 *
 * 没被熔断就是「正常」：经它的请求照常转发。被熔断时，后端暂停经它转发、请求直接返回 503，
 * 这里用红标写明原因，下面一行是从几点起、下次几点试探；悬停看拦下了多少次、试探失败了几次。
 * 熔断以后账号卡片不再显示代理报错、被跳过的请求也不进请求日志，这一格是面板上唯一看得到的地方。
 */
export function ProxyEgressCell({
  status,
  known = true,
  now,
}: {
  status?: ProxyEgressStatus;
  /** 后端还没回答过：不能说「正常」。 */
  known?: boolean;
  now?: number;
}) {
  const { t, i18n } = useTranslation();
  if (!known) {
    return <span className="text-xs text-sn-label3">--</span>;
  }
  if (!status) {
    return (
      <StatusTag size="sm" tone="ok">
        {t("proxies.egress_ok")}
      </StatusTag>
    );
  }

  const locale = i18n.language;
  const reason = KNOWN_FAULTS.has(status.fault)
    ? t(`proxies.egress_fault_${status.fault}`)
    : t("proxies.egress_fault_unknown");
  const nextMs = Date.parse(status.nextProbeAt);
  const scheduled = !status.probing && Number.isFinite(nextMs) && nextMs > (now ?? Date.now());
  const next = status.probing
    ? t("proxies.egress_probing")
    : scheduled
      ? t("proxies.egress_next_probe", { time: formatTime(status.nextProbeAt, locale) })
      : t("proxies.egress_waiting_probe");
  // 提示框里这一行已经有「下次试探」的标签，值只写时间。
  const nextValue = scheduled ? formatTime(status.nextProbeAt, locale, true) : next;

  const tooltip = [
    `${t("proxies.egress_tooltip_reason")}: ${reason}`,
    `${t("proxies.egress_tooltip_since")}: ${formatTime(status.since, locale, true)}`,
    `${t("proxies.egress_tooltip_next")}: ${nextValue}`,
    `${t("proxies.egress_tooltip_refused")}: ${status.refused}`,
    `${t("proxies.egress_tooltip_failed_probes")}: ${status.failedProbes}`,
    t("proxies.egress_tooltip_note"),
  ].join("\n");

  return (
    <HoverTooltip content={tooltip} className="max-w-full">
      <div className="min-w-0" data-testid="proxy-egress-open">
        <StatusTag size="sm" tone="bad" className="max-w-full">
          <span className="truncate">{t("proxies.egress_open", { reason })}</span>
        </StatusTag>
        <p className="mt-1 truncate text-xs text-sn-label3">
          {t("proxies.egress_since", { time: formatTime(status.since, locale) })} · {next}
        </p>
      </div>
    </HoverTooltip>
  );
}
