import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ThemeProvider, ToastProvider } from "@code-proxy/ui";
import i18n from "@code-proxy/i18n";
import { EndUsersPage } from "../EndUsersPage";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  update: vi.fn(),
  resetDailySpending: vi.fn(),
  listDailySpendingResetHistory: vi.fn(),
  permissionProfiles: vi.fn(async () => []),
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
    "daily-spending-reset-count": 0,
    "daily-spending-limit": 0,
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
    "daily-spending-reset-count": 2,
    "daily-spending-limit": 300,
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
          reset_at: "2026-07-20T10:00:00Z",
          actor_username: "admin-1",
          effective_used_before: 12.5,
          raw_today_cost: 92.25,
        },
        {
          id: 42,
          reset_at: "2026-07-21T11:00:00Z",
          actor_kind: "service_credential",
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
    expect(screen.getByText("120/300$")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Today usage" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Daily reset count" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View reset history" })).toHaveTextContent("2");
    expect(
      screen.getByRole("columnheader", { name: "Account Permission Profile" }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", {
        name: "Set a daily spending limit in the permission config before resetting",
      }),
    ).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Reset account today's spending" }));
    await waitFor(() => {
      expect(mocks.resetDailySpending).toHaveBeenCalledWith("user-frozen");
      expect(screen.getByRole("button", { name: "View reset history" })).toHaveTextContent("3");
    });

    await userEvent.click(screen.getByRole("button", { name: "Freeze account" }));
    await waitFor(() => {
      expect(mocks.update).toHaveBeenCalledWith("user-active", { status: "locked" });
    });
  });

  test("reloads the list when reset response does not include a reset count", async () => {
    mocks.resetDailySpending.mockResolvedValueOnce({
      status: "ok",
      end_user_id: "user-frozen",
      "daily-spending-used": 0,
    });
    renderPage();

    await screen.findByText("Alice");
    await userEvent.click(screen.getByRole("button", { name: "Reset account today's spending" }));

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
    expect(screen.getByText("$148.25")).toBeInTheDocument();
    expect(screen.getByText("Management key")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Reset ID" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Reset time" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Usage before reset" })).toBeInTheDocument();

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
    expect(screen.getByText("$120.00")).toBeInTheDocument();
    expect(
      screen.getByText(
        "All manual daily-spending reset records for this account. Today's true spend was not returned, so only current effective today usage is available.",
      ),
    ).toBeInTheDocument();
  });
});
