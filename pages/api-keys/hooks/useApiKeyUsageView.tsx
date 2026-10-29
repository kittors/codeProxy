import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
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
  buildRequestLogKeyOptionsFromFacet,
  buildRequestLogsColumns,
  RequestLogFilterCount,
  ChannelIdentityLabel,
  DEFAULT_REQUEST_LOG_PAGE_SIZE,
  EMPTY_REQUEST_LOG_KEY_FACET,
  readRequestLogKeyFacet,
  sortRequestLogKeyOptionsByCount,
  toRequestLogsRow,
  type RequestLogKeyFacet,
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
  // 按账号查看：后端用账号名下 Key 的稳定 ID 过滤（含已删除 Key 的历史），不必先拉取这些
  // Key 的明文放进查询串。与 usageViewKeys 二选一。
  const [usageEndUserId, setUsageEndUserId] = useState("");
  const [usageViewName, setUsageViewName] = useState("");
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageRawItems, setUsageRawItems] = useState<UsageLogItem[]>([]);
  const [usageTotalCount, setUsageTotalCount] = useState(0);
  const [usageSummary, setUsageSummary] = useState<ApiKeyUsageSummary>(EMPTY_USAGE_SUMMARY);
  const [usageCurrentPage, setUsageCurrentPage] = useState(1);
  const [usagePageSize, setUsagePageSize] = useState(DEFAULT_REQUEST_LOG_PAGE_SIZE);
  const [usageLastUpdatedAt, setUsageLastUpdatedAt] = useState<number | null>(null);
  const [usageFilterOptions, setUsageFilterOptions] = useState<{
    keyFacet: RequestLogKeyFacet;
    channels: string[];
    channel_options: UsageChannelFilterOption[];
    models: string[];
  }>({
    keyFacet: EMPTY_REQUEST_LOG_KEY_FACET,
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
  const [usageContentModalModel, setUsageContentModalModel] = useState("");
  const [usageContentModalTab, setUsageContentModalTab] = useState<"input" | "output">("input");
  const [usageErrorModalOpen, setUsageErrorModalOpen] = useState(false);
  const [usageErrorModalLogId, setUsageErrorModalLogId] = useState<number | null>(null);
  const [usageErrorModalModel, setUsageErrorModalModel] = useState("");
  // Monotonic request id: every filter change fires a request and only the
  // newest response is applied. A plain in-flight boolean would silently drop
  // the new request, leaving the table showing data for the previous filters.
  const usageFetchSeqRef = useRef(0);
  /** First key — keeps ApiKeysPage mask display working. */
  const usageViewKey = usageViewKeys[0] ?? null;
  const usageOpen = usageViewKeys.length > 0 || usageEndUserId !== "";

  const handleUsageContentClick = useCallback(
    (logId: number, tab: "input" | "output", model: string) => {
      setUsageContentModalLogId(logId);
      setUsageContentModalModel(model);
      setUsageContentModalTab(tab);
      setUsageContentModalOpen(true);
    },
    [],
  );

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

  // Which keys a request is limited to. The scope this dialog was opened for is
  // sent as selectors it already holds (the secrets listed on the keys page, or the
  // account id); the key picked in the dropdown narrows it. A pick made from a key
  // facet travels as a key id, which an older backend does not read, so a pick that
  // came from its secret-valued facet (or from the options seeded before the first
  // response) stays a selector. When nothing narrows the request it still carries an
  // empty api_keys, as it always has (the account view is the case: the account id
  // limits it, and no key list is fetched for it).
  const resolveKeyScope = useCallback((): { api_keys?: string[]; api_key_ids?: string[] } => {
    const selected = usageKeyQuery.trim();
    const facet = usageFilterOptions.keyFacet;
    const pickedById = selected !== "" && facet.byId && facet.values.includes(selected);
    // 账号范围由 end_user_id 限定，这里只需要带上用户在下拉里挑的那一把 Key。
    if (usageEndUserId) {
      if (!selected) return { api_keys: [] };
      return pickedById ? { api_key_ids: [selected] } : { api_keys: [selected] };
    }
    const scope = usageViewKeys;
    if (scope.length === 0) return { api_keys: [] };
    if (!selected) return { api_keys: scope };
    if (pickedById) return { api_keys: scope, api_key_ids: [selected] };
    return { api_keys: scope.includes(selected) ? [selected] : ["__no_match__"] };
  }, [usageEndUserId, usageFilterOptions.keyFacet, usageKeyQuery, usageViewKeys]);

  const fetchUsageLogs = useCallback(
    async (page: number, size: number) => {
      if (usageViewKeys.length === 0 && !usageEndUserId) return;
      const seq = ++usageFetchSeqRef.current;
      setUsageLoading(true);

      try {
        const result = await usageApi.getUsageLogs({
          page,
          size,
          days: usageTimeRange,
          end_user_id: usageEndUserId || undefined,
          ...resolveKeyScope(),
          model: usageModelQuery || undefined,
          channel: usageChannelQuery || undefined,
          status: usageStatusFilter || undefined,
        });

        if (seq !== usageFetchSeqRef.current) return;
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
        // 按账号查看时后端已按账号过滤，返回的 Key 就是这个账号的。
        const responseFacet = readRequestLogKeyFacet(result);
        let keyFacet = responseFacet;
        if (!responseFacet.byId) {
          // An older backend lists every key it can see by secret, scope or not, so the
          // scope is applied here; a facet of key ids was computed inside the scope.
          const scopeSet = new Set(usageViewKeys);
          const inScope = (key: string) => Boolean(usageEndUserId) || scopeSet.has(key);
          const responseKeys = responseFacet.values.filter(inScope);
          keyFacet = {
            byId: false,
            values: responseKeys.length > 0 ? responseKeys : usageViewKeys,
            names: { ...responseFacet.names },
            counts: Object.fromEntries(
              Object.entries(responseFacet.counts).filter(([key]) => inScope(key)),
            ),
          };
        }
        setUsageFilterOptions({
          keyFacet,
          channels: Array.isArray(result.filters?.channels) ? result.filters.channels : [],
          channel_options: Array.isArray(result.filters?.channel_options)
            ? result.filters.channel_options
            : [],
          models: Array.isArray(result.filters?.models) ? result.filters.models : [],
        });
        setUsageLastUpdatedAt(Date.now());
      } catch (err: unknown) {
        if (seq !== usageFetchSeqRef.current) return;
        notify({
          type: "error",
          message: err instanceof Error ? err.message : t("api_keys_page.load_usage_failed"),
        });
      } finally {
        if (seq === usageFetchSeqRef.current) {
          setUsageLoading(false);
        }
      }
    },
    [
      notify,
      resolveKeyScope,
      t,
      usageChannelQuery,
      usageEndUserId,
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
      keyFacet: EMPTY_REQUEST_LOG_KEY_FACET,
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
      setUsageEndUserId("");
      setUsageViewKeys(cleaned);
      setUsageViewName(name);
      // Seed key filter options before first fetch so the dropdown is usable immediately.
      // They are the secrets this page already holds, so they are selectors rather than
      // key ids; the first response replaces them with the backend's own facet.
      setUsageFilterOptions({
        keyFacet: { byId: false, values: cleaned, names: keyNames ?? {}, counts: {} },
        channels: [],
        channel_options: [],
        models: [],
      });
    },
    [resetUsageViewState],
  );

  /** 查看一个门户账号名下全部 Key 的用量（后端 end_user_id 过滤）。 */
  const openEndUserUsageView = useCallback(
    (endUserId: string, name: string) => {
      const id = endUserId.trim();
      if (!id) return;
      resetUsageViewState();
      setUsageViewKeys([]);
      setUsageEndUserId(id);
      setUsageViewName(name);
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
    const opts = buildRequestLogKeyOptionsFromFacet(usageFilterOptions.keyFacet, {
      allKeys: t("request_logs.all_keys"),
      systemCall: t("request_logs.system_call"),
    });
    return sortRequestLogKeyOptionsByCount(opts, i18n.resolvedLanguage).map((option) => ({
      value: option.value,
      label: option.label,
      triggerLabel: option.label,
      searchText: option.searchText ?? option.label,
      trailing: <RequestLogFilterCount count={option.count} />,
    }));
  }, [i18n.resolvedLanguage, t, usageFilterOptions.keyFacet]);

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

  // Re-query from page 1 when a query input listed below changes, and only
  // then. fetchUsageLogs is read through an Effect Event instead of being a
  // dependency: its identity also follows `t`, which only feeds the error
  // toast, so a language switch used to refetch and jump back to page 1.
  const reloadUsageLogs = useEffectEvent(() => {
    void fetchUsageLogs(1, usagePageSize);
  });

  useEffect(() => {
    if (usageViewKeys.length === 0 && !usageEndUserId) return;
    reloadUsageLogs();
  }, [
    usageChannelQuery,
    usageEndUserId,
    usageKeyQuery,
    usageModelQuery,
    usagePageSize,
    usageStatusFilter,
    usageTimeRange,
    usageViewKeys,
  ]);

  const closeUsageModal = useCallback(() => {
    setUsageViewKeys([]);
    setUsageEndUserId("");
    setUsageViewName("");
    resetUsageViewState();
  }, [resetUsageViewState]);

  return {
    usageViewKey,
    usageViewKeys,
    usageOpen,
    usageViewName,
    openUsageView,
    openEndUserUsageView,
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
    usageContentModalModel,
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
