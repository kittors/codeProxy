import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import { ThemeProvider, ToastProvider } from "@code-proxy/ui";
import { ModerationChannelPickerModal } from "../components/ModerationChannelPickerModal";

const mocks = vi.hoisted(() => ({
  listChannels: vi.fn(),
  patchBindings: vi.fn(),
}));

vi.mock("@code-proxy/api-client", () => ({
  contentModerationApi: {
    listChannels: mocks.listChannels,
    patchBindings: mocks.patchBindings,
  },
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
  keyword_mode: "keyword_only" as const,
  blocked_keywords: ["blocked"],
  thresholds: {},
  block_http_status: 403,
  block_message: "Blocked",
  version: 1,
  created_at: "2026-07-22T01:00:00Z",
  updated_at: "2026-07-22T02:00:00Z",
  api_key_configured: false,
  binding_counts: {},
};

function renderPicker() {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <ModerationChannelPickerModal
          open
          profile={profile}
          profiles={[profile, { ...profile, id: "profile-2", name: "Existing profile" }]}
          onClose={() => undefined}
          onBindingsChanged={() => undefined}
        />
      </ToastProvider>
    </ThemeProvider>,
  );
}

describe("ModerationChannelPickerModal", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    mocks.listChannels.mockReset();
    mocks.patchBindings.mockReset();
    mocks.listChannels.mockResolvedValue({
      items: [
        {
          channel_type: "auth_file",
          channel_id: "auth-1",
          name: "Codex Team",
          provider: "codex",
          tags: ["team-a"],
          disabled: false,
          profile_id: "profile-2",
        },
      ],
      page: 1,
      page_size: 20,
      total: 41,
    });
    mocks.patchBindings.mockResolvedValue({ bindings: [] });
  });

  test("uses server pagination and confirms replacement of another profile binding", async () => {
    const user = userEvent.setup();
    renderPicker();

    await waitFor(() =>
      expect(mocks.listChannels).toHaveBeenCalledWith(
        expect.objectContaining({
          channel_type: "auth_file",
          page: 1,
          page_size: 20,
        }),
      ),
    );
    expect(screen.getByText("Codex Team")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() =>
      expect(mocks.listChannels).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2, page_size: 20 }),
      ),
    );

    await user.click(screen.getByRole("checkbox", { name: "Select Codex Team" }));
    await user.click(screen.getByRole("button", { name: "Bind selected" }));
    expect(screen.getByText("Replace existing binding?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Replace binding" }));

    await waitFor(() =>
      expect(mocks.patchBindings).toHaveBeenCalledWith({
        allow_rebind: true,
        operations: [
          {
            channel_type: "auth_file",
            channel_id: "auth-1",
            profile_id: "profile-1",
          },
        ],
      }),
    );
  });
});
