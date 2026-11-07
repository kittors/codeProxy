import { useTranslation } from "react-i18next";
import type { MaskSummary } from "@code-proxy/api-client";
import { formatCompact } from "./format";
import { FINDER_KEYS, kindStyle, maskCategory, valueShape } from "./maskKinds";
import { KindChip } from "./KindChip";
import type { FeedFacet } from "./MaskingFeed";

/**
 * 按值看：这段时间遮得最多的值。同一个值在几个请求里出现，记录里是同一个 id，所以能合在一起
 * 数；面板上只显示它的开头几个字符和长度，原值从不出现。点一行就切回按请求看，只看这类值。
 */
export function MaskingValueRanking({
  summary,
  facet,
  onPickKind,
}: {
  summary: MaskSummary | null;
  facet: FeedFacet;
  onPickKind: (kind: string) => void;
}) {
  const { t, i18n } = useTranslation();
  if (!summary) return null;
  const values = summary.values.filter((v) =>
    facet === "" ? true : facet === "warn" || facet === "block" ? false : maskCategory(v.kind) === facet,
  );
  if (values.length === 0) {
    return <p className="px-5 py-14 text-center text-sm text-ink-3">{t("privacy_masking.feed.nothing_matches")}</p>;
  }
  const max = values[0]?.places || 1;

  return (
    <div className="pb-3">
      <div className="flex items-center justify-between px-5 pb-1.5 text-xs text-ink-3">
        <span>{t("privacy_masking.values.title")}</span>
        <span>{t("privacy_masking.values.note")}</span>
      </div>
      <ol>
        {values.map((value, index) => {
          const style = kindStyle(value.kind);
          return (
            <li key={value.id}>
              <button
                type="button"
                onClick={() => onPickKind(value.kind)}
                title={t("privacy_masking.values.seen", {
                  count: value.requests,
                  when: new Date(value.last_at).toLocaleString(i18n.language, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }),
                })}
                className="grid w-full grid-cols-[1.75rem_minmax(0,9rem)_minmax(0,1fr)_3.5rem] items-center gap-3 px-5 py-2 text-left transition-colors hover:bg-ink/[0.025] md:grid-cols-[1.75rem_minmax(0,11rem)_minmax(0,9rem)_minmax(0,6rem)_minmax(0,1fr)_3.5rem] dark:hover:bg-white/[0.04]"
              >
                <span className="text-xs text-ink-3 tabular-nums">{String(index + 1).padStart(2, "0")}</span>
                <span className="flex min-w-0 items-baseline gap-1.5">
                  <span className="truncate font-mono text-sm text-ink">{valueShape(value.head)}</span>
                  <span className="shrink-0 text-2xs text-ink-3">{t("privacy_masking.values.length", { count: value.len })}</span>
                </span>
                <span className="hidden md:block">
                  <KindChip kind={value.kind} />
                </span>
                <span className="hidden truncate text-xs text-ink-3 md:block">{t(FINDER_KEYS[value.by])}</span>
                <span className="relative h-1.5 overflow-hidden rounded-full bg-ink/[0.05] dark:bg-white/[0.07]">
                  <span
                    className={`absolute inset-y-0 left-0 rounded-full ${style.dot} opacity-80 motion-safe:animate-[quota-bar-grow_800ms_cubic-bezier(0.16,1,0.3,1)]`}
                    style={{ width: `${Math.max(3, (100 * value.places) / max)}%` }}
                  />
                </span>
                <span className="text-right text-sm font-semibold text-ink tabular-nums">{formatCompact(value.places)}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
