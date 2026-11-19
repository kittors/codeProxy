import type { GridFilterOption, GridFilters } from "@code-proxy/ui";
import {
  buildClientFacetOptions,
  buildModelFacetOptions,
  buildStatusFacetOptions,
  filterValues,
  itemsCarryClientFields,
  publicLogQueryFromFilters,
  type RequestLogClientsSupport,
} from "@features/request-log-viewer";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PublicLogsResponse } from "../types";

type PublicLogFacet = {
  apiKeyIds: string[];
  apiKeyIdNames: Record<string, string>;
  apiKeyIdCounts: Record<string, number>;
  models: string[];
  statuses: string[];
  clientNames: string[];
  clientNameCounts: Record<string, number>;
  clients: RequestLogClientsSupport;
};

const EMPTY_FACET: PublicLogFacet = {
  apiKeyIds: [],
  apiKeyIdNames: {},
  apiKeyIdCounts: {},
  models: [],
  statuses: ["success", "failed"],
  clientNames: [],
  clientNameCounts: {},
  clients: "pending",
};

/**
 * 公开查询（Key 自查页、门户「API Key 用量」页）的请求日志筛选：一份 GridFilters（分面按钮、表头筛选、
 * 芯片共用），按响应里的筛选项生成选项，发请求时换成 fetchPublicLogs 的参数。
 *
 * 公开查询没有能力声明：后端支持调用方字段时，filters 里有 client_names、每行带 client_name，
 * 两样都没有就是旧后端，Agent 列与筛选都不出现。
 */
export function usePublicLogFilters() {
  const { t } = useTranslation();
  const [filters, setFilters] = useState<GridFilters>({});
  const [facet, setFacet] = useState<PublicLogFacet>(EMPTY_FACET);

  const options = useMemo(() => {
    const identity: GridFilterOption[] = facet.apiKeyIds
      .map((id) => ({
        value: id,
        label: facet.apiKeyIdNames[id] || id.slice(0, 8),
        count: facet.apiKeyIdCounts[id] ?? 0,
        searchText: `${facet.apiKeyIdNames[id] ?? ""} ${id}`,
      }))
      .sort((left, right) => (right.count ?? 0) - (left.count ?? 0));
    return {
      identity,
      model: buildModelFacetOptions(facet.models),
      status: buildStatusFacetOptions(facet.statuses, t),
      agent: buildClientFacetOptions(facet.clientNames, facet.clientNameCounts, t),
    };
  }, [facet, t]);

  const query = useMemo(
    () => ({
      apiKeyIds: filterValues(filters, "identity"),
      ...publicLogQueryFromFilters(filters, facet.clients === "supported"),
    }),
    [facet.clients, filters],
  );

  /** 用一次响应更新筛选项与 Agent 支持情况。 */
  const readResponse = useCallback((resp: PublicLogsResponse) => {
    const clientNames = resp.filters?.client_names;
    const supported = Array.isArray(clientNames) || itemsCarryClientFields(resp.items ?? []);
    setFacet({
      apiKeyIds: resp.filters?.api_key_ids ?? [],
      apiKeyIdNames: resp.filters?.api_key_id_names ?? {},
      apiKeyIdCounts: resp.filters?.api_key_id_counts ?? {},
      models: resp.filters?.models ?? [],
      statuses: resp.filters?.statuses?.length ? resp.filters.statuses : ["success", "failed"],
      clientNames: Array.isArray(clientNames)
        ? clientNames.filter((name): name is string => typeof name === "string")
        : [],
      clientNameCounts: resp.filters?.client_name_counts ?? {},
      clients: supported ? "supported" : "unsupported",
    });
    if (!supported) {
      setFilters((prev) => {
        if (!prev.agent) return prev;
        const next = { ...prev };
        delete next.agent;
        return next;
      });
    }
  }, []);

  /** 换了查询对象（另一把 Key、退出登录）：筛选与筛选项一起清空。 */
  const reset = useCallback(() => {
    // 没筛选时保持同一个对象：页面以 filters 为依赖重新拉第一页，换成新的空对象会白白多拉一次。
    setFilters((prev) => (Object.keys(prev).length === 0 ? prev : {}));
    setFacet(EMPTY_FACET);
  }, []);

  return { filters, setFilters, options, query, clients: facet.clients, readResponse, reset };
}

export type PublicLogFilters = ReturnType<typeof usePublicLogFilters>;
