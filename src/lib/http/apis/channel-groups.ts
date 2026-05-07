import { apiClient } from "@/lib/http/client";
import type { TagDisplayFields } from "@/lib/http/types";

export interface ChannelGroupChannelDetail extends TagDisplayFields {
  name: string;
  source?: string;
}

export interface ChannelGroupItem {
  name: string;
  description?: string;
  strategy?: "round-robin" | "fill-first";
  priority?: number;
  implicit?: boolean;
  prefixes?: string[];
  channels?: string[];
  "allowed-models"?: string[];
  "path-routes"?: string[];
  channelDetails?: ChannelGroupChannelDetail[];
}

const normalizeStringList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const items: string[] = [];
  value.forEach((entry) => {
    const normalized = typeof entry === "string" ? entry.trim() : "";
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    items.push(normalized);
  });
  return items;
};

const normalizeChannelDetail = (value: unknown): ChannelGroupChannelDetail | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const detail = value as Record<string, unknown>;
  const name = typeof detail.name === "string" ? detail.name.trim() : "";
  if (!name) return null;
  return {
    name,
    source: typeof detail.source === "string" ? detail.source.trim() : undefined,
    default_tags: normalizeStringList(detail.default_tags),
    custom_tags: normalizeStringList(detail.custom_tags),
    hidden_default_tags: normalizeStringList(detail.hidden_default_tags),
    display_tags: normalizeStringList(detail.display_tags),
  };
};

export const channelGroupsApi = {
  async list(): Promise<ChannelGroupItem[]> {
    const data = await apiClient.get<Record<string, unknown>>("/channel-groups");
    const items = data?.items;
    if (!Array.isArray(items)) return [];
    return items
      .map((entry): ChannelGroupItem | null => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
        const item = entry as Record<string, unknown>;
        const name = typeof item.name === "string" ? item.name.trim() : "";
        if (!name) return null;
        return {
          name,
          description: typeof item.description === "string" ? item.description.trim() : undefined,
          strategy: item.strategy === "fill-first" ? "fill-first" : "round-robin",
          priority:
            typeof item.priority === "number" && Number.isFinite(item.priority)
              ? item.priority
              : undefined,
          implicit: item.implicit === true,
          prefixes: normalizeStringList(item.prefixes),
          channels: normalizeStringList(item.channels),
          "allowed-models": normalizeStringList(item["allowed-models"]),
          "path-routes": normalizeStringList(item["path-routes"]),
          channelDetails: Array.isArray(item["channel-details"])
            ? item["channel-details"]
                .map(normalizeChannelDetail)
                .filter((detail): detail is ChannelGroupChannelDetail => Boolean(detail))
            : [],
        };
      })
      .filter((item): item is ChannelGroupItem => Boolean(item));
  },
};
