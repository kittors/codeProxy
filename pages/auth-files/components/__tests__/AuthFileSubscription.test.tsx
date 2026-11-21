import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { TFunction } from "i18next";
import i18n from "@code-proxy/i18n";
import type { AuthFileItem } from "@code-proxy/api-client";
import { resolveAuthFileSubscriptionStatus, type PrefixProxyEditorState } from "@code-proxy/domain";
import {
  AuthFileSubscriptionBadge,
  describeAuthFileSubscription,
} from "../AuthFileSubscriptionBadge";
import { AuthFileSubscriptionFields } from "../AuthFileSubscriptionFields";

const NOW = Date.parse("2026-11-20T14:00:00.000Z");
const t = i18n.t.bind(i18n) as unknown as TFunction;

// A Pro account as the status API reported it on 2026-11-20, still carrying the
// manual start time someone typed earlier (11-12, two days off the real cycle).
const liveFile: AuthFileItem = {
  name: "codex.json",
  type: "codex",
  subscription_started_at: "2026-11-12T00:14:00.000Z",
  subscription_period: "monthly",
  shared_subscription: {
    expires_at: "2026-12-10T11:03:33Z",
    renews_at: "2026-12-10T05:03:33Z",
    source: "probe",
    state: "active",
    period: "monthly",
    checked_at: "2026-11-20T12:00:00Z",
  },
};

const editor: PrefixProxyEditorState = {
  open: true,
  fileName: "codex.json",
  loading: false,
  saving: false,
  error: null,
  json: {},
  prefix: "",
  proxyUrl: "",
  proxyId: "",
  subscriptionStartedAt: "2026-11-12T08:14",
  subscriptionPeriod: "monthly",
  concurrencyLimit: "",
  codexConvergenceMode: "",
  codexServiceTier: "",
  disableCooling: "",
};

describe("AuthFileSubscriptionBadge", () => {
  test("a live read counts down to the provider's end and names the renewal", () => {
    const status = resolveAuthFileSubscriptionStatus(liveFile, NOW);
    expect(status).not.toBeNull();
    const { container } = render(<AuthFileSubscriptionBadge status={status!} nowMs={NOW} />);
    expect(screen.getByText("20d left")).toBeInTheDocument();
    expect(container.querySelector('[data-subscription-source="live"]')).not.toBeNull();

    const description = describeAuthFileSubscription(status!, t);
    expect(description).toContain("renews automatically");
    expect(description).toContain(new Date(Date.parse("2026-12-10T05:03:33Z")).toLocaleString());
    expect(description).toContain(new Date(Date.parse("2026-11-20T12:00:00Z")).toLocaleString());
  });

  test("a manual entry says it was set manually", () => {
    const status = resolveAuthFileSubscriptionStatus(
      { ...liveFile, shared_subscription: undefined },
      NOW,
    );
    const { container } = render(<AuthFileSubscriptionBadge status={status!} nowMs={NOW} />);
    expect(container.querySelector('[data-subscription-source="manual"]')).not.toBeNull();
    expect(describeAuthFileSubscription(status!, t)).toMatch(/^Set manually/);
  });

  test("a live read with no paid plan reads No plan", () => {
    const status = resolveAuthFileSubscriptionStatus(
      {
        name: "free.json",
        shared_subscription: {
          source: "probe",
          state: "inactive",
          checked_at: "2026-11-20T12:00:00Z",
        },
      },
      NOW,
    );
    render(<AuthFileSubscriptionBadge status={status!} nowMs={NOW} />);
    expect(screen.getByText("No plan")).toBeInTheDocument();
  });
});

describe("AuthFileSubscriptionFields", () => {
  test("shows a live read instead of the manual inputs", () => {
    render(<AuthFileSubscriptionFields file={liveFile} editor={editor} setEditor={vi.fn()} />);
    expect(screen.getByText("Subscription (read automatically)")).toBeInTheDocument();
    expect(screen.getByText(/renews automatically/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Subscription start date")).toBeNull();
  });

  test("keeps the manual inputs when the provider's billing is not known", () => {
    render(
      <AuthFileSubscriptionFields
        file={{
          ...liveFile,
          shared_subscription: { expires_at: "2026-12-01T00:00:00Z", source: "signed_claims" },
        }}
        editor={editor}
        setEditor={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Subscription start date")).toBeInTheDocument();
    expect(screen.queryByText("Subscription (read automatically)")).toBeNull();
  });
});
