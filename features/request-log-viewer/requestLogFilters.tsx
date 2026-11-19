import { VendorIcon } from "@code-proxy/assets";
import type { GridFilterOption, GridFilters } from "@code-proxy/ui";
import type { TFunction } from "i18next";
import { describeRequestLogClient, UNKNOWN_REQUEST_LOG_CLIENT } from "./requestLogClients";
import {
  buildRequestLogKeyOptionsFromFacet,
  requestLogKeyFilterQuery,
  type RequestLogKeyFacet,
} from "./requestLogKeyFilter";

/**
 * 请求日志的筛选：页面只持有一份 GridFilters（芯片、表头筛选、工具栏分面按钮共用），
 * 发请求时在这里换成查询参数。键就是表格的列 id：identity、model、channel、agent、status。
 * 分面里「一个都不选」就是不筛（不会出现「全部取消、一条都不显示」的空选择），
 * 所以 *_empty 参数不再从界面发出。
 */

export const REQUEST_LOG_FILTER_COLUMNS = ["identity", "model", "channel", "agent", "status"] as const;

const sortByCount = (options: GridFilterOption[]) =>
  options.sort(
    (left, right) =>
      (right.count ?? 0) - (left.count ?? 0) || left.label.localeCompare(right.label),
  );

export function buildModelFacetOptions(models: readonly string[]): GridFilterOption[] {
  return models.map((model) => ({
    value: model,
    label: model,
    icon: <VendorIcon modelId={model} size={13} />,
  }));
}

export function buildChannelFacetOptions(
  channels: readonly { value: string; label: string; provider?: string; auth_type?: string }[],
): GridFilterOption[] {
  return channels.map((channel) => {
    const provider = String(channel.provider ?? "").trim();
    return {
      value: channel.value,
      label: channel.label || channel.value,
      icon: <VendorIcon modelId={provider} size={13} />,
      searchText: [channel.label, provider, channel.auth_type, channel.value]
        .filter(Boolean)
        .join(" "),
    };
  });
}

export function buildClientFacetOptions(
  names: readonly string[],
  counts: Readonly<Record<string, number>>,
  t: TFunction,
): GridFilterOption[] {
  return sortByCount(
    names.map((name) => {
      const client = name === UNKNOWN_REQUEST_LOG_CLIENT ? null : describeRequestLogClient(name);
      const label = client
        ? client.labelKey
          ? t(client.labelKey)
          : client.label
        : t("request_logs.agent_unknown");
      return {
        value: name,
        label,
        count: Number.isFinite(counts[name]) ? counts[name] : undefined,
        icon: client?.vendor ? <VendorIcon modelId={client.vendor} size={13} /> : undefined,
        searchText: `${label} ${name}`,
      };
    }),
  );
}

export function buildStatusFacetOptions(statuses: readonly string[], t: TFunction): GridFilterOption[] {
  return statuses.map((status) => ({
    value: status,
    label:
      status === "success"
        ? t("request_logs.status_success")
        : status === "failed"
          ? t("request_logs.status_failed")
          : status,
  }));
}

export function buildKeyFacetOptions(facet: RequestLogKeyFacet, t: TFunction): GridFilterOption[] {
  return sortByCount(
    buildRequestLogKeyOptionsFromFacet(facet, {
      allKeys: t("request_logs.all_users"),
      systemCall: t("request_logs.system_call"),
    })
      .filter((option) => option.value !== "")
      .map((option) => ({
        value: option.value,
        label: option.label,
        count: option.count,
        searchText: option.searchText,
      })),
  );
}

/** 某一列选中的取值；没筛这一列返回 undefined。 */
export function filterValues(filters: GridFilters, columnId: string): string[] | undefined {
  const value = filters[columnId];
  return value?.type === "options" && value.values.length > 0 ? [...value.values] : undefined;
}

/** 管理端 /usage/logs 的查询参数。Agent 只在后端声明 request-log-clients 后才发（旧后端不认，会返回全部）。 */
export function requestLogQueryFromFilters(
  filters: GridFilters,
  keyFacet: Pick<RequestLogKeyFacet, "byId">,
  clientsSupported: boolean,
) {
  const keys = filterValues(filters, "identity");
  return {
    ...requestLogKeyFilterQuery(keyFacet, { values: keys, matchesNone: false }),
    models: filterValues(filters, "model"),
    channels: filterValues(filters, "channel"),
    statuses: filterValues(filters, "status"),
    client_names: clientsSupported ? filterValues(filters, "agent") : undefined,
  };
}

/** 公开查询（门户、Key 自查）的参数：没有渠道和用户维度。 */
export function publicLogQueryFromFilters(filters: GridFilters, clientsSupported: boolean) {
  return {
    models: filterValues(filters, "model"),
    statuses: filterValues(filters, "status"),
    clientNames: clientsSupported ? filterValues(filters, "agent") : undefined,
  };
}
