import type { ApiKeyEntry } from "@/lib/http/apis/api-keys";
import type { ChannelGroupItem } from "@/lib/http/apis/channel-groups";

export type ProviderAccessSummary = {
  reachableKeys: number;
  totalKeys: number;
  exactOverrideKeys: number;
};

const normalize = (value: string | undefined) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

function buildGroupChannelMap(groups: ChannelGroupItem[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const group of groups) {
    const groupName = normalize(group.name);
    if (!groupName) continue;
    const channels = new Set<string>();
    for (const channel of group.channels ?? []) {
      const key = normalize(channel);
      if (key) channels.add(key);
    }
    out.set(groupName, channels);
  }
  return out;
}

function entryCanReachChannel(
  entry: ApiKeyEntry,
  channelName: string,
  groupChannels: Map<string, Set<string>>,
): boolean {
  const channelKey = normalize(channelName);
  if (!channelKey || entry.disabled) {
    return false;
  }

  const allowedChannels = (entry["allowed-channels"] ?? [])
    .map((value) => normalize(value))
    .filter(Boolean);
  const allowedGroups = (entry["allowed-channel-groups"] ?? [])
    .map((value) => normalize(value))
    .filter(Boolean);

  const channelAllowed = allowedChannels.length === 0 ? true : allowedChannels.includes(channelKey);

  const groupAllowed =
    allowedGroups.length === 0
      ? true
      : allowedGroups.some((group) => groupChannels.get(group)?.has(channelKey));

  return channelAllowed && groupAllowed;
}

export function summarizeProviderAccess(
  channelName: string,
  entries: ApiKeyEntry[],
  groups: ChannelGroupItem[],
): ProviderAccessSummary {
  const groupChannels = buildGroupChannelMap(groups);
  let totalKeys = 0;
  let reachableKeys = 0;
  let exactOverrideKeys = 0;

  for (const entry of entries) {
    if (entry.disabled) {
      continue;
    }
    totalKeys += 1;
    if ((entry["allowed-channels"] ?? []).length > 0) {
      exactOverrideKeys += 1;
    }
    if (entryCanReachChannel(entry, channelName, groupChannels)) {
      reachableKeys += 1;
    }
  }

  return {
    reachableKeys,
    totalKeys,
    exactOverrideKeys,
  };
}
