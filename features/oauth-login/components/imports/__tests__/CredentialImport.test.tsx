import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ApiError } from "@code-proxy/api-client";
import { findCredentialImportSpec } from "../../../model/credentialImport";
import { CredentialImport } from "../CredentialImport";
import { findAccountProvider } from "../../../model/catalog";

const mocks = vi.hoisted(() => ({ importCredential: vi.fn() }));

vi.mock("@code-proxy/api-client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@code-proxy/api-client")>();
  return { ...mod, oauthApi: { ...mod.oauthApi, importCredential: mocks.importCredential } };
});

const sessionSpec = findCredentialImportSpec("anthropic", "session")!;

function renderPanel(specKey: "anthropic" | "xai" = "anthropic") {
  const provider = findAccountProvider(specKey);
  const spec = findCredentialImportSpec(
    specKey,
    specKey === "anthropic" ? "session" : "sso-cookie",
  )!;
  const onRefreshList = vi.fn();
  const onClose = vi.fn();
  const onOptionsChange = vi.fn();
  render(
    <CredentialImport
      provider={provider}
      spec={spec}
      options={{ proxyId: "", projectId: "", usingApi: false }}
      onOptionsChange={onOptionsChange}
      proxyEntries={[]}
      proxyCheckState={{}}
      onRefreshList={onRefreshList}
      onClose={onClose}
    />,
  );
  return { onRefreshList, onClose };
}

const submitButton = () => screen.getByRole("button", { name: /^Import \d+$/ });

beforeEach(() => {
  mocks.importCredential.mockReset();
});

describe("CredentialImport", () => {
  test("extracts the sessionKey from a cookie and imports it", async () => {
    const user = userEvent.setup();
    mocks.importCredential.mockResolvedValue({
      status: "ok",
      email: "team.member@example.com",
      organization: "Acme Team",
    });
    const { onRefreshList } = renderPanel();

    const box = screen.getByRole("textbox");
    await user.click(box);
    await user.paste("sessionKey=sk-ant-sid01-abc; lastActiveOrg=o1; _ga=GA1");

    await user.click(submitButton());

    await waitFor(() =>
      expect(mocks.importCredential).toHaveBeenCalledWith("anthropic-session", {
        credential: "sk-ant-sid01-abc",
        proxyId: "",
        usingApi: false,
      }),
    );
    expect(await screen.findByText("team.member@example.com")).toBeInTheDocument();
    await waitFor(() => expect(onRefreshList).toHaveBeenCalled());
  });

  test("de-duplicates a bulk paste and imports each once", async () => {
    const user = userEvent.setup();
    mocks.importCredential.mockResolvedValue({ status: "ok", email: "x@example.com" });
    renderPanel();

    const box = screen.getByRole("textbox");
    await user.click(box);
    await user.paste("sk-ant-sid01-a\nsk-ant-sid01-b\nsk-ant-sid01-a");

    await user.click(submitButton());

    await waitFor(() => expect(mocks.importCredential).toHaveBeenCalledTimes(2));
    const sent = mocks.importCredential.mock.calls.map((call) => call[1].credential);
    expect(sent).toEqual(["sk-ant-sid01-a", "sk-ant-sid01-b"]);
  });

  test("shows a per-row error and retries only the failed one", async () => {
    const user = userEvent.setup();
    mocks.importCredential.mockRejectedValueOnce(
      new ApiError({ message: "x", status: 422, payload: { code: "credential_invalid" } }),
    );
    renderPanel();

    const box = screen.getByRole("textbox");
    await user.click(box);
    await user.paste("sk-ant-sid01-broken");
    await user.click(submitButton());

    const retry = await screen.findByRole("button", { name: /Retry 1 failed/ });

    mocks.importCredential.mockResolvedValueOnce({ status: "ok", email: "fixed@example.com" });
    await user.click(retry);

    expect(await screen.findByText("fixed@example.com")).toBeInTheDocument();
    expect(mocks.importCredential).toHaveBeenCalledTimes(2);
  });

  test("Grok passes the using-api choice through", async () => {
    const user = userEvent.setup();
    mocks.importCredential.mockResolvedValue({ status: "ok", email: "grok@example.com" });
    // options.usingApi defaults false here; assert the flag is threaded verbatim.
    renderPanel("xai");

    const box = screen.getByRole("textbox");
    await user.click(box);
    await user.paste("sso=grok-sso-value; sso-rw=grok-rw");
    await user.click(submitButton());

    await waitFor(() =>
      expect(mocks.importCredential).toHaveBeenCalledWith("xai-sso", {
        credential: "grok-sso-value",
        proxyId: "",
        usingApi: false,
      }),
    );
  });
});

// Keep a direct reference so the spec import is exercised even if the UI changes.
test("session spec maps to the server kind", () => {
  expect(sessionSpec.kind).toBe("anthropic-session");
});
