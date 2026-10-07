export type ModelDistributionDatum = { name: string; value: number };

export type DailySeriesPoint = {
  label: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
};
