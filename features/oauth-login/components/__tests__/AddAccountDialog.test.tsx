import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ApiError } from "@code-proxy/api-client";
import { AddAccountDialog, type AddAccountDialogProps } from "../AddAccountDialog";

const mocks = vi.hoisted(() => ({
  startAuth: vi.fn(),
  getAuthStatus: vi.fn(),
  submitCallback: vi.fn(),
  iflowCookieAuth: vi.fn(),
  importCredential: vi.fn(),
  oauthImportCredential: vi.fn(),
}));

vi.mock("@code-proxy/api-client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@code-proxy/api-client")>();
  return {
    ...mod,
    oauthApi: {
      ...mod.oauthApi,
      startAuth: mocks.startAuth,
      getAuthStatus: mocks.getAuthStatus,
      submitCallback: mocks.submitCallback,
      iflowCookieAuth: mocks.iflowCookieAuth,
      importCredential: mocks.oauthImportCredential,
    },
    vertexApi: { ...mod.vertexApi, importCredential: mocks.importCredential },
  };
});

const REMOTE = "https://relay.example.com";
const codexStart = {
  status: "ok",
  url: "https://auth.openai.com/oauth/authorize?redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fauth%2Fcallback&state=s1",
  state: "s1",
  flow: "redirect",
  expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
};

let pendingWindow: {
  opener: unknown;
  closed: boolean;
  location: { href: string };
  close: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  mocks.startAuth.mockResolvedValue(codexStart);
  mocks.getAuthStatus.mockResolvedValue({ status: "wait" });
  mocks.submitCallback.mockResolvedValue({ status: "ok" });
  mocks.iflowCookieAuth.mockResolvedValue({ status: "ok", email: "cookie@example.com" });
  mocks.importCredential.mockResolvedValue({ status: "ok" });
  mocks.oauthImportCredential.mockResolvedValue({ status: "ok", email: "session@example.com" });
  pendingWindow = { opener: {}, closed: false, location: { href: "" }, close: vi.fn() };
  vi.spyOn(window, "open").mockImplementation(() => pendingWindow as unknown as Window);
});

function renderDialog(props: Partial<AddAccountDialogProps> = {}) {
  const onClose = vi.fn();
  const onAuthorized = vi.fn(async () => ({ account: "ada@example.com" }));
  render(
    <AddAccountDialog
      open
      onClose={onClose}
      onAuthorized={onAuthorized}
      apiBase={REMOTE}
      {...props}
    />,
  );
  return { onClose, onAuthorized, dialog: within(screen.getByRole("dialog")) };
}

const fileInput = () =>
  document.querySelector<HTMLInputElement>('[role="dialog"] input[type="file"]');
const findFileInput = async () => {
  await waitFor(() => expect(fileInput()).not.toBeNull());
  return fileInput()!;
};

const pasteInto = (element: HTMLElement, text: string) =>
  fireEvent.paste(element, { clipboardData: { getData: () => text } });

describe("AddAccountDialog", () => {
  test("lists every way to add an account", () => {
    const { dialog } = renderDialog({ onImportAuthFiles: vi.fn(async () => []) });
    const tabs = dialog.getAllByRole("tab").map((tab) => tab.textContent);
    expect(tabs).toEqual([
      "Codex",
      "Claude",
      "Gemini CLI",
      "Antigravity",
      "Grok",
      "iFlow",
      "Qwen",
      "Kimi",
      "Vertex AI",
      "Auth files",
    ]);
    expect(dialog.getByRole("tab", { name: "Codex" })).toHaveAttribute("aria-selected", "true");
  });

  test("hides the auth-file entry when the page cannot upload", () => {
    const { dialog } = renderDialog();
    expect(dialog.queryByRole("tab", { name: "Auth files" })).not.toBeInTheDocument();
  });

  test("preselects the provider the list is filtered to", () => {
    const { dialog } = renderDialog({ providerHint: "claude" });
    expect(dialog.getByRole("tab", { name: "Claude" })).toHaveAttribute("aria-selected", "true");
    expect(dialog.getByRole("heading", { name: "Claude" })).toBeInTheDocument();
  });

  test("opens the provider page from the click and checks a pasted callback before submitting", async () => {
    const user = userEvent.setup();
    const { dialog, onAuthorized, onClose } = renderDialog();

    await user.click(dialog.getByRole("button", { name: "Sign in with Codex" }));

    // Opened blank inside the click (popup blockers), pointed at the URL once it exists.
    expect(window.open).toHaveBeenCalledWith("about:blank", "_blank");
    await waitFor(() => expect(pendingWindow.location.href).toBe(codexStart.url));
    expect(pendingWindow.opener).toBeNull();
    expect(mocks.startAuth).toHaveBeenCalledWith(
      "codex",
      expect.objectContaining({ callbackMode: undefined }),
    );
    expect(await dialog.findByText("Codex sign-in page opened in a new tab")).toBeInTheDocument();
    expect(dialog.getByText("localhost:1455/auth/callback?code=···&state=···")).toBeInTheDocument();

    const box = dialog.getByRole("textbox", { name: "Callback address" });
    pasteInto(box, "http://localhost:1455/auth/callback?code=ac_1&state=old-attempt");
    expect(await dialog.findByRole("alert")).toHaveTextContent(
      "That callback is from an earlier sign-in.",
    );
    expect(mocks.submitCallback).not.toHaveBeenCalled();

    mocks.getAuthStatus.mockResolvedValue({ status: "ok" });
    pasteInto(box, "http://localhost:1455/auth/callback?code=ac_1&scope=openid&state=s1");
    await waitFor(() =>
      expect(mocks.submitCallback).toHaveBeenCalledWith(
        "codex",
        { code: "ac_1", state: "s1" },
        { proxyId: undefined },
      ),
    );

    expect(await dialog.findByRole("heading", { name: "Codex account added" })).toBeInTheDocument();
    expect(await dialog.findByText("ada@example.com")).toBeInTheDocument();
    expect(onAuthorized).toHaveBeenCalledTimes(1);
    await user.click(dialog.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalled();
  });

  test("explains that the sign-in page address is not the callback", async () => {
    const user = userEvent.setup();
    const { dialog } = renderDialog();
    await user.click(dialog.getByRole("button", { name: "Sign in with Codex" }));
    const box = await dialog.findByRole("textbox", { name: "Callback address" });

    pasteInto(box, "https://auth.openai.com/oauth/authorize?client_id=x&state=s1");

    expect(await dialog.findByRole("alert")).toHaveTextContent(
      "That's the sign-in page's address, not the callback.",
    );
    expect(mocks.submitCallback).not.toHaveBeenCalled();
  });

  test("Claude on a remote server shows Anthropic's code page and takes code#state", async () => {
    const user = userEvent.setup();
    mocks.startAuth.mockResolvedValue({
      status: "ok",
      url: "https://claude.ai/oauth/authorize?redirect_uri=https%3A%2F%2Fplatform.claude.com%2Foauth%2Fcode%2Fcallback&state=cs",
      state: "cs",
      flow: "code",
    });
    const { dialog } = renderDialog({ providerHint: "claude" });

    await user.click(dialog.getByRole("button", { name: "Sign in with Claude" }));
    expect(mocks.startAuth).toHaveBeenCalledWith(
      "anthropic",
      expect.objectContaining({ callbackMode: "code" }),
    );
    expect(
      await dialog.findByText("After authorizing, the page shows an authorization code"),
    ).toBeInTheDocument();

    pasteInto(dialog.getByRole("textbox", { name: "Authorization code" }), "anth-code-9#cs");
    await waitFor(() =>
      expect(mocks.submitCallback).toHaveBeenCalledWith(
        "anthropic",
        { code: "anth-code-9", state: "cs" },
        { proxyId: undefined },
      ),
    );
  });

  test("a server on this machine finishes the login by itself", async () => {
    const user = userEvent.setup();
    mocks.startAuth.mockResolvedValue({
      status: "ok",
      url: "https://claude.ai/oauth/authorize?redirect_uri=http%3A%2F%2Flocalhost%3A54545%2Fcallback&state=ls",
      state: "ls",
      flow: "redirect",
    });
    const { dialog } = renderDialog({ providerHint: "claude", apiBase: "http://127.0.0.1:8317" });

    await user.click(dialog.getByRole("button", { name: "Sign in with Claude" }));

    expect(mocks.startAuth).toHaveBeenCalledWith(
      "anthropic",
      expect.objectContaining({ callbackMode: undefined }),
    );
    expect(await dialog.findByText(/The server runs on this computer/)).toBeInTheDocument();
    expect(dialog.queryByRole("textbox")).not.toBeInTheDocument();
    await user.click(dialog.getByRole("button", { name: /Didn't finish by itself/ }));
    expect(await dialog.findByRole("textbox", { name: "Callback address" })).toBeInTheDocument();
  });

  test("Grok sends the endpoint choice and accepts a bare code with the pending state", async () => {
    const user = userEvent.setup();
    mocks.startAuth.mockResolvedValue({
      status: "ok",
      url: "https://auth.x.ai/oauth2/authorize?redirect_uri=http%3A%2F%2F127.0.0.1%3A56121%2Fcallback&state=xs",
      state: "xs",
    });
    const { dialog } = renderDialog({ providerHint: "grok" });

    await user.click(dialog.getByRole("button", { name: /Sign-in options/ }));
    await user.click(dialog.getByRole("combobox", { name: "Grok request endpoint" }));
    await user.click(await screen.findByRole("option", { name: "xAI API (API quota)" }));
    await user.click(dialog.getByRole("button", { name: "Sign in with Grok" }));
    expect(mocks.startAuth).toHaveBeenCalledWith(
      "xai",
      expect.objectContaining({ usingApi: true }),
    );

    const box = await dialog.findByRole("textbox", { name: "Callback address" });
    await user.type(box, "grok-one-time-code{Enter}");
    await waitFor(() =>
      expect(mocks.submitCallback).toHaveBeenCalledWith(
        "xai",
        { code: "grok-one-time-code", state: "xs" },
        { proxyId: undefined },
      ),
    );
  });

  test("device sign-in shows the code to approve and needs nothing pasted", async () => {
    const user = userEvent.setup();
    mocks.startAuth.mockResolvedValue({
      status: "ok",
      url: "https://chat.qwen.ai/authorize?user_code=ABCD-1234&client=qwen-code",
      state: "qs",
      flow: "device",
      user_code: "ABCD-1234",
    });
    const { dialog } = renderDialog({ providerHint: "qwen" });

    await user.click(dialog.getByRole("button", { name: "Start Qwen sign-in" }));

    const code = await dialog.findByRole("group", { name: "Sign-in code" });
    expect(code).toHaveTextContent("ABCD-1234");
    expect(pendingWindow.location.href).toContain("user_code=ABCD-1234");
    expect(dialog.queryByRole("textbox")).not.toBeInTheDocument();

    mocks.getAuthStatus.mockResolvedValue({ status: "ok" });
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(await dialog.findByRole("heading", { name: "Qwen account added" })).toBeInTheDocument();
  });

  test("an expired login says so and starts over on request", async () => {
    const user = userEvent.setup();
    mocks.getAuthStatus.mockRejectedValue(
      new ApiError({
        message: "expired",
        status: 404,
        payload: {
          status: "error",
          error: "Authentication session expired",
          code: "oauth_login_expired",
        },
      }),
    );
    const { dialog } = renderDialog();

    await user.click(dialog.getByRole("button", { name: "Sign in with Codex" }));

    expect(
      await dialog.findByText("This sign-in expired (links last 10 minutes). Start over."),
    ).toBeInTheDocument();
    mocks.getAuthStatus.mockResolvedValue({ status: "wait" });
    await user.click(dialog.getByRole("button", { name: "Start over" }));
    await waitFor(() => expect(mocks.startAuth).toHaveBeenCalledTimes(2));
  });

  test("a login whose callback was accepted is not cut off by the expiry", async () => {
    const user = userEvent.setup();
    // The window closes moments after the login starts (computed at start time).
    mocks.startAuth.mockImplementation(async () => ({
      ...codexStart,
      expires_at: new Date(Date.now() + 1500).toISOString(),
    }));
    const { dialog } = renderDialog();

    await user.click(dialog.getByRole("button", { name: "Sign in with Codex" }));
    pasteInto(
      await dialog.findByRole("textbox", { name: "Callback address" }),
      "http://localhost:1455/auth/callback?code=ac_1&state=s1",
    );
    await waitFor(() => expect(mocks.submitCallback).toHaveBeenCalled());
    // Past the window: the server is still exchanging the code, so the login
    // must keep polling and finish rather than be declared expired.
    await act(() => new Promise((resolve) => window.setTimeout(resolve, 2000)));
    mocks.getAuthStatus.mockResolvedValue({ status: "ok" });
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });

    expect(await dialog.findByRole("heading", { name: "Codex account added" })).toBeInTheDocument();
  });

  test("a failed start explains itself and closes the blank tab", async () => {
    const user = userEvent.setup();
    mocks.startAuth.mockRejectedValue(
      new ApiError({
        message: "failed",
        status: 500,
        payload: { error: "failed to start callback server" },
      }),
    );
    const { dialog } = renderDialog();

    await user.click(dialog.getByRole("button", { name: "Sign in with Codex" }));

    expect(
      await dialog.findByText("Couldn't start the sign-in: failed to start callback server"),
    ).toBeInTheDocument();
    expect(pendingWindow.close).toHaveBeenCalled();
  });

  test("an answer from a login that was replaced is ignored", async () => {
    const user = userEvent.setup();
    let resolveFirstPoll: (value: { status: string }) => void = () => undefined;
    mocks.getAuthStatus.mockImplementationOnce(
      () => new Promise((resolve) => (resolveFirstPoll = resolve)),
    );
    const { dialog, onAuthorized } = renderDialog();

    await user.click(dialog.getByRole("button", { name: "Sign in with Codex" }));
    await dialog.findByText("Codex sign-in page opened in a new tab");
    mocks.startAuth.mockResolvedValue({ ...codexStart, state: "s2" });
    await user.click(dialog.getByRole("button", { name: "New link" }));
    await waitFor(() => expect(mocks.startAuth).toHaveBeenCalledTimes(2));

    await act(async () => resolveFirstPoll({ status: "ok" }));

    expect(dialog.queryByRole("heading", { name: "Codex account added" })).not.toBeInTheDocument();
    expect(onAuthorized).not.toHaveBeenCalled();
  });

  test("iFlow cookie import insists on BXAuth and reports the account", async () => {
    const user = userEvent.setup();
    const { dialog } = renderDialog({ providerHint: "iflow" });

    await user.click(dialog.getByRole("radio", { name: "Cookie import" }));
    // The panels swap with an exit animation first.
    const field = await dialog.findByRole("textbox", { name: "iFlow cookie" });
    await user.type(field, "foo=bar");
    expect(dialog.getByText(/No BXAuth found/)).toBeInTheDocument();
    expect(dialog.getByRole("button", { name: "Import cookie" })).toBeDisabled();

    await user.clear(field);
    await user.type(field, "foo=bar; BXAuth=token-1");
    await user.click(dialog.getByRole("button", { name: "Import cookie" }));

    expect(mocks.iflowCookieAuth).toHaveBeenCalledWith("foo=bar; BXAuth=token-1", { proxyId: "" });
    expect(await dialog.findByRole("heading", { name: "iFlow account added" })).toBeInTheDocument();
    expect(dialog.getByText("cookie@example.com")).toBeInTheDocument();
  });

  test("Claude SessionKey import extracts the key and reports the account", async () => {
    const user = userEvent.setup();
    const { dialog, onAuthorized } = renderDialog({ providerHint: "claude" });

    await user.click(dialog.getByRole("radio", { name: "SessionKey import" }));
    const field = await dialog.findByRole("textbox", { name: "Claude session key" });
    await user.click(field);
    await user.paste("sessionKey=sk-ant-sid01-abc; lastActiveOrg=o1");

    await user.click(dialog.getByRole("button", { name: /^Import \d+$/ }));

    await waitFor(() =>
      expect(mocks.oauthImportCredential).toHaveBeenCalledWith("anthropic-session", {
        credential: "sk-ant-sid01-abc",
        proxyId: "",
        usingApi: false,
      }),
    );
    expect(await dialog.findByText("session@example.com")).toBeInTheDocument();
    // The batch refreshes the list beneath its own results rather than swapping
    // to the single-account success screen.
    await waitFor(() => expect(onAuthorized).toHaveBeenCalled());
  });

  test("Vertex checks the key file before importing it", async () => {
    const user = userEvent.setup();
    mocks.importCredential.mockResolvedValue({
      status: "ok",
      project_id: "demo-project",
      email: "svc@demo-project.iam.gserviceaccount.com",
      location: "us-central1",
    });
    const { dialog } = renderDialog({ providerHint: "vertex" });
    const input = await findFileInput();

    const clientSecret = new File(
      [JSON.stringify({ installed: { client_id: "x" } })],
      "client_secret.json",
      {
        type: "application/json",
      },
    );
    await user.upload(input, clientSecret);
    expect(await dialog.findByRole("alert")).toHaveTextContent('missing type: "service_account"');

    const key = new File(
      [
        JSON.stringify({
          type: "service_account",
          project_id: "demo-project",
          client_email: "svc@demo-project.iam.gserviceaccount.com",
          private_key: "-----BEGIN PRIVATE KEY-----\n...",
        }),
      ],
      "key.json",
      { type: "application/json" },
    );
    await user.upload(
      document.querySelector<HTMLInputElement>('[role="dialog"] input[type="file"]')!,
      key,
    );
    expect(await dialog.findByText("svc@demo-project.iam.gserviceaccount.com")).toBeInTheDocument();

    await user.click(dialog.getByRole("button", { name: "Import" }));
    expect(mocks.importCredential).toHaveBeenCalledWith(key, undefined, { proxyId: "" });
    expect(
      await dialog.findByRole("heading", { name: "Vertex AI account added" }),
    ).toBeInTheDocument();
    expect(dialog.getByText("Project demo-project")).toBeInTheDocument();
  });

  test("auth files go through the page's own upload", async () => {
    const user = userEvent.setup();
    const onImportAuthFiles = vi.fn(async (files: File[]) => files.map((file) => file.name));
    const { dialog, onAuthorized } = renderDialog({ providerHint: "", onImportAuthFiles });

    await user.click(dialog.getByRole("tab", { name: "Auth files" }));
    const files = [
      new File(["{}"], "a.json", { type: "application/json" }),
      new File(["{}"], "b.json", { type: "application/json" }),
    ];
    await user.upload(await findFileInput(), files);

    expect(onImportAuthFiles).toHaveBeenCalledWith(files);
    expect(await dialog.findByRole("heading", { name: "Auth files imported" })).toBeInTheDocument();
    expect(dialog.getByText("Imported 2 auth files")).toBeInTheDocument();
    // The page's upload already refreshed the list.
    expect(onAuthorized).not.toHaveBeenCalled();
  });
});
