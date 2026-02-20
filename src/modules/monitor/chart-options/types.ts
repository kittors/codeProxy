export type ModelDistributionDatum = { name: string; value: number };

export type DailySeriesPoint = {
  label: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
};

export type HourlyStackPoint = {
  label: string;
  stacks: Array<{ key: string; value: number }>;
};

export type HourlySeries = {
  modelKeys: string[];
  modelPoints: HourlyStackPoint[];
  tokenKeys: string[];
  tokenPoints: HourlyStackPoint[];
};
