import { describe, expect, test } from "vitest";
import { isFatalSystemStatsStatus } from "../useSystemStats";

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
