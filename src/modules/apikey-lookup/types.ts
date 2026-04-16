export interface PublicLogItem {
  id: number;
  timestamp: string;
  model: string;
  failed: boolean;
  latency_ms: number;
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
  stats: {
    total: number;
    success_rate: number;
    total_tokens: number;
    total_cost: number;
  };
  filters: {
    models: string[];
  };
}

export interface LogRow {
  id: string;
  timestamp: string;
  timestampMs: number;
  model: string;
  failed: boolean;
  latencyText: string;
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
  hasContent: boolean;
}

export interface ChartDataResponse {
  daily_series: Array<{
    date: string;
    requests: number;
    input_tokens: number;
    output_tokens: number;
  }>;
  model_distribution: Array<{
    model: string;
    requests: number;
    tokens: number;
  }>;
  stats: { total: number; success_rate: number; total_tokens: number; total_cost: number };
}

export interface TableColumn<T> {
  key: string;
  label: string;
  width?: string;
  headerClassName?: string;
  cellClassName?: string;
  render: (row: T, index: number) => React.ReactNode;
}
