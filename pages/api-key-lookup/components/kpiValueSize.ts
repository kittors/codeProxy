/** Pick a KPI value font size so fixed-width cards never overflow. */
export function kpiValueSizeClass(displayText: string): string {
  const length = displayText.replace(/\s+/g, "").length;
  if (length <= 9) return "text-2xl";
  if (length <= 13) return "text-xl";
  if (length <= 17) return "text-lg";
  if (length <= 22) return "text-base";
  return "text-sm";
}

export function formatQuotaUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

export function formatQuotaCount(value: number): string {
  return Math.round(value).toLocaleString();
}
