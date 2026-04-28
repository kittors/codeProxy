import { Bot, Code2, Sparkles } from "lucide-react";
import type { TFunction } from "i18next";
import {
  CC_SWITCH_CLIENTS,
  pickCcSwitchDefaultModel,
  type CcSwitchClientConfig,
  type CcSwitchClientType,
} from "@/modules/ccswitch/ccswitchImport";

const iconByType: Record<CcSwitchClientType, typeof Bot> = {
  claude: Bot,
  codex: Code2,
  gemini: Sparkles,
};

function ImportOptionButton({
  t,
  client,
  models,
  compact,
  onSelect,
}: {
  t: TFunction;
  client: CcSwitchClientConfig;
  models: readonly string[];
  compact?: boolean;
  onSelect: (clientType: CcSwitchClientType) => void;
}) {
  const Icon = iconByType[client.type];
  const model = pickCcSwitchDefaultModel(client.type, models);
  const label = t(client.labelKey);
  const importLabel = t("ccswitch.import_client", { client: label });

  return (
    <button
      type="button"
      aria-label={importLabel}
      onClick={() => onSelect(client.type)}
      className={[
        "group inline-flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 hover:shadow-md active:translate-y-0 dark:border-neutral-800 dark:bg-neutral-950/70 dark:hover:border-neutral-700 dark:hover:bg-neutral-900",
        compact ? "px-2.5 py-2" : "p-3",
      ].join(" ")}
    >
      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700 transition group-hover:bg-slate-900 group-hover:text-white dark:bg-white/10 dark:text-white/75 dark:group-hover:bg-white dark:group-hover:text-neutral-950">
        <Icon size={15} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">
          {label}
        </span>
        {compact ? null : (
          <span className="mt-0.5 block text-xs text-slate-500 dark:text-white/55">
            {t(client.descriptionKey)}
          </span>
        )}
        {model ? (
          <span className="mt-1 block truncate font-mono text-[10px] text-slate-400 dark:text-white/35">
            {t("ccswitch.model_hint", { model })}
          </span>
        ) : null}
      </span>
    </button>
  );
}

export function CcSwitchImportOptions({
  t,
  models = [],
  compact = false,
  onSelect,
}: {
  t: TFunction;
  models?: readonly string[];
  compact?: boolean;
  onSelect: (clientType: CcSwitchClientType) => void;
}) {
  return (
    <div className={compact ? "flex flex-wrap items-center gap-2" : "grid gap-3 sm:grid-cols-3"}>
      {compact ? (
        <span className="mr-1 text-xs font-semibold text-slate-500 dark:text-white/45">
          {t("ccswitch.import_to_ccswitch")}
        </span>
      ) : null}
      {CC_SWITCH_CLIENTS.map((client) => (
        <ImportOptionButton
          key={client.type}
          t={t}
          client={client}
          models={models}
          compact={compact}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
