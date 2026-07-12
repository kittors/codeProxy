import { describe, expect, test } from "vitest";
import { ApiError } from "@code-proxy/api-client";
import {
  isRecoverableTenantOverrideError,
  isTransientRestoreError,
} from "../AuthProvider";

const apiError = (opts: {
  status?: number;
  code?: string;
  isTimeout?: boolean;
}): ApiError =>
  new ApiError({
    message: "test",
    status: opts.status ?? 0,
    isTimeout: opts.isTimeout,
    payload: opts.code ? { error: { code: opts.code, message: opts.code } } : null,
  });

describe("isRecoverableTenantOverrideError", () => {
  test("returns true for explicit override-invalid codes", () => {
    expect(
      isRecoverableTenantOverrideError(apiError({ status: 403, code: "tenant_scope_forbidden" })),
    ).toBe(true);
    expect(
      isRecoverableTenantOverrideError(apiError({ status: 403, code: "tenant_suspended" })),
    ).toBe(true);
    expect(
      isRecoverableTenantOverrideError(apiError({ status: 403, code: "tenant_expired" })),
    ).toBe(true);
    expect(isRecoverableTenantOverrideError(apiError({ status: 404, code: "not_found" }))).toBe(
      true,
    );
    expect(isRecoverableTenantOverrideError(apiError({ status: 404 }))).toBe(true);
  });

  test("returns false for transient network/timeout/5xx", () => {
    expect(isRecoverableTenantOverrideError(apiError({ status: 0 }))).toBe(false);
    expect(isRecoverableTenantOverrideError(apiError({ status: 0, isTimeout: true }))).toBe(false);
    expect(isRecoverableTenantOverrideError(apiError({ status: 500 }))).toBe(false);
    expect(isRecoverableTenantOverrideError(apiError({ status: 503, code: "unavailable" }))).toBe(
      false,
    );
  });

  test("returns false for non-API errors and unrelated 4xx", () => {
    expect(isRecoverableTenantOverrideError(new Error("boom"))).toBe(false);
    expect(isRecoverableTenantOverrideError(apiError({ status: 401, code: "unauthorized" }))).toBe(
      false,
    );
    expect(
      isRecoverableTenantOverrideError(apiError({ status: 403, code: "permission_denied" })),
    ).toBe(false);
  });
});

describe("isTransientRestoreError", () => {
  test("detects network, timeout, and 5xx", () => {
    expect(isTransientRestoreError(apiError({ status: 0 }))).toBe(true);
    expect(isTransientRestoreError(apiError({ status: 0, isTimeout: true }))).toBe(true);
    expect(isTransientRestoreError(apiError({ status: 500 }))).toBe(true);
    expect(isTransientRestoreError(new TypeError("Failed to fetch"))).toBe(true);
  });

  test("does not treat auth or scope rejection as transient", () => {
    expect(isTransientRestoreError(apiError({ status: 401, code: "unauthorized" }))).toBe(false);
    expect(
      isTransientRestoreError(apiError({ status: 403, code: "tenant_scope_forbidden" })),
    ).toBe(false);
  });
});
