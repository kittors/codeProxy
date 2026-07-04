export interface PublicLogItem {
  id: number;
  timestamp: string;
  api_key?: string;
  api_key_name?: string;
  channel_name?: string;
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
    models: string[];
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

export interface TableColumn<T> {
  key: string;
  label: string;
  width?: string;
  headerClassName?: string;
  cellClassName?: string;
  render: (row: T, index: number) => React.ReactNode;
}
