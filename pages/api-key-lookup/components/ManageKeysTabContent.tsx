import { KeyRound, Star, Trash2 } from "lucide-react";
import { Button } from "@code-proxy/ui";
import type { EndUserAPIKey } from "@code-proxy/api-client";

export function ManageKeysTabContent({
  t,
  keys,
  busy,
  onViewUsage,
  onSetDefault,
  onRotate,
  onDelete,
}: {
  t: (key: string, options?: Record<string, unknown>) => string;
  keys: EndUserAPIKey[];
  busy?: boolean;
  onViewUsage: (key: EndUserAPIKey) => void;
  onSetDefault: (key: EndUserAPIKey) => void;
  onRotate: (key: EndUserAPIKey) => void;
  onDelete: (key: EndUserAPIKey) => void;
}) {
  if (keys.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 px-6 py-16 text-center dark:border-neutral-800">
        <KeyRound size={28} className="mb-3 text-slate-400" />
        <p className="text-sm text-slate-500 dark:text-white/55">
          {t("apikey_lookup.no_keys", { defaultValue: "暂无 Key" })}
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 dark:border-white/10">
      <div className="divide-y divide-slate-100 dark:divide-white/10">
        {keys.map((k) => (
          <div
            key={k.id}
            className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate font-medium text-slate-900 dark:text-white">
                  {k.name || k.id.slice(0, 8)}
                </span>
                {k.is_default ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                    <Star size={12} />
                    {t("apikey_lookup.default_key", { defaultValue: "默认" })}
                  </span>
                ) : null}
                {k.disabled ? (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-white/10 dark:text-white/50">
                    {t("common.disabled", { defaultValue: "已停用" })}
                  </span>
                ) : null}
              </div>
              <code className="mt-1 block truncate text-xs text-slate-500 dark:text-white/45">
                {k.key_masked}
              </code>
            </div>
            <div className="flex shrink-0 flex-wrap gap-1.5">
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => onViewUsage(k)}>
                {t("apikey_lookup.view_usage", { defaultValue: "查看用量" })}
              </Button>
              {!k.is_default ? (
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => onSetDefault(k)}>
                  {t("apikey_lookup.set_default", { defaultValue: "设默认" })}
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => onRotate(k)}>
                {t("apikey_lookup.rotate_key", { defaultValue: "重置" })}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy || keys.length <= 1}
                onClick={() => onDelete(k)}
                className="text-rose-600 hover:text-rose-700 dark:text-rose-300"
                title={
                  keys.length <= 1
                    ? t("apikey_lookup.keep_one_key", { defaultValue: "至少保留一把 Key" })
                    : undefined
                }
              >
                <Trash2 size={14} />
                {t("common.delete", { defaultValue: "删除" })}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
