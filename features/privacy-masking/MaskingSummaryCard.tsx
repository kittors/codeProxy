import { useTranslation } from "react-i18next";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { AnimatedNumber, Button, SegmentedControl, Skeleton, surface } from "@code-proxy/ui";
import type { MaskSummary } from "@code-proxy/api-client";
import { formatCompact } from "./format";
import { MaskingDayBars } from "./MaskingDayBars";
import { MaskingFlow } from "./MaskingFlow";

/**
 * 观测页的头卡：这段时间没让上游看到的有多少（处数是主角，副指标是不同的值、请求数和被拦下的
 * 请求），每天各多少，以及从哪些客户端来、发往哪些渠道。
 *
 * 脱敏关着、也从没遮过任何东西时，不摆一个 0 出来让人以为「坏了」，而是说清现在请求原样发往
 * 上游，并给出打开的入口。门户只读、开不开由管理员决定：那里只说明，不给入口；流向图右边是上游
 * 厂商而不是渠道，不能点来筛选。
 */
export function MaskingSummaryCard({
  summary,
  enabled,
  days,
  onDays,
  selectedClient,
  selectedChannel,
  onSelect,
  onOpenSettings,
  scope = "tenant",
}: {
  summary: MaskSummary | null;
  enabled: boolean;
  days: 7 | 30;
  onDays: (days: 7 | 30) => void;
  selectedClient?: string;
  selectedChannel?: string;
  onSelect: (side: "client" | "channel", id: string) => void;
  onOpenSettings: () => void;
  scope?: "tenant" | "portal";
}) {
  const { t, i18n } = useTranslation();
  const card = `${surface({ radius: "3xl" })} p-5`;

  if (summary && summary.requests === 0 && !enabled) {
    return (
      <section className={`${card} flex flex-col items-center gap-3 py-12 text-center`}>
        <span className="grid size-11 place-items-center rounded-full bg-ink/[0.05] text-ink-3 dark:bg-white/[0.07]">
          <ShieldOff size={20} aria-hidden="true" />
        </span>
        {scope === "portal" ? (
          <>
            <h2 className="text-base font-semibold text-ink">{t("privacy_masking.portal.off_title")}</h2>
            <p className="max-w-md text-sm text-ink-3">{t("privacy_masking.portal.off_desc")}</p>
          </>
        ) : (
          <>
            <h2 className="text-base font-semibold text-ink">{t("privacy_masking.off.title")}</h2>
            <p className="max-w-md text-sm text-ink-3">{t("privacy_masking.off.description")}</p>
            <Button size="sm" variant="primary" onClick={onOpenSettings}>
              <ShieldCheck size={14} aria-hidden="true" />
              {t("privacy_masking.off.turn_on")}
            </Button>
          </>
        )}
      </section>
    );
  }

  return (
    <section className={card} aria-labelledby="pm-summary-title">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="pm-summary-title" className="text-base font-semibold text-ink">
            {t("privacy_masking.summary.title")}
          </h2>
          <p className="mt-0.5 text-xs text-ink-3">
            {enabled ? t("privacy_masking.summary.subtitle_on") : t("privacy_masking.summary.subtitle_off")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={[
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
              enabled
                ? "bg-violet-500/10 text-violet-700 dark:bg-violet-400/15 dark:text-violet-200"
                : "bg-ink/[0.05] text-ink-3 dark:bg-white/[0.07]",
            ].join(" ")}
          >
            <span aria-hidden="true" className={`size-1.5 rounded-full ${enabled ? "bg-violet-500" : "bg-ink-3"}`} />
            {enabled ? t("privacy_masking.status_on") : t("privacy_masking.status_off")}
          </span>
          <SegmentedControl
            size="sm"
            ariaLabel={t("privacy_masking.range_aria")}
            value={String(days) as "7" | "30"}
            onChange={(value) => onDays(value === "30" ? 30 : 7)}
            options={[
              { value: "7", label: t("privacy_masking.range_7") },
              { value: "30", label: t("privacy_masking.range_30") },
            ]}
          />
        </div>
      </header>

      {summary ? (
        <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] lg:gap-10">
          <div className="flex min-w-0 flex-col gap-7">
            <div>
              <div className="flex items-baseline gap-2">
                <AnimatedNumber
                  value={summary.places}
                  format={(v) => Math.round(v).toLocaleString(i18n.language)}
                  className="text-5xl leading-none font-light tracking-tight text-ink tabular-nums"
                />
              </div>
              <p className="mt-1.5 text-sm text-ink-2">{t("privacy_masking.summary.places", { count: summary.places })}</p>
              <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-3">
                <li className="flex items-baseline gap-1">
                  <span className="font-semibold text-ink tabular-nums">{formatCompact(summary.distinct)}</span>
                  <span>{t("privacy_masking.summary.distinct")}</span>
                </li>
                <li className="flex items-baseline gap-1">
                  <span className="font-semibold text-ink tabular-nums">{formatCompact(summary.requests)}</span>
                  <span>{t("privacy_masking.summary.requests")}</span>
                </li>
                {summary.blocked > 0 ? (
                  <li className="flex items-baseline gap-1">
                    <span className="font-semibold text-rose-600 tabular-nums dark:text-rose-300">{formatCompact(summary.blocked)}</span>
                    <span>{t("privacy_masking.summary.blocked")}</span>
                  </li>
                ) : null}
              </ul>
            </div>
            <MaskingDayBars days={summary.days} />
          </div>
          {summary.clients.length > 0 && summary.channels.length > 0 ? (
            <MaskingFlow
              clients={summary.clients}
              channels={summary.channels}
              selectedClient={selectedClient}
              selectedChannel={selectedChannel}
              onSelect={onSelect}
              channelsSelectable={scope !== "portal"}
            />
          ) : (
            <div className="grid place-items-center rounded-2xl bg-subtle px-6 py-10 text-center text-sm text-ink-3">
              {t("privacy_masking.summary.nothing_yet")}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]" aria-hidden="true">
          <div className="space-y-3">
            <Skeleton className="h-12 w-44" rounded="lg" />
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-12 w-full" rounded="lg" />
          </div>
          <Skeleton className="h-40 w-full" rounded="lg" />
        </div>
      )}
    </section>
  );
}
