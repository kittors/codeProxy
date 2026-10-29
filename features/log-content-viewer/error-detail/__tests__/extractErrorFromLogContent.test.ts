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

  // A streamed reply is stored from its start; the summary must never be the
  // head of the stream.
  const streamHead =
    'event: response.created\ndata: {"type":"response.created","response":{"id":"resp_1","status":"in_progress"}}\n\n' +
    'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"Hel"}\n\n';

  test("takes the summary from a stream's error event", () => {
    const failed =
      streamHead +
      'event: response.failed\ndata: {"type":"response.failed","response":{"error":{"code":"server_error","message":"The server had an error"}}}\n\n';
    expect(extractErrorFromLogContent(failed)?.message).toBe("The server had an error");

    const claude =
      'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_1"}}\n\n' +
      'event: error\ndata: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}\n\n';
    expect(extractErrorFromLogContent(claude)?.message).toBe("Overloaded");
  });

  test("asks for the details when a stream was cut before its error event", () => {
    const fromOutput = extractErrorFromLogContent(streamHead);
    expect(fromOutput).toEqual({ content: streamHead.trim(), message: "", reconstructed: false });

    const details = JSON.stringify({
      diagnostic: {
        upstream: {
          status: 200,
          error_message: '{"error":{"message":"stream disconnected before completion","type":"server_error"}}',
        },
        response: { status: 200 },
      },
    });
    const withDetails = extractErrorFromLogContent(streamHead, details);
    expect(withDetails?.message).toBe("stream disconnected before completion");
    expect(withDetails?.content).toBe(streamHead.trim());
    expect(withDetails?.reconstructed).toBe(false);
  });

  test("never summarises a stream by its head", () => {
    expect(extractErrorFromLogContent(streamHead, "")?.message).toBe("");
    expect(extractErrorFromLogContent(streamHead, `{"client":{"ip":"1.2.3.4"}}`)?.message).toBe("");
  });

  test("prefers the error the client was answered with over the upstream call's", () => {
    const details = JSON.stringify({
      diagnostic: {
        upstream: { status: 429, error_message: "status 429: {\"error\":{\"message\":\"raw upstream text\"}}" },
        response: { status: 429, error_message: "All accounts are cooling down; the earliest is back at 14:20" },
      },
    });
    expect(extractErrorFromLogContent("upstream connect error", details)?.message).toBe(
      "All accounts are cooling down; the earliest is back at 14:20",
    );
    const upstreamOnly = JSON.stringify({
      diagnostic: { upstream: { status: 429, error_message: 'status 429: {"error":{"message":"raw upstream text"}}' } },
    });
    expect(extractErrorFromLogContent("upstream connect error", upstreamOnly)?.message).toBe("raw upstream text");
  });

  test("falls back to the head of a plain-text body only once the details are known", () => {
    expect(extractErrorFromLogContent("upstream connect error or disconnect")?.message).toBe("");
    expect(extractErrorFromLogContent("upstream connect error or disconnect", "")?.message).toBe(
      "upstream connect error or disconnect",
    );
  });

  test("reads the error shapes upstreams answer with", () => {
    const gemini = '[{"error":{"code":429,"message":"Resource has been exhausted","status":"RESOURCE_EXHAUSTED"}}]';
    expect(extractErrorFromLogContent(gemini)?.message).toBe("Resource has been exhausted");
    expect(extractErrorFromLogContent('{"error":"invalid_grant"}')?.message).toBe("invalid_grant");
    expect(extractErrorFromLogContent('{"message":"Internal Server Error"}')?.message).toBe("Internal Server Error");
  });

  test("reconstructs a rejection the relay made itself from the answered status", () => {
    const details = JSON.stringify({
      diagnostic: {
        quota: { rejected: true, rejected_by: "daily_limit", error_code: "daily_limit_exceeded", error_message: "Daily request limit reached; it resets at 00:00" },
        response: { status: 429, error_code: "daily_limit_exceeded", error_type: "rate_limit_error", error_message: "Daily request limit reached; it resets at 00:00", source: "local_quota" },
      },
    });
    const result = extractErrorFromLogContent("", details);
    expect(result?.reconstructed).toBe(true);
    expect(result?.message).toBe("Daily request limit reached; it resets at 00:00");
    expect(result?.content).toContain('"http_status": 429');
    expect(result?.content).toContain('"code": "daily_limit_exceeded"');
  });

  test("returns null when nothing reconstructable exists", () => {
    expect(extractErrorFromLogContent("", "")).toBeNull();
    expect(extractErrorFromLogContent("", `{"client":{"ip":"1.2.3.4"}}`)).toBeNull();
  });
});
