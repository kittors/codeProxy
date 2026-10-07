import { describe, expect, test } from "vitest";
import { ApiError } from "@code-proxy/api-client";
import { describeImportError } from "../importErrors";

const apiError = (status: number, payload: unknown) =>
  new ApiError({ message: "x", status, payload, url: "/oauth-import/anthropic-session", method: "POST" });

describe("describeImportError", () => {
  test("a 404 means the backend is too old", () => {
    expect(describeImportError(apiError(404, { error: "not found" }))).toEqual({ kind: "unsupported" });
  });

  test("maps the server code, not the HTTP status", () => {
    expect(describeImportError(apiError(422, { code: "credential_invalid" })).kind).toBe(
      "credential_invalid",
    );
    expect(describeImportError(apiError(422, { code: "no_organization" })).kind).toBe(
      "no_organization",
    );
    expect(describeImportError(apiError(502, { code: "upstream_blocked" })).kind).toBe(
      "upstream_blocked",
    );
    expect(describeImportError(apiError(504, { code: "upstream_timeout" })).kind).toBe(
      "upstream_timeout",
    );
  });

  test("an unknown upstream error keeps its (already masked) message", () => {
    const problem = describeImportError(apiError(502, { code: "upstream_error", error: "socket closed" }));
    expect(problem).toEqual({ kind: "failed", message: "socket closed" });
  });

  test("a network failure is its own kind", () => {
    expect(describeImportError(apiError(0, {})).kind).toBe("network");
    expect(describeImportError(new TypeError("fetch failed")).kind).toBe("network");
  });
});
