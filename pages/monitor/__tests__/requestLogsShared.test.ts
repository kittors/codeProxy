import { describe, expect, test } from "vitest";
import {
  buildRequestLogsColumns,
  buildRequestLogKeyOptions,
  isSystemRequestLogKey,
  SYSTEM_REQUEST_LOG_FILTER_VALUE,
  toRequestLogsRow,
} from "@features/request-log-viewer";

describe("requestLogsShared", () => {
  test("recognizes management-triggered system request logs", () => {
    expect(isSystemRequestLogKey("POST /image-generation/test", "")).toBe(true);
    expect(isSystemRequestLogKey("", "")).toBe(true);
    expect(isSystemRequestLogKey("sk-live-123", "")).toBe(false);
    expect(isSystemRequestLogKey("POST /image-generation/test", "已有名称")).toBe(false);
  });

  test("marks system-triggered logs so key name can render as 系统调用", () => {
    const row = toRequestLogsRow({
      id: 1,
      timestamp: "2026-04-23T10:00:00Z",
      api_key: "POST /image-generation/test",
      api_key_name: "",
      model: "gpt-image-2",
      source: "codex",
      channel_name: "GptPlus1",
      provider: "codex",
      auth_type: "oauth",
      auth_index: "auth-1",
      failed: false,
      streaming: true,
      latency_ms: 1200,
      first_token_ms: 300,
      input_tokens: 10,
      output_tokens: 20,
      reasoning_tokens: 0,
      cached_tokens: 0,
      total_tokens: 30,
      cost: 0.01,
      has_content: true,
    });

    expect(row.isSystemCall).toBe(true);
    expect(row.apiKeyName).toBe("");
    expect(row.streaming).toBe(true);
    expect(row.channelProvider).toBe("codex");
    expect(row.channelAuthType).toBe("oauth");
  });

  test("normalizes channel auth_type aliases for table badges", () => {
    expect(
      toRequestLogsRow({
        id: 2,
        timestamp: "2026-04-23T10:00:00Z",
        api_key: "sk-live",
        api_key_name: "Live",
        model: "gpt-5.4",
        source: "openai",
        channel_name: "Relay",
        provider: "openai",
        auth_type: "api_key",
        auth_index: "auth-2",
        failed: false,
        latency_ms: 100,
        first_token_ms: 0,
        input_tokens: 1,
        output_tokens: 1,
        reasoning_tokens: 0,
        cached_tokens: 0,
        total_tokens: 2,
        cost: 0,
        has_content: false,
      }).channelAuthType,
    ).toBe("api");
  });

  test("deduplicates system call filter options", () => {
    const options = buildRequestLogKeyOptions(
      ["POST /image-generation/test", "/v0/management/image-generation/test", "sk-live-123456"],
      { "sk-live-123456": "Live Key" },
      { allKeys: "全部密钥", systemCall: "系统调用" },
    );

    expect(options.filter((option) => option.label === "系统调用")).toHaveLength(1);
    expect(options.find((option) => option.label === "系统调用")?.value).toBe(
      SYSTEM_REQUEST_LOG_FILTER_VALUE,
    );
    expect(options.find((option) => option.label === "Live Key")?.value).toBe("sk-live-123456");
  });

  test("keeps high-signal request metrics before bulky identifier columns", () => {
    const columns = buildRequestLogsColumns((key) => key);
    const keys = columns.map((column) => column.key);

    expect(keys).not.toContain("mode");
    expect(columns.find((column) => column.key === "latency")?.label).toBe(
      "request_logs.col_response_metrics",
    );
    expect(columns.find((column) => column.key === "latency")?.minWidthPx).toBe(240);
    expect(keys.indexOf("latency")).toBeLessThan(keys.indexOf("apiKeyName"));
    expect(keys.indexOf("inputTokens")).toBeLessThan(keys.indexOf("apiKeyName"));
    expect(keys.indexOf("cachedTokens")).toBeLessThan(keys.indexOf("model"));
    expect(keys.indexOf("cost")).toBeLessThan(keys.indexOf("model"));
    expect(columns.find((column) => column.key === "apiKeyName")?.width).toBe("w-40");
    expect(columns.find((column) => column.key === "model")?.width).toBe("w-44");
  });
});
