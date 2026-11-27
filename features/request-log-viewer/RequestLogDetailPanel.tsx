import { VendorIcon } from "@code-proxy/assets";
import { maskSensitiveIdentity } from "@code-proxy/domain";
import {
  Button,
  copyTextToClipboard,
  formatDateTime,
  formatDurationMs,
  formatInteger,
} from "@code-proxy/ui";
import { AlertTriangle, ArrowRight, Check, Copy, FileInput, FileOutput } from "@code-proxy/ui/icons";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { formatTokensPerSecondValue } from "./RequestLogGridCells";
import { describeRequestLogClient } from "./requestLogClients";
import { loopStoppedExplanation } from "./requestLogGuard";
import { computeOutputTokensPerSecond, describeThroughput } from "./requestLogMetrics";
import type { RequestLogsRow } from "./requestLogsRow";

/**
 * 行展开后的详情：请求、路由、耗时与用量三栏，失败时最上面一条说明与「查看错误详情」。
 * 单元格悬停提示里的明细这里都有一份完整的，键盘和读屏用户不需要悬停也能读到；
 * 原始 User-Agent 只在这里完整显示（单元格里只在提示中）。
 */

const DASH = "—";

function CopyValue({ value, label }: { value: string; label: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), 1400);
    return () => window.clearTimeout(timer);
  }, [copied]);
  return (
    <button
      type="button"
      onClick={() => {
        void copyTextToClipboard(value).then((ok) => setCopied(ok));
      }}
      aria-label={copied ? t("request_logs.copied_value", { label }) : t("request_logs.copy_value", { label })}
      className="group/copy inline-flex min-w-0 items-center gap-1.5 rounded-md text-left font-mono text-xs text-sn-label transition-colors hover:text-sn-label2"
    >
      <span className="min-w-0 break-all">{value}</span>
      <span className="relative inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center text-sn-label3">
        <span className={copied ? "sn-swap sn-on" : "sn-swap"}>
          <span className="sn-a">
            <Copy size={12} aria-hidden="true" />
          </span>
          <span className="sn-b text-emerald-600 dark:text-emerald-400">
            <Check size={13} aria-hidden="true" />
          </span>
        </span>
      </span>
    </button>
  );
}

/** 标签固定宽度、值左对齐：详情栏很宽时两端对齐会把标签和数值拉开半个屏幕。 */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 grid-cols-[6.5rem_minmax(0,1fr)] items-baseline gap-3 py-1">
      <dt className="text-xs text-sn-label3">{label}</dt>
      <dd className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-xs text-sn-label">{children}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="min-w-0">
      <h4 className="mb-1.5 text-2xs font-semibold tracking-wide text-sn-label3">{title}</h4>
      <dl className="flex flex-col">{children}</dl>
    </section>
  );
}

const muted = (text: string) => <span className="text-sn-label3">{text}</span>;

export function RequestLogDetailPanel({
  row,
  masked,
  hideChannel = false,
  onOpenContent,
  onOpenError,
}: {
  row: RequestLogsRow;
  masked: boolean;
  hideChannel?: boolean;
  onOpenContent?: (row: RequestLogsRow, side: "input" | "output") => void;
  onOpenError?: (row: RequestLogsRow) => void;
}) {
  const { t } = useTranslation();
  const mask = (value: string) => (masked && value ? maskSensitiveIdentity(value) : value);
  const client = describeRequestLogClient(row.clientName);
  const clientLabel = client
    ? client.labelKey
      ? t(client.labelKey)
      : client.label
    : t("request_logs.agent_unknown");
  const tps = computeOutputTokensPerSecond(row);
  const basis = describeThroughput(row);
  const firstToken = row.firstTokenMs ?? 0;
  const latency = row.latencyMs ?? 0;
  const use = row.cacheUse;
  const user = mask(row.endUserDisplayName || row.apiKeyName);
  const keyName = mask(row.apiKeyOwnName || row.apiKeyName);

  return (
    <div className="flex flex-col gap-4 px-5 pb-5 pt-3">
      {row.failed ? (
        <div
          className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl px-3.5 py-2.5 text-xs ${
            row.guardKind
              ? "bg-amber-500/[0.08] text-amber-800 dark:bg-amber-400/10 dark:text-amber-200"
              : "bg-rose-500/[0.07] text-rose-700 dark:bg-rose-400/10 dark:text-rose-300"
          }`}
        >
          <AlertTriangle size={14} className="shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            {row.guardKind
              ? loopStoppedExplanation(t, row.guardKind)
              : t("request_logs.detail_failed")}
          </span>
          {onOpenError ? (
            <Button size="xs" onClick={() => onOpenError(row)}>
              {t("request_logs.view_error_details")}
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className="grid gap-x-8 gap-y-4 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1.15fr]">
        <Section title={t("request_logs.detail_request")}>
          <Field label={t("request_logs.request_id")}>
            <CopyValue value={`#${row.id}`} label={t("request_logs.request_id")} />
          </Field>
          <Field label={t("request_logs.col_time")}>
            <span className="font-mono tabular-nums">
              {Number.isFinite(row.timestampMs) ? formatDateTime(row.timestampMs) : row.timestamp}
            </span>
          </Field>
          {row.isSystemCall ? (
            <Field label={t("request_logs.col_user_name")}>{t("request_logs.system_call")}</Field>
          ) : (
            <>
              {user ? <Field label={t("request_logs.col_user_name")}>{user}</Field> : null}
              {keyName ? <Field label={t("request_logs.col_key_name")}>{keyName}</Field> : null}
              {row.maskedApiKey ? (
                <Field label="Key">
                  <span className="font-mono">{row.maskedApiKey}</span>
                </Field>
              ) : null}
            </>
          )}
          <Field label={t("request_logs.col_agent")}>
            {clientLabel}
            {row.clientVersion ? muted(row.clientVersion) : null}
          </Field>
          <Field label={t("request_logs.user_agent")}>
            {row.userAgent ? (
              <CopyValue value={row.userAgent} label={t("request_logs.user_agent")} />
            ) : (
              muted(t("request_logs.user_agent_missing"))
            )}
          </Field>
        </Section>

        <Section title={t("request_logs.detail_routing")}>
          <Field label={t("request_logs.col_model")}>
            <span className="flex min-w-0 items-center gap-1.5">
              <VendorIcon modelId={row.model} size={13} />
              <span className="break-all">{row.displayModel || row.model || DASH}</span>
            </span>
          </Field>
          {row.upstreamModel && row.upstreamModel !== row.model ? (
            <Field label={t("request_logs.real_model_id")}>
              <span className="flex min-w-0 items-center gap-1.5">
                <ArrowRight size={12} className="shrink-0 text-sn-label3" aria-hidden="true" />
                <span className="break-all">{row.upstreamModel}</span>
              </span>
            </Field>
          ) : null}
          {row.upstreamResponseModel ? (
            <Field label={t("request_logs.upstream_response_model")}>
              <span
                className={`break-all ${row.upstreamModelMismatch ? "font-medium text-rose-600 dark:text-rose-400" : ""}`}
              >
                {row.upstreamResponseModel}
              </span>
            </Field>
          ) : null}
          {row.visionFallbackModel ? (
            <Field label={t("request_logs.vision_fallback_model_id")}>
              <span className="break-all">{row.visionFallbackModel}</span>
            </Field>
          ) : null}
          {!hideChannel ? (
            <Field label={t("request_logs.col_channel")}>
              <span className="break-all">{mask(row.channelName) || DASH}</span>
              {row.channelAuthType ? muted(row.channelAuthType === "oauth" ? "OAuth" : "API") : null}
              {row.channelProvider ? muted(row.channelProvider) : null}
            </Field>
          ) : null}
          <Field label={t("request_logs.col_mode")}>
            {t(row.streaming ? "request_logs.mode_streaming" : "request_logs.mode_non_streaming")}
          </Field>
        </Section>

        <Section title={t("request_logs.detail_usage")}>
          <Field label={t("request_logs.col_duration")}>
            <span className="tabular-nums">{latency > 0 ? formatDurationMs(latency) : DASH}</span>
            {firstToken > 0
              ? muted(
                  `${t("request_logs.first_token_short")} ${formatDurationMs(firstToken)} · ${t("request_logs.generation_time")} ${formatDurationMs(Math.max(0, latency - firstToken))}`,
                )
              : null}
          </Field>
          <Field label={t("request_logs.col_throughput")}>
            {tps !== null && basis ? (
              <>
                <span className="tabular-nums">{formatTokensPerSecondValue(tps)} tok/s</span>
                {muted(t(`request_logs.throughput_basis_${basis.basis}`))}
              </>
            ) : (
              muted(DASH)
            )}
          </Field>
          <Field label={t("request_logs.col_input")}>
            <span className="tabular-nums">{formatInteger(row.inputTokens)}</span>
            {use.kind === "known"
              ? muted(
                  `${t("request_logs.cache_read_tokens")} ${formatInteger(use.readTokens)} · ${t("request_logs.col_cache_write")} ${formatInteger(use.writeTokens)}`,
                )
              : use.kind === "legacy" && use.cachedTokens > 0
                ? muted(`${t("request_logs.cache_read_tokens")} ${formatInteger(use.cachedTokens)}`)
                : null}
          </Field>
          <Field label={t("request_logs.col_output")}>
            <span className="tabular-nums">{formatInteger(row.outputTokens)}</span>
          </Field>
          <Field label={t("request_logs.col_total_token")}>
            <span className="tabular-nums">{formatInteger(row.totalTokens)}</span>
          </Field>
          <Field label={t("request_logs.col_cost")}>
            <span className="tabular-nums">
              {row.cost > 0 ? `$${row.cost.toFixed(6).replace(/0+$/, "").replace(/\.$/, "")}` : DASH}
            </span>
          </Field>
          {row.hasContent && onOpenContent ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="xs" onClick={() => onOpenContent(row, "input")}>
                <FileInput size={12} aria-hidden="true" />
                {t("request_logs.open_input")}
              </Button>
              <Button size="xs" onClick={() => onOpenContent(row, "output")}>
                <FileOutput size={12} aria-hidden="true" />
                {t("request_logs.open_output")}
              </Button>
            </div>
          ) : null}
        </Section>
      </div>
    </div>
  );
}
