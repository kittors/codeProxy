import { useTranslation } from "react-i18next";
import { isDistinctModelIdentity } from "@code-proxy/domain";
import { HoverTooltip, OverflowTooltip } from "@code-proxy/ui";
import { ModelTag } from "@features/model-tags";
import type { RequestLogsRow } from "./requestLogsShared";

function ModelHintDot({
  label,
  value,
  toneClass,
}: {
  label: string;
  value: string;
  toneClass: string;
}) {
  return (
    <HoverTooltip content={`${label}\n${value}`} placement="top">
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${toneClass}`} aria-label={label} />
    </HoverTooltip>
  );
}

/**
 * Model column of the request log table.
 *
 * The hint dots only appear for a genuinely different model. An account alias that
 * merely adds a routing prefix (`ollama/deepseek-v4-flash:0731` for upstream
 * `deepseek-v4-flash:0731`) is the same model under two names, and announcing it as
 * a "real model ID" was noise on every single row of an aliased provider.
 */
export function RequestLogModelCell({ row }: { row: RequestLogsRow }) {
  const { t } = useTranslation();
  if (!row.model) {
    return <span className="text-xs text-slate-400 dark:text-white/30">--</span>;
  }

  const label = row.displayModel || row.model;
  return (
    <span className="inline-flex max-w-full items-center justify-center gap-1 align-middle">
      <OverflowTooltip content={label} className="min-w-0">
        <ModelTag id={label} size="sm" className="align-middle" />
      </OverflowTooltip>
      {isDistinctModelIdentity(row.model, row.upstreamModel) ? (
        <ModelHintDot
          label={t("request_logs.real_model_id")}
          value={row.upstreamModel}
          toneClass="bg-amber-500"
        />
      ) : null}
      {isDistinctModelIdentity(row.model, row.visionFallbackModel) ? (
        <ModelHintDot
          label={t("request_logs.vision_fallback_model_id")}
          value={row.visionFallbackModel}
          toneClass="bg-sky-500"
        />
      ) : null}
    </span>
  );
}
