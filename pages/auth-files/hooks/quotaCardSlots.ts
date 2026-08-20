import type { TFunction } from "i18next";
import {
  parseAdditionalQuotaWindowLabel,
  translateParameterizedQuotaLabel,
  translateXaiQuotaLabel,
} from "@code-proxy/domain";
import { filterAntigravityQuotaItems, type QuotaItem } from "@features/quota-preview/quota-helpers";
import { type QuotaProvider } from "@features/quota-preview/quota-fetch";

export type QuotaCardSlot = {
  id: string;
  label: string;
  item: QuotaItem | null;
  /**
   * Explanatory text for the row, surfaced behind an icon rather than printed.
   * The upstream describes each Antigravity group in a full sentence; inline it
   * would push the numbers off the card, which is the opposite of what a quota
   * row is for.
   */
  hint?: string;
};

const WEEK_SECONDS = 7 * 24 * 60 * 60;
const FIVE_HOUR_SECONDS = 5 * 60 * 60;

/**
 * Strip the trailing noun the upstream appends to every group name.
 *
 * It sends "Gemini Models" and "Claude and GPT models"; the card renders these
 * beside a window and a percentage, where the word "models" is the one part
 * that carries no information. This trims a generic suffix, not a list of known
 * groups — a group the upstream adds tomorrow is shortened the same way.
 */
const shortenAntigravityGroupName = (name: string): string => {
  const trimmed = name.trim();
  const shortened = trimmed.replace(/\s+models?$/i, "").trim();
  return shortened || trimmed;
};

/**
 * Order the rows the way the upstream client presents them: grouped by model
 * family, weekly above the 5-hour window inside each group.
 *
 * Groups keep the order the upstream returned them in rather than being sorted
 * here, so the card matches what the account holder sees in the real client.
 *
 * Each row is tagged with whether its group actually spans more than one
 * window. A group with a single window needs no window suffix — the fallback
 * model view reports only 5h, and appending "· 5-hour" to every row there is
 * noise on a card whose whole job is to show numbers.
 */
const orderAntigravityWindows = (
  items: QuotaItem[],
): Array<{
  item: QuotaItem;
  showWindow: boolean;
}> => {
  const groups = new Map<string, QuotaItem[]>();
  items.forEach((item) => {
    const groupKey = String(item.label ?? item.key ?? "");
    const bucket = groups.get(groupKey);
    if (bucket) bucket.push(item);
    else groups.set(groupKey, [item]);
  });

  const windowRank = (item: QuotaItem) => {
    if (item.windowSeconds === WEEK_SECONDS) return 0;
    if (item.windowSeconds === FIVE_HOUR_SECONDS) return 1;
    // An unrecognised window keeps its place after the two known ones rather
    // than being dropped: the upstream may add a window before we name it.
    return 2;
  };

  return [...groups.values()].flatMap((bucket) => {
    const distinctWindows = new Set(bucket.map((item) => item.windowSeconds ?? -1));
    const showWindow = distinctWindows.size > 1;
    return [...bucket]
      .sort((a, b) => windowRank(a) - windowRank(b))
      .map((item) => ({ item, showWindow }));
  });
};

/**
 * Compose the row label as "<group> · <window>", or just "<group>" when the
 * group has nothing to disambiguate against.
 *
 * The group name comes from the upstream and the window from `windowSeconds`,
 * so the label is localised without translating anything the upstream owns.
 * The backend used to send "Gemini Models · Weekly Limit Remaining" as one
 * string, which was too long for the row and could not be localised at all.
 */
const buildAntigravityRowLabel = (item: QuotaItem, showWindow: boolean, t: TFunction): string => {
  const group = shortenAntigravityGroupName(String(item.label ?? ""));
  if (!showWindow) return group;
  const windowLabel =
    item.windowSeconds === WEEK_SECONDS
      ? t("antigravity_quota.window_weekly")
      : item.windowSeconds === FIVE_HOUR_SECONDS
        ? t("antigravity_quota.window_5h")
        : null;
  if (!windowLabel) return group;
  return group ? `${group} · ${windowLabel}` : windowLabel;
};

/**
 * Map a provider's quota windows onto the fixed slots a card renders.
 *
 * Extracted from useAuthFilesStatusState so the matching rules — which are pure
 * and heavily branched per provider — can be tested directly.
 */
export const resolveQuotaCardSlots = (
  provider: QuotaProvider,
  items: QuotaItem[],
  t: TFunction,
): QuotaCardSlot[] => {
  const translateQuotaLabel = (text: string) => {
    if (!text) return text;
    if (text.startsWith("m_quota.")) return t(text);
    const additionalQuota = parseAdditionalQuotaWindowLabel(text);
    if (additionalQuota) {
      return t(`m_quota.additional_${additionalQuota.window}`, {
        name: additionalQuota.name,
      });
    }
    if (text.startsWith("claude_quota.")) return translateParameterizedQuotaLabel(t, text);
    if (text.startsWith("antigravity_quota.")) return t(text);
    if (text.startsWith("xai_quota.")) return translateXaiQuotaLabel(t, text);
    return text;
  };

  if (provider === "claude") {
    return items.map((item) => ({
      id: item.key ?? item.label,
      label: translateQuotaLabel(item.label),
      item,
    }));
  }
  if (provider === "antigravity") {
    // Show both windows per group, the way the upstream client does: a group
    // shares one weekly and one 5-hour limit, and hiding either leaves the
    // account holder guessing which one is about to run out.
    return orderAntigravityWindows(filterAntigravityQuotaItems(items)).map(
      ({ item, showWindow }, index) => {
        // meta holds the upstream's description of the group. Moving it onto the
        // slot keeps it out of the row's detail line, which is reserved for the
        // reset countdown, and hands it to the hint icon instead.
        const { meta, ...itemWithoutMeta } = item;
        const hint = [meta, t("antigravity_quota.group_hint")]
          .map((part) => (typeof part === "string" ? part.trim() : ""))
          .filter(Boolean)
          .join("\n\n");
        return {
          id: item.key ?? item.label ?? `antigravity-${index + 1}`,
          label: buildAntigravityRowLabel(item, showWindow, t),
          item: itemWithoutMeta,
          ...(hint ? { hint } : {}),
        };
      },
    );
  }
  if (provider === "xai") {
    return items.map((item, index) => ({
      id: item.key ?? item.label ?? `xai-${index + 1}`,
      label: translateQuotaLabel(item.label),
      item,
    }));
  }

  const supportsStableCodingSlots = provider === "codex" || provider === "kimi";
  if (!supportsStableCodingSlots) {
    // Rank data-bearing windows first so placeholder rows (e.g. kiro's
    // subscription entry with percent: null) never crowd out real quotas.
    const ranked = [
      ...items.filter((item) => typeof item.percent === "number" || Boolean(item.value)),
      ...items.filter((item) => typeof item.percent !== "number" && !item.value),
    ];
    return ranked.slice(0, 3).map((item) => ({
      id: item.key ?? item.label,
      label: translateQuotaLabel(item.label),
      item,
    }));
  }

  const normalize = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .replaceAll(/[^a-z0-9\u4e00-\u9fff]/g, "");

  const candidates = items
    .filter((item) => !parseAdditionalQuotaWindowLabel(String(item.label ?? "")))
    .map((item) => ({
      item,
      key: normalize(`${String(item.key ?? "")} ${String(item.label ?? "")}`),
    }));

  // One item may only fill one slot. The loose regex fallbacks overlap — a
  // `review_week` entry matches the /weekly|week|周/ branch that backs
  // `code_week` too — so without claiming, a card missing its code windows
  // rendered the review window twice under two different labels.
  const claimed = new Set<QuotaItem>();
  const claim = (item: QuotaItem | null | undefined): QuotaItem | null => {
    if (!item || claimed.has(item)) return null;
    claimed.add(item);
    return item;
  };
  const findExact = (label: string) =>
    items.find((item) => item.label === label && !claimed.has(item)) ?? null;
  const findKey = (...keys: string[]) =>
    items.find((item) => {
      if (claimed.has(item)) return false;
      const normalizedKey = normalize(String(item.key ?? ""));
      return keys.some((key) => normalizedKey === normalize(key));
    }) ?? null;
  const find = (re: RegExp) =>
    candidates.find((candidate) => !claimed.has(candidate.item) && re.test(candidate.key))?.item ??
    null;

  // Exact-key matches are resolved before any regex fallback so a precise
  // review_* entry cannot be consumed by the code_* fuzzy branch first.
  const codeFiveHourExact = findKey("code_5h", "code5h") ?? findExact("m_quota.code_5h");
  const codeWeekExact =
    findKey("code_week", "code_weekly", "codeweekly") ?? findExact("m_quota.code_weekly");
  const reviewFiveHourExact = findKey("review_5h", "review5h") ?? findExact("m_quota.review_5h");
  const reviewWeekExact =
    findKey("review_week", "review_weekly", "reviewweekly") ?? findExact("m_quota.review_weekly");
  const codeFiveHour = claim(codeFiveHourExact);
  const codeWeek = claim(codeWeekExact);
  const reviewFiveHour = claim(reviewFiveHourExact);
  const reviewWeek = claim(reviewWeekExact);
  const codeFiveHourSlot =
    codeFiveHour ?? claim(find(/(mquotacode5h|code5h|5h|5小时|fivehour|5hour)/i));
  const codeWeekSlot = codeWeek ?? claim(find(/(mquotacodeweekly|codeweekly|weekly|week|周)/i));
  const reviewFiveHourSlot =
    reviewFiveHour ??
    claim(find(/(mquotareview5h|review5h|review5hour|reviewfivehour|审查5小时|审查：5小时)/i));
  const reviewWeekSlot =
    reviewWeek ??
    claim(find(/(mquotareviewweekly|reviewweekly|reviewweek|review_week|审查周|审查：周)/i));

  const knownItems = claimed;

  const codingSlots: { id: string; label: string; item: QuotaItem | null }[] = [];
  if (codeFiveHourSlot) {
    codingSlots.push({
      id: "code_5h",
      label: translateQuotaLabel("m_quota.code_5h"),
      item: codeFiveHourSlot,
    });
  }
  if (codeWeekSlot) {
    codingSlots.push({
      id: "code_week",
      label: translateQuotaLabel("m_quota.code_weekly"),
      item: codeWeekSlot,
    });
  }
  if (provider === "kimi") {
    // Unmatched kimi payloads fall back to raw items instead of an empty state.
    if (codingSlots.length > 0) return codingSlots;
    return items.slice(0, 3).map((item) => ({
      id: item.key ?? item.label,
      label: translateQuotaLabel(item.label),
      item,
    }));
  }

  const codexSlots = [...codingSlots];
  if (reviewFiveHourSlot) {
    codexSlots.push({
      id: "review_5h",
      label: translateQuotaLabel("m_quota.review_5h"),
      item: reviewFiveHourSlot,
    });
  }
  if (reviewWeekSlot) {
    codexSlots.push({
      id: "review_week",
      label: translateQuotaLabel("m_quota.review_weekly"),
      item: reviewWeekSlot,
    });
  }

  const extraSlots = items
    .filter((item) => !knownItems.has(item))
    .map((item, index) => {
      const idKey = item.key ?? (normalize(String(item.label ?? "")) || `quota${index + 1}`);
      return {
        id: idKey,
        label: translateQuotaLabel(item.label),
        item,
      };
    });

  if (codexSlots.length === 0 && extraSlots.length > 0) return extraSlots;
  return [...codexSlots, ...extraSlots];
};
