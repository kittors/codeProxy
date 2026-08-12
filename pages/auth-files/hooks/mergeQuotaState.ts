import type { QuotaItem, QuotaState } from "@features/quota-preview/quota-helpers";

export const quotaItemMergeKeys = (item: QuotaItem): string[] =>
  Array.from(
    new Set(
      [item.key, item.label]
        .filter((value): value is string => Boolean(value))
        .map((value) =>
          value
            .trim()
            .toLowerCase()
            .replaceAll(/[^a-z0-9\u4e00-\u9fff]/g, ""),
        )
        .filter(Boolean),
    ),
  );

export const mergeQuotaItem = (previous: QuotaItem, incoming: QuotaItem): QuotaItem => ({
  ...previous,
  ...incoming,
  label:
    incoming.key && incoming.label === incoming.key && previous.label
      ? previous.label
      : incoming.label || previous.label,
  // percent/resetAtMs are taken from the newest payload only: an absent or null
  // value means "unknown now" and must not resurrect a stale percentage or
  // countdown. Assigned explicitly so a payload missing the key still clears it.
  percent: incoming.percent ?? null,
  resetAtMs: incoming.resetAtMs,
  value: incoming.value ?? previous.value,
  windowSeconds: incoming.windowSeconds ?? previous.windowSeconds,
  meta: incoming.meta ?? previous.meta,
});

export const mergeQuotaState = (
  previous: QuotaState | undefined,
  incoming: QuotaState,
): QuotaState => {
  if (!previous) return incoming;
  // The server payload is the whole truth about which windows exist. The backend
  // now merges partial upstream payloads by quota_key and stamps each window with
  // its own observed_at, so a window missing here is genuinely gone rather than
  // merely absent from one probe. The client must not re-add windows of its own:
  // that is what kept days-old values on screen, visually indistinguishable from
  // live data, whenever a payload came back empty.
  const remainingPrevious = [...previous.items];
  const mergedItems = incoming.items.map((item) => {
    const incomingKeys = quotaItemMergeKeys(item);
    const previousIndex = remainingPrevious.findIndex((candidate) =>
      quotaItemMergeKeys(candidate).some((key) => incomingKeys.includes(key)),
    );
    const [previousItem] = previousIndex < 0 ? [] : remainingPrevious.splice(previousIndex, 1);
    return previousItem ? mergeQuotaItem(previousItem, item) : item;
  });
  const resetCreditCountChanged =
    incoming.resetCreditCount !== undefined &&
    incoming.resetCreditCount !== previous.resetCreditCount;
  return {
    ...previous,
    ...incoming,
    items: mergedItems,
    planType: incoming.planType ?? previous.planType,
    resetCreditCount: incoming.resetCreditCount ?? previous.resetCreditCount,
    resetCreditExpirations:
      incoming.resetCreditExpirations ??
      (resetCreditCountChanged ? undefined : previous.resetCreditExpirations),
    updatedAt: incoming.updatedAt ?? previous.updatedAt,
    error:
      incoming.error ?? (incoming.status === "error" ? previous.error : undefined),
  };
};
