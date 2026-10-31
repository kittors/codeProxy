import { describe, expect, test } from "vitest";
import { toLogRow } from "../toLogRow";
import type { PublicLogItem } from "../types";

const item = (overrides: Partial<PublicLogItem> = {}): PublicLogItem => ({
  id: 7,
  timestamp: "2026-11-01T05:50:00Z",
  model: "gpt-5.4",
  failed: false,
  latency_ms: 1200,
  input_tokens: 10,
  output_tokens: 20,
  cached_tokens: 0,
  total_tokens: 30,
  cost: 0.01,
  has_content: false,
  ...overrides,
});

// A portal user reads their own request log through the same table as an administrator,
// so a request loop protection ended must reach the row, or it shows as a plain failure.
describe("a public log item as a request log row: loop protection", () => {
  test("carries the check that ended the request", () => {
    expect(toLogRow(item({ failed: true, guard_kind: "tool_loop" }))).toMatchObject({
      failed: true,
      guardKind: "tool_loop",
    });
    expect(toLogRow(item({ failed: true, guard_kind: "reply_loop" })).guardKind).toBe("reply_loop");
  });

  test("keeps a kind this panel does not know, trimmed", () => {
    expect(toLogRow(item({ failed: true, guard_kind: " something_new " })).guardKind).toBe(
      "something_new",
    );
  });

  test("has none for any other request, and for a backend that does not send it", () => {
    expect(toLogRow(item({ failed: true })).guardKind).toBe("");
    expect(toLogRow(item({ guard_kind: "" })).guardKind).toBe("");
  });
});
