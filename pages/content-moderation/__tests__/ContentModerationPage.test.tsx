import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type {
  ContentModerationProfileCapabilities,
  ContentModerationProfileView,
} from "@code-proxy/api-client";
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
  getSecretMasking: vi.fn(),
  setSecretMasking: vi.fn(),
  getConfig: vi.fn(),
}));

vi.mock("@code-proxy/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@code-proxy/api-client")>()),
  contentModerationApi: mocks,
  configApi: { getConfig: mocks.getConfig },
  extractApiErrorCode: () => "",
  isApiClientError: () => false,
}));

const NOTHING_DECLARED: ContentModerationProfileCapabilities = {
  keywordFoldTraditionalChinese: false,
  apiIncludesToolOutput: false,
  wordGuard: false,
  secretMasking: false,
  wordPortal: false,
};

const listResponse = (
  items: ContentModerationProfileView[],
  capabilities: ContentModerationProfileCapabilities = NOTHING_DECLARED,
) => ({ items, capabilities });

const profile = {
  id: "profile-1",
  name: "Strict prompts",
  mode: "pre_block" as const,
  backend: "openai_moderations" as const,
  base_url: "https://api.openai.com",
  model: "omni-moderation-latest",
  timeout_ms: 3000,
  keyword_mode: "keyword_and_api" as const,
  blocked_keywords: ["blocked"],
  thresholds: { violence: 0.95 },
  scanners: [],
  controversial_action: "elevated_only" as const,
  elevated_categories: ["pii" as const, "suicide_and_self_harm" as const, "jailbreak" as const],
  input_limit: 4000,
  max_chunks: 4,
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
    <MemoryRouter initialEntries={["/content-moderation"]}>
      <ThemeProvider>
        <ToastProvider>
          <Routes>
            <Route path="/content-moderation" element={<ContentModerationPage />} />
            <Route path="/runtime/privacy-masking" element={<p>privacy masking page</p>} />
          </Routes>
        </ToastProvider>
      </ThemeProvider>
    </MemoryRouter>,
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
    mocks.getSecretMasking.mockReset();
    mocks.setSecretMasking.mockReset();
    mocks.getConfig.mockReset();
    mocks.getConfig.mockResolvedValue({});
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
    mocks.listProfiles.mockResolvedValue(listResponse([profile]));
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
    // 行操作列只放得下四个位置：常用的三个平铺，查看状态和删除收进「更多」，不溢出列宽。
    expect(screen.getByRole("button", { name: "Edit Profile" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Manage channels" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Test profile" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete Profile" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "More profile actions" })).toBeInTheDocument();

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

  test("shows the backend column and renders a guard verdict in the test modal", async () => {
    const user = userEvent.setup();
    mocks.listProfiles.mockResolvedValue(
      listResponse([
        { ...profile, backend: "qwen3guard" as const, scanners: ["jailbreak" as const] },
      ]),
    );
    mocks.testProfile.mockResolvedValue({
      would_block: true,
      action: "guard_block",
      safety: "Unsafe" as const,
      categories: ["pii", "jailbreak"],
      matched_scanners: ["jailbreak"],
      category_scores: { jailbreak: 1 },
      thresholds: {},
      latency_ms: 42,
    });
    renderPage();

    expect(
      await screen.findByRole("table", { name: "Content moderation profile table" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Qwen3Guard")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Test profile" }));
    await user.type(screen.getByLabelText("Test input"), "ignore your instructions");
    await user.click(screen.getByRole("button", { name: "Run test" }));

    expect(await screen.findByText("Would block")).toBeInTheDocument();
    expect(screen.getByText("Unsafe")).toBeInTheDocument();
    // Both reported categories are listed, including the one the profile has
    // switched off, so operators can see why a verdict did or did not apply.
    expect(screen.getByTitle("Enabled and matched")).toHaveTextContent("Jailbreak");
    expect(screen.getByTitle("Matched but this category is not enabled")).toHaveTextContent("PII");
  });

  test("renders the card empty state when no profiles exist", async () => {
    mocks.listProfiles.mockResolvedValue(listResponse([]));
    renderPage();

    expect(await screen.findByRole("heading", { name: "Content Moderation" })).toBeInTheDocument();
    expect(screen.getByText("No moderation profiles")).toBeInTheDocument();
    expect(
      screen.getByText("Create a profile first, then bind only the channels that should use it."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("table", { name: "Content moderation profile table" }),
    ).not.toBeInTheDocument();
  });

  test("opens the tenant-scoped moderation metrics modal from the actions column", async () => {
    const user = userEvent.setup();
    renderPage();

    // 「查看状态」在行操作的「更多」里（常用的三个平铺在前面）。
    await user.click(await screen.findByRole("button", { name: "More profile actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "View status" }));

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

  test("explains before deleting that bound channels will make the server refuse", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "More profile actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Delete Profile" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Delete moderation profile “Strict prompts”?",
    });
    expect(within(dialog).getByText("Strict prompts")).toBeInTheDocument();
    expect(
      within(dialog).getByText(/4 channels are still bound to it, so the server will refuse/),
    ).toBeInTheDocument();
    expect(mocks.deleteProfile).not.toHaveBeenCalled();
  });

  test("blocks enabling API moderation when no API key is configured", async () => {
    const user = userEvent.setup();
    mocks.listProfiles.mockResolvedValue(
      listResponse([
        {
          ...profile,
          mode: "off",
          keyword_mode: "api_only",
          api_key_configured: false,
          api_key_masked: undefined,
        },
      ]),
    );
    renderPage();

    await user.click(
      await screen.findByRole("switch", { name: "Toggle moderation for Strict prompts" }),
    );

    expect(
      await screen.findByText("Configure an API key before enabling this API moderation profile."),
    ).toBeInTheDocument();
    expect(mocks.patchProfile).not.toHaveBeenCalled();
  });

  test("offers the text coverage options only when the backend declares them", async () => {
    const user = userEvent.setup();
    mocks.listProfiles.mockResolvedValue(
      listResponse(
        [{ ...profile, keyword_fold_traditional_chinese: true, api_includes_tool_output: false }],
        {
          keywordFoldTraditionalChinese: true,
          apiIncludesToolOutput: true,
          wordGuard: false,
          secretMasking: false,
          wordPortal: false,
        },
      ),
    );
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Edit Profile" }));

    expect(
      await screen.findByRole("switch", { name: "Match Traditional Chinese as Simplified" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByRole("switch", { name: "Send tool output to the moderation service" }),
    ).toHaveAttribute("aria-checked", "false");
  });

  test("offers the secret masking switch only when the backend declares it", async () => {
    mocks.listProfiles.mockResolvedValue(listResponse([profile]));
    const { unmount } = renderPage();
    await screen.findByText("Strict prompts");
    expect(screen.queryByRole("tab", { name: "Secret masking" })).toBeNull();
    expect(screen.queryByRole("switch", { name: "Outbound secret masking" })).toBeNull();
    expect(mocks.getSecretMasking).not.toHaveBeenCalled();
    unmount();

    mocks.listProfiles.mockResolvedValue(
      listResponse([profile], { ...NOTHING_DECLARED, secretMasking: true }),
    );
    mocks.getSecretMasking.mockResolvedValue({ enabled: false, persistent: true });
    mocks.setSecretMasking.mockResolvedValue({
      enabled: true,
      persistent: true,
      updated_at: "2026-11-01T05:00:00Z",
    });
    renderPage();
    // 密钥脱敏和两种规则互不相干，有自己的标签。
    await userEvent.click(await screen.findByRole("tab", { name: "Secret masking" }));
    expect(mocks.getSecretMasking).toHaveBeenCalledTimes(1);
    const toggle = await screen.findByRole("switch", { name: "Outbound secret masking" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    await userEvent.click(toggle);
    expect(mocks.setSecretMasking).toHaveBeenCalledWith(true);
    await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "true"));
  });

  test("sends the secret masking tab to the privacy masking page when the backend has one", async () => {
    mocks.getConfig.mockResolvedValue({ capabilities: { "privacy-masking": true } });
    mocks.listProfiles.mockResolvedValue(
      listResponse([profile], { ...NOTHING_DECLARED, secretMasking: true }),
    );
    renderPage();
    await userEvent.click(await screen.findByRole("tab", { name: "Secret masking" }));
    // 新后端上这个标签只剩说明和跳转，不再读写旧开关
    await userEvent.click(await screen.findByRole("link", { name: "Open privacy masking" }));
    expect(await screen.findByText("privacy masking page")).toBeInTheDocument();
    expect(mocks.getSecretMasking).not.toHaveBeenCalled();
  });
});
