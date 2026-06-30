import { useTranslation } from "react-i18next";

interface ProviderKeyStatusBadgesProps {
  editKeyEnabled: boolean;
  editKeyHeaderCount: number;
  editKeyModelCount: number;
  editKeyExcludedCount: number;
  editKeyType: string;
  isModelAccessProvider: boolean;
  allowedOpenCodeCount: number;
  totalOpenCodeModels: number;
  authMode: string;
}

export function ProviderKeyStatusBadges({
  editKeyEnabled,
  editKeyHeaderCount,
  editKeyModelCount,
  editKeyExcludedCount,
  editKeyType,
  isModelAccessProvider,
  allowedOpenCodeCount,
  totalOpenCodeModels,
  authMode,
}: ProviderKeyStatusBadgesProps) {
  const { t } = useTranslation();
  const isBedrock = editKeyType === "bedrock";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className={
          editKeyEnabled
            ? "rounded-full bg-emerald-600/10 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200"
            : "rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-200"
        }
      >
        {editKeyEnabled ? t("providers.enabled") : t("providers.disabled")}
      </span>
      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 dark:border-neutral-800 dark:bg-neutral-950/60 dark:text-white/75">
        {t("providers.headers_optional")}:{" "}
        <span className="font-semibold tabular-nums">{editKeyHeaderCount}</span>
      </span>
      {isModelAccessProvider ? (
        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 dark:border-neutral-800 dark:bg-neutral-950/60 dark:text-white/75">
          {t("providers.models_allowed_count", {
            allowed: allowedOpenCodeCount,
            total: totalOpenCodeModels,
          })}
        </span>
      ) : (
        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 dark:border-neutral-800 dark:bg-neutral-950/60 dark:text-white/75">
          {t("providers.models_label")}:{" "}
          <span className="font-semibold tabular-nums">{editKeyModelCount}</span>
        </span>
      )}
      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 dark:border-neutral-800 dark:bg-neutral-950/60 dark:text-white/75">
        {t("providers.excluded_models_label")}:{" "}
        <span className="font-semibold tabular-nums">{editKeyExcludedCount}</span>
      </span>
      {editKeyType === "vertex" ? (
        <span className="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white dark:bg-white dark:text-neutral-950">
          {t("providers.vertex_alias_required")}
        </span>
      ) : null}
      {isBedrock ? (
        <span className="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white dark:bg-white dark:text-neutral-950">
          {authMode === "sigv4"
            ? t("providers.bedrock_auth_sigv4")
            : t("providers.bedrock_auth_api_key")}
        </span>
      ) : null}
    </div>
  );
}
