import { useCallback, useEffect, useMemo, useState } from "react";
import { CircleAlert, Pencil, Plus, Trash2, TriangleAlert, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ChannelGroupChannelDetail } from "@/lib/http/apis/channel-groups";
import type {
  RoutingChannelGroupEntry,
  RoutingChannelGroupMatchMode,
  RoutingChannelGroupMemberEntry,
  RoutingPathRouteEntry,
  RoutingStrategy,
  VisualConfigValues,
} from "@/modules/config/visual/types";
import { makeClientId } from "@/modules/config/visual/types";
import { Button } from "@/modules/ui/Button";
import { Checkbox } from "@/modules/ui/Checkbox";
import { ConfirmModal } from "@/modules/ui/ConfirmModal";
import { TextInput } from "@/modules/ui/Input";
import { Modal } from "@/modules/ui/Modal";
import { SearchableCheckboxMultiSelect } from "@/modules/ui/SearchableCheckboxMultiSelect";
import { Select } from "@/modules/ui/Select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/modules/ui/Tabs";
import { useToast } from "@/modules/ui/ToastProvider";
import { HoverTooltip, OverflowTooltip } from "@/modules/ui/Tooltip";
import { DataTable, type DataTableColumn } from "@/modules/ui/DataTable";
import { VendorIcon } from "@/modules/api-keys/apiKeyPageUtils";
import {
  emptyModelPricing,
  formatModelPrice,
  type ModelPricing,
} from "@/modules/models/modelAvailability";

const SYSTEM_DEFAULT_GROUP_NAME = "default";
const SYSTEM_DEFAULT_GROUP_ID = "system-default-root";

type GroupDraft = {
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

type RoutingModelLoadResult = string | RoutingModelOption;

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

const createEmptyGroupDraft = (): GroupDraft => ({
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

const EMPTY_ROUTE_DRAFT = (): RoutingPathRouteEntry => ({
  id: makeClientId(),
  path: "",
  group: "",
  stripPrefix: true,
  fallback: "none",
});

function Field({
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

function cloneMembers(members: RoutingChannelGroupMemberEntry[]): RoutingChannelGroupMemberEntry[] {
  return members.map((member) => ({
    id: member.id || makeClientId(),
    name: member.name,
    priority: member.priority,
  }));
}

function syncDraftChannels(
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

function parsePriority(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function normalizeRoutePathInput(value: string): string {
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

function routePathInputIsRoot(value: string): boolean {
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

function routePathUsesReservedPrefix(path: string): boolean {
  const firstSegment = path.replace(/^\/+/, "").split("/")[0]?.toLowerCase() ?? "";
  return RESERVED_ROUTE_PREFIXES.has(firstSegment);
}

function summarizeList(values: string[], moreLabel: string): string {
  if (values.length === 0) return "";
  if (values.length === 1) return values[0];
  return `${values[0]}${moreLabel.replace("{{count}}", String(values.length - 1))}`;
}

function summarizePriorityMode(
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

function normalizeChannelName(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeTagName(value: string): string {
  return value.trim().replace(/\s+/g, "-").toLowerCase();
}

function normalizeRoutingModelOption(model: RoutingModelLoadResult): RoutingModelOption | null {
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

function readChannelDisplayTags(detail?: ChannelGroupChannelDetail | null): string[] {
  if (!detail?.display_tags || !Array.isArray(detail.display_tags)) return [];
  return detail.display_tags
    .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
    .filter((tag, index, list) => Boolean(tag) && list.indexOf(tag) === index);
}

function syncDraftTags(selectedTags: string[]): string[] {
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

function channelMatchesTags(
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

function isDisabledChannel(detail?: ChannelGroupChannelDetail | null): boolean {
  return detail?.disabled === true;
}

function renderChannelTags(tags: string[]) {
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

export function RoutingConfigEditor({
  values,
  disabled,
  availableChannels,
  availableChannelDetails = {},
  onRefreshAvailableChannels,
  loadModelsForChannels,
  onChange,
}: {
  values: VisualConfigValues;
  disabled?: boolean;
  availableChannels: string[];
  availableChannelDetails?: Record<string, ChannelGroupChannelDetail>;
  onRefreshAvailableChannels?: () => Promise<void> | void;
  loadModelsForChannels?: (
    channels: string[],
    groupName?: string,
  ) => Promise<RoutingModelLoadResult[]>;
  onChange: (values: Partial<VisualConfigValues>) => void;
}) {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [groupEditorOpen, setGroupEditorOpen] = useState(false);
  const [groupEditorId, setGroupEditorId] = useState<string | null>(null);
  const [deleteGroupTarget, setDeleteGroupTarget] = useState<RoutingChannelGroupEntry | null>(null);
  const [issueGroup, setIssueGroup] = useState<RoutingChannelGroupEntry | null>(null);
  const [groupDraft, setGroupDraft] = useState<GroupDraft>(() => createEmptyGroupDraft());
  const [groupEditorTab, setGroupEditorTab] = useState<"basic" | "models">("basic");
  const [modelOptions, setModelOptions] = useState<RoutingModelOption[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState("");
  const [modelsSelectionTouched, setModelsSelectionTouched] = useState(false);

  const update = useCallback(
    (patch: Partial<VisualConfigValues>) => {
      onChange(patch);
    },
    [onChange],
  );

  const routesByGroup = useMemo(() => {
    const map = new Map<string, RoutingPathRouteEntry[]>();
    values.routingPathRoutes.forEach((route) => {
      const key = route.group.trim().toLowerCase();
      if (!key) return;
      map.set(key, [...(map.get(key) ?? []), route]);
    });
    return map;
  }, [values.routingPathRoutes]);

  const displayGroups = useMemo<RoutingChannelGroupEntry[]>(() => {
    const defaultIndex = values.routingChannelGroups.findIndex(
      (group) => group.name.trim().toLowerCase() === SYSTEM_DEFAULT_GROUP_NAME,
    );
    if (defaultIndex >= 0) {
      const defaultGroup = values.routingChannelGroups[defaultIndex];
      return [
        { ...defaultGroup, system: true },
        ...values.routingChannelGroups.filter((_, index) => index !== defaultIndex),
      ];
    }
    return [
      {
        id: SYSTEM_DEFAULT_GROUP_ID,
        name: SYSTEM_DEFAULT_GROUP_NAME,
        description: "",
        strategy: "round-robin",
        excludeFromDefault: false,
        matchMode: "channels",
        channels: [],
        tags: [],
        allowedModels: [],
        system: true,
      },
      ...values.routingChannelGroups,
    ];
  }, [values.routingChannelGroups]);

  const channelOptions = useMemo(() => {
    return availableChannels
      .map((channel) => channel.trim())
      .filter(Boolean)
      .filter((channel, index, list) => list.indexOf(channel) === index)
      .map((channel) => ({
        value: channel,
        label: (
          <span className="flex min-w-0 items-center justify-between gap-2">
            <span className="truncate">{channel}</span>
            {renderChannelTags(
              readChannelDisplayTags(availableChannelDetails[normalizeChannelName(channel)]),
            )}
          </span>
        ),
        searchText: channel,
      }));
  }, [availableChannelDetails, availableChannels]);

  const tagOptions = useMemo(() => {
    const seen = new Set<string>();
    const tags: string[] = [];
    Object.values(availableChannelDetails).forEach((detail) => {
      readChannelDisplayTags(detail).forEach((tag) => {
        const normalized = normalizeTagName(tag);
        if (!normalized || seen.has(normalized)) return;
        seen.add(normalized);
        tags.push(normalized);
      });
    });
    return tags
      .sort((a, b) => a.localeCompare(b))
      .map((tag) => ({
        value: tag,
        label: tag,
        searchText: tag,
      }));
  }, [availableChannelDetails]);

  const availableChannelSet = useMemo(() => {
    return new Set(
      availableChannels.map((channel) => normalizeChannelName(channel)).filter(Boolean),
    );
  }, [availableChannels]);

  const resolveGroupChannels = useCallback(
    (group: Pick<RoutingChannelGroupEntry, "channels" | "matchMode" | "tags">) => {
      if (group.matchMode !== "tags") return group.channels;
      const priorityByChannel = new Map(
        group.channels.map((channel) => [normalizeChannelName(channel.name), channel]),
      );
      return availableChannels
        .filter((channel) => channelMatchesTags(channel, group.tags ?? [], availableChannelDetails))
        .map((channel) => {
          const configured = priorityByChannel.get(normalizeChannelName(channel));
          return {
            id: configured?.id ?? `tag-match-${normalizeChannelName(channel)}`,
            name: channel,
            priority: configured?.priority ?? "",
          };
        });
    },
    [availableChannelDetails, availableChannels],
  );

  const getStaleChannels = useCallback(
    (channels: RoutingChannelGroupMemberEntry[]) =>
      channels.filter((channel) => {
        const normalized = normalizeChannelName(channel.name);
        return normalized && !availableChannelSet.has(normalized);
      }),
    [availableChannelSet],
  );

  const staleChannelsByGroup = useMemo(() => {
    const map = new Map<string, RoutingChannelGroupMemberEntry[]>();
    values.routingChannelGroups.forEach((group) => {
      map.set(group.id, group.matchMode === "tags" ? [] : getStaleChannels(group.channels));
    });
    return map;
  }, [getStaleChannels, values.routingChannelGroups]);

  const issueStaleChannels = useMemo(
    () => (issueGroup ? (staleChannelsByGroup.get(issueGroup.id) ?? []) : []),
    [issueGroup, staleChannelsByGroup],
  );

  const selectedChannelValues = useMemo(
    () => groupDraft.channels.map((channel) => channel.name.trim()).filter(Boolean),
    [groupDraft.channels],
  );
  const selectedTagValues = useMemo(() => syncDraftTags(groupDraft.tags), [groupDraft.tags]);
  const resolvedDraftChannels = useMemo(
    () => resolveGroupChannels(groupDraft),
    [groupDraft, resolveGroupChannels],
  );
  const resolvedDraftChannelValues = useMemo(
    () => resolvedDraftChannels.map((channel) => channel.name.trim()).filter(Boolean),
    [resolvedDraftChannels],
  );
  const resolvedDraftChannelKey = useMemo(
    () => resolvedDraftChannelValues.join("\n"),
    [resolvedDraftChannelValues],
  );

  const editingSystemDefaultGroup =
    groupEditorId === SYSTEM_DEFAULT_GROUP_ID ||
    (groupEditorId !== null && groupDraft.name.trim().toLowerCase() === SYSTEM_DEFAULT_GROUP_NAME);

  const selectedModelSet = useMemo(() => {
    const effectiveSelectAll = !modelsSelectionTouched && groupDraft.allowedModels.length === 0;
    if (effectiveSelectAll) {
      return new Set(modelOptions.map((model) => model.id));
    }
    return new Set(groupDraft.allowedModels.map((model) => model.trim()).filter(Boolean));
  }, [groupDraft.allowedModels, modelOptions, modelsSelectionTouched]);

  const modelOptionIds = useMemo(() => modelOptions.map((model) => model.id), [modelOptions]);
  const selectedVisibleModelCount = useMemo(
    () => modelOptionIds.filter((model) => selectedModelSet.has(model)).length,
    [modelOptionIds, selectedModelSet],
  );
  const allVisibleModelsSelected =
    modelOptionIds.length > 0 && selectedVisibleModelCount === modelOptionIds.length;
  const someVisibleModelsSelected =
    selectedVisibleModelCount > 0 && selectedVisibleModelCount < modelOptionIds.length;

  const primaryRoute = groupDraft.routes[0] ?? EMPTY_ROUTE_DRAFT();
  const normalizedPrimaryRoutePath = useMemo(
    () => normalizeRoutePathInput(primaryRoute.path),
    [primaryRoute.path],
  );

  const draftStaleChannels = useMemo(() => {
    if (groupDraft.matchMode === "tags") return [];
    return getStaleChannels(groupDraft.channels);
  }, [getStaleChannels, groupDraft.channels, groupDraft.matchMode]);

  const draftStaleChannelIds = useMemo(
    () => new Set(draftStaleChannels.map((channel) => channel.id)),
    [draftStaleChannels],
  );

  const notifyStaleChannels = useCallback(
    (groupName: string, staleChannels: RoutingChannelGroupMemberEntry[]) => {
      if (staleChannels.length === 0) return;
      const details = staleChannels
        .map((channel) => `• ${channel.name.trim()}`)
        .filter(Boolean)
        .join("\n");
      notify({
        type: "warning",
        title: t("channel_groups_page.stale_toast_title"),
        message: `${t("channel_groups_page.stale_toast_message", {
          count: staleChannels.length,
          group: groupName || t("channel_groups_page.unnamed_group"),
        })}\n${details}`,
        duration: 2800,
      });
    },
    [notify, t],
  );

  const groupDraftError = useMemo(() => {
    if (editingSystemDefaultGroup) return "";
    if (!groupDraft.name.trim()) return t("channel_groups_page.group_name_required");
    if (!primaryRoute.path.trim()) return t("channel_groups_page.route_path_required");
    if (routePathInputIsRoot(primaryRoute.path)) {
      return t("channel_groups_page.route_path_root_reserved");
    }
    if (!normalizedPrimaryRoutePath) return t("channel_groups_page.route_path_invalid");
    if (routePathUsesReservedPrefix(normalizedPrimaryRoutePath)) {
      return t("channel_groups_page.route_path_reserved");
    }
    const previousGroup = groupEditorId
      ? values.routingChannelGroups.find((group) => group.id === groupEditorId)
      : null;
    const previousGroupName = previousGroup?.name.trim().toLowerCase() ?? "";
    const duplicateRoute = values.routingPathRoutes.some((route) => {
      if (
        normalizeRoutePathInput(route.path).toLowerCase() !==
        normalizedPrimaryRoutePath.toLowerCase()
      ) {
        return false;
      }
      return route.group.trim().toLowerCase() !== previousGroupName;
    });
    if (duplicateRoute) return t("channel_groups_page.route_path_duplicate");
    if (groupDraft.matchMode === "tags") {
      if (selectedTagValues.length === 0) return t("channel_groups_page.group_tags_required");
    } else if (groupDraft.channels.length === 0) {
      return t("channel_groups_page.group_channels_required");
    }
    if (draftStaleChannels.length > 0) {
      return t("channel_groups_page.stale_channels_required_cleanup", {
        count: draftStaleChannels.length,
      });
    }
    return "";
  }, [
    draftStaleChannels.length,
    editingSystemDefaultGroup,
    groupDraft.channels.length,
    groupDraft.matchMode,
    groupDraft.name,
    groupEditorId,
    normalizedPrimaryRoutePath,
    primaryRoute.path,
    selectedTagValues.length,
    t,
    values.routingChannelGroups,
    values.routingPathRoutes,
  ]);

  const openCreateGroup = useCallback(() => {
    void Promise.resolve(onRefreshAvailableChannels?.()).catch(() => undefined);
    setGroupEditorId(null);
    setGroupDraft(createEmptyGroupDraft());
    setGroupEditorTab("basic");
    setModelOptions([]);
    setModelsError("");
    setModelsSelectionTouched(false);
    setGroupEditorOpen(true);
  }, [onRefreshAvailableChannels]);

  const openEditGroup = useCallback(
    (group: RoutingChannelGroupEntry, options?: { notifyStale?: boolean }) => {
      void Promise.resolve(onRefreshAvailableChannels?.()).catch(() => undefined);
      const isSystemDefault =
        group.system || group.name.trim().toLowerCase() === SYSTEM_DEFAULT_GROUP_NAME;
      const groupName = group.name.trim().toLowerCase();
      const existingRoutes = values.routingPathRoutes
        .filter((route) => route.group.trim().toLowerCase() === groupName)
        .map((route) => ({ ...route, id: route.id || makeClientId() }))
        .slice(0, 1);
      setGroupEditorId(
        isSystemDefault && group.id === SYSTEM_DEFAULT_GROUP_ID
          ? SYSTEM_DEFAULT_GROUP_ID
          : group.id,
      );
      setGroupDraft({
        name: group.name,
        description: group.description,
        strategy: group.strategy === "fill-first" ? "fill-first" : "round-robin",
        excludeFromDefault: isSystemDefault ? false : group.excludeFromDefault === true,
        matchMode: isSystemDefault ? "channels" : (group.matchMode ?? "channels"),
        channels: cloneMembers(group.channels),
        tags: isSystemDefault ? [] : syncDraftTags(group.tags ?? []),
        allowedModels: group.allowedModels ?? [],
        routes: isSystemDefault
          ? []
          : existingRoutes.length > 0
            ? existingRoutes
            : [{ ...EMPTY_ROUTE_DRAFT(), group: group.name.trim() }],
      });
      setGroupEditorTab(isSystemDefault ? "models" : "basic");
      setModelOptions([]);
      setModelsError("");
      setModelsSelectionTouched((group.allowedModels ?? []).length > 0);
      if (!isSystemDefault && options?.notifyStale !== false) {
        notifyStaleChannels(group.name.trim(), staleChannelsByGroup.get(group.id) ?? []);
      }
      setGroupEditorOpen(true);
    },
    [
      notifyStaleChannels,
      onRefreshAvailableChannels,
      staleChannelsByGroup,
      values.routingPathRoutes,
    ],
  );

  const closeGroupEditor = useCallback(() => {
    setGroupEditorOpen(false);
    setGroupEditorId(null);
    setGroupDraft(createEmptyGroupDraft());
    setGroupEditorTab("basic");
    setModelOptions([]);
    setModelsError("");
    setModelsSelectionTouched(false);
  }, []);

  const updateDraftChannels = useCallback((selectedValues: string[]) => {
    setGroupDraft((current) => ({
      ...current,
      channels: syncDraftChannels(current.channels, selectedValues),
    }));
  }, []);

  const updateDraftTags = useCallback((selectedValues: string[]) => {
    setGroupDraft((current) => ({
      ...current,
      tags: syncDraftTags(selectedValues),
    }));
  }, []);

  const updateDraftChannelPriority = useCallback(
    (target: RoutingChannelGroupMemberEntry, priority: string) => {
      setGroupDraft((current) => ({
        ...current,
        channels:
          current.matchMode === "tags"
            ? (() => {
                const targetName = target.name.trim();
                const normalizedTarget = normalizeChannelName(targetName);
                if (!normalizedTarget) return current.channels;
                const existingIndex = current.channels.findIndex(
                  (channel) => normalizeChannelName(channel.name) === normalizedTarget,
                );
                if (existingIndex >= 0) {
                  return current.channels.map((channel, index) =>
                    index === existingIndex ? { ...channel, name: targetName, priority } : channel,
                  );
                }
                return [
                  ...current.channels,
                  {
                    id: target.id || makeClientId(),
                    name: targetName,
                    priority,
                  },
                ];
              })()
            : current.channels.map((channel) =>
                channel.id === target.id ? { ...channel, priority } : channel,
              ),
      }));
    },
    [],
  );

  const removeDraftChannel = useCallback((channelId: string) => {
    setGroupDraft((current) => ({
      ...current,
      channels: current.channels.filter((channel) => channel.id !== channelId),
    }));
  }, []);

  const toggleDraftModel = useCallback((modelId: string, checked: boolean) => {
    const normalized = modelId.trim();
    if (!normalized) return;
    setModelsSelectionTouched(true);
    setGroupDraft((current) => {
      const currentModels = current.allowedModels.map((model) => model.trim()).filter(Boolean);
      if (checked) {
        return {
          ...current,
          allowedModels: Array.from(new Set([...currentModels, normalized])),
        };
      }
      return {
        ...current,
        allowedModels: currentModels.filter((model) => model !== normalized),
      };
    });
  }, []);

  const selectAllDraftModels = useCallback(() => {
    setModelsSelectionTouched(true);
    setGroupDraft((current) => ({
      ...current,
      allowedModels: Array.from(new Set(modelOptionIds)),
    }));
  }, [modelOptionIds]);

  const clearDraftModels = useCallback(() => {
    setModelsSelectionTouched(true);
    setGroupDraft((current) => ({ ...current, allowedModels: [] }));
  }, []);

  const updatePrimaryRoute = useCallback((patch: Partial<RoutingPathRouteEntry>) => {
    setGroupDraft((current) => {
      const currentRoute = current.routes[0] ?? {
        ...EMPTY_ROUTE_DRAFT(),
        group: current.name.trim(),
      };
      return {
        ...current,
        routes: [{ ...currentRoute, ...patch }],
      };
    });
  }, []);

  const saveGroupDraft = useCallback(() => {
    if (groupDraftError) return;
    if (editingSystemDefaultGroup) {
      const allowedModels = Array.from(
        new Set(groupDraft.allowedModels.map((model) => model.trim()).filter(Boolean)),
      );
      const existingDefault = values.routingChannelGroups.find(
        (group) => group.name.trim().toLowerCase() === SYSTEM_DEFAULT_GROUP_NAME,
      );
      const defaultGroup: RoutingChannelGroupEntry = {
        id: existingDefault?.id ?? makeClientId(),
        name: SYSTEM_DEFAULT_GROUP_NAME,
        description: existingDefault?.description ?? "",
        strategy: existingDefault?.strategy === "fill-first" ? "fill-first" : "round-robin",
        excludeFromDefault: false,
        matchMode: "channels",
        channels: existingDefault ? cloneMembers(existingDefault.channels) : [],
        tags: [],
        allowedModels,
      };
      const defaultRoutes = values.routingPathRoutes.filter(
        (route) => route.group.trim().toLowerCase() === SYSTEM_DEFAULT_GROUP_NAME,
      );
      update({
        routingChannelGroups: existingDefault
          ? values.routingChannelGroups.map((group) =>
              group.id === existingDefault.id ? defaultGroup : group,
            )
          : [defaultGroup, ...values.routingChannelGroups],
        routingPathRoutes: [
          ...values.routingPathRoutes.filter(
            (route) => route.group.trim().toLowerCase() !== SYSTEM_DEFAULT_GROUP_NAME,
          ),
          ...defaultRoutes,
        ],
      });
      closeGroupEditor();
      return;
    }
    const groupName = groupDraft.name.trim();
    const normalizedDraft: RoutingChannelGroupEntry = {
      id: groupEditorId ?? makeClientId(),
      name: groupName,
      description: groupDraft.description.trim(),
      strategy: groupDraft.strategy === "fill-first" ? "fill-first" : "round-robin",
      excludeFromDefault:
        groupDraft.excludeFromDefault && groupName.toLowerCase() !== SYSTEM_DEFAULT_GROUP_NAME,
      matchMode: groupDraft.matchMode,
      tags: groupDraft.matchMode === "tags" ? syncDraftTags(groupDraft.tags) : [],
      allowedModels: Array.from(
        new Set(groupDraft.allowedModels.map((model) => model.trim()).filter(Boolean)),
      ),
      channels: (groupDraft.matchMode === "tags" ? resolvedDraftChannels : groupDraft.channels)
        .map((channel) => ({
          id: channel.id || makeClientId(),
          name: channel.name.trim(),
          priority: channel.priority.trim(),
        }))
        .filter((channel) => channel.name && (groupDraft.matchMode !== "tags" || channel.priority)),
    };
    const normalizedRoute = {
      ...primaryRoute,
      id: primaryRoute.id || makeClientId(),
      path: normalizedPrimaryRoutePath,
      group: groupName,
    };
    const normalizedRoutes = normalizedRoute.path
      ? [
          {
            ...normalizedRoute,
            group: groupName,
          },
        ]
      : [];

    if (groupEditorId) {
      const previousGroup = values.routingChannelGroups.find((group) => group.id === groupEditorId);
      const previousGroupName = previousGroup?.name.trim().toLowerCase() ?? "";
      const otherRoutes = values.routingPathRoutes.filter(
        (route) => route.group.trim().toLowerCase() !== previousGroupName,
      );
      update({
        routingChannelGroups: values.routingChannelGroups.map((group) =>
          group.id === groupEditorId ? normalizedDraft : group,
        ),
        routingPathRoutes: [...otherRoutes, ...normalizedRoutes],
      });
    } else {
      update({
        routingChannelGroups: [...values.routingChannelGroups, normalizedDraft],
        routingPathRoutes: [...values.routingPathRoutes, ...normalizedRoutes],
      });
    }
    closeGroupEditor();
  }, [
    closeGroupEditor,
    editingSystemDefaultGroup,
    groupDraft,
    groupDraftError,
    groupEditorId,
    normalizedPrimaryRoutePath,
    primaryRoute,
    resolvedDraftChannels,
    update,
    values.routingChannelGroups,
    values.routingPathRoutes,
  ]);

  const removeRoutingGroup = useCallback(
    (groupId: string) => {
      const removed = values.routingChannelGroups.find((group) => group.id === groupId);
      const removedName = removed?.name.trim().toLowerCase() ?? "";
      update({
        routingChannelGroups: values.routingChannelGroups.filter((group) => group.id !== groupId),
        routingPathRoutes: values.routingPathRoutes.filter(
          (route) => route.group.trim().toLowerCase() !== removedName,
        ),
      });
    },
    [update, values.routingChannelGroups, values.routingPathRoutes],
  );

  const confirmRemoveRoutingGroup = useCallback(() => {
    if (!deleteGroupTarget) return;
    removeRoutingGroup(deleteGroupTarget.id);
    setDeleteGroupTarget(null);
  }, [deleteGroupTarget, removeRoutingGroup]);

  const groupColumns = useMemo<DataTableColumn<RoutingChannelGroupEntry>[]>(
    () => [
      {
        key: "name",
        label: t("channel_groups_page.table_group"),
        width: "w-[150px] min-w-[150px]",
        cellClassName: "min-w-0 whitespace-nowrap font-medium",
        render: (group, index) => {
          const name = group.system
            ? t("channel_groups_page.system_default_route")
            : group.name.trim() || t("visual_config.group_n", { n: index + 1 });
          return (
            <OverflowTooltip content={name} className="block min-w-0">
              <span className="block truncate">{name}</span>
            </OverflowTooltip>
          );
        },
      },
      {
        key: "description",
        label: t("channel_groups_page.description_label"),
        width: "w-[220px] min-w-[220px]",
        cellClassName: "min-w-0 whitespace-nowrap text-slate-500 dark:text-white/55",
        render: (group) => {
          const description = group.system
            ? t("channel_groups_page.system_default_route_description")
            : group.description.trim() || t("channel_groups_page.no_description");
          return (
            <OverflowTooltip content={description} className="block min-w-0">
              <span className="block truncate">{description}</span>
            </OverflowTooltip>
          );
        },
      },
      {
        key: "channelCount",
        label: t("channel_groups_page.table_channel_count"),
        width: "w-[104px] min-w-[104px]",
        headerClassName: "text-center",
        cellClassName: "whitespace-nowrap text-center",
        render: (group) => {
          const channels = resolveGroupChannels(group);
          return (
            <span className="inline-flex h-5 min-w-[24px] items-center justify-center rounded-md bg-sky-50 px-1.5 text-xs font-semibold tabular-nums text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
              {channels.length}
            </span>
          );
        },
      },
      {
        key: "status",
        label: t("channel_groups_page.table_status"),
        width: "w-[112px] min-w-[112px]",
        cellClassName: "whitespace-nowrap",
        render: (group) => {
          const staleChannels = staleChannelsByGroup.get(group.id) ?? [];
          if (staleChannels.length === 0) {
            return (
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200">
                {t("channel_groups_page.status_normal")}
              </span>
            );
          }
          return (
            <button
              type="button"
              onClick={() => setIssueGroup(group)}
              disabled={disabled}
              title={t("channel_groups_page.view_issue_reason")}
              className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/50 disabled:opacity-40 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-200 dark:hover:bg-rose-500/15 dark:focus-visible:ring-rose-300/20"
            >
              <TriangleAlert size={13} />
              <span>{t("channel_groups_page.status_invalid")}</span>
            </button>
          );
        },
      },
      {
        key: "defaultScope",
        label: t("channel_groups_page.table_default_scope"),
        width: "w-[128px] min-w-[128px]",
        cellClassName: "whitespace-nowrap",
        render: (group) => {
          if (group.system) {
            return (
              <span className="text-slate-400 dark:text-white/35">
                {t("channel_groups_page.none")}
              </span>
            );
          }
          return group.excludeFromDefault ? (
            <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-200">
              {t("channel_groups_page.default_scope_isolated")}
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-neutral-800 dark:text-white/60">
              {t("channel_groups_page.default_scope_included")}
            </span>
          );
        },
      },
      {
        key: "channels",
        label: t("channel_groups_page.table_channels"),
        width: "w-[280px] min-w-[280px]",
        cellClassName: "min-w-0 whitespace-nowrap text-slate-700 dark:text-white/75",
        render: (group) => {
          const channels = resolveGroupChannels(group);
          const names = channels.map((channel) => channel.name.trim()).filter(Boolean);
          if (names.length === 0) {
            return (
              <span className="text-slate-400 dark:text-white/35">
                {t("channel_groups_page.none")}
              </span>
            );
          }
          return (
            <HoverTooltip
              className="block min-w-0"
              content={
                <div className="flex max-w-xs flex-wrap gap-1.5">
                  {channels.map((channel) => (
                    <span
                      key={channel.id}
                      className="inline-flex items-center rounded-md border border-slate-200/60 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700 dark:border-neutral-700/40 dark:bg-neutral-800/60 dark:text-white/80"
                    >
                      {channel.name}
                      {channel.priority.trim()
                        ? ` · ${t("channel_groups_page.priority_short", {
                            value: channel.priority.trim(),
                          })}`
                        : ""}
                    </span>
                  ))}
                </div>
              }
            >
              <span className="block min-w-0 truncate">
                {summarizeList(names, t("channel_groups_page.more_suffix"))}
              </span>
            </HoverTooltip>
          );
        },
      },
      {
        key: "priorityMode",
        label: t("channel_groups_page.table_priority_mode"),
        width: "w-[190px] min-w-[190px]",
        cellClassName: "min-w-0 whitespace-nowrap text-slate-700 dark:text-white/75",
        render: (group) => {
          if (group.system) {
            return (
              <span className="text-slate-400 dark:text-white/35">
                {t("channel_groups_page.none")}
              </span>
            );
          }
          const summary =
            group.strategy === "fill-first"
              ? t("channel_groups_page.routing_strategy_fill_first")
              : summarizePriorityMode(
                  resolveGroupChannels(group),
                  t("channel_groups_page.round_robin_mode"),
                  t("channel_groups_page.priority_short"),
                );
          return (
            <OverflowTooltip content={summary} className="block min-w-0">
              <span className="block truncate">{summary}</span>
            </OverflowTooltip>
          );
        },
      },
      {
        key: "routes",
        label: t("channel_groups_page.table_routes"),
        width: "w-[220px] min-w-[220px]",
        cellClassName: "min-w-0 whitespace-nowrap text-slate-700 dark:text-white/75",
        render: (group) => {
          if (group.system) {
            return <span className="font-mono text-slate-900 dark:text-white">/</span>;
          }
          const routes = routesByGroup.get(group.name.trim().toLowerCase()) ?? [];
          const routePaths = routes.map((route) => route.path.trim()).filter(Boolean);
          if (routePaths.length === 0) {
            return (
              <span className="text-slate-400 dark:text-white/35">
                {t("channel_groups_page.none")}
              </span>
            );
          }
          return (
            <HoverTooltip
              className="block min-w-0"
              content={
                <div className="flex max-w-xs flex-wrap gap-1.5">
                  {routePaths.map((path) => (
                    <span
                      key={path}
                      className="inline-flex items-center rounded-md border border-slate-200/60 bg-slate-50 px-2 py-0.5 font-mono text-[11px] text-slate-700 dark:border-neutral-700/40 dark:bg-neutral-800/60 dark:text-white/80"
                    >
                      {path}
                    </span>
                  ))}
                </div>
              }
            >
              <span className="block min-w-0 truncate">
                {summarizeList(routePaths, t("channel_groups_page.more_suffix"))}
              </span>
            </HoverTooltip>
          );
        },
      },
      {
        key: "actions",
        label: t("common.action"),
        width: "w-[112px] min-w-[112px]",
        cellClassName: "whitespace-nowrap",
        render: (group) => (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => openEditGroup(group)}
              disabled={disabled}
              className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-amber-600 disabled:opacity-40 dark:text-white/50 dark:hover:bg-neutral-800 dark:hover:text-amber-400"
              title={t("channel_groups_page.edit_group")}
              aria-label={t("channel_groups_page.edit_group")}
            >
              <Pencil size={15} />
            </button>
            {group.system ? null : (
              <button
                type="button"
                onClick={() => setDeleteGroupTarget(group)}
                disabled={disabled}
                className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-40 dark:text-white/50 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                title={t("visual_config.delete_group")}
                aria-label={t("visual_config.delete_group")}
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>
        ),
      },
    ],
    [disabled, openEditGroup, resolveGroupChannels, routesByGroup, staleChannelsByGroup, t],
  );

  const groupMemberColumns = useMemo<DataTableColumn<RoutingChannelGroupMemberEntry>[]>(
    () => [
      {
        key: "channel",
        label: t("channel_groups_page.table_channels"),
        cellClassName: "min-w-0 whitespace-nowrap",
        render: (channel) => {
          const detail = availableChannelDetails[normalizeChannelName(channel.name)];
          const displayTags = readChannelDisplayTags(detail);
          const isStale = draftStaleChannelIds.has(channel.id);
          const isDisabled = isDisabledChannel(detail);
          return (
            <OverflowTooltip content={channel.name} className="block min-w-0">
              <span className="block min-w-0">
                <span
                  className={`flex min-w-0 items-center gap-2 truncate text-sm ${
                    isStale
                      ? "text-rose-700 dark:text-rose-200"
                      : isDisabled
                        ? "text-slate-500 dark:text-white/45"
                        : "text-slate-900 dark:text-white"
                  }`}
                >
                  <span className="truncate">{channel.name}</span>
                  {isStale ? (
                    <span className="inline-flex shrink-0 items-center rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-500/15 dark:text-rose-200">
                      {t("channel_groups_page.deleted_badge")}
                    </span>
                  ) : null}
                  {!isStale && isDisabled ? (
                    <span className="inline-flex shrink-0 items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-white/10 dark:text-white/55">
                      {t("channel_groups_page.disabled_badge")}
                    </span>
                  ) : null}
                </span>
                {displayTags.length > 0 ? (
                  <span className="mt-1 flex flex-wrap gap-1">
                    {displayTags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700 dark:bg-sky-500/15 dark:text-sky-200"
                      >
                        {tag}
                      </span>
                    ))}
                  </span>
                ) : null}
              </span>
            </OverflowTooltip>
          );
        },
      },
      {
        key: "priority",
        label: t("channel_groups_page.channel_priority_label"),
        width: "w-[156px] min-w-[156px]",
        cellClassName: "whitespace-nowrap",
        render: (channel) => (
          <TextInput
            value={channel.priority}
            onChange={(event) => {
              const value = event.currentTarget.value;
              if (!/^\d*$/.test(value)) return;
              updateDraftChannelPriority(channel, value);
            }}
            placeholder="1"
            inputMode="numeric"
            pattern="[0-9]*"
            disabled={disabled}
          />
        ),
      },
      ...(groupDraft.matchMode === "tags"
        ? []
        : [
            {
              key: "actions",
              label: t("common.action"),
              width: "w-[72px] min-w-[72px]",
              headerClassName: "text-right",
              cellClassName: "whitespace-nowrap text-right",
              render: (channel) => (
                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeDraftChannel(channel.id)}
                    disabled={disabled}
                    aria-label={t("channel_groups_page.remove_channel")}
                  >
                    <X size={14} />
                  </Button>
                </div>
              ),
            } satisfies DataTableColumn<RoutingChannelGroupMemberEntry>,
          ]),
    ],
    [
      availableChannelDetails,
      disabled,
      draftStaleChannelIds,
      groupDraft.matchMode,
      removeDraftChannel,
      t,
      updateDraftChannelPriority,
    ],
  );

  const modelColumns = useMemo<DataTableColumn<RoutingModelOption>[]>(
    () => [
      {
        key: "select",
        label: "",
        width: "w-12",
        headerClassName: "text-center",
        cellClassName: "text-center",
        headerRender: () => (
          <Checkbox
            checked={allVisibleModelsSelected}
            indeterminate={someVisibleModelsSelected}
            disabled={disabled || modelOptions.length === 0}
            onCheckedChange={(checked) => {
              if (checked) selectAllDraftModels();
              else clearDraftModels();
            }}
            aria-label={t("channel_groups_page.allowed_models_label")}
          />
        ),
        render: (model) => (
          <Checkbox
            checked={selectedModelSet.has(model.id)}
            onCheckedChange={(checked) => toggleDraftModel(model.id, checked)}
            disabled={disabled}
            aria-label={model.id}
          />
        ),
      },
      {
        key: "model",
        label: t("models_page.col_model"),
        width: "w-[28rem]",
        cellClassName: "min-w-0",
        render: (model) => (
          <div className="flex min-w-0 items-center gap-2">
            <VendorIcon modelId={model.id} size={16} />
            <div className="min-w-0">
              <OverflowTooltip content={model.id} className="block min-w-0">
                <span className="block min-w-0 truncate font-medium">{model.id}</span>
              </OverflowTooltip>
              {model.description ? (
                <OverflowTooltip content={model.description} className="block min-w-0">
                  <span className="block min-w-0 truncate text-[11px] text-slate-500 dark:text-white/45">
                    {model.description}
                  </span>
                </OverflowTooltip>
              ) : null}
            </div>
          </div>
        ),
      },
      {
        key: "owner",
        label: t("models_page.col_owner"),
        width: "w-36",
        cellClassName: "min-w-0 whitespace-nowrap text-slate-600 dark:text-white/60",
        render: (model) => model.owned_by || "-",
        overflowTooltip: (model) => model.owned_by || "-",
      },
      {
        key: "price",
        label: t("models_page.col_price"),
        width: "w-56",
        cellClassName:
          "whitespace-nowrap font-mono text-xs tabular-nums text-slate-700 dark:text-slate-200",
        render: (model) =>
          formatModelPrice(model.pricing ?? emptyModelPricing(), t("models_page.not_priced")),
      },
    ],
    [
      allVisibleModelsSelected,
      clearDraftModels,
      disabled,
      modelOptions.length,
      selectAllDraftModels,
      selectedModelSet,
      someVisibleModelsSelected,
      t,
      toggleDraftModel,
    ],
  );

  useEffect(() => {
    if (!groupEditorOpen || groupEditorTab !== "models") return;
    if (
      (!editingSystemDefaultGroup && resolvedDraftChannelValues.length === 0) ||
      !loadModelsForChannels
    ) {
      setModelOptions([]);
      setModelsError("");
      return;
    }

    let cancelled = false;
    setModelsLoading(true);
    setModelsError("");
    const modelLoader = editingSystemDefaultGroup
      ? loadModelsForChannels(resolvedDraftChannelValues, SYSTEM_DEFAULT_GROUP_NAME)
      : loadModelsForChannels(resolvedDraftChannelValues);
    modelLoader
      .then((models) => {
        if (cancelled) return;
        const optionMap = new Map<string, RoutingModelOption>();
        for (const model of models) {
          const option = normalizeRoutingModelOption(model);
          if (!option) continue;
          const key = option.id.toLowerCase();
          if (!optionMap.has(key)) optionMap.set(key, option);
        }
        const normalized = Array.from(optionMap.values()).sort((a, b) => a.id.localeCompare(b.id));
        setModelOptions(normalized);
        const allowed = new Set(normalized.map((model) => model.id));
        setGroupDraft((current) => {
          if (!modelsSelectionTouched && current.allowedModels.length === 0) {
            return current;
          }
          const nextAllowedModels = current.allowedModels.filter((model) => allowed.has(model));
          const currentStr = JSON.stringify(current.allowedModels);
          const nextStr = JSON.stringify(nextAllowedModels);
          if (currentStr === nextStr) return current;
          return { ...current, allowedModels: nextAllowedModels };
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : t("channel_groups_page.models_load_failed");
        setModelsError(message);
      })
      .finally(() => {
        if (!cancelled) setModelsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    groupEditorOpen,
    groupEditorTab,
    editingSystemDefaultGroup,
    loadModelsForChannels,
    modelsSelectionTouched,
    resolvedDraftChannelKey,
    t,
  ]);

  return (
    <>
      <div className="space-y-3">
        <div className="flex flex-wrap justify-end gap-3">
          <Button variant="primary" size="sm" onClick={openCreateGroup} disabled={disabled}>
            <Plus size={14} />
            {t("channel_groups_page.add_group")}
          </Button>
        </div>

        <DataTable<RoutingChannelGroupEntry>
          tableId="routing-channel-groups"
          rows={displayGroups}
          columns={groupColumns}
          rowKey={(group) => group.id}
          virtualize={false}
          rowHeight={44}
          height="h-[calc(100dvh-200px)]"
          minWidth="min-w-[1360px]"
          caption={t("channel_groups_page.table_group")}
          emptyText={t("channel_groups_page.empty_groups")}
          allowWheelPropagationAtBoundary
          rowClassName={(group) =>
            group.system
              ? "bg-slate-50/55 dark:bg-neutral-900/45"
              : (staleChannelsByGroup.get(group.id)?.length ?? 0) > 0
                ? "bg-rose-50/35 dark:bg-rose-500/5"
                : ""
          }
        />
      </div>

      <Modal
        open={issueGroup !== null}
        title={t("channel_groups_page.issue_modal_title")}
        description={t("channel_groups_page.issue_modal_desc", {
          group: issueGroup?.name.trim() || t("channel_groups_page.unnamed_group"),
        })}
        onClose={() => setIssueGroup(null)}
        maxWidth="max-w-xl"
        bodyClassName="space-y-4"
        footer={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="secondary" onClick={() => setIssueGroup(null)}>
              {t("common.close")}
            </Button>
            {issueGroup && issueStaleChannels.length > 0 ? (
              <Button
                variant="primary"
                onClick={() => {
                  const group = issueGroup;
                  setIssueGroup(null);
                  openEditGroup(group, { notifyStale: false });
                }}
                disabled={disabled}
              >
                {t("channel_groups_page.view_and_cleanup")}
              </Button>
            ) : null}
          </div>
        }
      >
        {issueGroup && issueStaleChannels.length > 0 ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-400/25 dark:bg-rose-500/10 dark:text-rose-100">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-rose-600 dark:bg-rose-500/15 dark:text-rose-100">
                  <TriangleAlert size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{t("channel_groups_page.stale_alert_title")}</p>
                  <p className="mt-1 text-xs leading-5 text-rose-700/90 dark:text-rose-100/80">
                    {t("channel_groups_page.stale_alert_message", {
                      count: issueStaleChannels.length,
                    })}
                  </p>
                  <div className="mt-3 inline-flex items-center rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-rose-700 shadow-sm dark:bg-neutral-950/45 dark:text-rose-100">
                    {t("channel_groups_page.deleted_channels_count", {
                      count: issueStaleChannels.length,
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-neutral-800">
              <div className="grid grid-cols-[minmax(0,1fr)_88px] bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500 dark:bg-neutral-900 dark:text-white/55">
                <span>{t("channel_groups_page.table_channels")}</span>
                <span>{t("channel_groups_page.table_status")}</span>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-neutral-800">
                {issueStaleChannels.map((channel) => (
                  <div
                    key={channel.id}
                    className="grid grid-cols-[minmax(0,1fr)_88px] items-center gap-3 px-3 py-2.5 text-sm"
                  >
                    <OverflowTooltip content={channel.name} className="block min-w-0">
                      <span className="block truncate font-medium text-slate-900 dark:text-white">
                        {channel.name}
                      </span>
                    </OverflowTooltip>
                    <span className="inline-flex justify-center rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 dark:bg-rose-500/15 dark:text-rose-100">
                      {t("channel_groups_page.deleted_badge")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500 dark:border-neutral-800 dark:bg-neutral-900/60 dark:text-white/55">
            {t("channel_groups_page.issue_modal_empty")}
          </div>
        )}
      </Modal>

      <Modal
        open={groupEditorOpen}
        title={
          editingSystemDefaultGroup
            ? t("channel_groups_page.edit_system_default_route")
            : groupEditorId
              ? t("channel_groups_page.edit_group")
              : t("channel_groups_page.add_group")
        }
        description={t("channel_groups_page.group_modal_desc")}
        onClose={closeGroupEditor}
        maxWidth="max-w-4xl"
        bodyTestId="group-editor-modal-body"
        bodyHeightClassName="h-[560px] max-h-[calc(100vh-8rem)]"
        bodyOverflowClassName="overflow-hidden"
        bodyClassName="flex flex-col"
        footer={
          <div className="flex flex-wrap items-center gap-2">
            {groupDraftError ? (
              <span className="text-sm font-medium text-rose-600 dark:text-rose-300">
                {groupDraftError}
              </span>
            ) : null}
            <Button variant="secondary" onClick={closeGroupEditor} disabled={disabled}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="primary"
              onClick={saveGroupDraft}
              disabled={disabled || Boolean(groupDraftError)}
            >
              {groupEditorId ? t("common.save") : t("common.add")}
            </Button>
          </div>
        }
      >
        <div className="flex min-h-0 flex-1 flex-col gap-5">
          {draftStaleChannels.length > 0 ? (
            <div
              role="alert"
              className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-400/25 dark:bg-rose-500/10 dark:text-rose-200"
            >
              <div className="flex items-start gap-3">
                <TriangleAlert size={18} className="mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{t("channel_groups_page.stale_alert_title")}</p>
                  <p className="mt-1 text-xs leading-5 text-rose-700/90 dark:text-rose-100/85">
                    {t("channel_groups_page.stale_alert_message", {
                      count: draftStaleChannels.length,
                    })}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {draftStaleChannels.map((channel) => (
                      <span
                        key={channel.id}
                        className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-white/80 px-2.5 py-1 text-xs font-medium text-rose-700 dark:border-rose-400/30 dark:bg-neutral-950/50 dark:text-rose-100"
                      >
                        <span>{channel.name}</span>
                        <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-500/15 dark:text-rose-200">
                          {t("channel_groups_page.deleted_badge")}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <Tabs
            value={groupEditorTab}
            onValueChange={(value) => setGroupEditorTab(value as "basic" | "models")}
          >
            <div data-testid="group-editor-tabs-shell" className="flex min-h-0 flex-1 flex-col">
              <div className="shrink-0">
                <TabsList>
                  {editingSystemDefaultGroup ? null : (
                    <TabsTrigger value="basic">
                      {t("channel_groups_page.basic_config_tab")}
                    </TabsTrigger>
                  )}
                  <TabsTrigger value="models">{t("channel_groups_page.models_tab")}</TabsTrigger>
                </TabsList>
              </div>

              <div
                data-testid="group-editor-tab-viewport"
                className="mt-4 min-h-0 flex-1 overflow-hidden"
              >
                <TabsContent
                  value="basic"
                  className="h-full min-h-0 overflow-y-auto space-y-5 scrollbar-hidden"
                >
                  <Field
                    label={t("channel_groups_page.routing_strategy_label")}
                    tooltip={t("channel_groups_page.routing_strategy_tooltip")}
                  >
                    <Select
                      aria-label={t("channel_groups_page.routing_strategy_label")}
                      value={groupDraft.strategy}
                      disabled={disabled}
                      className="w-full"
                      options={[
                        {
                          value: "round-robin",
                          label: t("channel_groups_page.routing_strategy_round_robin"),
                        },
                        {
                          value: "fill-first",
                          label: t("channel_groups_page.routing_strategy_fill_first"),
                        },
                      ]}
                      onChange={(value) => {
                        setGroupDraft((current) => ({
                          ...current,
                          strategy: value === "fill-first" ? "fill-first" : "round-robin",
                        }));
                      }}
                    />
                  </Field>

                  <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm dark:border-neutral-800 dark:bg-neutral-900/60">
                    <Checkbox
                      checked={groupDraft.excludeFromDefault}
                      onCheckedChange={(checked) =>
                        setGroupDraft((current) => ({
                          ...current,
                          excludeFromDefault: checked,
                        }))
                      }
                      disabled={disabled}
                      aria-label={t("channel_groups_page.exclude_from_default_label")}
                      className="mt-0.5"
                    />
                    <span className="min-w-0">
                      <span className="block font-semibold text-slate-900 dark:text-white">
                        {t("channel_groups_page.exclude_from_default_label")}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-white/55">
                        {t("channel_groups_page.exclude_from_default_hint")}
                      </span>
                    </span>
                  </label>

                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label={t("channel_groups_page.group_name_label")}>
                      <TextInput
                        value={groupDraft.name}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          setGroupDraft((current) => ({ ...current, name: value }));
                        }}
                        placeholder="pro"
                        disabled={disabled}
                      />
                    </Field>
                    <Field label={t("channel_groups_page.description_label")}>
                      <TextInput
                        value={groupDraft.description}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          setGroupDraft((current) => ({ ...current, description: value }));
                        }}
                        placeholder={t("channel_groups_page.description_placeholder")}
                        disabled={disabled}
                      />
                    </Field>
                  </div>

                  <div className="grid gap-4 md:grid-cols-1">
                    <Field
                      label={t("channel_groups_page.route_path_label")}
                      hint={t("channel_groups_page.route_path_hint")}
                    >
                      <TextInput
                        value={primaryRoute.path}
                        onChange={(event) =>
                          updatePrimaryRoute({ path: event.currentTarget.value })
                        }
                        placeholder="/pro"
                        disabled={disabled}
                      />
                    </Field>
                  </div>

                  <Field
                    label={t("channel_groups_page.match_strategy_label")}
                    hint={t("channel_groups_page.match_strategy_hint")}
                  >
                    <Select
                      aria-label={t("channel_groups_page.match_strategy_label")}
                      value={groupDraft.matchMode}
                      disabled={disabled}
                      className="w-full"
                      options={[
                        {
                          value: "channels",
                          label: t("channel_groups_page.match_strategy_channels"),
                        },
                        {
                          value: "tags",
                          label: t("channel_groups_page.match_strategy_tags"),
                        },
                      ]}
                      onChange={(value) => {
                        setGroupDraft((current) => ({
                          ...current,
                          matchMode: value === "tags" ? "tags" : "channels",
                        }));
                        setModelsSelectionTouched(false);
                      }}
                    />
                  </Field>

                  <div className="space-y-3">
                    {groupDraft.matchMode === "tags" ? (
                      <Field
                        label={t("channel_groups_page.select_tag_label")}
                        hint={t("channel_groups_page.select_tag_hint")}
                      >
                        <SearchableCheckboxMultiSelect
                          value={selectedTagValues}
                          onChange={updateDraftTags}
                          options={tagOptions}
                          placeholder={t("channel_groups_page.select_tag_placeholder")}
                          searchPlaceholder={t("channel_groups_page.search_tag_placeholder")}
                          selectFilteredLabel={t("channel_groups_page.select_filtered_tags")}
                          deselectFilteredLabel={t("channel_groups_page.deselect_filtered_tags")}
                          selectedCountLabel={(count) =>
                            t("channel_groups_page.selected_tags_count", { count })
                          }
                          noResultsLabel={t("channel_groups_page.no_search_results")}
                          aria-label={t("channel_groups_page.select_tag_label")}
                          disabled={disabled}
                        />
                      </Field>
                    ) : (
                      <Field
                        label={t("channel_groups_page.select_channel_label")}
                        hint={t("channel_groups_page.select_channel_hint")}
                      >
                        <SearchableCheckboxMultiSelect
                          value={selectedChannelValues}
                          onChange={updateDraftChannels}
                          options={channelOptions}
                          placeholder={t("channel_groups_page.select_channel_placeholder")}
                          searchPlaceholder={t("channel_groups_page.search_channel_placeholder")}
                          selectFilteredLabel={t("channel_groups_page.select_filtered_channels")}
                          deselectFilteredLabel={t(
                            "channel_groups_page.deselect_filtered_channels",
                          )}
                          selectedCountLabel={(count) =>
                            t("channel_groups_page.selected_channels_count", { count })
                          }
                          noResultsLabel={t("channel_groups_page.no_search_results")}
                          aria-label={t("channel_groups_page.select_channel_label")}
                          disabled={disabled}
                        />
                      </Field>
                    )}
                  </div>

                  <DataTable<RoutingChannelGroupMemberEntry>
                    tableId="routing-channel-group-members"
                    rows={resolvedDraftChannels}
                    columns={groupMemberColumns}
                    rowKey={(channel) => channel.id}
                    virtualize={false}
                    rowHeight={52}
                    height="h-auto"
                    minHeight="min-h-0"
                    minWidth="min-w-[640px]"
                    caption={
                      groupDraft.matchMode === "tags"
                        ? t("channel_groups_page.matched_channel_label")
                        : t("channel_groups_page.select_channel_label")
                    }
                    emptyText={
                      groupDraft.matchMode === "tags"
                        ? t("channel_groups_page.empty_matched_channels")
                        : t("channel_groups_page.empty_group_channels")
                    }
                    rowClassName={(channel) =>
                      draftStaleChannelIds.has(channel.id)
                        ? "bg-rose-50/70 dark:bg-rose-500/10"
                        : ""
                    }
                    naturalFlow
                  />
                </TabsContent>

                <TabsContent
                  value="models"
                  className="flex h-full min-h-0 flex-col gap-3 overflow-hidden"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="text-sm font-semibold text-slate-900 dark:text-white">
                        {t("channel_groups_page.allowed_models_label")}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-white/55">
                        {t("channel_groups_page.allowed_models_hint")}
                      </div>
                    </div>
                  </div>

                  {!editingSystemDefaultGroup && resolvedDraftChannelValues.length === 0 ? (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500 dark:border-neutral-800 dark:bg-neutral-900/60 dark:text-white/55">
                      {t("channel_groups_page.models_need_channels")}
                    </div>
                  ) : modelsError ? (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-400/25 dark:bg-rose-500/10 dark:text-rose-200">
                      {modelsError}
                    </div>
                  ) : (
                    <div
                      data-testid="group-editor-model-list"
                      className="min-h-0 flex-1"
                    >
                      <DataTable<RoutingModelOption>
                        tableId="routing-model-options"
                        rows={modelOptions}
                        columns={modelColumns}
                        rowKey={(model) => model.id}
                        loading={modelsLoading}
                        virtualize={false}
                        rowHeight={58}
                        height="h-full"
                        minHeight="min-h-[360px]"
                        minWidth="min-w-[760px]"
                        caption={t("channel_groups_page.allowed_models_label")}
                        emptyText={t("channel_groups_page.no_channel_models")}
                        showAllLoadedMessage={false}
                      />
                    </div>
                  )}
                </TabsContent>
              </div>
            </div>
          </Tabs>
        </div>
      </Modal>

      <ConfirmModal
        open={deleteGroupTarget !== null}
        title={t("channel_groups_page.delete_group_title")}
        description={t("channel_groups_page.delete_group_desc", {
          group: deleteGroupTarget?.name.trim() || t("channel_groups_page.unnamed_group"),
          count:
            deleteGroupTarget === null
              ? 0
              : (routesByGroup.get(deleteGroupTarget.name.trim().toLowerCase()) ?? []).length,
        })}
        confirmText={t("channel_groups_page.delete_group_confirm")}
        onClose={() => setDeleteGroupTarget(null)}
        onConfirm={confirmRemoveRoutingGroup}
      />
    </>
  );
}
