import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, Ban, Boxes, ChevronRight, Loader2, ShieldAlert, TerminalSquare, X, type LucideIcon } from "lucide-react";
import { VendorIcon, hasVendorIcon } from "@code-proxy/assets";
import { Button, SegmentedControl, surface } from "@code-proxy/ui";
import type { MaskRecord, MaskSummary } from "@code-proxy/api-client";
import { formatCompact } from "./format";
import { ACTION_CHIP, clientMeta, maskCategory } from "./maskKinds";
import { KindChip } from "./KindChip";
import { MaskingValueRanking } from "./MaskingValueRanking";

export type FeedMode = "request" | "value";
export type FeedFacet = "" | "secret" | "personal" | "word" | "rule" | "warn" | "block";

/** 一类有多少处，分面上的数字：类目从 summary.kinds 加总，提醒和拦截各有自己的计数。 */
function facetCounts(summary: MaskSummary | null): Record<FeedFacet, number> {
  const counts: Record<FeedFacet, number> = { "": 0, secret: 0, personal: 0, word: 0, rule: 0, warn: 0, block: 0 };
  if (!summary) return counts;
  counts[""] = summary.places;
  for (const kind of summary.kinds) counts[maskCategory(kind.kind)] += kind.places;
  counts.warn = summary.warned;
  counts.block = summary.blocked;
  return counts;
}

const FACET_DOT: Record<Exclude<FeedFacet, "">, string> = {
  secret: "bg-violet-500",
  personal: "bg-sky-500",
  word: "bg-amber-500",
  rule: "bg-indigo-500",
  warn: "bg-amber-500",
  block: "bg-rose-500",
};

function dayLabel(iso: string, language: string, t: (key: string) => string) {
  const date = new Date(iso);
  const today = new Date();
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((start(today) - start(date)) / 86_400_000);
  if (diff === 0) return t("privacy_masking.today");
  if (diff === 1) return t("privacy_masking.yesterday");
  return date.toLocaleDateString(language, { month: "long", day: "numeric", weekday: "short" });
}

export function MaskingFeed({
  summary,
  mode,
  onMode,
  facet,
  onFacet,
  records,
  loading,
  loadingMore,
  hasMore,
  onLoadMore,
  live,
  filters,
  onClearFilter,
  onOpen,
  onPickKind,
}: {
  summary: MaskSummary | null;
  mode: FeedMode;
  onMode: (mode: FeedMode) => void;
  facet: FeedFacet;
  onFacet: (facet: FeedFacet) => void;
  records: MaskRecord[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  live: boolean;
  filters: Array<{ key: string; label: string }>;
  onClearFilter: (key: string) => void;
  onOpen: (record: MaskRecord) => void;
  onPickKind: (kind: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const counts = facetCounts(summary);
  const facets: FeedFacet[] = ["", "secret", "personal", "word", "rule", "warn", "block"];

  const groups = useMemo(() => {
    const out: Array<{ day: string; label: string; items: MaskRecord[] }> = [];
    for (const record of records) {
      const date = new Date(record.at);
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      const last = out[out.length - 1];
      if (last && last.day === key) last.items.push(record);
      else out.push({ day: key, label: dayLabel(record.at, i18n.language, t), items: [record] });
    }
    return out;
  }, [records, i18n.language, t]);

  return (
    <section className={`${surface({ radius: "3xl" })} @container overflow-hidden`} aria-label={t("privacy_masking.feed.title")}>
      <div className="flex flex-wrap items-center gap-3 px-5 pt-4">
        <SegmentedControl
          size="sm"
          ariaLabel={t("privacy_masking.feed.mode_aria")}
          value={mode}
          onChange={onMode}
          options={[
            { value: "request", label: t("privacy_masking.feed.by_request") },
            { value: "value", label: t("privacy_masking.feed.by_value") },
          ]}
        />
        {live ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-ink-3" title={t("privacy_masking.feed.live_hint")}>
            <span className="relative flex size-2" aria-hidden="true">
              <span className="absolute inline-flex size-full rounded-full bg-emerald-400 opacity-60 motion-safe:animate-ping" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            {t("privacy_masking.feed.live")}
          </span>
        ) : null}
        <span className="flex-1" />
        {filters.map((filter) => (
          <button
            key={filter.key}
            type="button"
            onClick={() => onClearFilter(filter.key)}
            className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 py-1 pr-1.5 pl-2.5 text-xs font-medium text-violet-700 transition-colors hover:bg-violet-500/15 dark:bg-violet-400/15 dark:text-violet-200"
            title={t("privacy_masking.feed.clear_filter")}
          >
            {filter.label}
            <X size={12} aria-hidden="true" />
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5 px-5 pt-3 pb-3" role="group" aria-label={t("privacy_masking.feed.facets_aria")}>
        {facets
          .filter((f) => f === "" || counts[f] > 0 || facet === f)
          .map((f) => {
            const active = facet === f;
            return (
              <button
                key={f || "all"}
                type="button"
                aria-pressed={active}
                onClick={() => onFacet(f)}
                className={[
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs transition-colors",
                  active
                    ? "bg-violet-500/12 text-violet-700 dark:bg-violet-400/20 dark:text-violet-100"
                    : "bg-ink/[0.04] text-ink-2 hover:bg-ink/[0.07] dark:bg-white/[0.06] dark:hover:bg-white/[0.09]",
                ].join(" ")}
              >
                {f ? <span aria-hidden="true" className={`size-1.5 rounded-full ${FACET_DOT[f]}`} /> : null}
                <span>{t(`privacy_masking.facet.${f || "all"}`)}</span>
                <span className={`font-semibold tabular-nums ${active ? "" : "text-ink"}`}>
                  {formatCompact(counts[f])}
                </span>
              </button>
            );
          })}
      </div>

      {mode === "value" ? (
        <MaskingValueRanking summary={summary} facet={facet} onPickKind={onPickKind} />
      ) : loading && records.length === 0 ? (
        <div className="grid place-items-center py-16 text-ink-3">
          <Loader2 size={18} className="animate-spin" aria-hidden="true" />
        </div>
      ) : records.length === 0 ? (
        <p className="px-5 py-14 text-center text-sm text-ink-3">
          {filters.length > 0 || facet ? t("privacy_masking.feed.nothing_matches") : t("privacy_masking.feed.nothing_yet")}
        </p>
      ) : (
        <div className="pb-2">
          {groups.map((group) => (
            <div key={group.day}>
              <h3 className="sticky top-0 z-[1] bg-surface/95 px-5 pt-3 pb-1.5 text-xs font-medium text-ink-3 backdrop-blur-sm">
                {group.label}
              </h3>
              <ul>
                {group.items.map((record) => (
                  <RecordRow key={record.key} record={record} onOpen={onOpen} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {mode === "request" ? (
        <footer className="flex flex-wrap items-center gap-3 px-5 pt-1 pb-4 text-xs text-ink-3">
          <span>{t("privacy_masking.feed.kept_note")}</span>
          <span className="flex-1" />
          {hasMore ? (
            <Button size="sm" variant="ghost" onClick={onLoadMore} disabled={loadingMore}>
              {loadingMore ? t("common.loading") : t("privacy_masking.feed.load_more")}
            </Button>
          ) : null}
        </footer>
      ) : null}
    </section>
  );
}

/**
 * 行里的小图标：认得的厂商画 logo，认不得（或没有）画通用图标。一律放进 13px 的方框：厂商 logo 是
 * 13px 的 <img>，lucide 图标跟着根字号缩成 11.7px，不套框的话两种行后面的名字差 1.3px。
 */
function RowGlyph({
  vendor,
  fallback: Fallback,
  fallbackClassName = "text-ink-3",
}: {
  vendor?: string;
  fallback: LucideIcon;
  fallbackClassName?: string;
}) {
  return (
    <span aria-hidden="true" className="grid size-[13px] shrink-0 place-items-center">
      {vendor && hasVendorIcon(vendor) ? (
        <VendorIcon modelId={vendor} size={13} />
      ) : (
        <Fallback size={13} className={fallbackClassName} />
      )}
    </span>
  );
}

function RecordRow({ record, onOpen }: { record: MaskRecord; onOpen: (record: MaskRecord) => void }) {
  const { t, i18n } = useTranslation();
  const client = clientMeta(record.client);
  const byKind = new Map<string, number>();
  for (const value of record.values) byKind.set(value.kind, (byKind.get(value.kind) ?? 0) + value.n);
  const ranked = [...byKind.entries()].sort((a, b) => b[1] - a[1]);
  // 24 小时制，和路由时间线、告警一样：英文的「08:18 PM」放不进 3.25rem 的时间列，会折成两行
  const time = new Date(record.at).toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

  return (
    <li>
      {/*
       * 每一行是各自独立的 grid，列宽只能由行宽决定、不能取决于这一行的内容：标签列原来是 auto，
       * 标签多、数字长的行把前面的 fr 列挤窄，模型名就跟着左右漂（11-07 线上截图）。标签列也按
       * 比例分，最窄放得下一个标签，标签在列里靠右；处数列放得下「999.9k」。
       *
       * 按列表自己的宽度（@container）分三档，不按视口：控制台有侧栏、门户没有。窄：两行（标签换到
       * 第二行）；中：一行但不显示模型，省下的宽度留给常是长 OAuth 邮箱的渠道名；宽：再加模型列。
       */}
      <button
        type="button"
        onClick={() => onOpen(record)}
        className="group grid w-full grid-cols-[3.25rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-5 py-2.5 text-left transition-colors hover:bg-ink/[0.025] @min-[44rem]:grid-cols-[3.25rem_minmax(0,2fr)_minmax(6rem,1fr)_3rem_1rem] @min-[64rem]:grid-cols-[3.25rem_minmax(0,2fr)_minmax(0,1fr)_minmax(6rem,1.2fr)_3rem_1rem] dark:hover:bg-white/[0.04]"
      >
        <span className="text-xs whitespace-nowrap text-ink-3 tabular-nums">{time}</span>
        <span className="flex min-w-0 items-center gap-1.5 text-sm text-ink">
          {/* 客户端名都很短，不让它跟渠道名一起按比例收缩（会被挤成「C…」）；渠道名常是长 OAuth 邮箱，只截它。
              客户端这段最窄也放得下各语言的「其他客户端」，箭头和渠道名每行从同一处开始；没有 logo 的
              客户端、渠道画流向图同款的通用图标，名字不往左缩。 */}
          <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap @min-[30rem]:min-w-[8.25rem]">
            <RowGlyph vendor={client.vendor} fallback={TerminalSquare} />
            <span>{client.label ?? t("privacy_masking.client.other")}</span>
          </span>
          <ArrowRight size={12} aria-hidden="true" className="shrink-0 text-ink-3" />
          {record.blocked ? (
            <>
              <RowGlyph fallback={Ban} fallbackClassName="text-rose-500 dark:text-rose-300" />
              <span className="truncate text-rose-600 dark:text-rose-300">{t("privacy_masking.feed.not_sent")}</span>
            </>
          ) : (
            <>
              <RowGlyph vendor={record.provider} fallback={Boxes} />
              <span className="truncate">{record.channel}</span>
            </>
          )}
        </span>
        <span className="hidden min-w-0 truncate text-xs text-ink-3 @min-[64rem]:block">{record.model}</span>
        <span className="col-span-2 col-start-2 flex min-w-0 flex-wrap items-center gap-1 @min-[44rem]:col-span-1 @min-[44rem]:col-start-auto @min-[44rem]:justify-end-safe">
          {record.blocked ? (
            <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs font-medium ${ACTION_CHIP.block}`}>
              <ShieldAlert size={11} aria-hidden="true" />
              {t("privacy_masking.action.block")}
            </span>
          ) : null}
          {ranked.slice(0, 3).map(([kind, n]) => (
            <KindChip key={kind} kind={kind} count={n} />
          ))}
          {ranked.length > 3 ? <span className="text-2xs text-ink-3">+{ranked.length - 3}</span> : null}
        </span>
        <span
          className="hidden text-right text-sm font-semibold text-ink tabular-nums @min-[44rem]:block"
          title={t("privacy_masking.summary.places", { count: record.places })}
        >
          {formatCompact(record.places)}
        </span>
        <ChevronRight size={14} aria-hidden="true" className="hidden text-ink-3 transition-transform group-hover:translate-x-0.5 @min-[44rem]:block" />
      </button>
    </li>
  );
}
