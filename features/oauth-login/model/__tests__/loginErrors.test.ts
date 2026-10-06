import { describe, expect, test } from "vitest";
import { ApiError } from "@code-proxy/api-client";
import { describeLoginError, describeStatusError } from "../loginErrors";

const apiError = (status: number, payload: unknown) =>
  new ApiError({ message: "request failed", status, payload });

describe("describeLoginError", () => {
  test("prefers the machine-readable code", () => {
    expect(describeLoginError(apiError(404, { code: "oauth_login_expired", error: "x" }))).toEqual({
      kind: "expired",
    });
    expect(
      describeLoginError(apiError(409, { code: "oauth_login_superseded", error: "x" })),
    ).toEqual({
      kind: "superseded",
    });
  });

  test("reads an older server's bare 404 as an expired login", () => {
    expect(
      describeLoginError(apiError(404, { status: "error", error: "unknown or expired state" })),
    ).toEqual({
      kind: "expired",
    });
  });

  test("recognises a callback aimed at another provider", () => {
    expect(describeLoginError(apiError(400, { error: "provider does not match state" }))).toEqual({
      kind: "provider_mismatch",
    });
  });

  test("treats a dropped connection as a network problem", () => {
    expect(describeLoginError(apiError(0, null))).toEqual({ kind: "network" });
    expect(describeLoginError(new TypeError("Failed to fetch"))).toEqual({ kind: "network" });
  });

  test("keeps any other server message", () => {
    expect(describeLoginError(apiError(500, { error: "failed to start callback server" }))).toEqual(
      {
        kind: "failed",
        message: "failed to start callback server",
      },
    );
  });
});

describe("describeStatusError", () => {
  test("maps codes and known messages", () => {
    expect(describeStatusError({ code: "oauth_login_expired" })).toEqual({ kind: "expired" });
    expect(
      describeStatusError({ error: "Superseded by another completed login for the same provider" }),
    ).toEqual({
      kind: "superseded",
    });
  });

  test("passes a token-exchange failure through", () => {
    expect(describeStatusError({ error: "Failed to exchange token" })).toEqual({
      kind: "failed",
      message: "Failed to exchange token",
    });
  });
});
