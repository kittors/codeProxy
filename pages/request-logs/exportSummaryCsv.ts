import type { UsageSummaryItem } from "@code-proxy/api-client";
import { downloadBlob } from "../logs/logsHelpers";

function escapeCsvField(value: string | number): string {
  const str = String(value);
  // Prevent CSV formula injection: prefix fields starting with dangerous chars with a single quote
  const needsFormulaSanitize = /^[=+\-@\t\r]/.test(str);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r") || needsFormulaSanitize) {
    let escaped = str.replace(/"/g, '""');
    if (needsFormulaSanitize) escaped = "'" + escaped;
    return `"${escaped}"`;
  }
  return str;
}

const DEFAULT_HEADERS = [
  "人员名",
  "API Key",
  "请求数",
  "输入Token",
  "输出Token",
  "总Token",
  "费用(USD)",
];

export function exportSummaryCsv(items: UsageSummaryItem[], headers?: string[]): void {
  const BOM = "﻿";
  const resolvedHeaders = headers ?? DEFAULT_HEADERS;
  const headerLine = resolvedHeaders.map(escapeCsvField).join(",");

  const rows = items.map((item) =>
    [
      item.person_name,
      item.api_key,
      item.request_count,
      item.input_tokens,
      item.output_tokens,
      item.total_tokens,
      item.total_cost_usd,
    ]
      .map(escapeCsvField)
      .join(","),
  );

  const csv = BOM + headerLine + "\n" + rows.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });

  const now = new Date();
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  downloadBlob(blob, `usage-summary-${stamp}.csv`);
}
