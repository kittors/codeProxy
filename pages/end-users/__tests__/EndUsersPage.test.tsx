import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ThemeProvider, ToastProvider } from "@code-proxy/ui";
import i18n from "@code-proxy/i18n";
import type { ApiKeyPermissionProfile } from "@code-proxy/api-client";
import { EndUsersPage } from "../EndUsersPage";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  update: vi.fn(),
  resetDailySpending: vi.fn(),
  listDailySpendingResetHistory: vi.fn(),
  permissionProfiles: vi.fn(async (): Promise<ApiKeyPermissionProfile[]> => []),
}));

vi.mock("@app/guards/PermissionGate", () => ({
  PermissionGate: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@app/providers/AuthProvider", () => ({
  useAuth: () => ({ can: () => true }),
}));

vi.mock("@code-proxy/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@code-proxy/api-client")>();
  return {
    ...actual,
    apiKeyPermissionProfilesApi: { list: mocks.permissionProfiles },
    endUsersApi: {
      ...actual.endUsersApi,
      list: mocks.list,
      update: mocks.update,
      resetDailySpending: mocks.resetDailySpending,
      listDailySpendingResetHistory: mocks.listDailySpendingResetHistory,
    },
  };
});

const users = [
  {
    id: "user-active",
    tenant_id: "tenant-1",
    username: "alice",
    display_name: "Alice",
    status: "active",
    must_change_password: false,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    version: 1,
    api_key_count: 2,
    "daily-spending-used": 12,
    "lifetime-spending-used": 88.7,
    "daily-spending-reset-count": 0,
    "daily-spending-limit": 0,
    "period-spending-limits": { "5h": 0, day: 0, week: 0, month: 0 },
    "period-spending": [],
  },
  {
    id: "user-frozen",
    tenant_id: "tenant-1",
    username: "bob",
    display_name: "Bob",
    status: "locked",
    must_change_password: false,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    version: 1,
    api_key_count: 1,
    "daily-spending-used": 120,
    "lifetime-spending-used": 912.34,
    "daily-spending-reset-count": 2,
    "daily-spending-limit": 300,
    "period-spending-limits": { "5h": 100, day: 300, week: 800, month: 4000 },
    "period-spending": [
      { period: "5h", limit: 100, used: 95, remaining: 5 },
      { period: "day", limit: 300, used: 120, remaining: 180 },
      { period: "week", limit: 800, used: 220, remaining: 580 },
      { period: "month", limit: 4000, used: 912.34, remaining: 3087.66 },
    ],
  },
];

function renderPage() {
  render(
    <ThemeProvider>
      <ToastProvider>
        <EndUsersPage />
      </ToastProvider>
    </ThemeProvider>,
  );
}

async function openRowMoreActions(displayName: string) {
  const row = screen.getByText(displayName).closest("tr");
  expect(row).not.toBeNull();
  await userEvent.click(within(row as HTMLElement).getByRole("button", { name: "More actions" }));
}

describe("EndUsersPage account semantics", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("en");
    mocks.list.mockResolvedValue({ items: users });
    mocks.update.mockResolvedValue(users[0]);
    mocks.resetDailySpending.mockResolvedValue({
      status: "ok",
      end_user_id: "user-frozen",
      "daily-spending-used": 0,
      "daily-spending-reset-count": 3,
      "effective-used-before": 120,
      "raw-today-cost": 120,
    });
    mocks.listDailySpendingResetHistory.mockResolvedValue({
      items: [
        {
          id: 41,
          day_key: "2026-07-20",
          reset_at: "2026-07-20T10:00:00Z",
          actor_username: "admin-1",
          cost_baseline: 92.25,
          effective_used_before: 12.5,
          raw_today_cost: 92.25,
        },
        {
          id: 42,
          day_key: "2026-07-21",
          reset_at: "2026-07-21T11:00:00Z",
          actor_kind: "service_credential",
          cost_baseline: 148.25,
          effective_used_before: 28.25,
          raw_today_cost: 148.25,
        },
      ],
      total: 2,
      "raw-today-cost": 175.5,
      "daily-spending-used": 28.25,
    });
  });

  test("shows account status, reset count, and account-level actions", async () => {
    renderPage();

    expect(await screen.findByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Frozen")).toBeInTheDocument();
    expect(screen.getAllByText("Unlimited").length).toBeGreaterThan(0);
    expect(screen.getByText("$120 / $300")).toBeInTheDocument();
    expect(screen.getByText("$95 / $100")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Quota" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Today" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Lifetime" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Total resets" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Daily limit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "RPM" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View reset history" })).toHaveTextContent("2");
    expect(
      screen.getByRole("columnheader", { name: "Account Permission Profile" }),
    ).toBeInTheDocument();

    await openRowMoreActions("Alice");
    expect(
      screen.getByRole("menuitem", {
        name: "Set a daily spending limit in the permission config before resetting",
      }),
    ).toHaveAttribute("data-disabled");
    await userEvent.keyboard("{Escape}");

    await openRowMoreActions("Bob");
    await userEvent.click(screen.getByRole("menuitem", { name: "Reset account today's spending" }));
    await waitFor(() => {
      expect(mocks.resetDailySpending).toHaveBeenCalledWith("user-frozen");
      expect(mocks.list.mock.calls.length).toBeGreaterThan(1);
    });

    await openRowMoreActions("Alice");
    await userEvent.click(screen.getByRole("menuitem", { name: "Freeze account" }));
    await waitFor(() => {
      expect(mocks.update).toHaveBeenCalledWith("user-active", {
        status: "locked",
      });
    });
  });

  test("edits unbound account quota and secondary limits directly", async () => {
    renderPage();
    await screen.findByText("Alice");

    await userEvent.click(screen.getAllByRole("button", { name: "Edit user account" })[0]!);
    const dialog = await screen.findByRole("dialog", {
      name: "Edit user account",
    });

    await userEvent.type(
      within(dialog).getByRole("spinbutton", { name: "5-hour quota (USD)" }),
      "50",
    );
    await userEvent.type(
      within(dialog).getByRole("spinbutton", { name: "Daily quota (USD)" }),
      "100",
    );
    await userEvent.type(
      within(dialog).getByRole("spinbutton", { name: "Daily request limit" }),
      "1000",
    );
    await userEvent.type(
      within(dialog).getByRole("spinbutton", { name: "Total request quota" }),
      "9000",
    );
    await userEvent.type(
      within(dialog).getByRole("spinbutton", {
        name: "Concurrent request limit",
      }),
      "3",
    );
    await userEvent.type(within(dialog).getByRole("spinbutton", { name: "RPM limit" }), "60");
    await userEvent.type(within(dialog).getByRole("spinbutton", { name: "TPM limit" }), "12000");
    await userEvent.type(
      within(dialog).getByRole("spinbutton", {
        name: "Lifetime spending limit (USD)",
      }),
      "500",
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mocks.update).toHaveBeenCalledWith(
        "user-active",
        expect.objectContaining({
          "daily-limit": 1000,
          "total-quota": 9000,
          "concurrency-limit": 3,
          "rpm-limit": 60,
          "tpm-limit": 12000,
          "spending-limit": 500,
          "daily-spending-limit": 100,
          "period-spending-limits": { "5h": 50, day: 100, week: 0, month: 0 },
        }),
      );
    });
  });

  test("binds a permission profile without sending a conflicting account period patch", async () => {
    mocks.permissionProfiles.mockResolvedValueOnce([
      {
        id: "standard",
        name: "Standard",
        "daily-limit": 15000,
        "total-quota": 50000,
        "daily-spending-limit": 300,
        "period-spending-limits": {
          "5h": 100,
          day: 300,
          week: 800,
          month: 4000,
        },
        "concurrency-limit": 4,
        "rpm-limit": 120,
        "tpm-limit": 50000,
        "allowed-channel-groups": ["pro"],
        "allowed-channels": [],
        "allowed-models": ["gpt-5.4"],
        "system-prompt": "Standard prompt",
      },
    ]);
    renderPage();
    await screen.findByText("Alice");

    await userEvent.click(screen.getAllByRole("button", { name: "Edit user account" })[0]!);
    const dialog = await screen.findByRole("dialog", {
      name: "Edit user account",
    });
    await userEvent.click(
      within(dialog).getByRole("combobox", {
        name: "Account Permission Profile",
      }),
    );
    await userEvent.click(await screen.findByRole("option", { name: "Standard" }));

    expect(within(dialog).getByRole("spinbutton", { name: "Daily quota (USD)" })).toBeDisabled();
    expect(within(dialog).getByRole("spinbutton", { name: "Daily request limit" })).toBeDisabled();
    expect(
      within(dialog).getByRole("spinbutton", {
        name: "Lifetime spending limit (USD)",
      }),
    ).not.toBeDisabled();

    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mocks.update).toHaveBeenCalledWith(
        "user-active",
        expect.objectContaining({
          "permission-profile-id": "standard",
          "daily-limit": 15000,
          "total-quota": 50000,
          "concurrency-limit": 4,
          "rpm-limit": 120,
          "tpm-limit": 50000,
        }),
      );
    });
    const updateBody = mocks.update.mock.calls.at(-1)?.[1];
    expect(updateBody).not.toHaveProperty("daily-spending-limit");
    expect(updateBody).not.toHaveProperty("period-spending-limits");
    expect(updateBody).not.toHaveProperty("spending-limit");
  });

  test("reloads the list when reset response does not include a reset count", async () => {
    mocks.resetDailySpending.mockResolvedValueOnce({
      status: "ok",
      end_user_id: "user-frozen",
      "daily-spending-used": 0,
    });
    renderPage();

    await screen.findByText("Alice");
    await openRowMoreActions("Bob");
    await userEvent.click(screen.getByRole("menuitem", { name: "Reset account today's spending" }));

    await waitFor(() => {
      expect(mocks.list).toHaveBeenCalledTimes(2);
    });
  });

  test("opens all-date reset history with true and effective today spending summaries", async () => {
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "View reset history" }));

    await waitFor(() => {
      expect(mocks.listDailySpendingResetHistory).toHaveBeenCalledWith("user-frozen", 200);
    });
    expect(await screen.findByText("Reset history · Bob / bob")).toBeInTheDocument();
    expect(screen.getByText("Today's true spend")).toBeInTheDocument();
    expect(screen.getByText("$175.50")).toBeInTheDocument();
    expect(screen.getByText("Current effective today usage")).toBeInTheDocument();
    expect(screen.getAllByText("$28.25").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$148.25").length).toBeGreaterThan(0);
    expect(screen.getByText("Management key")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Reset ID" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Reset time" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Project day" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Usage before reset" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Stored baseline" })).toBeInTheDocument();
    expect(screen.getByText("2026-07-21")).toBeInTheDocument();

    const newerId = screen.getByText("42");
    const olderId = screen.getByText("41");
    expect(
      newerId.compareDocumentPosition(olderId) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  test("falls back to the row's effective today usage when true spend is absent", async () => {
    mocks.listDailySpendingResetHistory.mockResolvedValueOnce({
      items: [],
      total: 0,
    });
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "View reset history" }));

    expect(await screen.findByText("Not returned")).toBeInTheDocument();
    expect(screen.getAllByText("$120.00").length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        "All manual daily-spending reset records for this account. Today's true spend was not returned, so only current effective today usage is available.",
      ),
    ).toBeInTheDocument();
  });
});
