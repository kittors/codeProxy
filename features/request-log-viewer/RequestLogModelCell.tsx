import { useTranslation } from "react-i18next";
import { isDistinctModelIdentity } from "@code-proxy/domain";
import { VendorIcon } from "@code-proxy/assets";
import { HoverTooltip, OverflowTooltip } from "@code-proxy/ui";
import type { RequestLogsRow } from "./requestLogsRow";

/**
 * 第二行的路由提示：真实发往上游的模型（琥珀点）、视觉补位模型（天蓝点）。
 * 可见文字是「→ 模型名」，读屏读 aria-label 里的完整说明。
 */
function ModelRouteHint({
  label,
  value,
  toneClass,
}: {
  label: string;
  value: string;
  toneClass: string;
}) {
  return (
    <HoverTooltip content={`${label}\n${value}`} placement="top" className="min-w-0">
      <span className="flex min-w-0 items-center gap-1" aria-label={`${label}: ${value}`}>
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${toneClass}`} aria-hidden="true" />
        <span className="truncate">→ {value}</span>
      </span>
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
      <span className="shrink-0 opacity-70">{label}</span>
      <span
        className={
          // Satin Tooltip 浅深主题下均为深色高对比气泡（--sn-tip-bg / --sn-tip-fg），强调色取亮红、正文继承 --sn-tip-fg。
          emphasized ? "font-semibold text-rose-300" : "text-[var(--sn-tip-fg)]"
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
 * Model column of the request log table: vendor icon, the model (with its thinking level), and a
 * second line for the routing — the model really sent upstream, the vision fallback — or, when
 * there is nothing to say about routing, whether it streamed.
 *
 * The routing hints only appear for a genuinely different model. An account alias that merely
 * adds a routing prefix (`ollama/deepseek-v4-flash:0731` for upstream `deepseek-v4-flash:0731`)
 * is the same model under two names, and announcing it as a "real model ID" was noise on every
 * single row of an aliased provider.
 */
export function RequestLogModelCell({ row }: { row: RequestLogsRow }) {
  const { t } = useTranslation();
  if (!row.model) {
    return <span className="text-xs text-sn-label3">--</span>;
  }
  const realModel = isDistinctModelIdentity(row.model, row.upstreamModel) ? row.upstreamModel : "";
  const visionModel = isDistinctModelIdentity(row.model, row.visionFallbackModel)
    ? row.visionFallbackModel
    : "";
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sn-label/[0.04] dark:bg-white/[0.06]">
        <VendorIcon modelId={row.model} size={15} />
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="flex min-w-0 items-center gap-1.5">
          <OverflowTooltip content={row.displayModel || row.model} className="block min-w-0 truncate text-sm font-medium text-sn-label">
            {row.model}
          </OverflowTooltip>
          {row.thinkingLevel ? (
            <span className="shrink-0 rounded-md bg-sn-label/[0.05] px-1.5 text-2xs leading-4 text-sn-label2 dark:bg-white/[0.07]">
              {row.thinkingLevel}
            </span>
          ) : null}
          {row.upstreamModelMismatch && row.upstreamResponseModel ? (
            <UpstreamModelMismatchBadge row={row} />
          ) : null}
        </span>
        <span className="mt-0.5 flex min-w-0 items-center gap-2 text-2xs text-sn-label3">
          {realModel ? (
            <ModelRouteHint
              label={t("request_logs.real_model_id")}
              value={realModel}
              toneClass="bg-amber-500"
            />
          ) : null}
          {visionModel ? (
            <ModelRouteHint
              label={t("request_logs.vision_fallback_model_id")}
              value={visionModel}
              toneClass="bg-sky-500"
            />
          ) : null}
          {!realModel && !visionModel ? (
            <span className="truncate">
              {t(row.streaming ? "request_logs.mode_streaming" : "request_logs.mode_non_streaming")}
            </span>
          ) : null}
        </span>
      </span>
    </span>
  );
}
