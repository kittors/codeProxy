import type {
  ModelAvailabilityItem,
  ModelAvailabilitySource,
} from "./modelAvailability";

const sourceKey = (source: ModelAvailabilitySource): string =>
  [
    source.label,
    source.provider ?? "",
    source.channel ?? "",
    source.clientId ?? "",
    source.source ?? "",
    source.modelId ?? "",
    source.upstreamModelId ?? "",
  ]
    .join("\x00")
    .toLowerCase();

const sourceFromItem = (
  item: ModelAvailabilityItem,
): ModelAvailabilitySource | null => {
  const provider = String(item.owned_by ?? "").trim();
  const source = String(item.source ?? "").trim();
  const label = provider || source;
  if (!label) return null;
  return {
    label,
    ...(provider ? { provider } : {}),
    ...(source ? { source } : {}),
  };
};

const sourcesFor = (item: ModelAvailabilityItem): ModelAvailabilitySource[] => {
  if (item.sources?.length) return item.sources;
  const synthesized = sourceFromItem(item);
  return synthesized ? [synthesized] : [];
};

const mergeSources = (
  current: ModelAvailabilityItem,
  incoming: ModelAvailabilityItem,
): ModelAvailabilitySource[] | undefined => {
  const seen = new Set<string>();
  const merged: ModelAvailabilitySource[] = [];
  for (const source of [...sourcesFor(current), ...sourcesFor(incoming)]) {
    const key = sourceKey(source);
    if (!key.trim() || seen.has(key)) continue;
    seen.add(key);
    merged.push(source);
  }
  return merged.length ? merged : undefined;
};

export const mergeAvailabilityItems = (
  current: ModelAvailabilityItem,
  incoming: ModelAvailabilityItem,
): ModelAvailabilityItem => ({
  ...current,
  ...incoming,
  id: current.id,
  owned_by: current.owned_by || incoming.owned_by,
  description: current.description || incoming.description,
  source: current.source || incoming.source,
  sources: mergeSources(current, incoming),
  pricing: current.pricing ?? incoming.pricing,
  inputModalities: current.inputModalities ?? incoming.inputModalities,
  outputModalities: current.outputModalities ?? incoming.outputModalities,
  supportsVision: current.supportsVision ?? incoming.supportsVision,
});

export const addAvailabilityModel = (
  map: Map<string, ModelAvailabilityItem>,
  item: ModelAvailabilityItem | null | undefined,
) => {
  const id = String(item?.id ?? "").trim();
  if (!id || !item) return;
  const key = id.toLowerCase();
  const next = { ...item, id };
  const existing = map.get(key);
  map.set(key, existing ? mergeAvailabilityItems(existing, next) : next);
};

export const mergeAvailabilityItemList = (
  items: ModelAvailabilityItem[],
): ModelAvailabilityItem[] => {
  const map = new Map<string, ModelAvailabilityItem>();
  for (const item of items) addAvailabilityModel(map, item);
  return Array.from(map.values());
};
