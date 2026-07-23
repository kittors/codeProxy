import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import { ThemeProvider, ToastProvider } from "@code-proxy/ui";
import { ContentModerationPage } from "../ContentModerationPage";

const mocks = vi.hoisted(() => ({
  getMetrics: vi.fn(),
  listProfiles: vi.fn(),
  createProfile: vi.fn(),
  patchProfile: vi.fn(),
  deleteProfile: vi.fn(),
  testProfile: vi.fn(),
  listChannels: vi.fn(),
  patchBindings: vi.fn(),
}));

vi.mock("@code-proxy/api-client", () => ({
  contentModerationApi: mocks,
  extractApiErrorCode: () => "",
  isApiClientError: () => false,
}));

const profile = {
  id: "profile-1",
  name: "Strict prompts",
  mode: "pre_block" as const,
  base_url: "https://api.openai.com",
  model: "omni-moderation-latest",
  timeout_ms: 3000,
  keyword_mode: "keyword_and_api" as const,
  blocked_keywords: ["blocked"],
  thresholds: { violence: 0.95 },
  block_http_status: 403,
  block_message: "Blocked",
  version: 3,
  created_at: "2026-07-22T01:00:00Z",
  updated_at: "2026-07-22T02:00:00Z",
  api_key_configured: true,
  api_key_masked: "sk-a****z",
  binding_counts: { auth_file: 2, provider_key: 1, provider: 1 },
};

function renderPage() {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <ContentModerationPage />
      </ToastProvider>
    </ThemeProvider>,
  );
}

describe("ContentModerationPage", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    mocks.getMetrics.mockReset();
    mocks.listProfiles.mockReset();
    mocks.createProfile.mockReset();
    mocks.patchProfile.mockReset();
    mocks.deleteProfile.mockReset();
    mocks.testProfile.mockReset();
    mocks.listChannels.mockReset();
    mocks.patchBindings.mockReset();
    mocks.getMetrics.mockResolvedValue({
      requests: 12,
      allows: 9,
      blocks: 2,
      errors: 1,
      cache_hits: 3,
      in_flight: 1,
      latency_total_ms: 180,
      latency_samples: 10,
      avg_latency_ms: 18,
    });
    mocks.listProfiles.mockResolvedValue([profile]);
    mocks.patchProfile.mockResolvedValue({ ...profile, mode: "off", version: 4 });
    mocks.testProfile.mockResolvedValue({
      would_block: true,
      action: "keyword_block",
      matched_keyword: "blocked",
      category_scores: {},
      thresholds: profile.thresholds,
      latency_ms: 0,
    });
  });

  test("renders profile rows and runs the no-storage test modal", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(
      await screen.findByRole("table", { name: "Content moderation profile table" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Strict prompts")).toBeInTheDocument();
    expect(screen.getByText("4 channels")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Test profile" }));
    expect(screen.getByText(/does not save test input/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText("Test input"), "This is blocked text");
    await user.click(screen.getByRole("button", { name: "Run test" }));

    await waitFor(() =>
      expect(mocks.testProfile).toHaveBeenCalledWith("profile-1", "This is blocked text"),
    );
    expect(await screen.findByText("Would block")).toBeInTheDocument();
    expect(screen.getByText("Matched keyword: blocked")).toBeInTheDocument();
  });

  test("opens the process-global moderation metrics modal from the actions column", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "View status" }));

    await waitFor(() => expect(mocks.getMetrics).toHaveBeenCalledTimes(1));
    const dialog = await screen.findByRole("dialog", { name: "Pre-block moderation status" });
    expect(dialog).toHaveTextContent("In progress");
    expect(dialog).toHaveTextContent("Checked");
    expect(dialog).toHaveTextContent("Allowed");
    expect(dialog).toHaveTextContent("Blocked");
    expect(dialog).toHaveTextContent("Moderation errors");
    expect(dialog).toHaveTextContent("18 ms");
  });

  test("toggles profile mode from the table with version concurrency", async () => {
    const user = userEvent.setup();
    renderPage();

    const toggle = await screen.findByRole("switch", {
      name: "Toggle moderation for Strict prompts",
    });
    expect(toggle).toBeChecked();

    await user.click(toggle);

    await waitFor(() =>
      expect(mocks.patchProfile).toHaveBeenCalledWith("profile-1", {
        mode: "off",
        version: 3,
      }),
    );
    expect(await screen.findByRole("switch", { name: /Strict prompts/ })).not.toBeChecked();
  });

  test("blocks enabling API moderation when no API key is configured", async () => {
    const user = userEvent.setup();
    mocks.listProfiles.mockResolvedValue([
      {
        ...profile,
        mode: "off",
        keyword_mode: "api_only",
        api_key_configured: false,
        api_key_masked: undefined,
      },
    ]);
    renderPage();

    await user.click(
      await screen.findByRole("switch", { name: "Toggle moderation for Strict prompts" }),
    );

    expect(
      await screen.findByText("Configure an API key before enabling this API moderation profile."),
    ).toBeInTheDocument();
    expect(mocks.patchProfile).not.toHaveBeenCalled();
  });
});
