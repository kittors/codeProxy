import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@/i18n";
import { AutoUpdatePrompt } from "@/modules/update/AutoUpdatePrompt";
import { ThemeProvider } from "@/modules/ui/ThemeProvider";
import { ToastProvider } from "@/modules/ui/ToastProvider";

const mocks = vi.hoisted(() => ({
  check: vi.fn(),
  apply: vi.fn(),
  get: vi.fn(),
}));

vi.mock("@/lib/http/apis/update", () => ({
  updateApi: {
    check: mocks.check,
    apply: mocks.apply,
  },
}));

vi.mock("@/lib/http/client", () => ({
  apiClient: {
    get: mocks.get,
  },
}));

vi.mock("@/modules/auth/AuthProvider", () => ({
  useAuth: () => ({
    state: {
      isAuthenticated: true,
      isRestoring: false,
    },
  }),
}));

function renderPrompt() {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <AutoUpdatePrompt initialDelayMs={0} />
      </ToastProvider>
    </ThemeProvider>,
  );
}

describe("AutoUpdatePrompt", () => {
  beforeEach(async () => {
    vi.useRealTimers();
    await i18n.changeLanguage("en");
    localStorage.clear();
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
      release_url: "https://github.com/kittors/CliRelay/releases/tag/v1.2.3",
      updater_available: true,
    });
    mocks.apply.mockResolvedValue({ status: "accepted" });
    mocks.get.mockResolvedValue({ uptime: 10 });
  });

  test("asks whether to update before showing the fixed-height update dialog", async () => {
    renderPrompt();

    expect(
      await screen.findByText(/A new version is available: v1\.2\.3.*update now\?/i),
    ).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /confirm/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /new version found/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /update now/i })).not.toBeInTheDocument();
    expect(mocks.apply).not.toHaveBeenCalled();
    expect(mocks.get).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));

    expect(await screen.findByRole("heading", { name: /new version found/i })).toBeInTheDocument();
    expect(await screen.findByText(/Fixes and improvements/i)).toBeInTheDocument();
    expect(screen.getByTestId("update-details-modal-body")).toHaveClass("h-[min(68vh,560px)]");
    expect(screen.getByRole("button", { name: /update now/i })).toBeInTheDocument();
    expect(mocks.apply).not.toHaveBeenCalled();
  });

  test("uses the management ui version in the confirmation prompt when only the panel changed", async () => {
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
      updater_available: true,
    });

    renderPrompt();

    expect(await screen.findByText(/panel-main-9477958.*update now\?/i)).toBeInTheDocument();
  });
});
