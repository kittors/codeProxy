import { CircleAlert } from "lucide-react";
import { HoverTooltip } from "@code-proxy/ui";
import type { ChannelGroupChannelDetail } from "@code-proxy/api-client";
import type {
  RoutingChannelGroupMatchMode,
  RoutingChannelGroupMemberEntry,
  RoutingPathRouteEntry,
  RoutingStrategy,
} from "@features/visual-config-editor";
import { makeClientId } from "@features/visual-config-editor";
import type { ModelPricing } from "@features/model-availability";

export const SYSTEM_DEFAULT_GROUP_NAME = "default";
export const SYSTEM_DEFAULT_GROUP_ID = "system-default-root";

export type GroupDraft = {
  name: string;
  description: string;
  strategy: RoutingStrategy;
  excludeFromDefault: boolean;
  matchMode: RoutingChannelGroupMatchMode;
  channels: RoutingChannelGroupMemberEntry[];
  tags: string[];
  allowedModels: string[];
  routes: RoutingPathRouteEntry[];
};

export type RoutingModelOption = {
  id: string;
  owned_by?: string;
  description?: string;
  pricing?: ModelPricing;
};

export type RoutingModelLoadResult = string | RoutingModelOption;

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

export const createEmptyGroupDraft = (): GroupDraft => ({
  name: "",
  description: "",
  strategy: "round-robin",
  excludeFromDefault: false,
  matchMode: "channels",
  channels: [],
  tags: [],
  allowedModels: [],
  routes: [{ ...EMPTY_ROUTE_DRAFT() }],
});

export const EMPTY_ROUTE_DRAFT = (): RoutingPathRouteEntry => ({
  id: makeClientId(),
  path: "",
  group: "",
  stripPrefix: true,
  fallback: "none",
});

export function Field({
  label,
  hint,
  tooltip,
  children,
}: {
  label: string;
  hint?: string;
  tooltip?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="text-sm font-semibold text-slate-900 dark:text-white">{label}</div>
        {tooltip ? (
          <HoverTooltip content={tooltip} placement="bottom">
            <span className="inline-flex h-6 w-6 items-center justify-center text-slate-400 dark:text-white/45">
              <CircleAlert size={16} aria-hidden="true" />
            </span>
          </HoverTooltip>
        ) : null}
      </div>
      {hint ? <div className="text-xs text-slate-500 dark:text-white/55">{hint}</div> : null}
      {children}
    </div>
  );
}

export function cloneMembers(
  members: RoutingChannelGroupMemberEntry[],
): RoutingChannelGroupMemberEntry[] {
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
    return !best || (current.priority ?? 0) > (best.priority ?? 0) ? current : best;
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

export function normalizeRoutingModelOption(
  model: RoutingModelLoadResult,
): RoutingModelOption | null {
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

export function renderChannelTags(tags: string[]) {
  if (tags.length === 0) return null;
  return (
    <span aria-hidden="true" className="flex shrink-0 flex-wrap gap-1">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700 dark:bg-sky-500/15 dark:text-sky-200"
        >
          {tag}
        </span>
      ))}
    </span>
  );
}
