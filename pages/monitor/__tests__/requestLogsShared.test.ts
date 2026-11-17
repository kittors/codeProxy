import { createElement } from "react";
import i18n from "@code-proxy/i18n";
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import type { TFunction } from "i18next";
import {
  buildRequestLogGridColumns,
  buildRequestLogKeyOptions,
  ChannelIdentityLabel,
  computeOutputTokensPerSecond,
  formatTokensPerSecond,
  isSystemRequestLogKey,
  sortRequestLogKeyOptionsByCount,
  SYSTEM_REQUEST_LOG_FILTER_VALUE,
  toRequestLogsRow,
  type RequestLogGridOptions,
} from "@features/request-log-viewer";

const keyT = ((key: string) => key) as unknown as TFunction;
const gridColumns = (options: Partial<RequestLogGridOptions> = {}) =>
  buildRequestLogGridColumns(keyT, { identity: "user", clients: "unsupported", now: 0, ...options });

describe("requestLogsShared", () => {
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

  test("puts time first and status last, with the metrics in between and no client sort", () => {
    const columns = gridColumns({ onOpenError: () => undefined });
    const ids = columns.map((column) => column.id);
    expect(ids).toEqual([
      "time",
      "identity",
      "model",
      "channel",
      "tokens",
      "total",
      "latency",
      "throughput",
      "cost",
      "status",
      "actions",
    ]);
    expect(columns.find((column) => column.id === "time")?.pin).toBe("start");
    expect(columns.find((column) => column.id === "status")?.pin).toBe("end");
    // 服务端分页、按时间倒序：只排当前页会误导，所以没有一列开表头排序。
    expect(columns.some((column) => column.sortable)).toBe(false);
    // 总 Token 默认收起（Token 列的悬停提示里有总计），可在视图菜单里打开。
    expect(columns.find((column) => column.id === "total")?.defaultHidden).toBe(true);
    expect(columns.every((column) => column.id === "actions" || column.header.length > 0)).toBe(true);
  });

  test("places the Agent column after the channel, as a placeholder until support is known", async () => {
    await i18n.changeLanguage("en");
    const row = toRequestLogsRow({
      id: 3,
      timestamp: "2026-11-18T08:00:00Z",
      api_key: "sk-agent-123456",
      api_key_name: "Ops",
      model: "claude-opus-5-5",
      source: "claude",
      channel_name: "Claude",
      auth_index: "auth-3",
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
      client_name: "claude-code",
      client_version: "2.1.3",
      user_agent: "claude-cli/2.1.3 (external, cli)",
    });
    expect(row).toMatchObject({ clientName: "claude-code", clientVersion: "2.1.3" });
    for (const clients of ["pending", "supported"] as const) {
      const ids = gridColumns({ clients }).map((column) => column.id);
      expect(ids.indexOf("agent")).toBe(ids.indexOf("channel") + 1);
    }
    expect(gridColumns({ clients: "unsupported" }).map((column) => column.id)).not.toContain(
      "agent",
    );
    const agent = gridColumns({ clients: "supported" }).find((column) => column.id === "agent");
    if (!agent) throw new Error("missing agent column");
    render(createElement("div", null, agent.cell(row, { rowIndex: 0, selected: false, expanded: false })));
    expect(screen.getByText("Claude Code")).toBeInTheDocument();
    expect(screen.getByText("2.1.3")).toBeInTheDocument();
    // 没有客户端名（旧数据、请求没带 UA）写「未知」；认不得的客户端原样显示它的 ID。
    const plain = { ...row, clientName: "", clientVersion: "", userAgent: "" };
    render(createElement("div", null, agent.cell(plain, { rowIndex: 0, selected: false, expanded: false })));
    expect(screen.getByText("Unknown")).toBeInTheDocument();
    const custom = { ...row, clientName: "okhttp", clientVersion: "", userAgent: "okhttp/4.12.0" };
    render(createElement("div", null, agent.cell(custom, { rowIndex: 0, selected: false, expanded: false })));
    expect(screen.getByText("Okhttp")).toBeInTheDocument();
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
    const column = gridColumns({ identity: "key" }).find((item) => item.id === "identity");

    expect(column?.header).toBe("request_logs.col_key_name");
    if (!column) throw new Error("missing identity column");
    render(createElement("div", null, column.cell(row, { rowIndex: 0, selected: false, expanded: false })));
    expect(screen.getByText("Laptop")).toBeInTheDocument();
    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
  });

  test("shows the cache hit rate, and never a 0% for a request whose cache use is unknown", async () => {
    await i18n.changeLanguage("en");
    const base = {
      id: 1,
      timestamp: "2026-10-30T00:00:00Z",
      api_key: "sk-cache-123456",
      api_key_name: "",
      model: "claude-opus-5-5",
      source: "claude",
      channel_name: "Claude",
      auth_index: "auth-1",
      failed: false,
      latency_ms: 100,
      first_token_ms: 20,
      input_tokens: 80000,
      output_tokens: 5,
      reasoning_tokens: 0,
      total_tokens: 80005,
      cost: 0,
      has_content: false,
    };
    const read = toRequestLogsRow({
      ...base,
      cached_tokens: 60000,
      cache_read_tokens: 60000,
      cache_write_tokens: 0,
      prompt_tokens: 80000,
    });
    // A turn that only wrote the cache: nothing was read, so the hit rate is 0%.
    const writeOnly = toRequestLogsRow({
      ...base,
      cached_tokens: 50000,
      cache_read_tokens: 0,
      cache_write_tokens: 50000,
    });
    const unknown = toRequestLogsRow({
      ...base,
      cached_tokens: 7000,
      cache_read_tokens: null,
      cache_write_tokens: null,
    });
    const older = toRequestLogsRow({ ...base, cached_tokens: 7000 });
    // 输入、缓存命中、输出合成了 Token 一列：主行「输入 → 输出」，副行是缓存命中率。
    const tokens = gridColumns().find((column) => column.id === "tokens");
    if (!tokens) throw new Error("missing tokens column");
    const cell = (row: typeof read) =>
      render(
        createElement("div", null, tokens.cell(row, { rowIndex: 0, selected: false, expanded: false })),
      ).container;
    const readCell = cell(read);
    expect(readCell).toHaveTextContent(/80K\s*→\s*5/);
    expect(readCell).toHaveTextContent(/Cache\s*75%/);
    expect(cell(writeOnly)).toHaveTextContent(/Cache\s*0%/);
    const unknownCell = cell(unknown);
    expect(unknownCell).toHaveTextContent(/Cache\s*—/);
    expect(unknownCell).not.toHaveTextContent("%");
    expect(
      screen.getByLabelText(
        "Older record: 7,000 cached tokens, reads and writes not recorded apart",
      ),
    ).toBeInTheDocument();
    // An older backend has one cached figure, which is not a hit rate: the count is shown.
    expect(cell(older)).toHaveTextContent(/Cache\s*7,000/);
  });

  test("can omit the channel column for public api key lookup logs", () => {
    expect(gridColumns({ hideChannel: true }).map((column) => column.id)).not.toContain("channel");
  });

  test("can omit the identity column for public api key lookup logs", () => {
    expect(gridColumns({ identity: "none" }).map((column) => column.id)).not.toContain("identity");
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
