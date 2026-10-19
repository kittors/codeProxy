import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ThemeProvider, ToastProvider } from "@code-proxy/ui";
import i18n from "@code-proxy/i18n";
import {
  NO_ACCESS_POLICY_CAPABILITIES,
  emptyQuotaMatrix,
  normalizeEndUser,
  normalizeEndUserAPIKey,
  type AccessPolicyCapabilities,
} from "@code-proxy/api-client";
import { EndUserKeysModal } from "../components/EndUserKeysModal";

const FULL: AccessPolicyCapabilities = {
  accessPolicy: true,
  modelFallback: true,
  batchProfileBinding: true,
  createWithProfile: true,
  ownedKeyAdmin: true,
};

const mocks = vi.hoisted(() => ({
  listKeys: vi.fn(),
  keySecret: vi.fn(),
  updateKey: vi.fn(),
  createKey: vi.fn(),
  resetKeyPeriodSpending: vi.fn(),
  entries: vi.fn(),
  updateEntry: vi.fn(),
  copy: vi.fn(async () => true),
}));

vi.mock("@code-proxy/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@code-proxy/api-client")>();
  return {
    ...actual,
    apiKeyEntriesApi: { ...actual.apiKeyEntriesApi, list: mocks.entries, update: mocks.updateEntry },
    endUsersApi: {
      ...actual.endUsersApi,
      listKeys: mocks.listKeys,
      keySecret: mocks.keySecret,
      updateKey: mocks.updateKey,
      createKey: mocks.createKey,
      resetKeyPeriodSpending: mocks.resetKeyPeriodSpending,
    },
  };
});

vi.mock("@code-proxy/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@code-proxy/ui")>()),
  copyTextToClipboard: mocks.copy,
}));

const accountLimits = emptyQuotaMatrix();
accountLimits.cost.day = 50;
accountLimits.requests.week = 1000;

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
  "quota-limits": accountLimits,
});

const keyLimits = emptyQuotaMatrix();
keyLimits.requests.week = 300;
const keyUsed = emptyQuotaMatrix();
keyUsed.requests.week = 120;

const keys = [
  normalizeEndUserAPIKey({
    id: "k1",
    tenant_id: "t1",
    end_user_id: "user-1",
    name: "primary",
    key_masked: "sk-****1111",
    disabled: false,
    is_default: true,
    "quota-limits": keyLimits,
    "model-rules": [],
    "quota-usage": { total: keyUsed, rules: [] },
  }),
  normalizeEndUserAPIKey({
    id: "k2",
    tenant_id: "t1",
    end_user_id: "user-1",
    name: "spare",
    key_masked: "sk-****2222",
    disabled: true,
    is_default: false,
  }),
];

function renderModal(onViewKeyUsage = vi.fn()) {
  render(
    <ThemeProvider>
      <ToastProvider>
        <EndUserKeysModal user={account} catalog={[]} canWrite onViewKeyUsage={onViewKeyUsage} onClose={vi.fn()} />
      </ToastProvider>
    </ThemeProvider>,
  );
  return screen.getByRole("dialog", { name: "Manage keys · Alice / alice" });
}

const rowOf = (name: string) => screen.getByText(name).closest("tr") as HTMLElement;

describe("EndUserKeysModal", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("en");
    mocks.listKeys.mockResolvedValue({ items: keys, capabilities: FULL });
    mocks.keySecret.mockResolvedValue({ id: "k1", key: "sk-plain-1111" });
    mocks.updateKey.mockResolvedValue(keys[0]);
    mocks.createKey.mockResolvedValue({ api_key: keys[0], plaintext_key: "sk-new-secret" });
    mocks.resetKeyPeriodSpending.mockResolvedValue({ status: "ok" });
  });

  test("shows the account ceiling and each key's own limits", async () => {
    const dialog = renderModal();
    expect(await within(dialog).findByText("primary")).toBeInTheDocument();
    expect(within(dialog).getByText("Account quota")).toBeInTheDocument();
    expect(within(rowOf("primary")).getByText("120 / 300")).toBeInTheDocument();
    expect(within(rowOf("spare")).getByText("Unlimited")).toBeInTheDocument();
  });

  test("copies a key by fetching only its own secret", async () => {
    renderModal();
    await screen.findByText("primary");
    await userEvent.click(within(rowOf("primary")).getByRole("button", { name: "Copy Key" }));

    await waitFor(() => expect(mocks.copy).toHaveBeenCalledWith("sk-plain-1111"));
    expect(mocks.keySecret).toHaveBeenCalledWith("user-1", "k1");
    // 不再为了复制把整个租户的 Key 明文都拉下来。
    expect(mocks.entries).not.toHaveBeenCalled();
  });

  test("resumes a paused key through the account endpoint", async () => {
    renderModal();
    await screen.findByText("spare");
    await userEvent.click(within(rowOf("spare")).getByRole("button", { name: "Click to enable" }));

    await waitFor(() => expect(mocks.updateKey).toHaveBeenCalledWith("user-1", "k2", { disabled: false }));
    expect(mocks.updateEntry).not.toHaveBeenCalled();
  });

  test("an old backend resumes keys through the legacy entry update and copies from the entry list", async () => {
    mocks.listKeys.mockResolvedValue({ items: keys, capabilities: NO_ACCESS_POLICY_CAPABILITIES });
    mocks.entries.mockResolvedValue([{ id: "k1", key: "sk-legacy-1111" }]);
    renderModal();
    await screen.findByText("primary");

    await userEvent.click(within(rowOf("primary")).getByRole("button", { name: "Copy Key" }));
    await waitFor(() => expect(mocks.copy).toHaveBeenCalledWith("sk-legacy-1111"));
    expect(mocks.keySecret).not.toHaveBeenCalled();
  });

  test("creates a key with a token limit and shows its secret once", async () => {
    const dialog = renderModal();
    await within(dialog).findByText("primary");
    await userEvent.click(within(dialog).getByRole("button", { name: "Create key" }));

    const editor = await screen.findByRole("dialog", { name: "Create key" });
    await userEvent.type(within(editor).getByRole("textbox", { name: "Name" }), "worker");
    await userEvent.click(within(editor).getByRole("tab", { name: /Quota/ }));
    await userEvent.type(within(editor).getByRole("textbox", { name: "Tokens · Daily" }), "2M");
    await userEvent.click(within(editor).getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(mocks.createKey).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({
          name: "worker",
          "quota-limits": expect.objectContaining({ tokens: expect.objectContaining({ day: 2_000_000 }) }),
          "model-rules": [],
        }),
      ),
    );
    expect(await screen.findByText("sk-new-secret")).toBeInTheDocument();
  });

  test("lets the per-key usage view open with that key's secret", async () => {
    const onViewKeyUsage = vi.fn();
    renderModal(onViewKeyUsage);
    await screen.findByText("primary");
    await userEvent.click(within(rowOf("primary")).getByRole("button", { name: "More actions" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "View usage" }));
    await waitFor(() => expect(onViewKeyUsage).toHaveBeenCalledWith(keys[0], "sk-plain-1111"));
  });
});
