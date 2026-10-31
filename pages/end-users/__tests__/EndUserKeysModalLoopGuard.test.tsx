import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ThemeProvider, ToastProvider } from "@code-proxy/ui";
import i18n from "@code-proxy/i18n";
import {
  ApiError,
  emptyQuotaMatrix,
  normalizeEndUser,
  normalizeEndUserAPIKey,
  type AccessPolicyCapabilities,
  type LoopGuardKeyView,
} from "@code-proxy/api-client";
import { EndUserKeysModal } from "../components/EndUserKeysModal";

// Editing a key of a portal account (Portal Accounts -> Manage keys -> edit): the key's
// loop protection is the last section of the editor when the backend has it, and is
// written before the key. On a backend without it the editor is what it always was.

const FULL: AccessPolicyCapabilities = {
  accessPolicy: true,
  modelFallback: true,
  batchProfileBinding: true,
  createWithProfile: true,
  ownedKeyAdmin: true,
};

const mocks = vi.hoisted(() => ({
  listKeys: vi.fn(),
  updateKey: vi.fn(),
  createKey: vi.fn(),
  getKey: vi.fn(),
  putKey: vi.fn(),
  can: vi.fn<(permission: string) => boolean>(),
}));

vi.mock("@code-proxy/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@code-proxy/api-client")>();
  return {
    ...actual,
    endUsersApi: {
      ...actual.endUsersApi,
      listKeys: mocks.listKeys,
      updateKey: mocks.updateKey,
      createKey: mocks.createKey,
    },
    loopGuardApi: { ...actual.loopGuardApi, getKey: mocks.getKey, putKey: mocks.putKey },
  };
});

vi.mock("@app/providers/AuthProvider", () => ({
  useOptionalAuth: () => ({ can: mocks.can }),
}));

const account = normalizeEndUser({
  id: "user-1",
  tenant_id: "t1",
  username: "alice",
  display_name: "Alice",
  status: "active",
  must_change_password: false,
  created_at: "",
  updated_at: "",
  version: 1,
  "quota-limits": emptyQuotaMatrix(),
});

const keys = [
  normalizeEndUserAPIKey({
    id: "k1",
    tenant_id: "t1",
    end_user_id: "user-1",
    name: "primary",
    key_masked: "sk-****1111",
    disabled: false,
    is_default: true,
    "quota-limits": emptyQuotaMatrix(),
    "model-rules": [],
  }),
];

const keyView = (overrides: Partial<LoopGuardKeyView> = {}): LoopGuardKeyView => ({
  key_id: "k1",
  reply: { enabled: null, window: 0, max_distinct: 0 },
  tool: { enabled: null, repeats: 0 },
  tenant: {
    reply: { enabled: false, window: 0, max_distinct: 0 },
    tool: { enabled: false, repeats: 0 },
  },
  effective: {
    reply: { enabled: false, source: "", window: 0, max_distinct: 0 },
    tool: { enabled: false, source: "", repeats: 0 },
  },
  persistent: true,
  updated_at: "",
  defaults: { reply_window: 256, reply_max_distinct: 24, tool_repeats: 8 },
  bounds: {
    min_reply_window: 64,
    max_reply_window: 2048,
    min_reply_distinct: 2,
    reply_distinct_window_share: 4,
    min_tool_repeats: 3,
    max_tool_repeats: 32,
  },
  ...overrides,
});

function renderModal() {
  render(
    <ThemeProvider>
      <ToastProvider>
        <EndUserKeysModal
          user={account}
          catalog={[]}
          canWrite
          onViewKeyUsage={vi.fn()}
          onClose={vi.fn()}
        />
      </ToastProvider>
    </ThemeProvider>,
  );
}

async function openEditor() {
  await screen.findByText("primary");
  await userEvent.click(screen.getByRole("button", { name: "Edit Key quota" }));
  return screen.findByRole("dialog", { name: /Edit Key quota/ });
}

const tabNames = (editor: HTMLElement) =>
  within(editor)
    .getAllByRole("tab")
    .map((tab) => tab.textContent?.trim());

async function choose(trigger: HTMLElement, option: string) {
  await userEvent.click(trigger);
  await userEvent.click(await screen.findByRole("option", { name: option }));
}

describe("a portal account's key editor and its loop protection", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("en");
    mocks.can.mockReset().mockImplementation(() => true);
    mocks.listKeys.mockResolvedValue({ items: keys, capabilities: FULL });
    mocks.updateKey.mockResolvedValue(keys[0]);
    mocks.createKey.mockResolvedValue({ api_key: keys[0], plaintext_key: "sk-new-secret" });
    mocks.getKey.mockReset().mockResolvedValue(keyView());
    mocks.putKey.mockReset().mockImplementation(async () => keyView());
  });

  test("the section is the last one of the editor, for the key being edited", async () => {
    renderModal();
    const editor = await openEditor();
    await waitFor(() => expect(tabNames(editor)).toContain("Loop protection"));
    expect(tabNames(editor)).toEqual(["Basics", "Quota", "Model rules", "Loop protection"]);
    expect(mocks.getKey).toHaveBeenCalledTimes(1);
    expect(mocks.getKey).toHaveBeenCalledWith("k1");

    await userEvent.click(within(editor).getByRole("tab", { name: "Loop protection" }));
    expect(
      within(editor).getByRole("combobox", { name: "Stop repeating replies" }),
    ).toHaveTextContent("Follow the tenant (off)");
    expect(within(editor).getByRole("combobox", { name: "Stop tool-call loops" })).toBeEnabled();
  });

  test.each([
    ["an older backend that has no such route", new ApiError({ message: "nf", status: 404 })],
    ["an account that may not read it", new ApiError({ message: "no", status: 403 })],
  ])(
    "%s: the editor has the same sections as before, and saving writes the key alone",
    async (_n, error) => {
      mocks.getKey.mockRejectedValue(error);
      renderModal();
      const editor = await openEditor();
      await waitFor(() => expect(mocks.getKey).toHaveBeenCalled());
      expect(tabNames(editor)).toEqual(["Basics", "Quota", "Model rules"]);

      const name = within(editor).getByRole("textbox", { name: "Name" });
      await userEvent.clear(name);
      await userEvent.type(name, "renamed");
      await userEvent.click(within(editor).getByRole("button", { name: "Save" }));

      await waitFor(() =>
        expect(mocks.updateKey).toHaveBeenCalledWith("user-1", "k1", { name: "renamed" }),
      );
      expect(mocks.putKey).not.toHaveBeenCalled();
    },
  );

  test("a new key has no section yet and nothing is read", async () => {
    renderModal();
    await screen.findByText("primary");
    await userEvent.click(screen.getByRole("button", { name: "Create key" }));
    const editor = await screen.findByRole("dialog", { name: "Create key" });
    expect(tabNames(editor)).toEqual(["Basics", "Quota", "Model rules"]);
    expect(mocks.getKey).not.toHaveBeenCalled();
  });

  test("an edit of the section is written first and the key after it", async () => {
    const order: string[] = [];
    mocks.putKey.mockImplementation(async () => {
      order.push("override");
      return keyView({ reply: { enabled: false, window: 0, max_distinct: 0 } });
    });
    mocks.updateKey.mockImplementation(async () => {
      order.push("key");
      return keys[0];
    });
    renderModal();
    const editor = await openEditor();

    const name = within(editor).getByRole("textbox", { name: "Name" });
    await userEvent.clear(name);
    await userEvent.type(name, "renamed");
    await userEvent.click(await within(editor).findByRole("tab", { name: "Loop protection" }));
    await choose(
      within(editor).getByRole("combobox", { name: "Stop repeating replies" }),
      "Off for this key",
    );
    await userEvent.click(within(editor).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mocks.updateKey).toHaveBeenCalledTimes(1));
    expect(order).toEqual(["override", "key"]);
    expect(mocks.putKey).toHaveBeenCalledWith("k1", {
      reply: { enabled: false },
      tool: { enabled: null },
    });
    expect(mocks.updateKey).toHaveBeenCalledWith("user-1", "k1", { name: "renamed" });
  });

  test("when only the section changed, only the override is written and the editor closes", async () => {
    renderModal();
    const editor = await openEditor();
    await userEvent.click(await within(editor).findByRole("tab", { name: "Loop protection" }));
    await choose(
      within(editor).getByRole("combobox", { name: "Stop tool-call loops" }),
      "On for this key",
    );
    await userEvent.click(within(editor).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mocks.putKey).toHaveBeenCalledTimes(1));
    expect(mocks.putKey).toHaveBeenCalledWith("k1", {
      reply: { enabled: null },
      tool: { enabled: true },
    });
    // Nothing about the key itself changed, so the account endpoint is not called.
    expect(mocks.updateKey).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: /Edit Key quota/ })).toBeNull(),
    );
  });

  test("saving without touching the section writes no override", async () => {
    renderModal();
    const editor = await openEditor();
    await within(editor).findByRole("tab", { name: "Loop protection" });
    const name = within(editor).getByRole("textbox", { name: "Name" });
    await userEvent.clear(name);
    await userEvent.type(name, "renamed");
    await userEvent.click(within(editor).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mocks.updateKey).toHaveBeenCalledTimes(1));
    expect(mocks.putKey).not.toHaveBeenCalled();
  });

  test("a value outside the range stops the save, is marked in the navigation, and is shown", async () => {
    renderModal();
    const editor = await openEditor();
    await userEvent.click(await within(editor).findByRole("tab", { name: "Loop protection" }));
    await choose(
      within(editor).getByRole("combobox", { name: "Stop repeating replies" }),
      "On for this key",
    );
    await userEvent.type(within(editor).getByRole("textbox", { name: "Lines compared" }), "10");

    // Away from the section, then save: the editor must not look like it did nothing.
    await userEvent.click(within(editor).getByRole("tab", { name: "Basics" }));
    const name = within(editor).getByRole("textbox", { name: "Name" });
    await userEvent.clear(name);
    await userEvent.type(name, "renamed");
    await userEvent.click(within(editor).getByRole("button", { name: "Save" }));

    expect(
      await within(editor).findByText("Enter a whole number from 64 to 2048."),
    ).toBeInTheDocument();
    expect(within(editor).getByRole("tab", { name: /Loop protection/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(within(editor).getByRole("tab", { name: /Loop protection/ })).toHaveAccessibleName(
      /This section needs changes/,
    );
    expect(mocks.putKey).not.toHaveBeenCalled();
    expect(mocks.updateKey).not.toHaveBeenCalled();
  });

  test("a refused write keeps the editor open on the section, with the reason, and the key unsaved", async () => {
    mocks.putKey.mockRejectedValue(new ApiError({ message: "database is read-only", status: 503 }));
    renderModal();
    const editor = await openEditor();
    await userEvent.click(await within(editor).findByRole("tab", { name: "Loop protection" }));
    await choose(
      within(editor).getByRole("combobox", { name: "Stop repeating replies" }),
      "Off for this key",
    );
    await userEvent.click(within(editor).getByRole("tab", { name: "Basics" }));
    const name = within(editor).getByRole("textbox", { name: "Name" });
    await userEvent.clear(name);
    await userEvent.type(name, "renamed");
    await userEvent.click(within(editor).getByRole("button", { name: "Save" }));

    expect(await within(editor).findByText("database is read-only")).toBeInTheDocument();
    expect(mocks.updateKey).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: /Edit Key quota/ })).toBeInTheDocument();
    // The choice is still there to retry.
    expect(
      within(editor).getByRole("combobox", { name: "Stop repeating replies" }),
    ).toHaveTextContent("Off for this key");
  });

  test("an account that may not write keys can read the section but not change it", async () => {
    mocks.can.mockImplementation((permission) => permission !== "api_keys.write");
    renderModal();
    const editor = await openEditor();
    await userEvent.click(await within(editor).findByRole("tab", { name: "Loop protection" }));
    expect(within(editor).getByRole("combobox", { name: "Stop repeating replies" })).toBeDisabled();
    expect(within(editor).getByRole("combobox", { name: "Stop tool-call loops" })).toBeDisabled();
  });

  test("a failed read is said in the section, and the key can still be saved", async () => {
    mocks.getKey.mockRejectedValue(new Error("network down"));
    renderModal();
    const editor = await openEditor();
    await userEvent.click(await within(editor).findByRole("tab", { name: "Loop protection" }));
    expect(await within(editor).findByRole("alert")).toHaveTextContent(
      "Could not load this key's loop protection settings.",
    );

    await userEvent.click(within(editor).getByRole("tab", { name: "Basics" }));
    const name = within(editor).getByRole("textbox", { name: "Name" });
    await userEvent.clear(name);
    await userEvent.type(name, "renamed");
    await userEvent.click(within(editor).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.updateKey).toHaveBeenCalledTimes(1));
    expect(mocks.putKey).not.toHaveBeenCalled();
  });
});
