import { KeyRound, RotateCcw, Star, Trash2 } from "lucide-react";
import { HoverTooltip } from "@code-proxy/ui";
import type { EndUserAPIKey } from "@code-proxy/api-client";

const iconBtnClass =
  "rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-white/50 dark:hover:bg-neutral-800";

export function ManageKeysTabContent({
  t,
  keys,
  busy,
  onSetDefault,
  onRotate,
  onDelete,
}: {
  t: (key: string, options?: Record<string, unknown>) => string;
  keys: EndUserAPIKey[];
  busy?: boolean;
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
        {keys.map((k) => {
          const setDefaultLabel = t("apikey_lookup.set_default", { defaultValue: "设默认" });
          const rotateLabel = t("apikey_lookup.rotate_key", { defaultValue: "重置" });
          const deleteLabel = t("common.delete", { defaultValue: "删除" });
          const keepOneLabel = t("apikey_lookup.keep_one_key", { defaultValue: "至少保留一把 Key" });
          const canDelete = keys.length > 1;

          return (
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
              <div className="flex shrink-0 items-center gap-1.5">
                {!k.is_default ? (
                  <HoverTooltip content={setDefaultLabel}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onSetDefault(k)}
                      className={`${iconBtnClass} hover:text-emerald-600 dark:hover:text-emerald-400`}
                      aria-label={setDefaultLabel}
                    >
                      <Star size={15} />
                    </button>
                  </HoverTooltip>
                ) : null}
                <HoverTooltip content={rotateLabel}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onRotate(k)}
                    className={`${iconBtnClass} hover:text-orange-600 dark:hover:text-orange-400`}
                    aria-label={rotateLabel}
                  >
                    <RotateCcw size={15} />
                  </button>
                </HoverTooltip>
                <HoverTooltip content={canDelete ? deleteLabel : keepOneLabel}>
                  <button
                    type="button"
                    disabled={busy || !canDelete}
                    onClick={() => onDelete(k)}
                    className={`${iconBtnClass} hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400`}
                    aria-label={canDelete ? deleteLabel : keepOneLabel}
                  >
                    <Trash2 size={15} />
                  </button>
                </HoverTooltip>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
