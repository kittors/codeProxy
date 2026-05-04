import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { channelGroupsApi } from "@/lib/http/apis/channel-groups";
import {
  routingConfigApi,
  type RoutingConfigGroupItem,
  type RoutingConfigItem,
  type RoutingConfigPathRouteItem,
} from "@/lib/http/apis/routing-config";
import { apiClient } from "@/lib/http/client";
import { RoutingConfigEditor } from "@/modules/channel-groups/RoutingConfigEditor";
import {
  DEFAULT_VISUAL_VALUES,
  makeClientId,
  type VisualConfigValues,
} from "@/modules/config/visual/types";
import {
  filterByConfiguredModelAvailability,
  loadConfiguredModelAvailability,
} from "@/modules/models/modelAvailability";
import { Card } from "@/modules/ui/Card";
import { useToast } from "@/modules/ui/ToastProvider";

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

function hydrateRoutingValues(payload: RoutingConfigItem | undefined): VisualConfigValues {
  const next = createEmptyRoutingValues();
  next.routingStrategy = payload?.strategy === "fill-first" ? "fill-first" : "round-robin";
  next.routingIncludeDefaultGroup = payload?.["include-default-group"] !== false;
  next.routingChannelGroups = Array.isArray(payload?.["channel-groups"])
    ? payload["channel-groups"].map((group, index) => {
        const priorityMap = group?.["channel-priorities"] ?? {};
        const channelNames = Array.isArray(group?.match?.channels) ? group.match.channels : [];
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

    const channels = group.channels.map((channel) => channel.name.trim()).filter(Boolean);
    const channelPriorities = group.channels.reduce<Record<string, number>>((map, channel) => {
      const channelName = channel.name.trim();
      const priority = parsePriorityText(channel.priority);
      if (channelName && priority !== null) {
        map[channelName] = priority;
      }
      return map;
    }, {});

    const item: RoutingConfigGroupItem = { name };
    if (group.description.trim()) {
      item.description = group.description.trim();
    }
    if (channels.length > 0) {
      item.match = { channels: Array.from(new Set(channels)) };
    }
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

  const loadAvailableChannels = useCallback(async () => {
    const items = await channelGroupsApi.list();
    const known = new Set<string>();
    for (const item of items) {
      for (const channel of item.channels ?? []) {
        const name = String(channel ?? "").trim();
        if (name) known.add(name);
      }
    }
    return Array.from(known).sort((a, b) => a.localeCompare(b));
  }, []);

  const loadModelsForChannels = useCallback(async (channels: string[]) => {
    const normalizedChannels = channels
      .map((channel) => String(channel ?? "").trim())
      .filter(Boolean);
    if (normalizedChannels.length === 0) return [];
    const params = new URLSearchParams();
    params.set("allowed_channels", normalizedChannels.join(","));
    const data = await apiClient.get<{ data?: Array<{ id?: string }> }>(
      `/models?${params.toString()}`,
    );
    const ids = Array.isArray(data?.data)
      ? data.data.map((model) => String(model.id ?? "").trim()).filter(Boolean)
      : [];
    const availability = await loadConfiguredModelAvailability();
    const visibleModels = filterByConfiguredModelAvailability(
      ids.map((id) => ({ id })),
      availability,
    );
    return Array.from(new Set(visibleModels.map((model) => model.id))).sort((a, b) =>
      a.localeCompare(b),
    );
  }, []);

  const loadPage = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [routing, channels] = await Promise.all([
        routingConfigApi.get(),
        loadAvailableChannels().catch(() => []),
      ]);
      const nextValues = hydrateRoutingValues(routing);
      setVisualValues(nextValues);
      setAvailableChannels(channels);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t("channel_groups_page.load_failed");
      setError(message);
      notify({ type: "error", message });
    } finally {
      setLoading(false);
    }
  }, [loadAvailableChannels, notify, t]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const persistValues = useCallback(
    async (nextValues: VisualConfigValues) => {
      setSaving(true);
      setError("");
      try {
        await routingConfigApi.update(serializeRoutingValues(nextValues));
        const [latest, channels] = await Promise.all([
          routingConfigApi.get(),
          loadAvailableChannels().catch(() => availableChannels),
        ]);
        const hydrated = hydrateRoutingValues(latest);
        setVisualValues(hydrated);
        setAvailableChannels(channels);
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
    [availableChannels, loadAvailableChannels, notify, t, visualValues],
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
    <div className="space-y-4 overflow-x-hidden">
      <Card
        title={t("channel_groups_page.title")}
        description={t("channel_groups_page.description")}
        loading={loading}
      >
        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-400/25 dark:bg-rose-500/15 dark:text-white">
            {error}
          </div>
        ) : null}

        <div className={error ? "mt-4 space-y-4" : "space-y-4"}>
          <div className="text-sm text-slate-500 dark:text-white/55">
            {t("channel_groups_page.editor_hint")}
          </div>

          <RoutingConfigEditor
            values={visualValues}
            disabled={loading || saving}
            availableChannels={availableChannels}
            loadModelsForChannels={loadModelsForChannels}
            onChange={handleEditorChange}
          />
        </div>
      </Card>
    </div>
  );
}
