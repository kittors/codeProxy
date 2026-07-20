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
    "daily-spending-limit": 300,
  },
];

describe("EndUsersPage account semantics", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("en");
    mocks.list.mockResolvedValue({ items: users });
    mocks.update.mockResolvedValue(users[0]);
    mocks.resetDailySpending.mockResolvedValue({
      status: "ok",
      end_user_id: "user-active",
      "daily-spending-used": 0,
      "effective-used-before": 12,
      "raw-today-cost": 12,
    });
  });

  test("shows account status, aggregated today usage, and account-level reset/freeze actions", async () => {
    render(
      <ThemeProvider>
        <ToastProvider>
          <EndUsersPage />
        </ToastProvider>
      </ThemeProvider>,
    );

    expect(await screen.findByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Frozen")).toBeInTheDocument();
    expect(screen.getAllByText("Unlimited").length).toBeGreaterThan(0);
    expect(screen.getByText("120/300$")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Today usage" })).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Account Permission Profile" }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", {
        name: "Set a daily spending limit in the permission config before resetting",
      }),
    ).toBeDisabled();

    await userEvent.click(
      screen.getByRole("button", { name: "Reset account today's spending" }),
    );
    await waitFor(() => {
      expect(mocks.resetDailySpending).toHaveBeenCalledWith("user-frozen");
    });

    await userEvent.click(screen.getByRole("button", { name: "Freeze account" }));
    await waitFor(() => {
      expect(mocks.update).toHaveBeenCalledWith("user-active", { status: "locked" });
    });
  });
});
