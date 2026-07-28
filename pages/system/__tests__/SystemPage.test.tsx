import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import { SystemPage } from "../SystemPage";
import { OnlineUpdateProvider } from "@features/online-update";
import { ThemeProvider } from "@code-proxy/ui";
import { ToastProvider } from "@code-proxy/ui";

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  check: vi.fn(),
  current: vi.fn(),
  apply: vi.fn(),
  progress: vi.fn(),
  events: vi.fn(),
  eventCallback: null as null | ((progress: Record<string, unknown>) => void),
}));

vi.mock("@code-proxy/api-client", () => ({
  apiClient: {
    get: mocks.apiGet,
  },
}));

vi.mock("@code-proxy/api-client/endpoints/update", () => ({
  updateApi: {
    check: mocks.check,
    current: mocks.current,
    apply: mocks.apply,
    progress: mocks.progress,
    events: mocks.events,
  },
}));

vi.mock("@app/providers/AuthProvider", () => ({
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

// The update modal is owned by the provider rather than by the page, so the page
// has to be rendered inside it for the update flow to be exercised. A large initial
// delay keeps the provider's background check from racing the assertions.
function renderPage() {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <OnlineUpdateProvider enabled initialDelayMs={10_000_000}>
          <SystemPage />
        </OnlineUpdateProvider>
      </ToastProvider>
    </ThemeProvider>,
  );
}

describe("SystemPage", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    window.localStorage.clear();
    mocks.apiGet.mockImplementation((path: string) => {
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
    mocks.apply.mockResolvedValue({ status: "accepted", run_id: 1 });
    mocks.eventCallback = null;
    mocks.events.mockImplementation(
      (
        onProgress: (progress: Record<string, unknown>) => void,
        options?: { signal?: AbortSignal },
      ) =>
        new Promise<void>((resolve) => {
          mocks.eventCallback = onProgress;
          const signal = options?.signal;
          if (signal?.aborted) {
            resolve();
            return;
          }
          signal?.addEventListener("abort", () => resolve(), { once: true });
        }),
    );
    mocks.progress.mockResolvedValue({
      status: "idle",
      stage: "idle",
      logs: [],
    });
  });

  test("renders connection and version fields without available models", async () => {
    renderPage();

    expect(await screen.findByText("System Info")).toBeInTheDocument();
    expect(screen.getByText("http://localhost:8317")).toBeInTheDocument();
    expect(screen.getByText("/v0/management")).toBeInTheDocument();
    expect(screen.getByText("main-1111111")).toBeInTheDocument();
    expect(screen.queryByText("Available Models")).not.toBeInTheDocument();
    expect(screen.queryByTestId("system-models-scroll-area")).not.toBeInTheDocument();
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
      expect(mocks.eventCallback).not.toBeNull();
    });
    mocks.eventCallback?.({
      run_id: 1,
      status: "completed",
      stage: "completed",
      message_code: "completed",
      message: "update completed",
      progress_percent: 100,
    });
    await waitFor(() => {
      expect(
        within(dialog).getByRole("heading", { name: /update completed/i }),
      ).toBeInTheDocument();
    });
    expect(mocks.current).not.toHaveBeenCalled();
    expect(mocks.check).toHaveBeenCalledTimes(1);
  });

  test("does not wait in the update console when apply returns noop", async () => {
    mocks.check.mockResolvedValueOnce({
      enabled: true,
      update_available: true,
      current_version: "dev-1111111",
      current_commit: "111111111111",
      current_ui_version: "panel-dev-1111111",
      current_ui_commit: "111111111111",
      latest_version: "dev-abcdef1",
      latest_commit: "abcdef123456",
      latest_ui_version: "panel-dev-fedcba9",
      latest_ui_commit: "fedcba987654",
      target_channel: "dev",
      docker_image: "ghcr.io/kittors/clirelay",
      docker_tag: "dev",
      release_notes: "Fixes and improvements",
      updater_available: true,
    });
    mocks.apply.mockResolvedValueOnce({
      status: "noop",
      message:
        "docker image for dev is not ready; latest successful publish is 1111111 but branch head is abcdef1",
    });

    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: /check docker update/i }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: /update now/i }));

    await waitFor(() => {
      expect(mocks.apply).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(within(dialog).queryByTestId("update-progress-console")).toBeNull();
    });
    expect(within(dialog).getByText(/docker image for dev is not ready/i)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /update now/i })).toBeDisabled();
  });
});
