import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { IpAccessStatus, ProtectionPolicy } from "@code-proxy/api-client";
import { ProtectionPolicyTab } from "../ProtectionPolicyTab";
import { TrustBanner } from "../TrustBanner";

const policy = vi.fn();
const updatePolicy = vi.fn();

vi.mock("@code-proxy/api-client", () => ({
  ipAccessApi: {
    policy: (...args: unknown[]) => policy(...args),
    updatePolicy: (...args: unknown[]) => updatePolicy(...args),
  },
}));

vi.mock("@app/providers/PermissionGate", () => ({
  PermissionGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// t 与 notify 都要是稳定引用：页面的加载回调依赖它们，每次渲染换新函数会让加载 effect 反复重跑。
const { translate } = vi.hoisted(() => ({
  translate: (key: string, params?: Record<string, string | number>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: translate, i18n: { language: "en" } }),
}));

const notify = vi.fn();
vi.mock("@code-proxy/ui", async () => {
  const actual = await vi.importActual<typeof import("@code-proxy/ui")>("@code-proxy/ui");
  return { ...actual, useToast: () => ({ notify }) };
});

function statusFixture(overrides: Partial<IpAccessStatus> = {}): IpAccessStatus {
  return {
    client_ip: "203.0.113.9",
    trusted: true,
    relay_header: "",
    trusted_proxies_configured: true,
    enforced: true,
    lockdown: false,
    active_rules: 3,
    storage_available: true,
    auto_ban_mode: "observe",
    ...overrides,
  };
}

function policyFixture(overrides: Partial<ProtectionPolicy> = {}): ProtectionPolicy {
  return {
    lockdown: false,
    auto_ban: {
      mode: "observe",
      window_seconds: 600,
      failure_threshold: 20,
      ban_minutes: 60,
      max_ban_minutes: 1440,
    },
    throttle: {
      login_failure_window_seconds: 0,
      account_failure_limit: 0,
      management_key_failure_limit: 0,
      unauthenticated_request_limit: 0,
      failure_reset_hours: 0,
    },
    alert: { notify_observe: false, cooldown_minutes: 30 },
    attempt_retention_days: 30,
    ...overrides,
  };
}

describe("TrustBanner", () => {
  test("warns and offers the fix when the client address is not trustworthy", () => {
    // The whole feature is inert in this state, so it must be impossible to miss.
    render(
      <TrustBanner
        status={statusFixture({
          trusted: false,
          relay_header: "X-Forwarded-For",
          trusted_proxies_configured: false,
          client_ip: "172.17.0.1",
          suggested_trusted_proxies: ["172.17.0.1/32"],
        })}
      />,
    );
    expect(screen.getByText("ip_access.banner_untrusted")).toBeInTheDocument();
    // The remedy is a button on the Protection tab now, so the banner points there
    // instead of printing a config snippet to paste.
    expect(screen.getByText("ip_access.banner_fix_hint")).toBeInTheDocument();
  });

  test("stays silent when enforcement is healthy", () => {
    const { container } = render(<TrustBanner status={statusFixture()} />);
    expect(container).toBeEmptyDOMElement();
  });

  test("flags dropped telemetry so partial statistics are not read as complete", () => {
    render(<TrustBanner status={statusFixture({ dropped_events: 42 })} />);
    expect(screen.getByText(/ip_access.banner_dropped/)).toBeInTheDocument();
  });
});

describe("ProtectionPolicyTab", () => {
  beforeEach(() => {
    policy.mockReset();
    updatePolicy.mockReset();
    policy.mockResolvedValue({ policy: policyFixture(), throttle: [] });
  });

  test("blocks enabling lockdown when the operator is not on the allow list", async () => {
    // Enabling it here would lock the operator out on their very next request.
    render(
      <ProtectionPolicyTab
        status={statusFixture({ self_allowed: false, suggested_self_rule: "203.0.113.9/32" })}
        onPolicySaved={vi.fn()}
      />,
    );
    const toggle = await screen.findByLabelText("ip_access.lockdown_label");
    expect(toggle).toBeDisabled();
  });

  test("allows enabling lockdown once the operator address is allow-listed", async () => {
    render(
      <ProtectionPolicyTab status={statusFixture({ self_allowed: true })} onPolicySaved={vi.fn()} />,
    );
    const toggle = await screen.findByLabelText("ip_access.lockdown_label");
    await waitFor(() => expect(toggle).not.toBeDisabled());
  });

  test("confirms allow-list-only mode as a reversible warning with its consequences", async () => {
    render(
      <ProtectionPolicyTab
        status={statusFixture({ self_allowed: true, suggested_self_rule: "203.0.113.9/32" })}
        onPolicySaved={vi.fn()}
      />,
    );
    const toggle = await screen.findByLabelText("ip_access.lockdown_label");
    await waitFor(() => expect(toggle).not.toBeDisabled());
    await userEvent.click(toggle);

    const dialog = await screen.findByRole("dialog", { name: "ip_access.lockdown_confirm_title" });
    expect(within(dialog).getByText("ip_access.lockdown_consequence_others")).toBeInTheDocument();
    expect(
      within(dialog).getByText('ip_access.lockdown_consequence_self:{"cidr":"203.0.113.9/32"}'),
    ).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "ip_access.lockdown_confirm_ok" }));
    await waitFor(() =>
      expect(screen.getByLabelText("ip_access.lockdown_label")).toHaveAttribute(
        "aria-checked",
        "true",
      ),
    );
  });

  test("blocks lockdown while the client address is untrusted", async () => {
    render(
      <ProtectionPolicyTab
        status={statusFixture({ trusted: false, self_allowed: true })}
        onPolicySaved={vi.fn()}
      />,
    );
    const toggle = await screen.findByLabelText("ip_access.lockdown_label");
    expect(toggle).toBeDisabled();
  });
});
