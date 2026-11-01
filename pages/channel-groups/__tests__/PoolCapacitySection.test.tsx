import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import type { PoolCapacityResponse } from "@code-proxy/api-client";
import { PoolCapacitySection } from "../PoolCapacitySection";

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn<() => Promise<Record<string, unknown>>>(),
  getPools: vi.fn<() => Promise<PoolCapacityResponse>>(),
  auth: { current: null as { can: (permission: string) => boolean } | null },
}));

vi.mock("@app/providers/AuthProvider", () => ({
  useOptionalAuth: () => mocks.auth.current,
}));

vi.mock("@code-proxy/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@code-proxy/api-client")>();
  return {
    ...actual,
    configApi: { getConfig: mocks.getConfig },
    poolCapacityApi: { get: mocks.getPools },
  };
});

const withPermissions = (...granted: string[]) => ({ can: (p: string) => granted.includes(p) });

const POOLS: PoolCapacityResponse = {
  generated_at: "2026-11-01T01:00:00Z",
  pools: [
    {
      provider: "codex",
      window_key: "code_week",
      window_label: "Weekly",
      window_seconds: 604800,
      accounts: 2,
      accounts_with_data: 2,
      remaining_percent: 40,
    },
  ],
};

/** Gives the section time to do everything it is going to do. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

describe("PoolCapacitySection", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    mocks.auth.current = withPermissions("auth_files.read");
    mocks.getPools.mockResolvedValue(POOLS);
  });

  test("shows the card when the backend declares it and the account may read AI accounts", async () => {
    mocks.getConfig.mockResolvedValue({ capabilities: { "pool-capacity": true } });
    render(<PoolCapacitySection />);
    expect(await screen.findByTestId("pool-capacity-row")).toBeInTheDocument();
    expect(mocks.getPools).toHaveBeenCalledTimes(1);
  });

  test("an older backend that does not declare it gets no card and no request", async () => {
    mocks.getConfig.mockResolvedValue({ capabilities: { alerts: true } });
    const { container } = render(<PoolCapacitySection />);
    await waitFor(() => expect(mocks.getConfig).toHaveBeenCalled());
    await settle();
    expect(mocks.getPools).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });

  test("a backend with no capabilities block at all is treated as an older one", async () => {
    mocks.getConfig.mockResolvedValue({ debug: false });
    const { container } = render(<PoolCapacitySection />);
    await waitFor(() => expect(mocks.getConfig).toHaveBeenCalled());
    await settle();
    expect(mocks.getPools).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });

  test("without auth_files.read it neither renders nor asks the backend anything", async () => {
    mocks.auth.current = withPermissions("routing.read", "api_keys.read");
    mocks.getConfig.mockResolvedValue({ capabilities: { "pool-capacity": true } });
    const { container } = render(<PoolCapacitySection />);
    await settle();
    expect(mocks.getConfig).not.toHaveBeenCalled();
    expect(mocks.getPools).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });

  test("when the declaration cannot be read it stays away rather than guessing", async () => {
    mocks.getConfig.mockRejectedValue(new Error("network down"));
    const { container } = render(<PoolCapacitySection />);
    await waitFor(() => expect(mocks.getConfig).toHaveBeenCalled());
    await settle();
    expect(mocks.getPools).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });

  test("outside a signed-in session (no auth provider) the permission check does not block it", async () => {
    mocks.auth.current = null;
    mocks.getConfig.mockResolvedValue({ capabilities: { "pool-capacity": true } });
    render(<PoolCapacitySection />);
    expect(await screen.findByTestId("pool-capacity-row")).toBeInTheDocument();
  });
});
