import { render, screen, waitFor } from "@testing-library/react";
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

  test("only shows a toast notification when an update is available", async () => {
    renderPrompt();

    await waitFor(() => {
      expect(mocks.check).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByText(/Fixes and improvements/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /update now/i })).not.toBeInTheDocument();
    expect(mocks.apply).not.toHaveBeenCalled();
    expect(mocks.get).not.toHaveBeenCalled();
  });
});
