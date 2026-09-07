import type { useTranslation } from "react-i18next";
import type { ChannelGroupChannelDetail } from "@code-proxy/api-client/endpoints/channel-groups";
import type {
  RoutingChannelGroupMemberEntry,
  RoutingDistribution,
  RoutingScheduling,
  RoutingStrategy,
} from "@features/visual-config-editor";
import { makeClientId } from "@features/visual-config-editor";
import type { RoutingModelOption, RoutingModelLoadResult } from "./types";

const RESERVED_ROUTE_PREFIXES = new Set([
  "manage",
  "management.html",
  "v0",
  "v1",
  "v1beta",
  "api",
  "anthropic",
  "codex",
]);

export function normalizeRoutingStrategy(value: unknown): RoutingStrategy {
  return value === "fill-first" || value === "session-sticky" ? value : "round-robin";
}

export function distributionLabel(
  t: ReturnType<typeof useTranslation>["t"],
  distribution: RoutingDistribution,
) {
  if (distribution === "least-load") {
    return t("channel_groups_page.distribution_least_load");
  }
  if (distribution === "fill-first") {
    return t("channel_groups_page.distribution_fill_first");
  }
  return t("channel_groups_page.distribution_weighted");
}

/**
 * Summarises a group's scheduling for the table. Stickiness is an additional
 * constraint on top of the distribution, so it is appended rather than shown
 * instead of it.
 */
export function schedulingLabel(
  t: ReturnType<typeof useTranslation>["t"],
  scheduling: RoutingScheduling,
) {
  const base = distributionLabel(t, scheduling.distribution);
  if (!scheduling.sticky.enabled) return base;
  return `${base} · ${t("channel_groups_page.sticky_badge")}`;
}

export function cloneMembers(members: RoutingChannelGroupMemberEntry[]): RoutingChannelGroupMemberEntry[] {
  return members.map((member) => ({
    id: member.id || makeClientId(),
    name: member.name,
    priority: member.priority,
  }));
}

export function syncDraftChannels(
  currentChannels: RoutingChannelGroupMemberEntry[],
  selectedChannels: string[],
): RoutingChannelGroupMemberEntry[] {
  const existing = new Map(
    currentChannels
      .map((channel) => [channel.name.trim().toLowerCase(), channel] as const)
      .filter(([name]) => name),
  );

  return selectedChannels
    .map((channelName) => channelName.trim())
    .filter((channelName, index, list) => channelName && list.indexOf(channelName) === index)
    .map((channelName) => {
      const matched = existing.get(channelName.toLowerCase());
      return matched
        ? { ...matched, name: channelName }
        : { id: makeClientId(), name: channelName, priority: "" };
    });
}

export function parsePriority(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function normalizeRoutePathInput(value: string): string {
  let trimmed = value.trim();
  if (!trimmed) return "";

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol && parsed.host) {
      trimmed = decodeURIComponent(parsed.pathname || "");
    }
  } catch {
    // Keep non-URL inputs as-is.
  }

  const queryIndex = trimmed.search(/[?#]/);
  if (queryIndex >= 0) {
    trimmed = trimmed.slice(0, queryIndex);
  }

  trimmed = trimmed.replace(/^\/+|\/+$/g, "");
  if (!trimmed) return "";

  const segments = trimmed.split("/");
  for (const segment of segments) {
    if (!segment) return "";
    if (Array.from(segment).some((char) => !/[\p{L}\p{N}_-]/u.test(char))) {
      return "";
    }
  }

  return `/${trimmed}`;
}

export function routePathInputIsRoot(value: string): boolean {
  let trimmed = value.trim();
  if (!trimmed) return false;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol && parsed.host) {
      trimmed = decodeURIComponent(parsed.pathname || "");
    }
  } catch {
    // Keep non-URL inputs as-is.
  }

  const queryIndex = trimmed.search(/[?#]/);
  if (queryIndex >= 0) {
    trimmed = trimmed.slice(0, queryIndex);
  }
  return trimmed.replace(/^\/+|\/+$/g, "") === "";
}

export function routePathUsesReservedPrefix(path: string): boolean {
  const firstSegment = path.replace(/^\/+/, "").split("/")[0]?.toLowerCase() ?? "";
  return RESERVED_ROUTE_PREFIXES.has(firstSegment);
}

export function summarizeList(values: string[], moreLabel: string): string {
  if (values.length === 0) return "";
  if (values.length === 1) return values[0];
  return `${values[0]}${moreLabel.replace("{{count}}", String(values.length - 1))}`;
}

export function summarizePriorityMode(
  members: RoutingChannelGroupMemberEntry[],
  roundRobinLabel: string,
  priorityShortLabel: string,
): string {
  const prioritized = members
    .map((member) => ({
      name: member.name.trim(),
      priority: parsePriority(member.priority),
    }))
    .filter((member) => member.name && member.priority !== null);

  if (prioritized.length === 0) return roundRobinLabel;

  const distinct = new Set(prioritized.map((member) => member.priority));
  if (distinct.size <= 1) return roundRobinLabel;

  const top = prioritized.reduce((best, current) => {
    if (!best || (current.priority ?? 0) > (best.priority ?? 0)) return current;
    return best;
  }, prioritized[0]);
  if (!top.priority) return roundRobinLabel;
  return `${top.name} · ${priorityShortLabel.replace("{{value}}", String(top.priority))}`;
}

export function normalizeChannelName(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeTagName(value: string): string {
  return value.trim().replace(/\s+/g, "-").toLowerCase();
}

export function normalizeRoutingModelOption(model: RoutingModelLoadResult): RoutingModelOption | null {
  if (typeof model === "string") {
    const id = model.trim();
    return id ? { id } : null;
  }
  const id = String(model.id ?? "").trim();
  if (!id) return null;
  return {
    id,
    owned_by: model.owned_by,
    description: model.description,
    pricing: model.pricing,
  };
}

export function readChannelDisplayTags(detail?: ChannelGroupChannelDetail | null): string[] {
  if (!detail?.display_tags || !Array.isArray(detail.display_tags)) return [];
  return detail.display_tags
    .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
    .filter((tag, index, list) => Boolean(tag) && list.indexOf(tag) === index);
}

export function syncDraftTags(selectedTags: string[]): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  selectedTags.forEach((tag) => {
    const normalized = normalizeTagName(tag);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    tags.push(normalized);
  });
  return tags;
}

export function channelMatchesTags(
  channelName: string,
  tags: string[],
  detailsByName: Record<string, ChannelGroupChannelDetail>,
): boolean {
  if (tags.length === 0) return false;
  const detail = detailsByName[normalizeChannelName(channelName)];
  const displayTags = readChannelDisplayTags(detail).map(normalizeTagName);
  if (displayTags.length === 0) return false;
  const selected = new Set(tags.map(normalizeTagName).filter(Boolean));
  return displayTags.some((tag) => selected.has(tag));
}

export function isDisabledChannel(detail?: ChannelGroupChannelDetail | null): boolean {
  return detail?.disabled === true;
}
