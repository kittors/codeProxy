import { useCallback, useMemo, useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  RoutingChannelGroupEntry,
  RoutingChannelGroupMemberEntry,
  RoutingPathRouteEntry,
  VisualConfigValues,
} from "@/modules/config/visual/types";
import { makeClientId } from "@/modules/config/visual/types";
import { Button } from "@/modules/ui/Button";
import { TextInput } from "@/modules/ui/Input";
import { Modal } from "@/modules/ui/Modal";
import { SearchableCheckboxMultiSelect } from "@/modules/ui/SearchableCheckboxMultiSelect";
import { HoverTooltip, OverflowTooltip } from "@/modules/ui/Tooltip";
import { VirtualTable, type VirtualTableColumn } from "@/modules/ui/VirtualTable";

type GroupDraft = {
  name: string;
  description: string;
  channels: RoutingChannelGroupMemberEntry[];
  routes: RoutingPathRouteEntry[];
};

const createEmptyGroupDraft = (): GroupDraft => ({
  name: "",
  description: "",
  channels: [],
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
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) ? parsed : null;
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

export function RoutingConfigEditor({
  values,
  disabled,
  availableChannels,
  onChange,
}: {
  values: VisualConfigValues;
  disabled?: boolean;
  availableChannels: string[];
  onChange: (values: Partial<VisualConfigValues>) => void;
}) {
  const { t } = useTranslation();
  const [groupEditorOpen, setGroupEditorOpen] = useState(false);
  const [groupEditorId, setGroupEditorId] = useState<string | null>(null);
  const [groupDraft, setGroupDraft] = useState<GroupDraft>(() => createEmptyGroupDraft());

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

  const selectedChannelValues = useMemo(
    () => groupDraft.channels.map((channel) => channel.name.trim()).filter(Boolean),
    [groupDraft.channels],
  );

  const primaryRoute = groupDraft.routes[0] ?? EMPTY_ROUTE_DRAFT();

  const groupDraftError = useMemo(() => {
    if (!groupDraft.name.trim()) return t("channel_groups_page.group_name_required");
    if (!primaryRoute.path.trim()) return t("channel_groups_page.route_path_required");
    if (groupDraft.channels.length === 0) return t("channel_groups_page.group_channels_required");
    return "";
  }, [groupDraft.channels.length, groupDraft.name, primaryRoute.path, t]);

  const openCreateGroup = useCallback(() => {
    setGroupEditorId(null);
    setGroupDraft(createEmptyGroupDraft());
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
        routes: existingRoutes.length > 0 ? existingRoutes : [{ ...EMPTY_ROUTE_DRAFT(), group: group.name.trim() }],
      });
      setGroupEditorOpen(true);
    },
    [values.routingPathRoutes],
  );

  const closeGroupEditor = useCallback(() => {
    setGroupEditorOpen(false);
    setGroupEditorId(null);
    setGroupDraft(createEmptyGroupDraft());
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

  const updatePrimaryRoute = useCallback((patch: Partial<RoutingPathRouteEntry>) => {
    setGroupDraft((current) => {
      const currentRoute = current.routes[0] ?? { ...EMPTY_ROUTE_DRAFT(), group: current.name.trim() };
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
      path: primaryRoute.path.trim(),
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
        key: "channels",
        label: t("channel_groups_page.table_channels"),
        width: "w-[280px] min-w-[280px]",
        cellClassName: "min-w-0 whitespace-nowrap text-slate-700 dark:text-white/75",
        render: (group) => {
          const names = group.channels
            .map((channel) => channel.name.trim())
            .filter(Boolean);
          if (names.length === 0) {
            return <span className="text-slate-400 dark:text-white/35">{t("channel_groups_page.none")}</span>;
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
            return <span className="text-slate-400 dark:text-white/35">{t("channel_groups_page.none")}</span>;
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
    [disabled, openEditGroup, removeRoutingGroup, routesByGroup, t],
  );

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
          minWidth="min-w-[1360px]"
          caption={t("channel_groups_page.groups_table_title")}
          emptyText={t("channel_groups_page.empty_groups")}
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
        <div className="space-y-5">
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
                onChange={(event) => updatePrimaryRoute({ path: event.currentTarget.value })}
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

          {groupDraft.channels.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500 dark:border-neutral-800 dark:text-white/55">
              {t("channel_groups_page.empty_group_channels")}
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200/80 dark:border-neutral-800">
              <div className="grid grid-cols-[minmax(0,1.5fr)_140px_56px] gap-3 border-b border-slate-200/80 bg-slate-50/80 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-neutral-800 dark:bg-neutral-900/50 dark:text-white/40">
                <div>{t("channel_groups_page.table_channels")}</div>
                <div>{t("channel_groups_page.channel_priority_label")}</div>
                <div className="text-right">{t("common.action")}</div>
              </div>
              {groupDraft.channels.map((channel) => (
                <div
                  key={channel.id}
                  className="grid grid-cols-[minmax(0,1.5fr)_140px_56px] gap-3 border-b border-slate-200/70 px-4 py-3 last:border-b-0 dark:border-neutral-800"
                >
                  <div className="truncate pt-2 text-sm text-slate-900 dark:text-white">
                    {channel.name}
                  </div>
                  <TextInput
                    value={channel.priority}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      updateDraftChannel(channel.id, { priority: value });
                    }}
                    placeholder="0"
                    inputMode="numeric"
                    disabled={disabled}
                  />
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
                </div>
              ))}
            </div>
          )}

        </div>
      </Modal>
    </>
  );
}
