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
  current: vi.fn(),
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
    current: mocks.current,
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
    mocks.current.mockResolvedValue({
      enabled: true,
      current_version: "main-abcdef1",
      current_commit: "abcdef123456",
      current_ui_version: "panel-main-abcdef1",
      current_ui_commit: "abcdef123456",
      target_channel: "main",
      docker_image: "ghcr.io/kittors/clirelay",
      docker_tag: "latest",
      updater_available: true,
    });
    mocks.apply.mockResolvedValue({ status: "accepted" });
  });

  test("checks update details and applies updates from system info", async () => {
    mocks.check.mockResolvedValueOnce({
      enabled: true,
      update_available: true,
      current_version: "main-1111111",
      current_commit: "1111111",
      latest_version: "main-abcdef1",
      latest_commit: "abcdef123456",
      target_channel: "main",
      docker_image: "ghcr.io/kittors/clirelay",
      docker_tag: "latest",
      release_notes: "Fixes and improvements",
      updater_available: true,
    });

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
    await waitFor(() => {
      expect(mocks.current).toHaveBeenCalled();
    });
    expect(mocks.check).toHaveBeenCalledTimes(1);
  });

  test("rechecks the target version before treating the update as successful", async () => {
    mocks.check
      .mockResolvedValueOnce({
        enabled: true,
        update_available: true,
        current_version: "main-1111111",
        current_commit: "1111111",
        current_ui_version: "panel-dev-1111111",
        current_ui_commit: "1111111",
        latest_version: "dev-abcdef1",
        latest_commit: "abcdef123456",
        latest_ui_version: "panel-dev-abcdef1",
        latest_ui_commit: "abcdef123456",
        target_channel: "dev",
        docker_image: "ghcr.io/kittors/clirelay",
        docker_tag: "dev",
        release_notes: "Fixes and improvements",
        updater_available: true,
      })
    mocks.current.mockResolvedValue({
        enabled: true,
        update_available: true,
        current_version: "main-1111111",
        current_commit: "1111111",
        current_ui_version: "panel-dev-abcdef1",
        current_ui_commit: "abcdef123456",
        latest_version: "dev-abcdef1",
        latest_commit: "abcdef123456",
        latest_ui_version: "panel-dev-abcdef1",
        latest_ui_commit: "abcdef123456",
        target_channel: "dev",
        docker_image: "ghcr.io/kittors/clirelay",
        docker_tag: "dev",
        release_notes: "Fixes and improvements",
        updater_available: true,
      });

    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: /check docker update/i }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: /update now/i }));

    await waitFor(() => {
      expect(mocks.apply).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(mocks.current.mock.calls.length).toBeGreaterThan(1);
    });
    expect(mocks.check).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByText(/running version is still not dev-abcdef1/i),
    ).toBeInTheDocument();
  });

  test("shows backend and management ui versions separately inside update details", async () => {
    mocks.check.mockResolvedValue({
      enabled: true,
      update_available: true,
      current_version: "main-a0ed5c6",
      current_commit: "a0ed5c63a118412d5b4da8d57ec6d049111b7888",
      current_ui_version: "panel-main-1111111",
      current_ui_commit: "1111111",
      latest_version: "main-a0ed5c6",
      latest_commit: "a0ed5c63a118412d5b4da8d57ec6d049111b7888",
      latest_ui_version: "panel-main-9477958",
      latest_ui_commit: "94779588adb784b1ceff19c662d3ab55155997e1",
      target_channel: "main",
      docker_image: "ghcr.io/kittors/clirelay",
      docker_tag: "latest",
      release_notes: "Fixes and improvements",
      updater_available: true,
    });
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: /check docker update/i }));
    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).getByText("Service version")).toBeInTheDocument();
    expect(within(dialog).getAllByText("main-a0ed5c6")).toHaveLength(2);
    expect(within(dialog).getByText("Management UI version")).toBeInTheDocument();
    expect(within(dialog).getByText("panel-main-9477958")).toBeInTheDocument();
  });

  test("shows degraded update check messages returned by the backend", async () => {
    mocks.check.mockResolvedValue({
      enabled: true,
      update_available: false,
      current_version: "dev-1111111",
      current_commit: "1111111",
      current_ui_version: "panel-dev-1111111",
      current_ui_commit: "1111111",
      latest_version: "dev-1111111",
      latest_commit: "1111111",
      latest_ui_version: "panel-dev-1111111",
      latest_ui_commit: "1111111",
      target_channel: "dev",
      docker_image: "ghcr.io/kittors/clirelay",
      docker_tag: "dev",
      updater_available: true,
      message: "service update check degraded: github rate limit exceeded",
    });
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: /check docker update/i }));
    const dialog = await screen.findByRole("dialog");

    expect(
      within(dialog).getByText(/service update check degraded: github rate limit exceeded/i),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText("You are already on the latest Docker image.")).toBeNull();
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
    expect(screen.getByTestId("update-details-modal-body")).toHaveClass("h-[min(68vh,560px)]");
    expect(screen.getByTestId("update-release-notes")).toHaveClass(
      "max-h-60",
      "overflow-y-auto",
      "break-words",
    );
    expect(screen.getByTestId("update-image-value")).toHaveClass("break-words");
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

  test("shows concrete docker versions without release notes when already up to date", async () => {
    mocks.check.mockResolvedValue({
      enabled: true,
      update_available: false,
      current_version: "main-de96948",
      current_commit: "de96948c21de3f0a47a8e1e08cb1b859c73069ba",
      latest_version: "main-de96948",
      latest_commit: "de96948c21de3f0a47a8e1e08cb1b859c73069ba",
      latest_commit_url:
        "https://github.com/kittors/CliRelay/commit/de96948c21de3f0a47a8e1e08cb1b859c73069ba",
      target_channel: "main",
      docker_image: "ghcr.io/kittors/clirelay",
      docker_tag: "latest",
      release_notes: "## Changelog\n\n- Older release note that should not be shown",
      updater_available: true,
    });
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: /check docker update/i }));
    const dialog = await screen.findByRole("dialog");

    expect(
      within(dialog).getByRole("heading", { name: /already up to date/i }),
    ).toBeInTheDocument();
    expect(within(dialog).getAllByText("main-de96948")).toHaveLength(2);
    expect(within(dialog).queryByText(/older release note/i)).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /update now/i })).toBeDisabled();
  });
});
