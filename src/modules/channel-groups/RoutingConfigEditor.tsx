import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Pencil, Plus, Trash2, TriangleAlert, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  RoutingChannelGroupEntry,
  RoutingChannelGroupMemberEntry,
  RoutingPathRouteEntry,
  VisualConfigValues,
} from "@/modules/config/visual/types";
import { makeClientId } from "@/modules/config/visual/types";
import { Button } from "@/modules/ui/Button";
import { Checkbox } from "@/modules/ui/Checkbox";
import { TextInput } from "@/modules/ui/Input";
import { Modal } from "@/modules/ui/Modal";
import { SearchableCheckboxMultiSelect } from "@/modules/ui/SearchableCheckboxMultiSelect";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/modules/ui/Tabs";
import { useToast } from "@/modules/ui/ToastProvider";
import { HoverTooltip, OverflowTooltip } from "@/modules/ui/Tooltip";
import { VirtualTable, type VirtualTableColumn } from "@/modules/ui/VirtualTable";
import { VendorIcon } from "@/modules/api-keys/apiKeyPageUtils";
import {
  emptyModelPricing,
  formatModelPrice,
  type ModelPricing,
} from "@/modules/models/modelAvailability";

type GroupDraft = {
  name: string;
  description: string;
  channels: RoutingChannelGroupMemberEntry[];
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

const createEmptyGroupDraft = (): GroupDraft => ({
  name: "",
  description: "",
  channels: [],
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
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold text-slate-900 dark:text-white">{label}</div>
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

export function RoutingConfigEditor({
  values,
  disabled,
  availableChannels,
  loadModelsForChannels,
  onChange,
}: {
  values: VisualConfigValues;
  disabled?: boolean;
  availableChannels: string[];
  loadModelsForChannels?: (channels: string[]) => Promise<RoutingModelLoadResult[]>;
  onChange: (values: Partial<VisualConfigValues>) => void;
}) {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [groupEditorOpen, setGroupEditorOpen] = useState(false);
  const [groupEditorId, setGroupEditorId] = useState<string | null>(null);
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

  const channelOptions = useMemo(() => {
    return availableChannels
      .map((channel) => channel.trim())
      .filter(Boolean)
      .filter((channel, index, list) => list.indexOf(channel) === index)
      .map((channel) => ({
        value: channel,
        label: channel,
        searchText: channel,
      }));
  }, [availableChannels]);

  const availableChannelSet = useMemo(() => {
    return new Set(
      availableChannels.map((channel) => normalizeChannelName(channel)).filter(Boolean),
    );
  }, [availableChannels]);

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
      map.set(group.id, getStaleChannels(group.channels));
    });
    return map;
  }, [getStaleChannels, values.routingChannelGroups]);

  const selectedChannelValues = useMemo(
    () => groupDraft.channels.map((channel) => channel.name.trim()).filter(Boolean),
    [groupDraft.channels],
  );

  const selectedModelSet = useMemo(
    () => new Set(groupDraft.allowedModels.map((model) => model.trim()).filter(Boolean)),
    [groupDraft.allowedModels],
  );

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

  const draftStaleChannels = useMemo(
    () => getStaleChannels(groupDraft.channels),
    [getStaleChannels, groupDraft.channels],
  );

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
    if (!groupDraft.name.trim()) return t("channel_groups_page.group_name_required");
    if (!primaryRoute.path.trim()) return t("channel_groups_page.route_path_required");
    if (!normalizedPrimaryRoutePath) return t("channel_groups_page.route_path_invalid");
    if (groupDraft.channels.length === 0) return t("channel_groups_page.group_channels_required");
    if (draftStaleChannels.length > 0) {
      return t("channel_groups_page.stale_channels_required_cleanup", {
        count: draftStaleChannels.length,
      });
    }
    return "";
  }, [
    draftStaleChannels.length,
    groupDraft.channels.length,
    groupDraft.name,
    normalizedPrimaryRoutePath,
    primaryRoute.path,
    t,
  ]);

  const openCreateGroup = useCallback(() => {
    setGroupEditorId(null);
    setGroupDraft(createEmptyGroupDraft());
    setGroupEditorTab("basic");
    setModelOptions([]);
    setModelsError("");
    setModelsSelectionTouched(false);
    setGroupEditorOpen(true);
  }, []);

  const openEditGroup = useCallback(
    (group: RoutingChannelGroupEntry) => {
      const groupName = group.name.trim().toLowerCase();
      const existingRoutes = values.routingPathRoutes
        .filter((route) => route.group.trim().toLowerCase() === groupName)
        .map((route) => ({ ...route, id: route.id || makeClientId() }))
        .slice(0, 1);
      setGroupEditorId(group.id);
      setGroupDraft({
        name: group.name,
        description: group.description,
        channels: cloneMembers(group.channels),
        allowedModels: group.allowedModels ?? [],
        routes:
          existingRoutes.length > 0
            ? existingRoutes
            : [{ ...EMPTY_ROUTE_DRAFT(), group: group.name.trim() }],
      });
      setGroupEditorTab("basic");
      setModelOptions([]);
      setModelsError("");
      setModelsSelectionTouched((group.allowedModels ?? []).length > 0);
      notifyStaleChannels(group.name.trim(), staleChannelsByGroup.get(group.id) ?? []);
      setGroupEditorOpen(true);
    },
    [notifyStaleChannels, staleChannelsByGroup, values.routingPathRoutes],
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

  const updateDraftChannel = useCallback(
    (channelId: string, patch: Partial<RoutingChannelGroupMemberEntry>) => {
      setGroupDraft((current) => ({
        ...current,
        channels: current.channels.map((channel) =>
          channel.id === channelId ? { ...channel, ...patch } : channel,
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
    const groupName = groupDraft.name.trim();
    const normalizedDraft: RoutingChannelGroupEntry = {
      id: groupEditorId ?? makeClientId(),
      name: groupName,
      description: groupDraft.description.trim(),
      allowedModels: Array.from(
        new Set(groupDraft.allowedModels.map((model) => model.trim()).filter(Boolean)),
      ),
      channels: groupDraft.channels
        .map((channel) => ({
          id: channel.id || makeClientId(),
          name: channel.name.trim(),
          priority: channel.priority.trim(),
        }))
        .filter((channel) => channel.name),
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
    groupDraft,
    groupDraftError,
    groupEditorId,
    normalizedPrimaryRoutePath,
    primaryRoute,
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

  const groupColumns = useMemo<VirtualTableColumn<RoutingChannelGroupEntry>[]>(
    () => [
      {
        key: "name",
        label: t("channel_groups_page.table_group"),
        width: "w-[150px] min-w-[150px]",
        cellClassName: "min-w-0 whitespace-nowrap font-medium",
        render: (group, index) => {
          const name = group.name.trim() || t("visual_config.group_n", { n: index + 1 });
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
          const description = group.description.trim() || t("channel_groups_page.no_description");
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
        render: (group) => (
          <span className="inline-flex h-5 min-w-[24px] items-center justify-center rounded-md bg-sky-50 px-1.5 text-xs font-semibold tabular-nums text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
            {group.channels.length}
          </span>
        ),
      },
      {
        key: "modelCount",
        label: t("channel_groups_page.table_model_count"),
        width: "w-[104px] min-w-[104px]",
        headerClassName: "text-center",
        cellClassName: "whitespace-nowrap text-center",
        render: (group) =>
          group.allowedModels.length > 0 ? (
            <span className="inline-flex h-5 min-w-[24px] items-center justify-center rounded-md bg-violet-50 px-1.5 text-xs font-semibold tabular-nums text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
              {group.allowedModels.length}
            </span>
          ) : (
            <span className="text-xs text-slate-400 dark:text-white/35">
              {t("channel_groups_page.all_models")}
            </span>
          ),
      },
      {
        key: "status",
        label: t("channel_groups_page.table_status"),
        width: "w-[170px] min-w-[170px]",
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
              onClick={() => openEditGroup(group)}
              disabled={disabled}
              className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-40 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-200 dark:hover:bg-rose-500/15"
            >
              <TriangleAlert size={13} />
              <span>{t("channel_groups_page.status_invalid")}</span>
              <span className="text-[11px] font-medium text-rose-600 dark:text-rose-200/85">
                {t("channel_groups_page.deleted_channels_count", { count: staleChannels.length })}
              </span>
            </button>
          );
        },
      },
      {
        key: "channels",
        label: t("channel_groups_page.table_channels"),
        width: "w-[280px] min-w-[280px]",
        cellClassName: "min-w-0 whitespace-nowrap text-slate-700 dark:text-white/75",
        render: (group) => {
          const names = group.channels.map((channel) => channel.name.trim()).filter(Boolean);
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
                  {group.channels.map((channel) => (
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
          const summary = summarizePriorityMode(
            group.channels,
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
            <button
              type="button"
              onClick={() => removeRoutingGroup(group.id)}
              disabled={disabled}
              className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-40 dark:text-white/50 dark:hover:bg-red-900/20 dark:hover:text-red-400"
              title={t("visual_config.delete_group")}
              aria-label={t("visual_config.delete_group")}
            >
              <Trash2 size={15} />
            </button>
          </div>
        ),
      },
    ],
    [disabled, openEditGroup, removeRoutingGroup, routesByGroup, staleChannelsByGroup, t],
  );

  const groupMemberColumns = useMemo<VirtualTableColumn<RoutingChannelGroupMemberEntry>[]>(
    () => [
      {
        key: "channel",
        label: t("channel_groups_page.table_channels"),
        cellClassName: "min-w-0 whitespace-nowrap",
        render: (channel) => (
          <OverflowTooltip content={channel.name} className="block min-w-0">
            <span
              className={`flex min-w-0 items-center gap-2 truncate text-sm ${
                draftStaleChannelIds.has(channel.id)
                  ? "text-rose-700 dark:text-rose-200"
                  : "text-slate-900 dark:text-white"
              }`}
            >
              <span className="truncate">{channel.name}</span>
              {draftStaleChannelIds.has(channel.id) ? (
                <span className="inline-flex shrink-0 items-center rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-500/15 dark:text-rose-200">
                  {t("channel_groups_page.deleted_badge")}
                </span>
              ) : null}
            </span>
          </OverflowTooltip>
        ),
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
              updateDraftChannel(channel.id, { priority: value });
            }}
            placeholder="1"
            inputMode="numeric"
            pattern="[0-9]*"
            disabled={disabled}
          />
        ),
      },
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
      },
    ],
    [disabled, draftStaleChannelIds, removeDraftChannel, t, updateDraftChannel],
  );

  const modelColumns = useMemo<VirtualTableColumn<RoutingModelOption>[]>(
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
    if (selectedChannelValues.length === 0 || !loadModelsForChannels) {
      setModelOptions([]);
      setModelsError("");
      return;
    }

    let cancelled = false;
    setModelsLoading(true);
    setModelsError("");
    loadModelsForChannels(selectedChannelValues)
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
        setGroupDraft((current) => ({
          ...current,
          allowedModels: modelsSelectionTouched
            ? current.allowedModels.filter((model) => allowed.has(model))
            : normalized.map((model) => model.id),
        }));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : t("channel_groups_page.models_load_failed");
        setModelOptions([]);
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
    loadModelsForChannels,
    modelsSelectionTouched,
    selectedChannelValues,
    t,
  ]);

  return (
    <>
      <div className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              {t("channel_groups_page.groups_table_title")}
            </h3>
            <p className="text-xs text-slate-500 dark:text-white/55">
              {t("channel_groups_page.groups_table_desc")}
            </p>
          </div>
          <Button variant="primary" size="sm" onClick={openCreateGroup} disabled={disabled}>
            <Plus size={14} />
            {t("channel_groups_page.add_group")}
          </Button>
        </div>

        <VirtualTable<RoutingChannelGroupEntry>
          rows={values.routingChannelGroups}
          columns={groupColumns}
          rowKey={(group) => group.id}
          virtualize={false}
          rowHeight={44}
          height="h-auto max-h-[68vh]"
          minWidth="min-w-[1660px]"
          caption={t("channel_groups_page.groups_table_title")}
          emptyText={t("channel_groups_page.empty_groups")}
          rowClassName={(group) =>
            (staleChannelsByGroup.get(group.id)?.length ?? 0) > 0
              ? "bg-rose-50/35 dark:bg-rose-500/5"
              : ""
          }
        />
      </div>

      <Modal
        open={groupEditorOpen}
        title={
          groupEditorId ? t("channel_groups_page.edit_group") : t("channel_groups_page.add_group")
        }
        description={t("channel_groups_page.group_modal_desc")}
        onClose={closeGroupEditor}
        maxWidth="max-w-4xl"
        bodyTestId="group-editor-modal-body"
        bodyHeightClassName="h-[680px] max-h-[calc(100vh-10rem)]"
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
                  <TabsTrigger value="basic">
                    {t("channel_groups_page.basic_config_tab")}
                  </TabsTrigger>
                  <TabsTrigger value="models">{t("channel_groups_page.models_tab")}</TabsTrigger>
                </TabsList>
              </div>

              <div
                data-testid="group-editor-tab-viewport"
                className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1"
              >
                <TabsContent value="basic" className="space-y-5">
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

                  <div className="space-y-3">
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
                        deselectFilteredLabel={t("channel_groups_page.deselect_filtered_channels")}
                        selectedCountLabel={(count) =>
                          t("channel_groups_page.selected_channels_count", { count })
                        }
                        noResultsLabel={t("channel_groups_page.no_search_results")}
                        aria-label={t("channel_groups_page.select_channel_label")}
                        disabled={disabled}
                      />
                    </Field>
                  </div>

                  <VirtualTable<RoutingChannelGroupMemberEntry>
                    rows={groupDraft.channels}
                    columns={groupMemberColumns}
                    rowKey={(channel) => channel.id}
                    virtualize={false}
                    rowHeight={52}
                    height="h-[248px]"
                    minWidth="min-w-[640px]"
                    caption={t("channel_groups_page.select_channel_label")}
                    emptyText={t("channel_groups_page.empty_group_channels")}
                    rowClassName={(channel) =>
                      draftStaleChannelIds.has(channel.id)
                        ? "bg-rose-50/70 dark:bg-rose-500/10"
                        : ""
                    }
                  />
                </TabsContent>

                <TabsContent value="models" className="flex h-full min-h-0 flex-col gap-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="text-sm font-semibold text-slate-900 dark:text-white">
                        {t("channel_groups_page.allowed_models_label")}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-white/55">
                        {t("channel_groups_page.allowed_models_hint")}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={selectAllDraftModels}
                        disabled={disabled || modelOptions.length === 0}
                      >
                        <Check size={14} />
                        {t("channel_groups_page.select_all_models")}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={clearDraftModels}
                        disabled={disabled || groupDraft.allowedModels.length === 0}
                      >
                        <X size={14} />
                        {t("channel_groups_page.clear_models")}
                      </Button>
                    </div>
                  </div>

                  {selectedChannelValues.length === 0 ? (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500 dark:border-neutral-800 dark:bg-neutral-900/60 dark:text-white/55">
                      {t("channel_groups_page.models_need_channels")}
                    </div>
                  ) : modelsError ? (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-400/25 dark:bg-rose-500/10 dark:text-rose-200">
                      {modelsError}
                    </div>
                  ) : modelsLoading ? (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500 dark:border-neutral-800 dark:bg-neutral-900/60 dark:text-white/55">
                      {t("common.loading")}
                    </div>
                  ) : modelOptions.length === 0 ? (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500 dark:border-neutral-800 dark:bg-neutral-900/60 dark:text-white/55">
                      {t("channel_groups_page.no_channel_models")}
                    </div>
                  ) : (
                    <div
                      data-testid="group-editor-model-list"
                      className="min-h-0 flex-1 overflow-hidden"
                    >
                      <VirtualTable<RoutingModelOption>
                        rows={modelOptions}
                        columns={modelColumns}
                        rowKey={(model) => model.id}
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
    </>
  );
}
