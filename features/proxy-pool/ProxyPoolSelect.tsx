import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Network } from "lucide-react";
import type { ProxyPoolEntry } from "@code-proxy/api-client/endpoints/proxies";
import { Select, type SelectOption } from "@code-proxy/ui";
import {
  proxyEndpoint,
  proxyLatencyTone,
  proxyProtocol,
  type ProxyCheckState,
  type ProxyLatencyTone,
} from "./proxy-utils";

interface ProxyPoolSelectProps {
  value: string;
  onChange: (value: string) => void;
  entries: ProxyPoolEntry[];
  label?: string;
  hint?: string;
  ariaLabel?: string;
  noneLabel?: string;
  checkState?: ProxyCheckState;
  showDetails?: boolean;
}

/**
 * 与代理池页同一套分档。简约风格：快是绿、慢是琥珀、失败是红；中等延迟（300ms–1s）属于正常范围，
 * 中性标签 + 数字就够了。多彩风格下中等叠回琥珀、慢叠回橙色，每一档都有自己的颜色。
 */
const latencyToneClasses: Record<ProxyLatencyTone, string> = {
  none: "bg-ink/[0.05] text-ink-3 dark:bg-white/[0.07]",
  fast: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  medium:
    "bg-ink/[0.05] text-ink-2 dark:bg-white/[0.07] colorful:bg-amber-50 colorful:text-amber-700 colorful:dark:bg-amber-950/30 colorful:dark:text-amber-200",
  slow: "bg-amber-500/10 text-amber-700 dark:text-amber-300 colorful:bg-orange-50 colorful:text-orange-700 colorful:dark:bg-orange-950/30 colorful:dark:text-orange-200",
  failed: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
};

export function ProxyPoolSelect({
  value,
  onChange,
  entries,
  label,
  hint,
  ariaLabel,
  noneLabel,
  checkState = {},
  showDetails = false,
}: ProxyPoolSelectProps) {
  const { t } = useTranslation();

  const options = useMemo<SelectOption[]>(() => {
    const normalizedValue = value.trim();
    const seen = new Set<string>();
    const base: SelectOption[] = [{ value: "", label: noneLabel ?? t("proxies.select_none") }];

    entries.forEach((entry) => {
      const id = entry.id.trim();
      if (!id || seen.has(id)) return;
      seen.add(id);
      const result = checkState[id];
      const tone = proxyLatencyTone(result);
      const protocol = proxyProtocol(entry.url);
      const endpoint = proxyEndpoint(entry);
      const displayName = entry.name || id;
      const latencyText =
        typeof result?.latencyMs === "number"
          ? `${result.latencyMs} ms`
          : result?.checking
            ? t("common.loading_ellipsis")
            : "";
      const statusText =
        typeof result?.ok === "boolean"
          ? result.ok
            ? t("proxies.check_ok")
            : t("proxies.check_failed")
          : t("proxies.check_pending");
      const checkSummary = latencyText ? `${statusText} · ${latencyText}` : statusText;
      base.push({
        value: id,
        triggerLabel: showDetails ? (
          <span className="flex min-w-0 items-center gap-2">
            <Network size={14} className="shrink-0 text-ink-3" />
            <span className="min-w-0 flex-1 truncate">{displayName}</span>
            <span className="shrink-0 text-xs font-semibold text-ink-3">
              {protocol} · {endpoint}
            </span>
          </span>
        ) : undefined,
        label: (
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <Network size={14} className="shrink-0 text-ink-3" />
            <span className="min-w-0 flex-1">
              <span className="block truncate">
                {displayName}
                <span className="ml-1 text-xs text-ink-3">({id})</span>
              </span>
              {showDetails ? (
                <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-ink-3">
                  <span className="font-semibold">{protocol}</span>
                  <span className="font-mono">{endpoint}</span>
                  {entry.description ? <span className="truncate">{entry.description}</span> : null}
                  {result?.message && result.ok === false ? (
                    <span className="truncate text-rose-600 dark:text-rose-300">
                      {result.message}
                    </span>
                  ) : null}
                </span>
              ) : null}
            </span>
            {showDetails ? (
              <span
                data-latency-tone={tone}
                className={[
                  "shrink-0 rounded-full px-2 py-0.5 text-2xs font-semibold",
                  latencyToneClasses[tone],
                ].join(" ")}
                title={result?.message}
              >
                {checkSummary}
              </span>
            ) : null}
            {!entry.enabled ? (
              <span className="shrink-0 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-2xs font-semibold text-amber-700 dark:text-amber-300">
                {t("proxies.disabled")}
              </span>
            ) : null}
          </span>
        ),
      });
    });

    if (normalizedValue && !seen.has(normalizedValue)) {
      base.push({
        value: normalizedValue,
        label: t("proxies.select_missing", { id: normalizedValue }),
      });
    }

    return base;
  }, [checkState, entries, noneLabel, showDetails, t, value]);

  return (
    <div className="space-y-2">
      {label ? (
        <p className="text-xs font-semibold text-ink-2">{label}</p>
      ) : null}
      <Select
        value={value.trim()}
        onChange={onChange}
        options={options}
        placeholder={t("proxies.select_placeholder")}
        aria-label={ariaLabel ?? label ?? t("proxies.select_label")}
        className="w-full"
      />
      {hint ? <p className="text-xs text-ink-3">{hint}</p> : null}
    </div>
  );
}
