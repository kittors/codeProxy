import type {
  RoutingChannelGroupEntry,
  RoutingChannelGroupMemberEntry,
  RoutingFallback,
  RoutingPathRouteEntry,
  RoutingStrategy,
} from "./types";
import { makeClientId } from "./types";
import { parseScheduling, serializeScheduling, strategyFromScheduling } from "./routingScheduling";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function parseRoutingFallback(raw: unknown): RoutingFallback {
  return raw === "default" ? "default" : "none";
}

export function parseRoutingStrategy(raw: unknown): RoutingStrategy {
  return raw === "fill-first" || raw === "session-sticky" ? raw : "round-robin";
}

export function parseRoutingTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(
    new Set(
      raw
        .map((value) =>
          String(value ?? "")
            .trim()
            .replace(/\s+/g, "-")
            .toLowerCase(),
        )
        .filter(Boolean),
    ),
  );
}

export function parseRoutingPriorityText(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const priority = Number(trimmed);
  return Number.isSafeInteger(priority) ? priority : null;
}

export function parseRoutingChannelGroups(raw: unknown): RoutingChannelGroupEntry[] {
  if (!Array.isArray(raw)) return [];

  return raw.map((item, index) => {
    const record = asRecord(item) ?? {};
    const match = asRecord(record.match);
    const priorityRecord = asRecord(record["channel-priorities"]);
    const channels = Array.isArray(match?.channels)
      ? match.channels.map((value) => String(value ?? "").trim()).filter(Boolean)
      : [];
    const tags = parseRoutingTags(match?.tags);
    const priorityNames = priorityRecord
      ? Object.keys(priorityRecord)
          .map((value) => String(value ?? "").trim())
          .filter(Boolean)
      : [];
    const names = Array.from(new Set([...channels, ...priorityNames]));
    const members: RoutingChannelGroupMemberEntry[] = names.map((name, memberIndex) => {
      let priority = "";
      if (priorityRecord) {
        const rawPriority = Object.entries(priorityRecord).find(
          ([key]) => key.trim().toLowerCase() === name.toLowerCase(),
        )?.[1];
        if (typeof rawPriority === "number" && Number.isFinite(rawPriority)) {
          priority = String(rawPriority);
        } else if (typeof rawPriority === "string" && rawPriority.trim()) {
          priority = rawPriority.trim();
        }
      }
      return {
        id: `routing-group-${index}-channel-${memberIndex}-${makeClientId()}`,
        name,
        priority,
      };
    });
    const strategy = parseRoutingStrategy(record.strategy);
    return {
      id: `routing-group-${index}-${makeClientId()}`,
      name: typeof record.name === "string" ? record.name : "",
      description: typeof record.description === "string" ? record.description : "",
      strategy,
      scheduling: parseScheduling(asRecord(record.scheduling), strategy),
      excludeFromDefault:
        record["exclude-from-default"] === true &&
        String(record.name ?? "")
          .trim()
          .toLowerCase() !== "default",
      matchMode: tags.length > 0 ? "tags" : "channels",
      channels: members,
      tags,
      allowedModels: Array.isArray(record["allowed-models"])
        ? Array.from(
            new Set(
              record["allowed-models"].map((model) => String(model ?? "").trim()).filter(Boolean),
            ),
          )
        : [],
    };
  });
}

export function parseRoutingPathRoutes(raw: unknown): RoutingPathRouteEntry[] {
  if (!Array.isArray(raw)) return [];

  return raw.map((item, index) => {
    const record = asRecord(item) ?? {};
    return {
      id: `routing-path-${index}-${makeClientId()}`,
      path: typeof record.path === "string" ? record.path : "",
      group: typeof record.group === "string" ? record.group : "",
      stripPrefix: record["strip-prefix"] !== false,
      fallback: parseRoutingFallback(record.fallback),
    };
  });
}

export function serializeRoutingChannelGroupsForYaml(
  groups: RoutingChannelGroupEntry[],
): Array<Record<string, unknown>> {
  return groups
    .map((group) => {
      const name = group.name.trim();
      if (!name) return null;

      const item: Record<string, unknown> = { name };
      if (group.description.trim()) {
        item.description = group.description.trim();
      }
      // Both representations are written: `scheduling` is authoritative, and
      // `strategy` keeps a backend that predates it behaving sensibly.
      item.strategy = strategyFromScheduling(group.scheduling);
      item.scheduling = serializeScheduling(group.scheduling);
      if (group.excludeFromDefault && name.trim().toLowerCase() !== "default") {
        item["exclude-from-default"] = true;
      }

      const match: Record<string, unknown> = {};
      if (group.matchMode === "tags") {
        const tags = parseRoutingTags(group.tags);
        if (tags.length > 0) {
          match.tags = tags;
        }
      } else {
        const channels = group.channels.map((channel) => channel.name.trim()).filter(Boolean);
        if (channels.length > 0) {
          match.channels = Array.from(new Set(channels));
        }
      }
      if (Object.keys(match).length > 0) {
        item.match = match;
      }

      const channelWeights = group.channels.reduce<Record<string, number>>((acc, channel) => {
        const channelName = channel.name.trim();
        const weight = parseRoutingPriorityText(channel.priority);
        if (channelName && weight !== null) {
          acc[channelName] = weight;
        }
        return acc;
      }, {});
      if (Object.keys(channelWeights).length > 0) {
        // Mirrored for the same rollout reason as `strategy` above.
        item["channel-priorities"] = channelWeights;
        const scheduling = asRecord(item.scheduling) ?? {};
        item.scheduling = { ...scheduling, "channel-weights": channelWeights };
      }
      const allowedModels = Array.from(
        new Set(group.allowedModels.map((model) => model.trim()).filter(Boolean)),
      );
      if (allowedModels.length > 0) {
        item["allowed-models"] = allowedModels;
      }

      return item;
    })
    .filter((group): group is Record<string, unknown> => group !== null);
}

export function serializeRoutingPathRoutesForYaml(
  routes: RoutingPathRouteEntry[],
): Array<Record<string, unknown>> {
  return routes
    .map((route) => {
      const path = route.path.trim();
      const group = route.group.trim();
      if (!path || !group) return null;

      const item: Record<string, unknown> = {
        path,
        group,
      };
      if (!route.stripPrefix) {
        item["strip-prefix"] = false;
      }
      if (route.fallback !== "none") {
        item.fallback = route.fallback;
      }
      return item;
    })
    .filter((route): route is Record<string, unknown> => route !== null);
}
