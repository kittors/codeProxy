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

const channel = (id: string, profileId?: string) => ({
  channel_type: "auth_file" as const,
  channel_id: id,
  name: `Channel ${id}`,
  provider: "codex",
  tags: ["team-a"],
  disabled: false,
  ...(profileId ? { profile_id: profileId } : {}),
});

function renderPicker(onBindingsChanged = () => undefined) {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <ModerationChannelPickerModal
          open
          profile={profile}
          profiles={[profile, { ...profile, id: "profile-2", name: "Existing profile" }]}
          onClose={() => undefined}
          onBindingsChanged={onBindingsChanged}
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
          ...channel("auth-1", "profile-2"),
          name: "Codex Team",
        },
      ],
      page: 1,
      page_size: 20,
      total: 1,
    });
    mocks.patchBindings.mockResolvedValue({ bindings: [] });
  });

  test("removes the actions column and binds selected channels with rebind confirmation", async () => {
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
    expect(await screen.findByText("Codex Team")).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Actions" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Unbind Codex Team" })).not.toBeInTheDocument();

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

  test("starts current bindings checked and unbinds selected channels from the footer", async () => {
    mocks.listChannels.mockResolvedValue({
      items: [{ ...channel("auth-1", "profile-1"), name: "Codex Team" }],
      page: 1,
      page_size: 20,
      total: 1,
    });
    const user = userEvent.setup();
    renderPicker();

    const checkbox = await screen.findByRole("checkbox", { name: "Select Codex Team" });
    await waitFor(() => expect(checkbox).toBeChecked());
    await user.click(screen.getByRole("button", { name: "Unbind selected" }));

    await waitFor(() =>
      expect(mocks.patchBindings).toHaveBeenCalledWith({
        allow_rebind: false,
        operations: [
          {
            channel_type: "auth_file",
            channel_id: "auth-1",
            profile_id: null,
          },
        ],
      }),
    );
  });

  test("materializes tag matches from every catalog page into channel bindings", async () => {
    const firstPage = Array.from({ length: 50 }, (_, index) => channel(`auth-${index + 1}`));
    const secondPage = [channel("auth-51", "profile-2")];
    mocks.listChannels.mockImplementation(async (query: { page?: number; page_size?: number }) => {
      if (query.page_size === 50) {
        return {
          items: query.page === 2 ? secondPage : firstPage,
          page: query.page ?? 1,
          page_size: 50,
          total: 51,
        };
      }
      return {
        items: [],
        page: query.page ?? 1,
        page_size: 20,
        total: 0,
      };
    });
    const onBindingsChanged = vi.fn();
    const user = userEvent.setup();
    renderPicker(onBindingsChanged);

    const tagInput = await screen.findByRole("textbox", { name: "Tag filter" });
    await user.type(tagInput, "team-a{Enter}");
    await user.click(screen.getByRole("button", { name: "Bind by tag" }));

    expect(
      await screen.findByText(/Matched channels: 51\. Bindings to update: 51\./),
    ).toBeInTheDocument();
    expect(screen.getByText(/Currently bound to another profile: 1/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Bind matched channels" }));

    await waitFor(() => {
      expect(mocks.listChannels).toHaveBeenCalledWith(
        expect.objectContaining({
          channel_type: "auth_file",
          tags: ["team-a"],
          tag_mode: "any",
          page: 1,
          page_size: 50,
        }),
      );
      expect(mocks.listChannels).toHaveBeenCalledWith(
        expect.objectContaining({
          channel_type: "auth_file",
          tags: ["team-a"],
          tag_mode: "any",
          page: 2,
          page_size: 50,
        }),
      );
    });

    await waitFor(() => expect(mocks.patchBindings).toHaveBeenCalledTimes(1));
    const request = mocks.patchBindings.mock.calls[0]?.[0];
    expect(request).toEqual({
      allow_rebind: true,
      operations: expect.arrayContaining([
        {
          channel_type: "auth_file",
          channel_id: "auth-1",
          profile_id: "profile-1",
        },
        {
          channel_type: "auth_file",
          channel_id: "auth-51",
          profile_id: "profile-1",
        },
      ]),
    });
    expect(request.operations).toHaveLength(51);
    expect(onBindingsChanged).toHaveBeenCalledTimes(1);
  });
});
