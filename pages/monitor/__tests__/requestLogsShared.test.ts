import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import {
  buildRequestLogsColumns,
  buildRequestLogKeyOptions,
  ChannelIdentityLabel,
  computeOutputTokensPerSecond,
  formatTokensPerSecond,
  isSystemRequestLogKey,
  sortRequestLogKeyOptionsByCount,
  SYSTEM_REQUEST_LOG_FILTER_VALUE,
  toFilterParam,
  toRequestLogsRow,
} from "@features/request-log-viewer";

describe("requestLogsShared", () => {
  test("builds request filters from the committed selection", () => {
    expect(toFilterParam(null)).toEqual({ values: undefined, matchesNone: false });
    expect(toFilterParam([])).toEqual({ values: undefined, matchesNone: true });
    expect(toFilterParam(["auth-codex"])).toEqual({
      values: ["auth-codex"],
      matchesNone: false,
    });
  });

  test("exposes the full channel name on the truncated identity label", () => {
    const name = "ryskt8qjfg@privaterelay.appleid.com";

    render(
      createElement(ChannelIdentityLabel, {
        name,
        provider: "codex",
        authType: "oauth",
        apiLabel: "API",
        oauthLabel: "OAuth",
      }),
    );

    expect(screen.getByText(name)).toHaveAttribute("title", name);
  });

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

  test("aggregates system counts and sorts key options by count with stable ties", () => {
    const options = buildRequestLogKeyOptions(
      [
        "POST /image-generation/test",
        "/v0/management/image-generation/test",
        "sk-zulu",
        "sk-alpha",
      ],
      { "sk-zulu": "Zulu", "sk-alpha": "Alpha" },
      { allKeys: "全部密钥", systemCall: "系统调用" },
      {
        "POST /image-generation/test": 4,
        "/v0/management/image-generation/test": 6,
        "sk-zulu": 8,
        "sk-alpha": 8,
      },
    );

    expect(options.find((option) => option.value === "")?.count).toBe(26);
    expect(options.find((option) => option.value === SYSTEM_REQUEST_LOG_FILTER_VALUE)?.count).toBe(
      10,
    );
    expect(sortRequestLogKeyOptionsByCount(options, "en").map((option) => option.label)).toEqual([
      "全部密钥",
      "系统调用",
      "Alpha",
      "Zulu",
    ]);
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

  test("builds a key-primary identity column for account usage and portal logs", () => {
    const row = toRequestLogsRow({
      id: 9,
      timestamp: "2026-07-19T12:00:00Z",
      api_key: "sk-owned-123456",
      api_key_id: "key-laptop-123456",
      api_key_name: "Alice",
      end_user_display_name: "Alice",
      api_key_own_name: "Laptop",
      model: "gpt-5.4",
      source: "codex",
      channel_name: "Codex",
      auth_index: "auth-9",
      failed: false,
      latency_ms: 100,
      first_token_ms: 20,
      input_tokens: 1,
      output_tokens: 1,
      reasoning_tokens: 0,
      cached_tokens: 0,
      total_tokens: 2,
      cost: 0,
      has_content: false,
    });
    const column = buildRequestLogsColumns((key) => key, undefined, undefined, {
      identityColumn: "key",
    }).find((item) => item.key === "apiKeyName");

    expect(column?.label).toBe("request_logs.col_key_name");
    if (!column) throw new Error("missing apiKeyName column");
    render(createElement("div", null, column.render(row, 0)));
    expect(screen.getByText("Laptop")).toBeInTheDocument();
    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
  });

  test("can omit the channel column for public api key lookup logs", () => {
    const keys = buildRequestLogsColumns((key) => key, undefined, undefined, {
      hideChannel: true,
    }).map((column) => column.key);
    expect(keys).not.toContain("channelName");
  });

  test("can omit the identity column for public api key lookup logs", () => {
    const keys = buildRequestLogsColumns((key) => key, undefined, undefined, {
      identityColumn: "none",
    }).map((column) => column.key);
    expect(keys).not.toContain("apiKeyName");
  });

  describe("computeOutputTokensPerSecond", () => {
    test("calculates normal streaming TPS from stream generation delta", () => {
      const row = toRequestLogsRow({
        id: 101,
        timestamp: "2026-04-23T10:00:00Z",
        api_key: "sk-live",
        api_key_name: "Live",
        model: "gemini-3.7-flash",
        source: "google",
        channel_name: "Google",
        auth_index: "auth-1",
        failed: false,
        streaming: true,
        latency_ms: 3000,
        first_token_ms: 1000,
        input_tokens: 100,
        output_tokens: 200,
        reasoning_tokens: 0,
        cached_tokens: 0,
        total_tokens: 300,
        cost: 0,
        has_content: false,
      });

      // stream generation delta = 3000 - 1000 = 2000ms (2.0s)
      // outputTokens = 200 => 200 / 2 = 100 t/s
      const tps = computeOutputTokensPerSecond(row);
      expect(tps).toBe(100);
      expect(formatTokensPerSecond(tps)).toBe("100 t/s");
    });

    test("handles burst streaming without explosive TPS spikes", () => {
      // User's exact scenario: 3.10s total, 3.08s first token (20ms delta), 165 output tokens
      const row = toRequestLogsRow({
        id: 102,
        timestamp: "2026-04-23T10:00:00Z",
        api_key: "sk-live",
        api_key_name: "Live",
        model: "gemini-3.7-flash-high",
        source: "google",
        channel_name: "Google",
        auth_index: "auth-1",
        failed: false,
        streaming: true,
        latency_ms: 3100,
        first_token_ms: 3080,
        input_tokens: 156466,
        output_tokens: 165,
        reasoning_tokens: 0,
        cached_tokens: 150441,
        total_tokens: 156631,
        cost: 0.01,
        has_content: false,
      });

      // streamGenerationMs = 20ms (< 200ms and firstToken / total >= 0.9)
      // Should fall back to total duration (3.10s): 165 / 3.10 = 53.2258... t/s instead of 8250 t/s
      const tps = computeOutputTokensPerSecond(row);
      expect(tps).toBeCloseTo(165 / 3.1, 2);
      expect(formatTokensPerSecond(tps)).toBe("53.2 t/s");
    });

    test("calculates non-streaming TPS using total duration", () => {
      const row = toRequestLogsRow({
        id: 103,
        timestamp: "2026-04-23T10:00:00Z",
        api_key: "sk-live",
        api_key_name: "Live",
        model: "gpt-4o",
        source: "openai",
        channel_name: "OpenAI",
        auth_index: "auth-1",
        failed: false,
        streaming: false,
        latency_ms: 2000,
        first_token_ms: 0,
        input_tokens: 50,
        output_tokens: 80,
        reasoning_tokens: 0,
        cached_tokens: 0,
        total_tokens: 130,
        cost: 0,
        has_content: false,
      });

      // 80 tokens / 2.0s = 40 t/s
      const tps = computeOutputTokensPerSecond(row);
      expect(tps).toBe(40);
      expect(formatTokensPerSecond(tps)).toBe("40.0 t/s");
    });

    test("returns null for zero or invalid output tokens or durations", () => {
      const zeroRow = toRequestLogsRow({
        id: 104,
        timestamp: "2026-04-23T10:00:00Z",
        api_key: "sk-live",
        api_key_name: "Live",
        model: "gpt-4o",
        source: "openai",
        channel_name: "OpenAI",
        auth_index: "auth-1",
        failed: false,
        streaming: true,
        latency_ms: 1000,
        first_token_ms: 200,
        input_tokens: 50,
        output_tokens: 0,
        reasoning_tokens: 0,
        cached_tokens: 0,
        total_tokens: 50,
        cost: 0,
        has_content: false,
      });
      expect(computeOutputTokensPerSecond(zeroRow)).toBeNull();
      expect(formatTokensPerSecond(null)).toBe("--");
    });
  });
});
