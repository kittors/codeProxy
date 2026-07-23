import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Activity, AlertTriangle, CheckCircle2, Clock3, ScanSearch, ShieldX } from "lucide-react";
import { contentModerationApi, type ContentModerationMetrics } from "@code-proxy/api-client";
import { Modal } from "@code-proxy/ui";

export interface ModerationMetricsModalProps {
  open: boolean;
  onClose: () => void;
}

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
  const averageLatency = metrics?.avg_latency_ms ?? 0;
  const tiles = [
    {
      key: "in_flight",
      label: t("content_moderation.metrics_in_flight"),
      help: t("content_moderation.metrics_in_flight_help"),
      value: numberFormatter.format(metrics?.in_flight ?? 0),
      icon: Activity,
      tone: "text-cyan-300",
    },
    {
      key: "requests",
      label: t("content_moderation.metrics_requests"),
      help: t("content_moderation.metrics_requests_help"),
      value: numberFormatter.format(metrics?.requests ?? 0),
      icon: ScanSearch,
      tone: "text-sky-300",
    },
    {
      key: "allows",
      label: t("content_moderation.metrics_allows"),
      help: t("content_moderation.metrics_allows_help"),
      value: numberFormatter.format(metrics?.allows ?? 0),
      icon: CheckCircle2,
      tone: "text-emerald-300",
    },
    {
      key: "blocks",
      label: t("content_moderation.metrics_blocks"),
      help: t("content_moderation.metrics_blocks_help"),
      value: numberFormatter.format(metrics?.blocks ?? 0),
      icon: ShieldX,
      tone: "text-rose-300",
    },
    {
      key: "errors",
      label: t("content_moderation.metrics_errors"),
      help: t("content_moderation.metrics_errors_help"),
      value: numberFormatter.format(metrics?.errors ?? 0),
      icon: AlertTriangle,
      tone: "text-amber-300",
    },
    {
      key: "avg_latency_ms",
      label: t("content_moderation.metrics_avg_latency"),
      help: t("content_moderation.metrics_avg_latency_help"),
      value: t("content_moderation.metrics_latency_value", {
        value: numberFormatter.format(Math.round(averageLatency)),
      }),
      icon: Clock3,
      tone: "text-violet-300",
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
      <div
        className="rounded-2xl border border-slate-800 bg-slate-950 p-4 text-white shadow-[0_18px_50px_rgb(2_6_23_/_0.28)] sm:p-5"
        aria-busy={loading}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold tracking-tight">
              {t("content_moderation.metrics_card_title")}
            </p>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-400">
              {t("content_moderation.metrics_card_help")}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <span className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-2.5 py-1 text-2xs font-medium text-cyan-200">
              {t("content_moderation.metrics_badge_sync")}
            </span>
            <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-2xs font-medium text-emerald-200">
              {t("content_moderation.metrics_badge_pre_block")}
            </span>
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
            {error}
          </div>
        ) : null}

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((tile) => {
            const Icon = tile.icon;
            return (
              <div
                key={tile.key}
                className="min-h-32 rounded-xl border border-white/[0.08] bg-white/[0.045] p-3.5"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-medium text-slate-300">{tile.label}</p>
                  <Icon size={17} className={tile.tone} aria-hidden="true" />
                </div>
                <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums text-white">
                  {loading && !metrics ? "…" : tile.value}
                </p>
                <p className="mt-2 text-2xs leading-4 text-slate-500">{tile.help}</p>
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
