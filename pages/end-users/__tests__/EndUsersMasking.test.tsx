import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ThemeProvider, ToastProvider } from "@code-proxy/ui";
import i18n from "@code-proxy/i18n";
import type { ApiKeyPermissionProfile } from "@code-proxy/api-client";
import { EndUsersPage } from "../EndUsersPage";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  permissionProfiles: vi.fn(async (): Promise<ApiKeyPermissionProfile[]> => []),
}));

vi.mock("@app/providers/PermissionGate", () => ({
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
    },
  };
});

const mockUsers = [
  {
    id: "user-1",
    tenant_id: "tenant-1",
    username: "zhouyujie",
    display_name: "周禹杰",
    status: "active",
    must_change_password: false,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    version: 1,
    api_key_count: 1,
    "daily-spending-used": 8.04,
    "lifetime-spending-used": 8.04,
    "daily-spending-reset-count": 0,
    "daily-spending-limit": 0,
    "period-spending-limits": { "5h": 0, day: 0, week: 0, month: 0 },
    "period-spending": [],
  },
];

describe("EndUsersPage masking toggle", () => {
  beforeEach(async () => {
    window.localStorage.clear();
    await i18n.changeLanguage("zh-CN");
    mocks.list.mockReset();
    mocks.list.mockResolvedValue({ items: mockUsers });
  });

  test("toggles masking of display name and username when toggle button is clicked", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <ToastProvider>
          <EndUsersPage />
        </ToastProvider>
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("周禹杰")).toBeInTheDocument();
      expect(screen.getByText("zhouyujie")).toBeInTheDocument();
    });

    const toggleButton = screen.getByRole("button", { name: "开启数据脱敏" });
    await user.click(toggleButton);

    await waitFor(() => {
      expect(screen.getByText("周*杰")).toBeInTheDocument();
      expect(screen.getByText("zh***ie")).toBeInTheDocument();
    });

    const unmaskButton = screen.getByRole("button", { name: "关闭数据脱敏" });
    await user.click(unmaskButton);

    await waitFor(() => {
      expect(screen.getByText("周禹杰")).toBeInTheDocument();
      expect(screen.getByText("zhouyujie")).toBeInTheDocument();
    });
  });
});
