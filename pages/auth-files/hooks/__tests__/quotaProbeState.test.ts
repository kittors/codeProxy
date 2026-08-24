import { describe, expect, test } from "vitest";
import { shouldShowQuotaPlaceholder } from "../quotaProbeState";

describe("shouldShowQuotaPlaceholder", () => {
  test("a refresh the reader asked for always places holders", () => {
    expect(shouldShowQuotaPlaceholder({ status: "loading" }, false)).toBe(true);
  });

  test("nothing is placed while no probe runs", () => {
    expect(shouldShowQuotaPlaceholder({ status: "idle" }, false)).toBe(false);
    expect(shouldShowQuotaPlaceholder(undefined, false)).toBe(false);
  });

  test("the silent entry probe places holders for an account with no result yet", () => {
    expect(shouldShowQuotaPlaceholder(undefined, true)).toBe(true);
    expect(shouldShowQuotaPlaceholder({ status: "idle" }, true)).toBe(true);
  });

  test("a background probe leaves a settled account alone", () => {
    // "no quota" is a real answer once a probe has returned; blinking it grey
    // every refresh interval would be worse than leaving it.
    expect(shouldShowQuotaPlaceholder({ status: "idle", updatedAt: 1 }, true)).toBe(false);
    expect(shouldShowQuotaPlaceholder({ status: "success", updatedAt: 1 }, true)).toBe(false);
  });

  test("an error keeps its badge rather than turning back into a placeholder", () => {
    expect(shouldShowQuotaPlaceholder({ status: "error" }, true)).toBe(false);
  });
});
