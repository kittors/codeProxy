import { describe, expect, test } from "vitest";
import type { UsageLogItem } from "@code-proxy/api-client/endpoints/usage";
import { toRequestLogsRow } from "../requestLogsRow";

const apiItem = (overrides: Partial<UsageLogItem> = {}): UsageLogItem =>
  ({
    id: 1,
    timestamp: "2026-09-21T12:00:00Z",
    api_key: "sk-test1234567890",
    api_key_name: "Primary",
    model: "gemini-3.8-flash-high",
    source: "gemini",
    channel_name: "Gemini",
    auth_index: "auth-1",
    failed: false,
    streaming: true,
    latency_ms: 1200,
    first_token_ms: 120,
    input_tokens: 12,
    output_tokens: 34,
    reasoning_tokens: 0,
    cached_tokens: 0,
    total_tokens: 46,
    cost: 0.01,
    has_content: false,
    ...overrides,
  }) as UsageLogItem;

// The audit is only as good as the mapping: a row that loses these two fields on
// the way from the API to the table renders as a clean request, which is exactly
// the outcome the feature exists to prevent.
describe("toRequestLogsRow upstream response audit fields", () => {
  test("carries the observed model and the server's verdict through", () => {
    const row = toRequestLogsRow(
      apiItem({
        upstream_model: "gemini-3.8-flash",
        upstream_response_model: "gemini-3.8-flash-exp-a",
        upstream_model_mismatch: true,
      }),
    );

    expect(row.upstreamModel).toBe("gemini-3.8-flash");
    expect(row.upstreamResponseModel).toBe("gemini-3.8-flash-exp-a");
    expect(row.upstreamModelMismatch).toBe(true);
  });

  test("defaults to no finding when the API omits both fields", () => {
    const row = toRequestLogsRow(apiItem());

    expect(row.upstreamResponseModel).toBe("");
    expect(row.upstreamModelMismatch).toBe(false);
  });

  test("keeps an honoured mapping out of the findings", () => {
    const row = toRequestLogsRow(
      apiItem({
        upstream_response_model: "gemini-3.8-flash-high",
        upstream_model_mismatch: false,
      }),
    );

    expect(row.upstreamResponseModel).toBe("gemini-3.8-flash-high");
    expect(row.upstreamModelMismatch).toBe(false);
  });
});
