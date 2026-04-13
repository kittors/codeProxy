import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { usageApi } from "@/lib/http/apis";
import type { ApiKeyEntry } from "@/lib/http/apis/api-keys";
import type { UsageLogItem } from "@/lib/http/apis/usage";
import { useToast } from "@/modules/ui/ToastProvider";
import {
  buildRequestLogsColumns,
  DEFAULT_REQUEST_LOG_PAGE_SIZE,
  toRequestLogsRow,
  type RequestLogsRow,
  type TimeRange,
} from "@/modules/monitor/requestLogsShared";

type StatusFilter = "" | "success" | "failed";

const normalizeChannelGroupKey = (value: string): string => value.trim().toLowerCase();

const resolveChannelGroupLabel = (value: string): string => {
  const labels: Record<string, string> = {
    gemini: "Gemini",
    claude: "Claude",
    codex: "Codex",
    vertex: "Vertex",
    openai: "OpenAI Compatible",
    "gemini-cli": "Gemini CLI",
    antigravity: "Antigravity",
    kimi: "Kimi",
    qwen: "Qwen",
    iflow: "iFlow",
    kiro: "Kiro",
  };
  const key = normalizeChannelGroupKey(value);
  return labels[key] || value;
};

export function useApiKeyUsageView({
  channelGroupByName,
}: {
  channelGroupByName: Record<string, string>;
}) {
  const { t } = useTranslation();
  const { notify } = useToast();

  const [usageViewKey, setUsageViewKey] = useState<string | null>(null);
  const [usageViewName, setUsageViewName] = useState("");
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageRawItems, setUsageRawItems] = useState<UsageLogItem[]>([]);
  const [usageTotalCount, setUsageTotalCount] = useState(0);
  const [usageCurrentPage, setUsageCurrentPage] = useState(1);
  const [usagePageSize, setUsagePageSize] = useState(DEFAULT_REQUEST_LOG_PAGE_SIZE);
  const [usageLastUpdatedAt, setUsageLastUpdatedAt] = useState<number | null>(null);
  const [usageFilterOptions, setUsageFilterOptions] = useState<{ channels: string[]; models: string[] }>({
    channels: [],
    models: [],
  });
  const usageFilterOptionsRef = useRef<{ channels: string[]; models: string[] }>({
    channels: [],
    models: [],
  });
  const [usageTimeRange, setUsageTimeRange] = useState<TimeRange>(7);
  const [usageChannelQuery, setUsageChannelQuery] = useState("");
  const [usageChannelGroupQuery, setUsageChannelGroupQuery] = useState("");
  const [usageModelQuery, setUsageModelQuery] = useState("");
  const [usageStatusFilter, setUsageStatusFilter] = useState<StatusFilter>("");
  const [usageContentModalOpen, setUsageContentModalOpen] = useState(false);
  const [usageContentModalLogId, setUsageContentModalLogId] = useState<number | null>(null);
  const [usageContentModalTab, setUsageContentModalTab] = useState<"input" | "output">("input");
  const [usageErrorModalOpen, setUsageErrorModalOpen] = useState(false);
  const [usageErrorModalLogId, setUsageErrorModalLogId] = useState<number | null>(null);
  const [usageErrorModalModel, setUsageErrorModalModel] = useState("");
  const usageFetchInFlightRef = useRef(false);

  const handleUsageContentClick = useCallback((logId: number, tab: "input" | "output") => {
    setUsageContentModalLogId(logId);
    setUsageContentModalTab(tab);
    setUsageContentModalOpen(true);
  }, []);

  const handleUsageErrorClick = useCallback((logId: number, model: string) => {
    setUsageErrorModalLogId(logId);
    setUsageErrorModalModel(model);
    setUsageErrorModalOpen(true);
  }, []);

  const usageLogColumns = useMemo(
    () => buildRequestLogsColumns(t, handleUsageContentClick, handleUsageErrorClick),
    [t, handleUsageContentClick, handleUsageErrorClick],
  );

  const usageRows = useMemo<RequestLogsRow[]>(
    () => (usageRawItems ?? []).map((item) => toRequestLogsRow(item)),
    [usageRawItems],
  );

  const usageTotalPages = Math.max(1, Math.ceil(usageTotalCount / usagePageSize));

  const buildUsageChannelQuery = useCallback(
    (channelName: string, groupKey: string) => {
      const trimmedChannel = channelName.trim();
      const normalizedGroup = normalizeChannelGroupKey(groupKey);

      if (trimmedChannel) {
        if (!normalizedGroup) return trimmedChannel;
        const mappedGroup = channelGroupByName[trimmedChannel];
        return mappedGroup === normalizedGroup ? trimmedChannel : "__no_match__";
      }

      if (!normalizedGroup) return "";
      const matchedChannels = usageFilterOptionsRef.current.channels.filter(
        (channel) => channelGroupByName[channel] === normalizedGroup,
      );
      return matchedChannels.length > 0 ? matchedChannels.join(",") : "__no_match__";
    },
    [channelGroupByName],
  );

  const fetchUsageLogs = useCallback(
    async (page: number, size: number) => {
      if (!usageViewKey || usageFetchInFlightRef.current) return;
      usageFetchInFlightRef.current = true;
      setUsageLoading(true);

      try {
        const channelQuery = buildUsageChannelQuery(usageChannelQuery, usageChannelGroupQuery);
        const result = await usageApi.getUsageLogs({
          page,
          size,
          days: usageTimeRange,
          api_key: usageViewKey,
          model: usageModelQuery || undefined,
          channel: channelQuery || undefined,
          status: usageStatusFilter || undefined,
        });

        setUsageRawItems(result.items ?? []);
        setUsageTotalCount(result.total ?? 0);
        setUsageCurrentPage(page);
        setUsageFilterOptions({
          channels: Array.isArray(result.filters?.channels) ? result.filters.channels : [],
          models: Array.isArray(result.filters?.models) ? result.filters.models : [],
        });
        setUsageLastUpdatedAt(Date.now());
      } catch (err: unknown) {
        notify({
          type: "error",
          message: err instanceof Error ? err.message : t("api_keys_page.load_usage_failed"),
        });
      } finally {
        usageFetchInFlightRef.current = false;
        setUsageLoading(false);
      }
    },
    [
      buildUsageChannelQuery,
      notify,
      t,
      usageChannelGroupQuery,
      usageChannelQuery,
      usageModelQuery,
      usageStatusFilter,
      usageTimeRange,
      usageViewKey,
    ],
  );

  const resetUsageViewState = useCallback(() => {
    setUsageRawItems([]);
    setUsageTotalCount(0);
    setUsageCurrentPage(1);
    setUsagePageSize(DEFAULT_REQUEST_LOG_PAGE_SIZE);
    setUsageLastUpdatedAt(null);
    setUsageFilterOptions({ channels: [], models: [] });
    setUsageTimeRange(7);
    setUsageChannelQuery("");
    setUsageChannelGroupQuery("");
    setUsageModelQuery("");
    setUsageStatusFilter("");
  }, []);

  const handleViewUsage = useCallback(
    async (entry: ApiKeyEntry) => {
      resetUsageViewState();
      setUsageViewKey(entry.key);
      setUsageViewName(entry.name || t("api_keys_page.unnamed"));
    },
    [resetUsageViewState, t],
  );

  const usageChannelOptions = useMemo(
    () => [
      { value: "", label: t("request_logs.all_channels") },
      ...usageFilterOptions.channels.map((channel) => ({ value: channel, label: channel })),
    ],
    [t, usageFilterOptions.channels],
  );

  const usageChannelGroupOptions = useMemo(() => {
    const seen = new Set<string>();
    const values: { value: string; label: string }[] = [];
    usageFilterOptions.channels.forEach((channel) => {
      const groupKey = channelGroupByName[channel];
      if (!groupKey || seen.has(groupKey)) return;
      seen.add(groupKey);
      values.push({ value: groupKey, label: resolveChannelGroupLabel(groupKey) });
    });
    values.sort((a, b) => a.label.localeCompare(b.label));
    return [{ value: "", label: t("api_keys_page.all_channel_groups") }, ...values];
  }, [channelGroupByName, t, usageFilterOptions.channels]);

  const usageModelOptions = useMemo(
    () => [
      { value: "", label: t("request_logs.all_models") },
      ...usageFilterOptions.models.map((model) => ({ value: model, label: model })),
    ],
    [t, usageFilterOptions.models],
  );

  const usageLastUpdatedText = useMemo(() => {
    if (usageLoading) return t("request_logs.refreshing");
    if (!usageLastUpdatedAt) return t("request_logs.not_refreshed");
    return t("request_logs.updated_at", {
      time: new Date(usageLastUpdatedAt).toLocaleTimeString(),
    });
  }, [t, usageLastUpdatedAt, usageLoading]);

  useEffect(() => {
    usageFilterOptionsRef.current = usageFilterOptions;
  }, [usageFilterOptions]);

  useEffect(() => {
    if (!usageViewKey) return;
    void fetchUsageLogs(1, usagePageSize);
  }, [
    fetchUsageLogs,
    usageChannelGroupQuery,
    usageChannelQuery,
    usageModelQuery,
    usagePageSize,
    usageStatusFilter,
    usageTimeRange,
    usageViewKey,
  ]);

  const closeUsageModal = useCallback(() => {
    setUsageViewKey(null);
    setUsageViewName("");
    resetUsageViewState();
  }, [resetUsageViewState]);

  return {
    usageViewKey,
    usageViewName,
    usageLoading,
    usageTotalCount,
    usageCurrentPage,
    usagePageSize,
    setUsagePageSize,
    usageLastUpdatedText,
    usageTimeRange,
    setUsageTimeRange,
    usageChannelQuery,
    setUsageChannelQuery,
    usageChannelGroupQuery,
    setUsageChannelGroupQuery,
    usageModelQuery,
    setUsageModelQuery,
    usageStatusFilter,
    setUsageStatusFilter,
    usageContentModalOpen,
    setUsageContentModalOpen,
    usageContentModalLogId,
    usageContentModalTab,
    usageErrorModalOpen,
    setUsageErrorModalOpen,
    usageErrorModalLogId,
    usageErrorModalModel,
    usageLogColumns,
    usageRows,
    usageTotalPages,
    usageChannelOptions,
    usageChannelGroupOptions,
    usageModelOptions,
    fetchUsageLogs,
    handleViewUsage,
    closeUsageModal,
  };
}
