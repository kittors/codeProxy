import { render, screen, waitFor, within } from "@testing-library/react";
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
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Fixes and improvements/i)).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: /update now/i }));

    await waitFor(() => {
      expect(mocks.apply).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(mocks.apiGet).toHaveBeenCalledWith("/system-stats", expect.any(Object));
    });
  });

  test("keeps long update details contained inside the user-opened dialog", async () => {
    mocks.check.mockResolvedValue({
      enabled: true,
      update_available: true,
      current_version: "main-1111111-with-an-extra-long-build-identifier",
      current_commit: "1111111",
      latest_version: "dev-abcdef1234567890-with-an-extra-long-build-identifier",
      latest_commit: "abcdef1234567890",
      target_channel: "dev",
      docker_image:
        "ghcr.io/kittors/clirelay-with-a-very-long-image-name-that-should-not-overflow-the-dialog",
      docker_tag: "dev-abcdef1234567890-extra-long-tag",
      release_notes: "Fixes and improvements\n".repeat(80),
      updater_available: true,
    });
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: /check docker update/i }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveClass("max-w-[min(92vw,900px)]");
    expect(screen.getByTestId("update-release-notes")).toHaveClass(
      "max-h-[42vh]",
      "overflow-y-auto",
      "break-words",
    );
    expect(screen.getByTestId("update-image-value")).toHaveClass("break-all");
  });

  test("shows updater sidecar unavailable warning only once", async () => {
    mocks.check.mockResolvedValue({
      enabled: true,
      update_available: true,
      current_version: "dev-1111111",
      current_commit: "1111111",
      latest_version: "v1.2.3",
      latest_commit: "abcdef123456",
      target_channel: "main",
      docker_image: "ghcr.io/kittors/clirelay",
      docker_tag: "latest",
      release_notes: "Fixes and improvements",
      updater_available: false,
    });
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: /check docker update/i }));
    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).getAllByText(/updater sidecar/i, { exact: false })).toHaveLength(1);
    expect(within(dialog).getByRole("button", { name: /update now/i })).toBeDisabled();
  });

  test("renders update release notes as markdown", async () => {
    mocks.check.mockResolvedValue({
      enabled: true,
      update_available: true,
      current_version: "dev-1111111",
      current_commit: "1111111",
      latest_version: "v1.2.3",
      latest_commit: "abcdef123456",
      target_channel: "main",
      docker_image: "ghcr.io/kittors/clirelay",
      docker_tag: "latest",
      release_notes:
        "## Changes\n\n- Fix duplicate updater notice\n- Render release notes as **Markdown**",
      updater_available: true,
    });
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: /check docker update/i }));
    const dialog = await screen.findByRole("dialog");

    expect(await within(dialog).findByRole("heading", { name: "Changes" })).toBeInTheDocument();
    expect(within(dialog).getByText("Markdown")).toBeInTheDocument();
    expect(within(dialog).getAllByRole("listitem")).toHaveLength(2);
  });
});
