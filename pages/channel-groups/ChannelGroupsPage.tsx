import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  channelGroupsApi,
  type ChannelGroupChannelDetail,
} from "@code-proxy/api-client/endpoints/channel-groups";
import {
  routingConfigApi,
  type RoutingConfigGroupItem,
  type RoutingConfigItem,
  type RoutingConfigPathRouteItem,
} from "@code-proxy/api-client/endpoints/routing-config";
import { apiClient, modelsApi } from "@code-proxy/api-client";
import { RoutingConfigEditor, type RoutingModelOption } from "@features/routing-config-editor";
import { normalizeProviderKey, normalizeTagValue } from "@code-proxy/domain";
import {
  DEFAULT_VISUAL_VALUES,
  makeClientId,
  type RoutingStrategy,
  type VisualConfigValues,
} from "@features/visual-config-editor";
import {
  filterByConfiguredModelAvailability,
  loadConfiguredModelAvailability,
} from "@features/model-availability";
import { Card } from "@code-proxy/ui";
import { useToast } from "@code-proxy/ui";

function createEmptyRoutingValues(): VisualConfigValues {
  return {
    ...DEFAULT_VISUAL_VALUES,
    routingChannelGroups: [],
    routingPathRoutes: [],
  };
}

function parsePriorityText(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const priority = Number(trimmed);
  return Number.isSafeInteger(priority) ? priority : null;
}

const normalizeOwnerValue = (value: string): string =>
  value.trim().replace(/\s+/g, "-").toLowerCase();

const isRequestCancelled = (err: unknown, signal?: AbortSignal) =>
  signal?.aborted || (err instanceof Error && err.message === "Request was cancelled");

function normalizeRoutingStrategy(value: unknown): RoutingStrategy {
  return value === "fill-first" || value === "session-sticky" ? value : "round-robin";
}

const normalizeRoutingTags = (values: unknown): string[] => {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const tags: string[] = [];
  values.forEach((value) => {
    const tag = normalizeTagValue(value);
    if (!tag || seen.has(tag)) return;
    seen.add(tag);
    tags.push(tag);
  });
  return tags;
};

type MappedOwnerSelection = {
  owners: string[];
  hasUnmappedChannels: boolean;
};

type ChannelDetailsByName = Record<string, ChannelGroupChannelDetail>;
type ChannelDetailsByGroup = Record<string, ChannelDetailsByName>;

const collectMappedOwnersForChannels = (
  channels: string[],
  detailsByName: ChannelDetailsByName,
  ownerByAuthGroup: Record<string, string>,
): MappedOwnerSelection => {
  const owners = new Set<string>();
  let hasUnmappedChannels = false;
  for (const channel of channels) {
    const detail = detailsByName[channel.trim().toLowerCase()];
    const candidates = [detail?.source, detail?.name, channel];
    let matched = false;
    for (const candidate of candidates) {
      const key = normalizeProviderKey(String(candidate ?? ""));
      const owner = normalizeOwnerValue(ownerByAuthGroup[key] ?? "");
      if (!owner) continue;
      owners.add(owner);
      matched = true;
    }
    if (!matched) hasUnmappedChannels = true;
  }
  return { owners: Array.from(owners), hasUnmappedChannels };
};

function hydrateRoutingValues(payload: RoutingConfigItem | undefined): VisualConfigValues {
  const next = createEmptyRoutingValues();
  next.routingStrategy = normalizeRoutingStrategy(payload?.strategy);
  next.routingIncludeDefaultGroup = payload?.["include-default-group"] !== false;
  next.routingChannelGroups = Array.isArray(payload?.["channel-groups"])
    ? payload["channel-groups"].map((group, index) => {
        const priorityMap = group?.["channel-priorities"] ?? {};
        const channelNames = Array.isArray(group?.match?.channels) ? group.match.channels : [];
        const tags = normalizeRoutingTags(group?.match?.tags);
        const mergedNames = Array.from(
          new Set(
            [
              ...channelNames.map((name) => String(name ?? "").trim()),
              ...Object.keys(priorityMap).map((name) => String(name ?? "").trim()),
            ].filter(Boolean),
          ),
        );
        return {
          id: `routing-group-${index}-${makeClientId()}`,
          name: String(group?.name ?? ""),
          description: String(group?.description ?? ""),
          strategy: normalizeRoutingStrategy(group?.strategy),
          excludeFromDefault:
            group?.["exclude-from-default"] === true &&
            String(group?.name ?? "")
              .trim()
              .toLowerCase() !== "default",
          matchMode: tags.length > 0 ? "tags" : "channels",
          tags,
          allowedModels: Array.isArray(group?.["allowed-models"])
            ? Array.from(
                new Set(
                  group["allowed-models"]
                    .map((model) => String(model ?? "").trim())
                    .filter(Boolean),
                ),
              )
            : [],
          channels: mergedNames.map((name, channelIndex) => ({
            id: `routing-group-${index}-channel-${channelIndex}-${makeClientId()}`,
            name,
            priority:
              typeof priorityMap[name] === "number" && Number.isFinite(priorityMap[name])
                ? String(priorityMap[name])
                : "",
          })),
        };
      })
    : [];
  next.routingPathRoutes = Array.isArray(payload?.["path-routes"])
    ? payload["path-routes"].map((route, index) => ({
        id: `routing-path-${index}-${makeClientId()}`,
        path: String(route?.path ?? ""),
        group: String(route?.group ?? ""),
        stripPrefix: route?.["strip-prefix"] !== false,
        fallback: route?.fallback === "default" ? "default" : "none",
      }))
    : [];
  return next;
}

function serializeRoutingValues(values: VisualConfigValues): RoutingConfigItem {
  const groups: RoutingConfigGroupItem[] = values.routingChannelGroups.reduce<
    RoutingConfigGroupItem[]
  >((acc, group) => {
    const name = group.name.trim();
    if (!name) return acc;

    const item: RoutingConfigGroupItem = { name };
    if (group.description.trim()) {
      item.description = group.description.trim();
    }
    item.strategy = normalizeRoutingStrategy(group.strategy);
    if (group.excludeFromDefault && name.toLowerCase() !== "default") {
      item["exclude-from-default"] = true;
    }
    if (group.matchMode === "tags") {
      const tags = normalizeRoutingTags(group.tags);
      if (tags.length > 0) {
        item.match = { tags };
      }
    } else {
      const channels = group.channels.map((channel) => channel.name.trim()).filter(Boolean);

      if (channels.length > 0) {
        item.match = { channels: Array.from(new Set(channels)) };
      }
    }
    const channelPriorities = group.channels.reduce<Record<string, number>>((map, channel) => {
      const channelName = channel.name.trim();
      const priority = parsePriorityText(channel.priority);
      if (channelName && priority !== null) {
        map[channelName] = priority;
      }
      return map;
    }, {});
    if (Object.keys(channelPriorities).length > 0) {
      item["channel-priorities"] = channelPriorities;
    }
    const allowedModels = Array.from(
      new Set(group.allowedModels.map((model) => model.trim()).filter(Boolean)),
    );
    if (allowedModels.length > 0) {
      item["allowed-models"] = allowedModels;
    }
    acc.push(item);
    return acc;
  }, []);

  const routes: RoutingConfigPathRouteItem[] = values.routingPathRoutes.reduce<
    RoutingConfigPathRouteItem[]
  >((acc, route) => {
    const path = route.path.trim();
    const group = route.group.trim();
    if (!path || !group) return acc;
    acc.push({
      path,
      group,
      "strip-prefix": route.stripPrefix,
      fallback: route.fallback,
    });
    return acc;
  }, []);

  return {
    strategy: values.routingStrategy,
    "include-default-group": values.routingIncludeDefaultGroup,
    "channel-groups": groups,
    "path-routes": routes,
  };
}

export function ChannelGroupsPage() {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [visualValues, setVisualValues] = useState<VisualConfigValues>(() =>
    createEmptyRoutingValues(),
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [availableChannels, setAvailableChannels] = useState<string[]>([]);
  const [availableChannelDetails, setAvailableChannelDetails] = useState<ChannelDetailsByName>({});
  const [availableChannelDetailsByGroup, setAvailableChannelDetailsByGroup] =
    useState<ChannelDetailsByGroup>({});
  const [authGroupOwnerMap, setAuthGroupOwnerMap] = useState<Record<string, string>>({});

  const loadAvailableChannels = useCallback(async (options?: { signal?: AbortSignal }) => {
    const items = await channelGroupsApi.list(
      options?.signal ? { signal: options.signal } : undefined,
    );
    const known = new Set<string>();
    const detailsByName: ChannelDetailsByName = {};
    const detailsByGroup: ChannelDetailsByGroup = {};
    for (const item of items) {
      const groupKey = item.name.trim().toLowerCase();
      for (const channel of item.channels ?? []) {
        const name = String(channel ?? "").trim();
        if (name) known.add(name);
      }
      for (const detail of item.channelDetails ?? []) {
        const name = String(detail.name ?? "").trim();
        if (!name) continue;
        known.add(name);
        const channelKey = name.toLowerCase();
        if (groupKey) {
          detailsByGroup[groupKey] = {
            ...(detailsByGroup[groupKey] ?? {}),
            [channelKey]: detail,
          };
        }
        if (!detailsByName[channelKey] || detailsByName[channelKey].disabled === true) {
          detailsByName[channelKey] = detail;
        }
      }
    }
    return {
      names: Array.from(known).sort((a, b) => a.localeCompare(b)),
      detailsByName,
      detailsByGroup,
    };
  }, []);

  const refreshAvailableChannels = useCallback(async () => {
    const channels = await loadAvailableChannels();
    setAvailableChannels(channels.names);
    setAvailableChannelDetails(channels.detailsByName);
    setAvailableChannelDetailsByGroup(channels.detailsByGroup);
  }, [loadAvailableChannels]);

  const loadModelsForChannels = useCallback(
    async (channels: string[], groupName?: string) => {
      const normalizedChannels = channels
        .map((channel) => String(channel ?? "").trim())
        .filter(Boolean);
      const normalizedGroup = String(groupName ?? "").trim();
      if (normalizedChannels.length === 0 && !normalizedGroup) return [];
      const params = new URLSearchParams();
      if (normalizedChannels.length > 0) {
        params.set("allowed_channels", normalizedChannels.join(","));
      }
      if (normalizedGroup) {
        params.set("allowed_channel_groups", normalizedGroup);
      }
      const data = await apiClient.get<{ data?: Array<{ id?: string }> }>(
        `/models?${params.toString()}`,
      );
      const ids = Array.isArray(data?.data)
        ? data.data.map((model) => String(model.id ?? "").trim()).filter(Boolean)
        : [];
      // Group editors must use the same scope as the channel group; default
      // availability can be narrower and would drop owner-mapped catalog models.
      const availability =
        normalizedGroup && normalizedGroup !== "default"
          ? await loadConfiguredModelAvailability({ allowedChannelGroups: [normalizedGroup] })
          : await loadConfiguredModelAvailability();
      const detailsForGroup =
        (normalizedGroup ? availableChannelDetailsByGroup[normalizedGroup.toLowerCase()] : undefined) ??
        availableChannelDetails;
      const ownerSelection = collectMappedOwnersForChannels(
        normalizedChannels,
        detailsForGroup,
        authGroupOwnerMap,
      );
      let visibleModels = filterByConfiguredModelAvailability(
        ids.map((id) => ({ id })),
        availability,
      );
      const metadataById = new Map(
        availability.items.map((model) => [model.id.toLowerCase(), model] as const),
      );
      if (ownerSelection.owners.length > 0 && !ownerSelection.hasUnmappedChannels) {
        const selectedOwnerSet = new Set(ownerSelection.owners);
        visibleModels = visibleModels.filter((model) => {
          const metadata = metadataById.get(model.id.toLowerCase());
          const owner = normalizeOwnerValue(metadata?.owned_by ?? "");
          const source = normalizeOwnerValue(metadata?.source ?? "");
          return selectedOwnerSet.has(owner) || selectedOwnerSet.has(source);
        });
      }
      const optionMap = new Map<string, RoutingModelOption>();
      const addModelOption = (id: string, metadata = metadataById.get(id.toLowerCase())) => {
        const normalized = id.trim();
        if (!normalized) return;
        const key = normalized.toLowerCase();
        if (optionMap.has(key)) return;
        optionMap.set(key, {
          id: normalized,
          owned_by: metadata?.owned_by,
          description: metadata?.description,
          pricing: metadata?.pricing,
        });
      };

      for (const model of visibleModels) addModelOption(model.id);

      if (ownerSelection.owners.length > 0) {
        const selectedOwnerSet = new Set(ownerSelection.owners);
        for (const model of availability.items) {
          const owner = normalizeOwnerValue(model.owned_by ?? "");
          const source = normalizeOwnerValue(model.source ?? "");
          if (!selectedOwnerSet.has(owner) && !selectedOwnerSet.has(source)) continue;
          addModelOption(model.id, model);
        }
      }

      return Array.from(optionMap.values()).sort((a, b) => a.id.localeCompare(b.id));
    },
    [authGroupOwnerMap, availableChannelDetails, availableChannelDetailsByGroup],
  );

  const loadPage = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const [routing, channels, ownerMappings] = await Promise.all([
        routingConfigApi.get(signal ? { signal } : undefined),
        loadAvailableChannels(signal ? { signal } : undefined).catch(() => ({
          names: [],
          detailsByName: {},
          detailsByGroup: {},
        })),
        modelsApi
          .getAuthGroupModelOwnerMappingMap(signal ? { signal } : undefined)
          .catch(() => ({})),
      ]);
      if (signal?.aborted) return;
      const nextValues = hydrateRoutingValues(routing);
      setVisualValues(nextValues);
      setAvailableChannels(channels.names);
      setAvailableChannelDetails(channels.detailsByName);
      setAvailableChannelDetailsByGroup(channels.detailsByGroup);
      setAuthGroupOwnerMap(ownerMappings);
    } catch (err: unknown) {
      if (isRequestCancelled(err, signal)) return;
      const message = err instanceof Error ? err.message : t("channel_groups_page.load_failed");
      setError(message);
      notify({ type: "error", message });
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [loadAvailableChannels, notify, t]);

  useEffect(() => {
    const controller = new AbortController();
    void loadPage(controller.signal);
    return () => controller.abort();
  }, [loadPage]);

  const persistValues = useCallback(
    async (nextValues: VisualConfigValues) => {
      setSaving(true);
      setError("");
      try {
        await routingConfigApi.update(serializeRoutingValues(nextValues));
        const [latest, channels] = await Promise.all([
          routingConfigApi.get(),
          loadAvailableChannels().catch(() => ({
            names: availableChannels,
            detailsByName: availableChannelDetails,
            detailsByGroup: availableChannelDetailsByGroup,
          })),
        ]);
        const hydrated = hydrateRoutingValues(latest);
        setVisualValues(hydrated);
        setAvailableChannels(channels.names);
        setAvailableChannelDetails(channels.detailsByName);
        setAvailableChannelDetailsByGroup(channels.detailsByGroup);
        notify({ type: "success", message: t("channel_groups_page.saved") });
      } catch (err: unknown) {
        setVisualValues(visualValues);
        const message = err instanceof Error ? err.message : t("channel_groups_page.save_failed");
        setError(message);
        notify({
          type: "error",
          message,
        });
      } finally {
        setSaving(false);
      }
    },
    [
      availableChannelDetails,
      availableChannelDetailsByGroup,
      availableChannels,
      loadAvailableChannels,
      notify,
      t,
      visualValues,
    ],
  );

  const handleEditorChange = useCallback(
    (patch: Partial<VisualConfigValues>) => {
      const nextValues: VisualConfigValues = { ...visualValues, ...patch };
      setVisualValues(nextValues);
      void persistValues(nextValues);
    },
    [persistValues, visualValues],
  );

  return (
    <div className="space-y-4 overflow-x-hidden md:flex md:h-[calc(100dvh-112px)] md:min-h-0 md:flex-col">
      <Card
        className="md:flex md:min-h-0 md:flex-1 md:flex-col md:overflow-hidden"
        bodyClassName="md:flex md:min-h-0 md:flex-1 md:flex-col"
        loading={loading}
      >
        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-400/25 dark:bg-rose-500/15 dark:text-white">
            {error}
          </div>
        ) : null}

        <div
          className={[
            error ? "mt-4" : null,
            "space-y-4 md:flex md:min-h-0 md:flex-1 md:flex-col",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <RoutingConfigEditor
            title={t("channel_groups_page.title")}
            values={visualValues}
            disabled={loading || saving}
            availableChannels={availableChannels}
            availableChannelDetails={availableChannelDetails}
            availableChannelDetailsByGroup={availableChannelDetailsByGroup}
            onRefreshAvailableChannels={refreshAvailableChannels}
            loadModelsForChannels={loadModelsForChannels}
            onChange={handleEditorChange}
          />
        </div>
      </Card>
    </div>
  );
}
