import { describe, expect, test } from "vitest";
import { ApiError } from "@code-proxy/api-client";
import { isFatalQuotaRefreshError } from "../hooks/useAuthFilesQuotaState";

describe("isFatalQuotaRefreshError", () => {
  test("halts on 401/403 ApiError", () => {
    expect(
      isFatalQuotaRefreshError(new ApiError({ message: "denied", status: 403 })),
    ).toBe(true);
    expect(
      isFatalQuotaRefreshError(new ApiError({ message: "unauth", status: 401 })),
    ).toBe(true);
  });

  test("halts on tenant scope code", () => {
    expect(
      isFatalQuotaRefreshError(
        new ApiError({
          message: "scope",
          status: 403,
          payload: { error: { code: "tenant_resource_scope_unavailable" } },
        }),
      ),
    ).toBe(true);
  });

  test("does not halt on generic or network errors", () => {
    expect(isFatalQuotaRefreshError(new Error("network"))).toBe(false);
    expect(
      isFatalQuotaRefreshError(new ApiError({ message: "server", status: 500 })),
    ).toBe(false);
  });
});
