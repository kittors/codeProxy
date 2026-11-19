import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Ban, ListFilter, ShieldCheck } from "lucide-react";
import { ipAccessApi, type AuthAttemptWindow, type AuthSourceSummary } from "@code-proxy/api-client";
import {
  GRID_WIDTH,
  DataGrid,
  Select,
  GRID_ROW_ACTIONS_COLUMN,
  GridRowActions,
  type GridRowAction,
  type DataGridColumn,
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
  const [items, setItems] = useState<AuthSourceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [window_, setWindow] = useState<AuthAttemptWindow>("24h");

  const load = useCallback(
    async (next: AuthAttemptWindow) => {
      setLoading(true);
      try {
        const response = await ipAccessApi.summary({ window: next });
        setItems(response.items ?? []);
        setLoadError(null);
      } catch (error) {
        // 读不到时表格显示出错态和「重试」，不是一张看起来「没有威胁」的空表。
        setLoadError(error instanceof Error ? error.message : "");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void load(window_);
  }, [load, window_, refreshToken]);

  const columns = useMemo<DataGridColumn<AuthSourceSummary>[]>(
    () => [
      {
        id: "source",
        header: t("ip_access.col_source"),
        width: GRID_WIDTH.name,
        overflowTooltip: true,
        cell: (item) => (
          <span className="font-mono text-sm text-ink">
            {item.sample_ip || item.ip_prefix}
            {item.trusted ? "" : ` (${t("ip_access.untrusted_short")})`}
          </span>
        ),
      },
      {
        id: "failures",
        header: t("ip_access.col_failures"),
        width: GRID_WIDTH.numericWide,
        cell: (item) => (
          <span className="tabular-nums font-medium text-rose-600 dark:text-rose-300">
            {item.failures}
          </span>
        ),
      },
      {
        id: "attempts",
        header: t("ip_access.col_attempts"),
        width: GRID_WIDTH.numericWide,
        cell: (item) => <span className="tabular-nums">{item.attempts}</span>,
      },
      {
        id: "successes",
        header: t("ip_access.col_successes"),
        width: GRID_WIDTH.numericWide,
        // Failures followed by a success is the strongest signal on this page, so
        // it gets its own column instead of being folded into the attempt count.
        cell: (item) =>
          item.successes > 0 ? (
            <span className="tabular-nums font-medium text-amber-600 dark:text-amber-300">
              {item.successes}
            </span>
          ) : (
            <span className="tabular-nums text-ink-3">0</span>
          ),
      },
      {
        id: "usernames",
        header: t("ip_access.col_usernames"),
        width: GRID_WIDTH.numericWide,
        cell: (item) => <span className="tabular-nums">{item.distinct_usernames}</span>,
      },
      {
        id: "last_seen",
        header: t("ip_access.col_last_seen"),
        width: GRID_WIDTH.timestamp,
        cell: (item) => new Date(item.last_seen).toLocaleString(i18n.language),
      },
      {
        id: "state",
        header: t("ip_access.col_state"),
        width: GRID_WIDTH.compact,
        cell: (item) => <SourceState summary={item} />,
      },
      {
        id: "actions",
        header: t("ip_access.col_actions"),
        ...GRID_ROW_ACTIONS_COLUMN,
        cell: (item) => {
          const inspect: GridRowAction = {
            key: "inspect",
            label: t("ip_access.inspect"),
            icon: <ListFilter />,
            onClick: () => onInspect(item.ip_prefix),
          };
          // 查看人人可点，封禁 / 放行要写权限：没权限时只剩「查看」，仍是同一组按钮、同一种对齐。
          return (
            <PermissionGate
              permission="platform.ip_access.write"
              fallback={<GridRowActions actions={[inspect]} />}
            >
              <GridRowActions
                actions={[
                  inspect,
                  {
                    key: "ban",
                    label: t("ip_access.ban_source"),
                    icon: <Ban />,
                    disabled: !item.trusted,
                    onClick: () => onBan(item.ip_prefix),
                  },
                  {
                    key: "allow",
                    label: t("ip_access.allow_source"),
                    icon: <ShieldCheck />,
                    disabled: !item.trusted,
                    onClick: () => onAllow(item.ip_prefix),
                  },
                ]}
              />
            </PermissionGate>
          );
        },
      },
    ],
    [i18n.language, onAllow, onBan, onInspect, t],
  );

  return (
    <>
      <div className="pb-3">
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
          <span className="text-xs text-ink-3">
            {t("ip_access.overview_description")}
          </span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <DataGrid<AuthSourceSummary>
          fill
          id="ip-access-threat-overview"
          label={t("ip_access.tab_overview")}
          rows={items}
          columns={columns}
          rowKey={(item) => item.ip_prefix}
          loading={loading}
          error={loadError === null ? null : loadError || t("ip_access.load_failed")}
          onRetry={() => void load(window_)}
          empty={{ title: t("ip_access.no_threats") }}
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
  danger: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  warning: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  neutral: "bg-ink/[0.05] text-ink-2 dark:bg-white/[0.07]",
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
