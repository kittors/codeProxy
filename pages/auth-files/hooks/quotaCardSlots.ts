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
 * How many rows a provider usually fills, for sizing loading placeholders.
 *
 * Purely a visual estimate: the real row count comes from whatever the probe
 * returns, and being off by one only means the placeholder block is slightly
 * taller or shorter than the data that replaces it. Nothing routes on this, so
 * an unlisted provider simply takes the default rather than being a defect.
 */
const EXPECTED_QUOTA_SLOTS: Partial<Record<QuotaProvider, number>> = {
  // code + review, each with a 5-hour and a weekly window.
  codex: 4,
  // Weekly limit, per-model usage, pay-as-you-go and monthly credits.
  xai: 4,
  // One weekly and one 5-hour window per model group.
  antigravity: 4,
  kimi: 2,
};

const DEFAULT_EXPECTED_QUOTA_SLOTS = 3;

export const expectedQuotaSlotCount = (provider: QuotaProvider | null | undefined): number =>
  (provider ? EXPECTED_QUOTA_SLOTS[provider] : undefined) ?? DEFAULT_EXPECTED_QUOTA_SLOTS;

/**
 * Strip the trailing noun the upstream appends to its group names.
 *
 * It sends "Gemini Models" and "Claude and GPT models"; on a row that already
 * shows a window and a percentage, the word "models" is the one part carrying
 * no information. A generic suffix, not a list of known groups.
 */
const shortenAntigravityGroupName = (name: string): string => {
  const trimmed = name.trim();
  return trimmed.replace(/\s+models?$/i, "").trim() || trimmed;
};

/**
 * Order rows the way the upstream client does: grouped, weekly above 5-hour.
 *
 * Only the grouped-summary view has two windows per group. The fallback view
 * reports one row per model family, and tagging those with a window suffix
 * would be noise, so the flag says whether the group has anything to
 * disambiguate against.
 */
const orderAntigravityWindows = (
  items: QuotaItem[],
): Array<{ item: QuotaItem; showWindow: boolean }> => {
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
    return 2;
  };

  return [...groups.values()].flatMap((bucket) => {
    const showWindow = new Set(bucket.map((item) => item.windowSeconds ?? -1)).size > 1;
    return [...bucket]
      .sort((a, b) => windowRank(a) - windowRank(b))
      .map((item) => ({ item, showWindow }));
  });
};

const buildAntigravityRowLabel = (item: QuotaItem, showWindow: boolean, t: TFunction): string => {
  const group = shortenAntigravityGroupName(String(item.label ?? ""));
  if (!showWindow) return group;
  const windowLabel =
    item.windowSeconds === WEEK_SECONDS
      ? t("antigravity_quota.window_weekly")
      : item.windowSeconds === FIVE_HOUR_SECONDS
        ? t("antigravity_quota.window_5h")
        : null;
  return windowLabel ? `${group} · ${windowLabel}` : group;
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
    return orderAntigravityWindows(filterAntigravityQuotaItems(items)).map(
      ({ item, showWindow }, index) => {
        // meta names the model this row was measured from (fallback view) or
        // describes the group (summary view). Either way it explains the row
        // rather than qualifying the number, so it belongs behind the icon and
        // must not reach the countdown slot.
        const { meta, ...itemWithoutMeta } = item;
        const description = typeof meta === "string" ? meta.trim() : "";
        // A model id never contains a space; the grouped summary's description
        // is a sentence. So the shape tells them apart: one names the model the
        // row was measured from, the other is already an explanation.
        const explanation = !description
          ? ""
          : description.includes(" ")
            ? description
            : t("antigravity_quota.measured_from", { model: description });
        const hint = [explanation, t("antigravity_quota.group_hint")].filter(Boolean).join("\n\n");
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
