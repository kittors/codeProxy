import { describe, expect, test } from "vitest";
import { extractErrorFromLogContent } from "../extractErrorFromLogContent";

describe("extractErrorFromLogContent", () => {
  test("prefers stored output content", () => {
    const result = extractErrorFromLogContent(
      `{"error":{"message":"boom","type":"upstream_error"}}`,
      `{"diagnostic":{"upstream":{"status":500}}}`,
    );
    expect(result).toEqual({
      content: `{"error":{"message":"boom","type":"upstream_error"}}`,
      message: "boom",
      reconstructed: false,
    });
  });

  test("reconstructs from diagnostic status when output and body are missing", () => {
    const details = JSON.stringify({
      diagnostic: {
        upstream: {
          status: 429,
          provider: "xai",
          auth_label: "user@example.com",
          url: "https://example.com/v1/responses",
          attempt: 3,
        },
      },
      response: {
        upstream_log: "=== API RESPONSE 1 ===\nStatus: 429\nHeaders:\nX-Request-Id: abc\n\n",
      },
    });
    const result = extractErrorFromLogContent("", details);
    expect(result?.reconstructed).toBe(true);
    expect(result?.message).toContain("HTTP 429");
    expect(result?.message).toContain("xai");
    expect(result?.content).toContain('"http_status": 429');
  });

  test("prefers body from upstream_log when present", () => {
    const details = JSON.stringify({
      response: {
        upstream_log:
          "=== API RESPONSE 1 ===\nStatus: 429\nHeaders:\nX-Test: 1\nBody:\n{\"error\":{\"message\":\"too many requests\"}}\n",
      },
    });
    const result = extractErrorFromLogContent("", details);
    expect(result?.reconstructed).toBe(true);
    expect(result?.message).toBe("too many requests");
    expect(result?.content).toContain("too many requests");
  });

  test("returns null when nothing reconstructable exists", () => {
    expect(extractErrorFromLogContent("", "")).toBeNull();
    expect(extractErrorFromLogContent("", `{"client":{"ip":"1.2.3.4"}}`)).toBeNull();
  });
});
