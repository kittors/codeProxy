import { describe, expect, test } from "vitest";
import {
  buildWsUrl,
  isFatalSystemStatsStatus,
  shouldConnectSystemStats,
} from "../useSystemStats";

describe("buildWsUrl", () => {
  // The monitor socket bypasses ApiClient, so this null is the only thing
  // standing between a signed-out dashboard and a stream of credential-less
  // handshakes that the server counts as failed auth attempts.
  test("returns null without a token instead of connecting anonymously", () => {
    expect(buildWsUrl("http://localhost:8317", "")).toBeNull();
  });

  test("returns null when the API base cannot be resolved", () => {
    expect(buildWsUrl("", "cps_token")).toBeNull();
  });

  test("upgrades https to wss and carries the token", () => {
    const url = buildWsUrl("https://relay.example.com", "cps_token");
    expect(url).toMatch(/^wss:\/\/relay\.example\.com\//);
    expect(url).toContain("/system-stats/ws");
    expect(url).toContain("token=cps_token");
  });
});

describe("shouldConnectSystemStats", () => {
  test("requires enabled, a token, and a usable auth gate", () => {
    expect(shouldConnectSystemStats({ enabled: true, managementKey: "k", authUsable: true })).toBe(
      true,
    );
    expect(shouldConnectSystemStats({ enabled: false, managementKey: "k", authUsable: true })).toBe(
      false,
    );
    expect(shouldConnectSystemStats({ enabled: true, managementKey: "", authUsable: true })).toBe(
      false,
    );
    // Gate closed after a sign-out: polling here would be credential-less too,
    // so falling back to HTTP is not an acceptable answer.
    expect(shouldConnectSystemStats({ enabled: true, managementKey: "k", authUsable: false })).toBe(
      false,
    );
  });
});

describe("isFatalSystemStatsStatus", () => {
  test("treats 401/403 as fatal", () => {
    expect(isFatalSystemStatsStatus(401)).toBe(true);
    expect(isFatalSystemStatsStatus(403)).toBe(true);
  });

  test("treats other statuses as non-fatal", () => {
    expect(isFatalSystemStatsStatus(200)).toBe(false);
    expect(isFatalSystemStatsStatus(500)).toBe(false);
    expect(isFatalSystemStatsStatus(0)).toBe(false);
  });
});
