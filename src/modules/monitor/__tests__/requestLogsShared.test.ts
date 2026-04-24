import { describe, expect, test } from "vitest";
import {
  buildRequestLogKeyOptions,
  isSystemRequestLogKey,
  SYSTEM_REQUEST_LOG_FILTER_VALUE,
  toRequestLogsRow,
} from "@/modules/monitor/requestLogsShared";

describe("requestLogsShared", () => {
  test("recognizes management-triggered system request logs", () => {
    expect(isSystemRequestLogKey("POST /image-generation/test", "")).toBe(true);
    expect(isSystemRequestLogKey("", "")).toBe(true);
    expect(isSystemRequestLogKey("sk-live-123", "")).toBe(false);
    expect(
      isSystemRequestLogKey("POST /image-generation/test", "已有名称"),
    ).toBe(false);
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
      auth_index: "auth-1",
      failed: false,
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
  });

  test("deduplicates system call filter options", () => {
    const options = buildRequestLogKeyOptions(
      [
        "POST /image-generation/test",
        "/v0/management/image-generation/test",
        "sk-live-123456",
      ],
      { "sk-live-123456": "Live Key" },
      { allKeys: "全部密钥", systemCall: "系统调用" },
    );

    expect(
      options.filter((option) => option.label === "系统调用"),
    ).toHaveLength(1);
    expect(options.find((option) => option.label === "系统调用")?.value).toBe(
      SYSTEM_REQUEST_LOG_FILTER_VALUE,
    );
    expect(options.find((option) => option.label === "Live Key")?.value).toBe(
      "sk-live-123456",
    );
  });
});
