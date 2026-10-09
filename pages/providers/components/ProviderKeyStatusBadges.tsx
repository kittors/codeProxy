import { useTranslation } from "react-i18next";

const NEUTRAL_BADGE =
  "rounded-full bg-ink/[0.05] px-2.5 py-1 text-xs font-medium text-ink-2 dark:bg-white/[0.07]";

interface ProviderKeyStatusBadgesProps {
  editKeyEnabled: boolean;
  editKeyHeaderCount: number;
  editKeyModelCount: number;
  editKeyExcludedCount: number;
  editKeyType: string;
  showModelBadges: boolean;
  authMode: string;
}

export function ProviderKeyStatusBadges({
  editKeyEnabled,
  editKeyHeaderCount,
  editKeyModelCount,
  editKeyExcludedCount,
  editKeyType,
  showModelBadges,
  authMode,
}: ProviderKeyStatusBadgesProps) {
  const { t } = useTranslation();
  const isBedrock = editKeyType === "bedrock";
  const showExcludedBadge =
    showModelBadges &&
    editKeyType !== "opencode-go" &&
    editKeyType !== "cline" &&
    editKeyType !== "ollama-cloud";

  // 标签不描边：计数一律中性淡底；启用 / 停用是状态，停用用琥珀提醒，启用简约风格是中性、
  // 多彩风格是绿色淡底；「需要别名」「鉴权方式」是说明，不再用一块黑底实色抢眼。
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className={
          editKeyEnabled
            ? `${NEUTRAL_BADGE} colorful:bg-emerald-600/10 colorful:text-emerald-700 colorful:dark:bg-emerald-500/15 colorful:dark:text-emerald-200`
            : "rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300"
        }
      >
        {editKeyEnabled ? t("providers.enabled") : t("providers.disabled")}
      </span>
      <span className={NEUTRAL_BADGE}>
        {t("providers.headers_optional")}:{" "}
        <span className="font-semibold tabular-nums">{editKeyHeaderCount}</span>
      </span>
      {showModelBadges ? (
        <>
          <span className={NEUTRAL_BADGE}>
            {t("providers.models_label")}:{" "}
            <span className="font-semibold tabular-nums">
              {editKeyModelCount}
            </span>
          </span>
          {showExcludedBadge ? (
            <span className={NEUTRAL_BADGE}>
              {t("providers.excluded_models_label")}:{" "}
              <span className="font-semibold tabular-nums">
                {editKeyExcludedCount}
              </span>
            </span>
          ) : null}
        </>
      ) : null}
      {editKeyType === "vertex" ? (
        <span className="rounded-full bg-sky-500/10 px-2.5 py-1 text-xs font-semibold text-sky-700 dark:text-sky-300">
          {t("providers.vertex_alias_required")}
        </span>
      ) : null}
      {isBedrock ? (
        <span className={NEUTRAL_BADGE}>
          {authMode === "sigv4"
            ? t("providers.bedrock_auth_sigv4")
            : t("providers.bedrock_auth_api_key")}
        </span>
      ) : null}
    </div>
  );
}
