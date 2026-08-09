import type { TFunction } from "i18next";
import {
  parseAdditionalQuotaWindowLabel,
  translateParameterizedQuotaLabel,
  translateXaiQuotaLabel,
} from "@code-proxy/domain";
import {
  filterAntigravityQuotaItems,
  type QuotaItem,
} from "@features/quota-preview/quota-helpers";
import { type QuotaProvider } from "@features/quota-preview/quota-fetch";

export type QuotaCardSlot = {
  id: string;
  label: string;
  item: QuotaItem | null;
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
      return filterAntigravityQuotaItems(items).map((item, index) => ({
        id: item.key ?? item.label ?? `antigravity-${index + 1}`,
        label: translateQuotaLabel(item.label),
        item,
      }));
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
      candidates.find((candidate) => !claimed.has(candidate.item) && re.test(candidate.key))
        ?.item ?? null;

    // Exact-key matches are resolved before any regex fallback so a precise
    // review_* entry cannot be consumed by the code_* fuzzy branch first.
    const codeFiveHourExact = findKey("code_5h", "code5h") ?? findExact("m_quota.code_5h");
    const codeWeekExact =
      findKey("code_week", "code_weekly", "codeweekly") ?? findExact("m_quota.code_weekly");
    const reviewFiveHourExact = findKey("review_5h", "review5h") ?? findExact("m_quota.review_5h");
    const reviewWeekExact =
      findKey("review_week", "review_weekly", "reviewweekly") ??
      findExact("m_quota.review_weekly");
    const codeFiveHour = claim(codeFiveHourExact);
    const codeWeek = claim(codeWeekExact);
    const reviewFiveHour = claim(reviewFiveHourExact);
    const reviewWeek = claim(reviewWeekExact);
    const codeFiveHourSlot =
      codeFiveHour ?? claim(find(/(mquotacode5h|code5h|5h|5小时|fivehour|5hour)/i));
    const codeWeekSlot =
      codeWeek ?? claim(find(/(mquotacodeweekly|codeweekly|weekly|week|周)/i));
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
