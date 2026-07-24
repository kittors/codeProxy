import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { usageApi } from "@code-proxy/api-client";
import type { ApiKeyEntry } from "@code-proxy/api-client/endpoints/api-keys";
import type {
  UsageChannelFilterOption,
  UsageLogItem,
} from "@code-proxy/api-client/endpoints/usage";
import { useToast, type SearchableSelectOption } from "@code-proxy/ui";
import { ModelTag } from "@features/model-tags";
import {
  buildRequestLogKeyOptions,
  buildRequestLogsColumns,
  RequestLogFilterCount,
  ChannelIdentityLabel,
  DEFAULT_REQUEST_LOG_PAGE_SIZE,
  sortRequestLogKeyOptionsByCount,
  toRequestLogsRow,
  type RequestLogsRow,
  type TimeRange,
} from "@features/request-log-viewer";
import type { ApiKeyUsageSummary } from "../types";

type StatusFilter = "" | "success" | "failed";

const EMPTY_USAGE_SUMMARY: ApiKeyUsageSummary = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  requestCount: 0,
  successRate: 0,
};

export function useApiKeyUsageView() {
  const { t, i18n } = useTranslation();
  const { notify } = useToast();

  const [usageViewKeys, setUsageViewKeys] = useState<string[]>([]);
  const [usageViewName, setUsageViewName] = useState("");
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageRawItems, setUsageRawItems] = useState<UsageLogItem[]>([]);
  const [usageTotalCount, setUsageTotalCount] = useState(0);
  const [usageSummary, setUsageSummary] = useState<ApiKeyUsageSummary>(EMPTY_USAGE_SUMMARY);
  const [usageCurrentPage, setUsageCurrentPage] = useState(1);
  const [usagePageSize, setUsagePageSize] = useState(DEFAULT_REQUEST_LOG_PAGE_SIZE);
  const [usageLastUpdatedAt, setUsageLastUpdatedAt] = useState<number | null>(null);
  const [usageFilterOptions, setUsageFilterOptions] = useState<{
    api_keys: string[];
    api_key_names: Record<string, string>;
    api_key_counts: Record<string, number>;
    channels: string[];
    channel_options: UsageChannelFilterOption[];
    models: string[];
  }>({
    api_keys: [],
    api_key_names: {},
    api_key_counts: {},
    channels: [],
    channel_options: [],
    models: [],
  });
  const [usageTimeRange, setUsageTimeRange] = useState<TimeRange>(7);
  const [usageKeyQuery, setUsageKeyQuery] = useState("");
  const [usageChannelQuery, setUsageChannelQuery] = useState("");
  const [usageModelQuery, setUsageModelQuery] = useState("");
  const [usageStatusFilter, setUsageStatusFilter] = useState<StatusFilter>("");
  const [usageContentModalOpen, setUsageContentModalOpen] = useState(false);
  const [usageContentModalLogId, setUsageContentModalLogId] = useState<number | null>(null);
  const [usageContentModalTab, setUsageContentModalTab] = useState<"input" | "output">("input");
  const [usageErrorModalOpen, setUsageErrorModalOpen] = useState(false);
  const [usageErrorModalLogId, setUsageErrorModalLogId] = useState<number | null>(null);
  const [usageErrorModalModel, setUsageErrorModalModel] = useState("");
  const usageFetchInFlightRef = useRef(false);
  /** First key — keeps ApiKeysPage mask display working. */
  const usageViewKey = usageViewKeys[0] ?? null;

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

  const resolveScopedApiKeys = useCallback(() => {
    const scope = usageViewKeys;
    if (scope.length === 0) return [];
    const selected = usageKeyQuery.trim();
    if (!selected) return scope;
    return scope.includes(selected) ? [selected] : ["__no_match__"];
  }, [usageKeyQuery, usageViewKeys]);

  const fetchUsageLogs = useCallback(
    async (page: number, size: number) => {
      if (usageViewKeys.length === 0 || usageFetchInFlightRef.current) return;
      usageFetchInFlightRef.current = true;
      setUsageLoading(true);

      try {
        const result = await usageApi.getUsageLogs({
          page,
          size,
          days: usageTimeRange,
          api_keys: resolveScopedApiKeys(),
          model: usageModelQuery || undefined,
          channel: usageChannelQuery || undefined,
          status: usageStatusFilter || undefined,
        });

        const items = result.items ?? [];
        setUsageRawItems(items);
        setUsageTotalCount(result.total ?? 0);
        setUsageSummary({
          inputTokens: items.reduce((sum, item) => sum + item.input_tokens, 0),
          outputTokens: items.reduce((sum, item) => sum + item.output_tokens, 0),
          totalTokens: result.stats.total_tokens,
          requestCount: result.stats.total || result.total || 0,
          successRate: result.stats.success_rate,
        });
        setUsageCurrentPage(page);
        // Keep key options within the opened scope; merge names from response.
        const scopeSet = new Set(usageViewKeys);
        const responseKeys = Array.isArray(result.filters?.api_keys)
          ? result.filters.api_keys.filter((key) => scopeSet.has(key))
          : [];
        const keys = responseKeys.length > 0 ? responseKeys : usageViewKeys;
        const names = { ...result.filters?.api_key_names };
        const counts = Object.fromEntries(
          Object.entries(result.filters?.api_key_counts ?? {}).filter(([key]) => scopeSet.has(key)),
        );
        setUsageFilterOptions({
          api_keys: keys,
          api_key_names: names,
          api_key_counts: counts,
          channels: Array.isArray(result.filters?.channels) ? result.filters.channels : [],
          channel_options: Array.isArray(result.filters?.channel_options)
            ? result.filters.channel_options
            : [],
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
      notify,
      resolveScopedApiKeys,
      t,
      usageChannelQuery,
      usageModelQuery,
      usageStatusFilter,
      usageTimeRange,
      usageViewKeys,
    ],
  );

  const resetUsageViewState = useCallback(() => {
    setUsageRawItems([]);
    setUsageTotalCount(0);
    setUsageSummary(EMPTY_USAGE_SUMMARY);
    setUsageCurrentPage(1);
    setUsagePageSize(DEFAULT_REQUEST_LOG_PAGE_SIZE);
    setUsageLastUpdatedAt(null);
    setUsageFilterOptions({
      api_keys: [],
      api_key_names: {},
      api_key_counts: {},
      channels: [],
      channel_options: [],
      models: [],
    });
    setUsageTimeRange(7);
    setUsageKeyQuery("");
    setUsageChannelQuery("");
    setUsageModelQuery("");
    setUsageStatusFilter("");
  }, []);

  const openUsageView = useCallback(
    (keys: string[], name: string, keyNames?: Record<string, string>) => {
      const cleaned = Array.from(new Set(keys.map((k) => k.trim()).filter(Boolean)));
      if (cleaned.length === 0) return;
      resetUsageViewState();
      setUsageViewKeys(cleaned);
      setUsageViewName(name);
      // Seed key filter options before first fetch so the dropdown is usable immediately.
      setUsageFilterOptions({
        api_keys: cleaned,
        api_key_names: keyNames ?? {},
        api_key_counts: {},
        channels: [],
        channel_options: [],
        models: [],
      });
    },
    [resetUsageViewState],
  );

  const handleViewUsage = useCallback(
    async (entry: ApiKeyEntry) => {
      const name = entry.name || t("api_keys_page.unnamed");
      openUsageView([entry.key], name, entry.name ? { [entry.key]: entry.name } : undefined);
    },
    [openUsageView, t],
  );

  const usageKeyOptions = useMemo<SearchableSelectOption[]>(() => {
    const sourceKeys =
      usageFilterOptions.api_keys.length > 0 ? usageFilterOptions.api_keys : usageViewKeys;
    const opts = buildRequestLogKeyOptions(
      sourceKeys,
      usageFilterOptions.api_key_names,
      {
        allKeys: t("request_logs.all_keys"),
        systemCall: t("request_logs.system_call"),
      },
      usageFilterOptions.api_key_counts,
    );
    return sortRequestLogKeyOptionsByCount(opts, i18n.resolvedLanguage).map((option) => ({
      value: option.value,
      label: option.label,
      triggerLabel: option.label,
      searchText: option.searchText ?? option.label,
      trailing: <RequestLogFilterCount count={option.count} />,
    }));
  }, [
    i18n.resolvedLanguage,
    t,
    usageFilterOptions.api_key_counts,
    usageFilterOptions.api_key_names,
    usageFilterOptions.api_keys,
    usageViewKeys,
  ]);

  const usageChannelOptions = useMemo<SearchableSelectOption[]>(() => {
    const apiLabel = t("request_logs.auth_type_api");
    const oauthLabel = t("request_logs.auth_type_oauth");
    const source: UsageChannelFilterOption[] =
      usageFilterOptions.channel_options.length > 0
        ? usageFilterOptions.channel_options
        : usageFilterOptions.channels.map((ch) => ({
            value: ch,
            label: ch,
          }));
    return [
      {
        value: "",
        label: t("request_logs.all_channels"),
        searchText: t("request_logs.all_channels"),
      },
      ...source.map((option) => {
        const provider = String(option.provider ?? "").trim();
        const authType = String(option.auth_type ?? "").trim();
        return {
          value: option.value,
          label: (
            <ChannelIdentityLabel
              name={option.label}
              provider={option.provider}
              authType={option.auth_type}
              apiLabel={apiLabel}
              oauthLabel={oauthLabel}
              className="w-full"
              nameClassName="text-sm font-normal text-inherit"
            />
          ),
          searchText: [option.label, provider, authType, option.value].filter(Boolean).join(" "),
        };
      }),
    ];
  }, [t, usageFilterOptions.channel_options, usageFilterOptions.channels]);

  const usageModelOptions = useMemo<SearchableSelectOption[]>(
    () => [
      { value: "", label: t("request_logs.all_models"), searchText: t("request_logs.all_models") },
      ...usageFilterOptions.models.map((model) => ({
        value: model,
        label: <ModelTag id={model} size="sm" />,
        searchText: model,
      })),
    ],
    [t, usageFilterOptions.models],
  );

  const usageStatusOptions = useMemo<SearchableSelectOption[]>(
    () => [
      { value: "", label: t("request_logs.all_status"), searchText: t("request_logs.all_status") },
      {
        value: "success",
        label: t("request_logs.status_success"),
        searchText: t("request_logs.status_success"),
      },
      {
        value: "failed",
        label: t("request_logs.status_failed"),
        searchText: t("request_logs.status_failed"),
      },
    ],
    [t],
  );

  const usageLastUpdatedText = useMemo(() => {
    if (usageLoading) return t("request_logs.refreshing");
    if (!usageLastUpdatedAt) return t("request_logs.not_refreshed");
    return t("request_logs.updated_at", {
      time: new Date(usageLastUpdatedAt).toLocaleTimeString(),
    });
  }, [t, usageLastUpdatedAt, usageLoading]);

  useEffect(() => {
    if (usageViewKeys.length === 0) return;
    void fetchUsageLogs(1, usagePageSize);
  }, [
    fetchUsageLogs,
    usageChannelQuery,
    usageKeyQuery,
    usageModelQuery,
    usagePageSize,
    usageStatusFilter,
    usageTimeRange,
    usageViewKeys,
  ]);

  const closeUsageModal = useCallback(() => {
    setUsageViewKeys([]);
    setUsageViewName("");
    resetUsageViewState();
  }, [resetUsageViewState]);

  return {
    usageViewKey,
    usageViewKeys,
    usageViewName,
    openUsageView,
    usageLoading,
    usageTotalCount,
    usageSummary,
    usageCurrentPage,
    usagePageSize,
    setUsagePageSize,
    usageLastUpdatedText,
    usageTimeRange,
    setUsageTimeRange,
    usageKeyQuery,
    setUsageKeyQuery,
    usageChannelQuery,
    setUsageChannelQuery,
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
    usageKeyOptions,
    usageChannelOptions,
    usageModelOptions,
    usageStatusOptions,
    fetchUsageLogs,
    handleViewUsage,
    closeUsageModal,
  };
}
