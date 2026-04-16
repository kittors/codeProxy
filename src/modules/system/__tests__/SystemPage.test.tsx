import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@/i18n";
import { SystemPage } from "@/modules/system/SystemPage";
import { ThemeProvider } from "@/modules/ui/ThemeProvider";
import { ToastProvider } from "@/modules/ui/ToastProvider";

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  check: vi.fn(),
  apply: vi.fn(),
}));

vi.mock("@/lib/http/client", () => ({
  apiClient: {
    get: mocks.apiGet,
  },
}));

vi.mock("@/lib/http/apis/update", () => ({
  updateApi: {
    check: mocks.check,
    apply: mocks.apply,
  },
}));

vi.mock("@/modules/auth/AuthProvider", () => ({
  useAuth: () => ({
    state: {
      apiBase: "http://localhost:8317",
      serverVersion: "main-1111111",
      serverBuildDate: "2026-04-16T08:00:00Z",
    },
    meta: {
      managementEndpoint: "/v0/management",
    },
  }),
}));

function renderPage() {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <SystemPage updateHeartbeatIntervalMs={1} updateHeartbeatTimeoutMs={200} />
      </ToastProvider>
    </ThemeProvider>,
  );
}

describe("SystemPage", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === "/models") return Promise.resolve({ data: [] });
      if (path === "/system-stats") return Promise.resolve({ uptime: 10 });
      return Promise.resolve({});
    });
    mocks.check.mockResolvedValue({
      enabled: true,
      update_available: true,
      current_version: "main-1111111",
      current_commit: "1111111",
      latest_version: "v1.2.3",
      latest_commit: "abcdef123456",
      target_channel: "main",
      docker_image: "ghcr.io/kittors/clirelay",
      docker_tag: "latest",
      release_notes: "Fixes and improvements",
      updater_available: true,
    });
    mocks.apply.mockResolvedValue({ status: "accepted" });
  });

  test("checks update details and applies updates from system info", async () => {
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: /check docker update/i }));
    expect(await screen.findByText(/Fixes and improvements/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /update now/i }));

    await waitFor(() => {
      expect(mocks.apply).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(mocks.apiGet).toHaveBeenCalledWith("/system-stats", expect.any(Object));
    });
  });
});
