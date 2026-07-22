import type { PeriodSpendingItem } from "@code-proxy/api-client";

export interface PublicChannelFilterOption {
  value: string;
  label: string;
  provider?: string;
  auth_type?: "oauth" | "api" | string;
  auth_index?: string;
}

export interface PublicLogItem {
  id: number;
  timestamp: string;
  api_key?: string;
  api_key_id?: string;
  api_key_masked?: string;
  api_key_name?: string;
  api_key_own_name?: string;
  end_user_display_name?: string;
  channel_name?: string;
  provider?: string;
  auth_type?: "oauth" | "api" | string;
  model: string;
  upstream_model?: string;
  vision_fallback_model?: string;
  failed: boolean;
  streaming?: boolean;
  latency_ms: number;
  first_token_ms?: number;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  total_tokens: number;
  cost: number;
  has_content: boolean;
}

export interface PublicLogsResponse {
  items: PublicLogItem[];
  total: number;
  page: number;
  size: number;
  api_key_name?: string;
  stats: {
    total: number;
    success_rate: number;
    total_tokens: number;
    total_sessions?: number;
    total_cost: number;
  };
  filters: {
    api_key_ids?: string[];
    api_key_id_names?: Record<string, string>;
    api_key_id_counts?: Record<string, number>;
    models: string[];
    channels: string[];
    channel_options?: PublicChannelFilterOption[];
    statuses: string[];
  };
}

export interface ChartDataResponse {
  daily_series: Array<{
    date: string;
    requests: number;
    input_tokens: number;
    output_tokens: number;
  }>;
  heatmap_series?: Array<{
    date: string;
    requests: number;
    sessions: number;
    tokens: number;
    cost: number;
  }>;
  model_distribution: Array<{
    model: string;
    requests: number;
    tokens: number;
  }>;
  api_key_name?: string;
  stats: {
    total: number;
    success_rate: number;
    total_tokens: number;
    total_sessions?: number;
    total_cost: number;
  };
}

/** Only present fields mean that limit is configured on the key. */
export interface PublicUsageLimits {
  "daily-limit"?: number;
  "daily-used"?: number;
  "total-quota"?: number;
  "total-used"?: number;
  "spending-limit"?: number;
  "spending-used"?: number;
  "daily-spending-limit"?: number;
  "daily-spending-used"?: number;
}

export interface PublicQuotaScope {
  scope: "account" | "key";
  "period-spending": PeriodSpendingItem[];
  "daily-spending-used": number;
  "lifetime-spending-used": number;
}

export interface PublicUsageSummaryResponse {
  found: boolean;
  range: string;
  stats: {
    total_calls: number;
    quota_cost: number;
  };
  limits?: PublicUsageLimits | null;
  "quota-scopes"?: PublicQuotaScope[];
}

export interface TableColumn<T> {
  key: string;
  label: string;
  width?: string;
  headerClassName?: string;
  cellClassName?: string;
  render: (row: T, index: number) => React.ReactNode;
}
