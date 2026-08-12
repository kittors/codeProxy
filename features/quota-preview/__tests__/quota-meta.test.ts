import { describe, expect, test } from "vitest";
import {
  isZeroMoneyQuotaMeta,
  quotaMetaHasMoney,
  resolveDisplayableQuotaMeta,
} from "../quota-meta";

describe("resolveDisplayableQuotaMeta", () => {
  test("keeps a funded balance", () => {
    expect(resolveDisplayableQuotaMeta("$40.00 / $50.00")).toBe("$40.00 / $50.00");
  });

  // xAI reports an unfunded balance as "$0.00 / $0.00", which occupied a line on
  // the card while saying nothing the countdown beside it did not.
  test.each(["$0.00 / $0.00", "$0 / $0", "$0.000 / $0.00", "$0.00/$0.00"])(
    "drops the all-zero balance %s",
    (meta) => {
      expect(isZeroMoneyQuotaMeta(meta)).toBe(true);
      expect(resolveDisplayableQuotaMeta(meta)).toBeNull();
    },
  );

  test("keeps a balance that is only partly spent down to zero", () => {
    expect(resolveDisplayableQuotaMeta("$0.00 / $50.00")).toBe("$0.00 / $50.00");
    expect(isZeroMoneyQuotaMeta("$0.00 / $50.00")).toBe(false);
  });

  test("handles thousands separators", () => {
    expect(resolveDisplayableQuotaMeta("$0.00 / $1,200.00")).toBe("$0.00 / $1,200.00");
    expect(isZeroMoneyQuotaMeta("$0 / $0,000.00")).toBe(true);
  });

  test("drops raw ISO period ranges", () => {
    expect(resolveDisplayableQuotaMeta("2026-07-16T06:45:51+00:00 - 2026-07-23T06:45:51+00:00")).toBeNull();
  });

  test("keeps non-money text and reports it as non-money", () => {
    expect(resolveDisplayableQuotaMeta("weekly window")).toBe("weekly window");
    expect(quotaMetaHasMoney("weekly window")).toBe(false);
    expect(quotaMetaHasMoney("$5 left")).toBe(true);
  });

  test("treats blank meta as nothing to render", () => {
    expect(resolveDisplayableQuotaMeta("   ")).toBeNull();
    expect(resolveDisplayableQuotaMeta(null)).toBeNull();
    expect(resolveDisplayableQuotaMeta(undefined)).toBeNull();
  });
});
