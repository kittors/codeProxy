import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Network } from "lucide-react";
import type { ProxyPoolEntry } from "@/lib/http/apis/proxies";
import { Select, type SelectOption } from "@/modules/ui/Select";

interface ProxyPoolSelectProps {
  value: string;
  onChange: (value: string) => void;
  entries: ProxyPoolEntry[];
  label?: string;
  hint?: string;
  ariaLabel?: string;
}

export function ProxyPoolSelect({
  value,
  onChange,
  entries,
  label,
  hint,
  ariaLabel,
}: ProxyPoolSelectProps) {
  const { t } = useTranslation();

  const options = useMemo<SelectOption[]>(() => {
    const normalizedValue = value.trim();
    const seen = new Set<string>();
    const base: SelectOption[] = [{ value: "", label: t("proxies.select_none") }];

    entries.forEach((entry) => {
      const id = entry.id.trim();
      if (!id || seen.has(id)) return;
      seen.add(id);
      base.push({
        value: id,
        label: (
          <span className="flex min-w-0 items-center gap-2">
            <Network size={14} className="shrink-0 text-slate-400 dark:text-white/45" />
            <span className="min-w-0 flex-1 truncate">
              {entry.name || id}
              <span className="ml-1 text-xs text-slate-500 dark:text-white/50">({id})</span>
            </span>
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
  }, [entries, t, value]);

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
