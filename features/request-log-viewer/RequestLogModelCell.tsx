import { useTranslation } from "react-i18next";
import { isDistinctModelIdentity } from "@code-proxy/domain";
import { HoverTooltip, OverflowTooltip } from "@code-proxy/ui";
import { ModelTag } from "@features/model-tags";
import type { RequestLogsRow } from "./requestLogsRow";

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

function ModelComparisonRow({
  label,
  value,
  emphasized = false,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <span className="flex items-baseline gap-2 whitespace-nowrap">
      <span className="shrink-0 text-canvas/60">{label}</span>
      <span
        className={
          // 气泡在浅色模式是深底、深色模式反转成浅底，红字的深浅也要跟着反过来。
          emphasized ? "font-semibold text-rose-300 dark:text-rose-600" : "text-canvas"
        }
      >
        {value || "--"}
      </span>
    </span>
  );
}

/**
 * Audit marker for a request the upstream answered as a different model.
 *
 * Rendered as `≠` rather than another coloured dot: the dots next to it describe
 * routing we configured, while this one reports the upstream disagreeing with
 * it, and a glyph says that without relying on the reader telling amber from
 * rose. The verdict itself comes from the server — see usage.UpstreamModelMismatch
 * for which naming differences are deliberately not reported here.
 */
function UpstreamModelMismatchBadge({ row }: { row: RequestLogsRow }) {
  const { t } = useTranslation();
  const sentModel = row.upstreamModel || row.model;
  const title = t("request_logs.upstream_model_mismatch");

  return (
    <HoverTooltip
      placement="top"
      content={
        <span className="flex flex-col gap-1 text-left text-xs">
          <span className="font-semibold text-rose-300 dark:text-rose-600">{title}</span>
          <ModelComparisonRow label={t("request_logs.sent_upstream_model")} value={sentModel} />
          <ModelComparisonRow
            label={t("request_logs.upstream_response_model")}
            value={row.upstreamResponseModel}
            emphasized
          />
        </span>
      }
    >
      <span
        aria-label={`${title}: ${row.upstreamResponseModel}`}
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-rose-500/12 text-2xs font-bold leading-none text-rose-600 dark:bg-rose-400/20 dark:text-rose-300"
      >
        ≠
      </span>
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
    return <span className="text-xs text-ink-3">--</span>;
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
      {row.upstreamModelMismatch && row.upstreamResponseModel ? (
        <UpstreamModelMismatchBadge row={row} />
      ) : null}
    </span>
  );
}
