import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ApiError } from "@code-proxy/api-client";
import i18n from "@code-proxy/i18n";
import { ThemeProvider, ToastProvider } from "@code-proxy/ui";
import { ModerationProfileSelect } from "../components/ModerationProfileSelect";

const mocks = vi.hoisted(() => ({
  listProfiles: vi.fn(),
  listChannels: vi.fn(),
  patchBindings: vi.fn(),
  notify: vi.fn(),
}));

vi.mock("@code-proxy/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@code-proxy/api-client")>()),
  contentModerationApi: mocks,
}));

vi.mock("@code-proxy/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@code-proxy/ui")>()),
  useToast: () => ({ notify: mocks.notify }),
}));

describe("ModerationProfileSelect", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    mocks.listProfiles.mockReset();
    mocks.listChannels.mockReset();
    mocks.patchBindings.mockReset();
    mocks.notify.mockReset();
    mocks.listProfiles.mockResolvedValue([
      {
        id: "profile-1",
        name: "Strict prompts",
      },
    ]);
    mocks.listChannels.mockResolvedValue({
      items: [
        {
          channel_type: "auth_file",
          channel_id: "auth-1",
          name: "Codex Team",
          provider: "codex",
          tags: [],
          disabled: false,
        },
      ],
      page: 1,
      page_size: 50,
      total: 1,
    });
    mocks.patchBindings.mockResolvedValue({ bindings: [] });
  });

  test("does not notify when an in-flight binding lookup is cancelled", async () => {
    let abortCount = 0;
    mocks.listChannels
      .mockImplementationOnce(
        ({ signal }: { signal?: AbortSignal }) =>
          new Promise((_, reject) => {
            signal?.addEventListener(
              "abort",
              () => {
                abortCount += 1;
                reject(new ApiError({ message: "Request was cancelled" }));
              },
              { once: true },
            );
          }),
      )
      .mockResolvedValueOnce({
        items: [],
        page: 1,
        page_size: 50,
        total: 0,
      });

    const view = render(
      <ThemeProvider>
        <ToastProvider>
          <ModerationProfileSelect channelType="auth_file" channelId="auth-1" />
        </ToastProvider>
      </ThemeProvider>,
    );
    await waitFor(() => expect(mocks.listChannels).toHaveBeenCalledTimes(1));

    view.rerender(
      <ThemeProvider>
        <ToastProvider>
          <ModerationProfileSelect channelType="auth_file" channelId="auth-2" />
        </ToastProvider>
      </ThemeProvider>,
    );

    await waitFor(() => expect(abortCount).toBe(1));
    await waitFor(() => expect(mocks.listChannels).toHaveBeenCalledTimes(2));
    await Promise.resolve();
    await Promise.resolve();

    expect(mocks.notify).not.toHaveBeenCalledWith(expect.objectContaining({ type: "error" }));
  });

  test("updates only the binding endpoint for a stable channel id", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <ToastProvider>
          <ModerationProfileSelect channelType="auth_file" channelId="auth-1" />
        </ToastProvider>
      </ThemeProvider>,
    );

    const select = await screen.findByRole("combobox", {
      name: "Content moderation profile",
    });
    await waitFor(() => expect(select).not.toBeDisabled());
    await user.click(select);
    await user.click(screen.getByRole("option", { name: "Strict prompts" }));

    await waitFor(() =>
      expect(mocks.patchBindings).toHaveBeenCalledWith({
        allow_rebind: false,
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
