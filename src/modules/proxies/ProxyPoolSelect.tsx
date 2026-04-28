import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Network } from "lucide-react";
import type { ProxyPoolEntry } from "@/lib/http/apis/proxies";
import { Select, type SelectOption } from "@/modules/ui/Select";
import {
  proxyEndpoint,
  proxyLatencyTone,
  proxyProtocol,
  type ProxyCheckState,
  type ProxyLatencyTone,
} from "@/modules/proxies/proxy-utils";

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

const latencyToneClasses: Record<ProxyLatencyTone, string> = {
  none: "bg-slate-100 text-slate-500 dark:bg-neutral-900 dark:text-white/45",
  fast: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300",
  medium: "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-200",
  slow: "bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-200",
  failed: "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300",
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
      const latencyText =
        typeof result?.latencyMs === "number"
          ? `${result.latencyMs} ms`
          : result?.checking
            ? t("common.loading_ellipsis")
            : t("proxies.latency_unknown");
      const statusText =
        typeof result?.ok === "boolean"
          ? result.ok
            ? t("proxies.check_ok")
            : t("proxies.check_failed")
          : t("proxies.check_pending");
      base.push({
        value: id,
        label: (
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <Network size={14} className="shrink-0 text-slate-400 dark:text-white/45" />
            <span className="min-w-0 flex-1">
              <span className="block truncate">
                {entry.name || id}
                <span className="ml-1 text-xs text-slate-500 dark:text-white/50">({id})</span>
              </span>
              {showDetails ? (
                <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-white/50">
                  <span className="font-semibold">{proxyProtocol(entry.url)}</span>
                  <span className="font-mono">{proxyEndpoint(entry)}</span>
                  {entry.description ? <span className="truncate">{entry.description}</span> : null}
                </span>
              ) : null}
            </span>
            {showDetails ? (
              <span
                data-latency-tone={tone}
                className={[
                  "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                  latencyToneClasses[tone],
                ].join(" ")}
                title={result?.message}
              >
                {statusText} · {latencyText}
              </span>
            ) : null}
            {!entry.enabled ? (
              <span className="shrink-0 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-200">
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
        <p className="text-xs font-semibold text-slate-700 dark:text-white/75">{label}</p>
      ) : null}
      <Select
        value={value.trim()}
        onChange={onChange}
        options={options}
        placeholder={t("proxies.select_placeholder")}
        aria-label={ariaLabel ?? label ?? t("proxies.select_label")}
        className="w-full"
      />
      {hint ? <p className="text-xs text-slate-500 dark:text-white/55">{hint}</p> : null}
    </div>
  );
}
