import { useEffect, useMemo, useState, type ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { Activity, AlertTriangle, CheckCircle2, Clock3, ScanSearch, ShieldX } from "lucide-react";
import { contentModerationApi, type ContentModerationMetrics } from "@code-proxy/api-client";
import { AnimatedNumber, Modal } from "@code-proxy/ui";

export interface ModerationMetricsModalProps {
  open: boolean;
  onClose: () => void;
}

type MetricTile = {
  key: string;
  title: string;
  help: string;
  value: number;
  format: (value: number) => string;
  icon: ComponentType<{ size?: number; className?: string }>;
};

export function ModerationMetricsModal({ open, onClose }: ModerationMetricsModalProps) {
  const { t } = useTranslation();
  const [metrics, setMetrics] = useState<ContentModerationMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    let active = true;
    let requestPending = false;

    const loadMetrics = async (initial: boolean) => {
      if (requestPending) return;
      requestPending = true;
      if (initial) {
        setLoading(true);
        setError("");
      }
      try {
        const next = await contentModerationApi.getMetrics();
        if (!active) return;
        setMetrics(next);
        setError("");
      } catch (requestError) {
        if (!active) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : t("content_moderation.metrics_load_failed"),
        );
      } finally {
        requestPending = false;
        if (active && initial) setLoading(false);
      }
    };

    void loadMetrics(true);
    const intervalId = window.setInterval(() => void loadMetrics(false), 5000);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [open, t]);

  const numberFormatter = useMemo(() => new Intl.NumberFormat(), []);
  const formatCount = (value: number) => numberFormatter.format(value);
  const formatLatency = (value: number) =>
    t("content_moderation.metrics_latency_value", {
      value: numberFormatter.format(Math.round(value)),
    });

  const tiles: MetricTile[] = [
    {
      key: "in_flight",
      title: t("content_moderation.metrics_in_flight"),
      help: t("content_moderation.metrics_in_flight_help"),
      value: metrics?.in_flight ?? 0,
      format: formatCount,
      icon: Activity,
    },
    {
      key: "requests",
      title: t("content_moderation.metrics_requests"),
      help: t("content_moderation.metrics_requests_help"),
      value: metrics?.requests ?? 0,
      format: formatCount,
      icon: ScanSearch,
    },
    {
      key: "allows",
      title: t("content_moderation.metrics_allows"),
      help: t("content_moderation.metrics_allows_help"),
      value: metrics?.allows ?? 0,
      format: formatCount,
      icon: CheckCircle2,
    },
    {
      key: "blocks",
      title: t("content_moderation.metrics_blocks"),
      help: t("content_moderation.metrics_blocks_help"),
      value: metrics?.blocks ?? 0,
      format: formatCount,
      icon: ShieldX,
    },
    {
      key: "errors",
      title: t("content_moderation.metrics_errors"),
      help: t("content_moderation.metrics_errors_help"),
      value: metrics?.errors ?? 0,
      format: formatCount,
      icon: AlertTriangle,
    },
    {
      key: "avg_latency_ms",
      title: t("content_moderation.metrics_avg_latency"),
      help: t("content_moderation.metrics_avg_latency_help"),
      value: metrics?.avg_latency_ms ?? 0,
      format: formatLatency,
      icon: Clock3,
    },
  ];

  return (
    <Modal
      open={open}
      title={t("content_moderation.metrics_title")}
      description={t("content_moderation.metrics_description")}
      maxWidth="max-w-3xl"
      onClose={onClose}
    >
      <div className="space-y-4" aria-busy={loading}>
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-neutral-800 dark:bg-white/[0.04]">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              {t("content_moderation.metrics_card_title")}
            </p>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600 dark:text-white/65">
              {t("content_moderation.metrics_card_help")}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-900/5 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-white/10 dark:text-white/70">
              {t("content_moderation.metrics_badge_sync")}
            </span>
            <span className="rounded-full bg-emerald-600/10 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200">
              {t("content_moderation.metrics_badge_pre_block")}
            </span>
          </div>
        </div>

        {error ? (
          <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
            {error}
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {tiles.map((tile) => {
            const Icon = tile.icon;
            return (
              <article
                key={tile.key}
                className="flex h-full min-w-0 flex-col rounded-2xl border border-black/[0.06] bg-white p-5 shadow-[0_1px_2px_rgb(15_23_42_/_0.035)] dark:border-white/[0.06] dark:bg-neutral-950/70 dark:shadow-[0_1px_2px_rgb(0_0_0_/_0.22)]"
              >
                <p className="flex min-w-0 items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-white/55">
                  <Icon size={14} className="shrink-0 text-slate-900 dark:text-white" />
                  <span className="min-w-0 truncate">{tile.title}</span>
                </p>
                <p className="mt-3 min-w-0 overflow-hidden text-2xl font-semibold tracking-tight tabular-nums text-slate-900 dark:text-white">
                  {loading && !metrics ? (
                    "…"
                  ) : (
                    <AnimatedNumber value={tile.value} format={tile.format} />
                  )}
                </p>
                <p className="mt-auto pt-2 text-xs text-slate-600 dark:text-white/65">{tile.help}</p>
              </article>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
