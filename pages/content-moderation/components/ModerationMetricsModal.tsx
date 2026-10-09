import { useEffect, useMemo, useState, type ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { Activity, AlertTriangle, CheckCircle2, Clock3, ScanSearch, ShieldX } from "lucide-react";
import { contentModerationApi, type ContentModerationMetrics } from "@code-proxy/api-client";
import { AnimatedNumber, Callout, Modal, Skeleton, surface, iconHueClass } from "@code-proxy/ui";

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
      icon={<Activity />}
      tone="info"
      size="lg"
      onClose={onClose}
    >
      <div className="space-y-4" aria-busy={loading}>
        {/* 「这些数从哪来、什么时候清零」是读这张表的前提，放在最上面；两个标签说明统计的是哪一段。 */}
        <Callout
          tone="info"
          title={
            <span className="flex flex-wrap items-center gap-2">
              {t("content_moderation.metrics_card_title")}
              <span className="rounded-full bg-ink/[0.05] px-2 py-0.5 text-2xs font-semibold text-ink-2 dark:bg-white/[0.07]">
                {t("content_moderation.metrics_badge_sync")}
              </span>
              <span className="rounded-full bg-ink/[0.05] px-2 py-0.5 text-2xs font-semibold text-ink-2 dark:bg-white/[0.07] colorful:bg-emerald-500/10 colorful:text-emerald-700 colorful:dark:text-emerald-300">
                {t("content_moderation.metrics_badge_pre_block")}
              </span>
            </span>
          }
        >
          {t("content_moderation.metrics_card_help")}
        </Callout>

        {error ? (
          <Callout tone="warning" role="alert" title={t("content_moderation.metrics_load_failed")}>
            {error}
          </Callout>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((tile) => {
            const Icon = tile.icon;
            return (
              <article
                key={tile.key}
                className={`flex h-full min-w-0 flex-col p-4 ${surface({ tone: "raised", radius: "2xl" })}`}
              >
                <p className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-ink-3">
                  <Icon size={14} className={`shrink-0 text-ink-3 ${iconHueClass(Icon)}`} aria-hidden="true" />
                  <span className="min-w-0 truncate">{tile.title}</span>
                </p>
                <div className="mt-2.5 min-w-0 overflow-hidden text-2xl font-semibold tracking-tight tabular-nums text-ink">
                  {loading && !metrics ? (
                    <Skeleton className="my-1 h-6 w-16" />
                  ) : (
                    <AnimatedNumber value={tile.value} format={tile.format} />
                  )}
                </div>
                <p className="mt-auto pt-2 text-xs leading-5 text-ink-3">{tile.help}</p>
              </article>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
