import { describe, expect, test } from "vitest";
import {
  resolveAuthFileSubscriptionStatus,
  resolveLiveAuthFileSubscription,
  sharedSubscriptionFromStatus,
} from "../subscription";
import type { AuthFileItem } from "../types";

// Shapes as the status API returned them for a Pro account on 2026-11-20: the
// plan renews 12-10 05:03 UTC, paid access ends six hours later.
const LIVE = {
  expires_at: "2026-12-10T11:03:33Z",
  renews_at: "2026-12-10T05:03:33Z",
  source: "probe",
  state: "active",
  period: "monthly",
  checked_at: "2026-11-20T12:00:00Z",
} as const;
const NOW = Date.parse("2026-11-20T14:00:00.000Z");

const file = (fields: Partial<AuthFileItem>): AuthFileItem => ({ name: "codex.json", ...fields });

describe("resolveAuthFileSubscriptionStatus", () => {
  test("a live read wins over the manual start time", () => {
    // The manual entry (11-12 + one month = 12-12) is two days off the real
    // renewal; the live read is what the provider will charge on.
    const status = resolveAuthFileSubscriptionStatus(
      file({
        subscription_started_at: "2026-11-12T00:14:00.000Z",
        subscription_period: "monthly",
        shared_subscription: LIVE,
      }),
      NOW,
    );
    expect(status).toEqual(
      expect.objectContaining({
        source: "live",
        state: "active",
        expiresAtMs: Date.parse(LIVE.expires_at),
        renewsAtMs: Date.parse(LIVE.renews_at),
        checkedAtMs: Date.parse(LIVE.checked_at),
        startedAtMs: null,
        remainingDays: 20,
        expired: false,
        period: "monthly",
        tone: "active",
      }),
    );
  });

  test("a renewing plan stays calm near its renewal; a canceled or unpaid one does not", () => {
    const soon = { ...LIVE, expires_at: "2026-11-23T11:03:33Z", renews_at: "2026-11-23T05:03:33Z" };
    expect(resolveAuthFileSubscriptionStatus(file({ shared_subscription: soon }), NOW)?.tone).toBe(
      "active",
    );
    const canceling = { ...soon, renews_at: null, cancels_at: soon.renews_at, state: "canceling" };
    expect(
      resolveAuthFileSubscriptionStatus(file({ shared_subscription: canceling }), NOW),
    ).toEqual(expect.objectContaining({ tone: "urgent", cancelsAtMs: Date.parse(soon.renews_at) }));
    expect(
      resolveAuthFileSubscriptionStatus(
        file({ shared_subscription: { ...canceling, expires_at: LIVE.expires_at } }),
        NOW,
      )?.tone,
    ).toBe("warning");
    expect(
      resolveAuthFileSubscriptionStatus(
        file({ shared_subscription: { ...LIVE, state: "past_due" } }),
        NOW,
      )?.tone,
    ).toBe("urgent");
  });

  test("a live read past its end shows as expired", () => {
    const status = resolveAuthFileSubscriptionStatus(
      file({
        shared_subscription: { ...LIVE, expires_at: "2026-11-18T00:00:00Z", state: "inactive" },
      }),
      NOW,
    );
    expect(status).toEqual(
      expect.objectContaining({ source: "live", expired: true, tone: "expired" }),
    );
  });

  test("a live read reporting no plan and no end has no end date", () => {
    const status = resolveLiveAuthFileSubscription(
      file({
        subscription_started_at: "2026-11-12T00:14:00.000Z",
        shared_subscription: { source: "probe", state: "inactive", checked_at: LIVE.checked_at },
      }),
      NOW,
    );
    expect(status).toEqual(
      expect.objectContaining({
        source: "live",
        state: "inactive",
        expiresAtMs: null,
        expired: true,
      }),
    );
  });

  test("without a live read the manual start time is used", () => {
    const status = resolveAuthFileSubscriptionStatus(
      file({ subscription_started_at: "2026-11-12T00:14:00.000Z", subscription_period: "monthly" }),
      NOW,
    );
    expect(status).toEqual(
      expect.objectContaining({
        source: "manual",
        expiresAtMs: Date.parse("2026-12-12T00:14:00.000Z"),
      }),
    );
  });

  test("a token snapshot is shown only while its end is ahead", () => {
    const ahead = resolveAuthFileSubscriptionStatus(
      file({
        shared_subscription: { expires_at: "2026-12-01T00:00:00Z", source: "signed_claims" },
      }),
      NOW,
    );
    expect(ahead).toEqual(expect.objectContaining({ source: "claims", expired: false }));
    // Codex keeps the login-time claims on refresh: on 2026-11-20 every account
    // still carried an end in October while the plans kept renewing.
    expect(
      resolveAuthFileSubscriptionStatus(
        file({
          shared_subscription: {
            started_at: "2026-09-10T05:02:42Z",
            expires_at: "2026-10-10T05:03:33Z",
            source: "signed_claims",
          },
        }),
        NOW,
      ),
    ).toBeNull();
  });
});

describe("sharedSubscriptionFromStatus", () => {
  test("carries the whole set, unset fields as null", () => {
    expect(
      sharedSubscriptionFromStatus({
        subscription_expires_at: LIVE.expires_at,
        subscription_cancels_at: " 2026-12-10T05:03:33Z ",
        subscription_source: "probe",
        subscription_state: "canceling",
        subscription_period: "monthly",
        subscription_checked_at: LIVE.checked_at,
      }),
    ).toEqual({
      started_at: null,
      expires_at: LIVE.expires_at,
      source: "probe",
      renews_at: null,
      cancels_at: "2026-12-10T05:03:33Z",
      period: "monthly",
      state: "canceling",
      checked_at: LIVE.checked_at,
    });
  });

  test("an entry without any subscription field carries none", () => {
    expect(sharedSubscriptionFromStatus({})).toBeNull();
    expect(
      sharedSubscriptionFromStatus({ subscription_source: "  ", subscription_expires_at: null }),
    ).toBeNull();
  });
});
