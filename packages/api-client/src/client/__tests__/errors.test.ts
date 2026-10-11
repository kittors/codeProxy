import { afterEach, describe, expect, test, vi } from "vitest";
import { ApiClient } from "@code-proxy/api-client";
import { extractApiErrorMessage } from "../errors";

const FALLBACK = "Request failed (422)";

describe("extractApiErrorMessage", () => {
  test.each([
    [
      "a config.yaml save the YAML parser rejected",
      {
        error: "invalid_yaml",
        message: "yaml: line 3: mapping values are not allowed in this context",
      },
      "invalid_yaml: yaml: line 3: mapping values are not allowed in this context",
    ],
    [
      "a config.yaml save whose channel groups failed validation",
      {
        error: "invalid_config",
        message: 'duplicate channel group "team-a"',
      },
      'invalid_config: duplicate channel group "team-a"',
    ],
    [
      "an update whose updater could not be reached",
      {
        error: "updater_unreachable",
        message: 'Get "http://updater:8320/run": dial tcp: connection refused',
      },
      'updater_unreachable: Get "http://updater:8320/run": dial tcp: connection refused',
    ],
    [
      "a Vertex import whose error is a phrase rather than a code",
      { error: "invalid json", message: "unexpected end of JSON input" },
      "invalid json: unexpected end of JSON input",
    ],
  ])("shows the code and the reason for %s", (_case, payload, expected) => {
    expect(extractApiErrorMessage(payload, FALLBACK)).toBe(expected);
  });

  test("does not repeat a code the reason already is or starts with", () => {
    expect(
      extractApiErrorMessage(
        { error: "invalid_config", message: "invalid_config: bad group" },
        FALLBACK,
      ),
    ).toBe("invalid_config: bad group");
    expect(
      extractApiErrorMessage({ error: "Invalid JSON", message: "invalid json" }, FALLBACK),
    ).toBe("invalid json");
  });

  test("keeps the bare code when the reason is blank or not text", () => {
    expect(extractApiErrorMessage({ error: "invalid_yaml", message: "   " }, FALLBACK)).toBe(
      "invalid_yaml",
    );
    expect(extractApiErrorMessage({ error: "invalid_yaml", message: 42 }, FALLBACK)).toBe(
      "invalid_yaml",
    );
    expect(extractApiErrorMessage({ error: "updater_unavailable", message: null }, FALLBACK)).toBe(
      "updater_unavailable",
    );
  });

  test("reads the other error shapes as before", () => {
    expect(
      extractApiErrorMessage(
        {
          error: {
            code: "config_version_conflict",
            message: "the configuration changed",
            details: {},
          },
        },
        FALLBACK,
      ),
    ).toBe("the configuration changed");
    expect(extractApiErrorMessage({ error: "missing management key" }, FALLBACK)).toBe(
      "missing management key",
    );
    expect(extractApiErrorMessage({ message: "bad request" }, FALLBACK)).toBe("bad request");
    expect(extractApiErrorMessage({ detail: "not allowed" }, FALLBACK)).toBe("not allowed");
    expect(extractApiErrorMessage("  plain text  ", FALLBACK)).toBe("plain text");
    expect(extractApiErrorMessage({}, FALLBACK)).toBe(FALLBACK);
    expect(extractApiErrorMessage(null, FALLBACK)).toBe(FALLBACK);
  });

  test("truncates a long reason together with its code", () => {
    const message = extractApiErrorMessage(
      { error: "unexpected_status", message: "x".repeat(3000) },
      FALLBACK,
    );
    expect(message.startsWith("unexpected_status: xxx")).toBe(true);
    expect(message).toHaveLength(2003);
    expect(message.endsWith("...")).toBe(true);
  });
});

describe("ApiClient error messages", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("a rejected config.yaml save throws its reason and keeps the body as payload", async () => {
    const body = {
      error: "invalid_config",
      message: 'duplicate channel group "team-a"',
    };
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: 422,
        statusText: "Unprocessable Entity",
        headers: { "Content-Type": "application/json" },
      }),
    );
    const client = new ApiClient();
    client.setConfig({ apiBase: "http://localhost:8317", managementKey: "test-key" });

    await expect(client.putRawText("/config.yaml", "routing: {}\n")).rejects.toMatchObject({
      name: "ApiError",
      status: 422,
      message: 'invalid_config: duplicate channel group "team-a"',
      payload: body,
      isAuthError: false,
    });
  });
});
