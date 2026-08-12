import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Ban, ListFilter, ShieldCheck } from "lucide-react";
import { ipAccessApi, type AuthAttemptWindow, type AuthSourceSummary } from "@code-proxy/api-client";
import {
  Button,
  COLUMN_WIDTH,
  DataTable,
  Select,
  TABLE_ROW_ACTIONS_COLUMN,
  useToast,
  type DataTableColumn,
} from "@code-proxy/ui";
import { PermissionGate } from "@app/providers/PermissionGate";

const WINDOW_OPTIONS: AuthAttemptWindow[] = ["1h", "6h", "24h", "7d"];

interface ThreatOverviewTabProps {
  onBan: (cidr: string) => void;
  onAllow: (cidr: string) => void;
  onInspect: (ipPrefix: string) => void;
  refreshToken: number;
}

export function ThreatOverviewTab({
  onBan,
  onAllow,
  onInspect,
  refreshToken,
}: ThreatOverviewTabProps) {
  const { t, i18n } = useTranslation();
  const { notify } = useToast();
  const [items, setItems] = useState<AuthSourceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [window_, setWindow] = useState<AuthAttemptWindow>("24h");

  const load = useCallback(
    async (next: AuthAttemptWindow) => {
      setLoading(true);
      try {
        const response = await ipAccessApi.summary({ window: next });
        setItems(response.items ?? []);
      } catch (error) {
        notify({
          type: "error",
          message: error instanceof Error ? error.message : t("ip_access.load_failed"),
        });
      } finally {
        setLoading(false);
      }
    },
    [notify, t],
  );

  useEffect(() => {
    void load(window_);
  }, [load, window_, refreshToken]);

  const columns = useMemo<DataTableColumn<AuthSourceSummary>[]>(
    () => [
      {
        key: "source",
        label: t("ip_access.col_source"),
        width: COLUMN_WIDTH.name,
        overflowTooltip: true,
        render: (item) => (
          <span className="font-mono text-sm text-slate-900 dark:text-white">
            {item.sample_ip || item.ip_prefix}
            {item.trusted ? "" : ` (${t("ip_access.untrusted_short")})`}
          </span>
        ),
      },
      {
        key: "failures",
        label: t("ip_access.col_failures"),
        width: COLUMN_WIDTH.numericWide,
        render: (item) => (
          <span className="tabular-nums font-medium text-rose-600 dark:text-rose-300">
            {item.failures}
          </span>
        ),
      },
      {
        key: "attempts",
        label: t("ip_access.col_attempts"),
        width: COLUMN_WIDTH.numericWide,
        render: (item) => <span className="tabular-nums">{item.attempts}</span>,
      },
      {
        key: "successes",
        label: t("ip_access.col_successes"),
        width: COLUMN_WIDTH.numericWide,
        // Failures followed by a success is the strongest signal on this page, so
        // it gets its own column instead of being folded into the attempt count.
        render: (item) =>
          item.successes > 0 ? (
            <span className="tabular-nums font-medium text-amber-600 dark:text-amber-300">
              {item.successes}
            </span>
          ) : (
            <span className="tabular-nums text-slate-400">0</span>
          ),
      },
      {
        key: "usernames",
        label: t("ip_access.col_usernames"),
        width: COLUMN_WIDTH.numericWide,
        render: (item) => <span className="tabular-nums">{item.distinct_usernames}</span>,
      },
      {
        key: "last_seen",
        label: t("ip_access.col_last_seen"),
        width: COLUMN_WIDTH.timestamp,
        render: (item) => new Date(item.last_seen).toLocaleString(i18n.language),
      },
      {
        key: "state",
        label: t("ip_access.col_state"),
        width: COLUMN_WIDTH.compact,
        render: (item) => <SourceState summary={item} />,
      },
      {
        key: "actions",
        label: t("ip_access.col_actions"),
        ...TABLE_ROW_ACTIONS_COLUMN,
        lockOrder: "end" as const,
        render: (item) => (
          <div className="flex items-center gap-1.5">
            <Button
              size="xs"
              variant="ghost"
              tooltip={t("ip_access.inspect")}
              onClick={() => onInspect(item.ip_prefix)}
            >
              <ListFilter size={15} />
            </Button>
            <PermissionGate permission="platform.ip_access.write">
              <Button
                size="xs"
                variant="ghost"
                tooltip={t("ip_access.ban_source")}
                disabled={!item.trusted}
                onClick={() => onBan(item.ip_prefix)}
              >
                <Ban size={15} />
              </Button>
              <Button
                size="xs"
                variant="ghost"
                tooltip={t("ip_access.allow_source")}
                disabled={!item.trusted}
                onClick={() => onAllow(item.ip_prefix)}
              >
                <ShieldCheck size={15} />
              </Button>
            </PermissionGate>
          </div>
        ),
      },
    ],
    [i18n.language, onAllow, onBan, onInspect, t],
  );

  return (
    <>
      <div className="border-t border-slate-100 px-5 py-3 dark:border-white/8">
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-full min-[480px]:w-auto sm:w-[140px]">
            <Select
              value={window_}
              onChange={(value) => setWindow(value as AuthAttemptWindow)}
              options={WINDOW_OPTIONS.map((option) => ({
                value: option,
                label: t(`ip_access.window_${option}`),
              }))}
              size="sm"
              fullWidth
              aria-label={t("ip_access.filter_window")}
            />
          </div>
          <span className="text-xs text-slate-500 dark:text-white/50">
            {t("ip_access.overview_description")}
          </span>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden px-5">
        <DataTable<AuthSourceSummary>
          tableId="ip-access-threat-overview"
          rows={items}
          columns={columns}
          rowKey={(item) => item.ip_prefix}
          loading={loading}
          virtualize={false}
          height="h-full"
          minHeight="min-h-full"
          minWidth="min-w-[900px]"
          emptyText={t("ip_access.no_threats")}
          showAllLoadedMessage={false}
        />
      </div>
    </>
  );
}

function SourceState({ summary }: { summary: AuthSourceSummary }) {
  const { t } = useTranslation();
  if (summary.rule_effect === "deny") {
    return <StateBadge tone="danger" label={t("ip_access.state_blocked")} />;
  }
  if (summary.rule_effect === "allow") {
    return <StateBadge tone="success" label={t("ip_access.state_allowed")} />;
  }
  if (summary.throttled > 0) {
    return <StateBadge tone="warning" label={t("ip_access.state_throttled")} />;
  }
  return <StateBadge tone="neutral" label={t("ip_access.state_none")} />;
}

const STATE_TONE = {
  danger: "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  warning: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  success: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  neutral: "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-white/70",
} as const;

function StateBadge({ tone, label }: { tone: keyof typeof STATE_TONE; label: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATE_TONE[tone]}`}
    >
      {label}
    </span>
  );
}
