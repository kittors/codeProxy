import { describe, expect, test } from "vitest";
import {
  BACKEND_REFRESH_GRACE_MS,
  REFRESH_LOCK_TTL_MS,
  REFRESH_LOCK_WAIT_MS,
  REFRESH_TIMEOUT_MS,
  REFRESH_TOTAL_BUDGET_MS,
  REQUEST_TIMEOUT_MS,
} from "../constants";

/**
 * Cross-repo coupling gate. These are not style preferences: a retry that lands
 * outside the backend's refresh grace window is seen as token reuse, which
 * revokes the entire session — strictly worse than the failure this retry logic
 * exists to survive. Raising any budget without raising the backend grace
 * seconds (and this mirror) must fail here.
 */
describe("refresh budget", () => {
  test("refresh budget must fit inside the backend grace window", () => {
    expect(REFRESH_LOCK_WAIT_MS + REFRESH_TOTAL_BUDGET_MS).toBeLessThan(BACKEND_REFRESH_GRACE_MS);
  });

  test("single attempt timeout must not exceed the request timeout", () => {
    expect(REFRESH_TIMEOUT_MS).toBeLessThan(REQUEST_TIMEOUT_MS);
  });

  test("the storage lock must outlive a full refresh sequence", () => {
    // A shorter TTL would let a peer preempt a tab that is still refreshing.
    expect(REFRESH_LOCK_TTL_MS).toBeGreaterThan(REFRESH_TOTAL_BUDGET_MS);
  });
});
