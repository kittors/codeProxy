import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import i18n from "@code-proxy/i18n";
import {
  NO_ACCESS_POLICY_CAPABILITIES,
  emptyQuotaMatrix,
  normalizeEndUser,
  type AccessPolicyCapabilities,
  type ApiKeyPermissionProfile,
  type EndUser,
  type EndUserUpdateBody,
} from "@code-proxy/api-client";
import { EndUserCreateModal } from "../components/EndUserCreateModal";
import { EndUserCreatedSecretsModal } from "../components/EndUserCreatedSecretsModal";
import { EndUserDeleteModal, EndUserResetPasswordModal } from "../components/EndUserConfirmModals";
import { EndUserEditModal } from "../components/EndUserEditModal";
import { emptyForm, type EndUserForm } from "../endUserForm";

const t = i18n.t.bind(i18n);

const FULL: AccessPolicyCapabilities = {
  accessPolicy: true,
  modelFallback: true,
  batchProfileBinding: true,
  createWithProfile: true,
  ownedKeyAdmin: true,
};

const alice: EndUser = normalizeEndUser({
  id: "user-1",
  tenant_id: "tenant-1",
  username: "alice",
  display_name: "Alice",
  status: "active",
  must_change_password: false,
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-01T00:00:00Z",
  version: 1,
  "rpm-limit": 0,
});

const standardLimits = emptyQuotaMatrix();
standardLimits.cost.day = 300;
standardLimits.requests.week = 5000;

const standard: ApiKeyPermissionProfile = {
  id: "standard",
  name: "Standard",
  "daily-limit": 0,
  "total-quota": 0,
  "daily-spending-limit": 300,
  "period-spending-limits": { "5h": 0, day: 300, week: 0, month: 0 },
  "concurrency-limit": 4,
  "rpm-limit": 120,
  "tpm-limit": 50000,
  "allowed-channel-groups": [],
  "allowed-channels": [],
  "allowed-models": [],
  "system-prompt": "",
  "quota-limits": standardLimits,
  "model-rules": [{ id: "opus", name: "Opus weekly", models: ["claude-opus-*"], limits: standardLimits }],
  "model-routes": [],
};

function CreateHarness({ onSubmit, allowProfile = false }: { onSubmit: (form: EndUserForm) => void; allowProfile?: boolean }) {
  const [form, setForm] = useState<EndUserForm>(() => emptyForm());
  const [serverError, setServerError] = useState("");
  return (
    <EndUserCreateModal
      t={t}
      open
      form={form}
      setForm={setForm}
      busy={false}
      createPasswordError={serverError}
      setCreatePasswordError={setServerError}
      profiles={[standard]}
      allowProfile={allowProfile}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(form);
      }}
      onClose={vi.fn()}
    />
  );
}

function renderEditor({
  user = alice,
  capabilities = FULL,
  onSubmit = vi.fn(),
}: {
  user?: EndUser;
  capabilities?: AccessPolicyCapabilities;
  onSubmit?: (body: EndUserUpdateBody) => void;
} = {}) {
  render(
    <MemoryRouter>
      <EndUserEditModal
        open
        user={user}
        profiles={[standard]}
        boundCounts={new Map([["standard", 3]])}
        capabilities={capabilities}
        catalog={[{ value: "claude-opus-4-5" }, { value: "claude-sonnet-4-5" }, { value: "gpt-5" }]}
        availableChannelGroups={[]}
        availableChannels={[]}
        channelRouteGroupsByName={{}}
        availableModels={[]}
        onAccessScopeChange={vi.fn()}
        saving={false}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />
    </MemoryRouter>,
  );
  return screen.getByRole("dialog", { name: "Edit user account" });
}

const openSection = async (dialog: HTMLElement, name: string) =>
  userEvent.click(within(dialog).getByRole("tab", { name: new RegExp(name) }));

describe("end-user dialogs", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  test("create: display name is required and a typed password must meet the policy", async () => {
    const onSubmit = vi.fn();
    render(<CreateHarness onSubmit={onSubmit} />);
    const dialog = screen.getByRole("dialog", { name: "Create user" });

    // 不填密码会随机生成且只显示一次——常驻在表单里，不再藏在占位文字。
    expect(within(dialog).getByText(/generate a random password/i)).toBeInTheDocument();
    // 后端没声明 create-with-profile 时不出现模板选择。
    expect(within(dialog).queryByRole("combobox", { name: "Permission template" })).toBeNull();

    await userEvent.click(within(dialog).getByRole("button", { name: "Create user" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(within(dialog).getByText("Required")).toBeInTheDocument();

    const fields = within(dialog).getAllByRole("textbox");
    await userEvent.type(fields[0]!, "Bob");
    const password = dialog.querySelector('input[type="password"]') as HTMLInputElement;
    await userEvent.type(password, "short");
    await userEvent.tab();
    expect(within(dialog).getByText("At least 12 characters")).toBeInTheDocument();

    await userEvent.clear(password);
    await userEvent.click(within(dialog).getByRole("button", { name: "Create user" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  test("create: binds a template up front when the backend supports it", async () => {
    const onSubmit = vi.fn();
    render(<CreateHarness onSubmit={onSubmit} allowProfile />);
    const dialog = screen.getByRole("dialog", { name: "Create user" });

    await userEvent.type(within(dialog).getAllByRole("textbox")[0]!, "Bob");
    await userEvent.click(within(dialog).getByRole("combobox", { name: "Permission template" }));
    await userEvent.click(await screen.findByRole("option", { name: "Standard" }));
    // 选中后写明这个模板限了什么。
    expect(within(dialog).getByText(/Day \$300/)).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: "Create user" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ permissionProfileId: "standard" }));
  });

  test("edit: a custom account saves the full matrix, its rules and its routes", async () => {
    const onSubmit = vi.fn();
    const dialog = renderEditor({ onSubmit });

    await openSection(dialog, "Quota");
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Spend · Daily" }), "100");
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Tokens · Monthly" }), "5M");

    await openSection(dialog, "Model rules");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add rule" }));
    const models = within(dialog).getByRole("combobox", { name: "Models for \"Rule 1\"" });
    await userEvent.type(models, "claude-opus-*{Enter}");
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Requests · Weekly" }), "200");
    await userEvent.type(
      within(dialog).getByRole("combobox", { name: "Fallback model for \"Rule 1\"" }),
      "claude-sonnet-4-5",
    );

    await openSection(dialog, "Model routes");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add route" }));
    await userEvent.type(
      within(dialog).getByRole("combobox", { name: "Source models of route 1" }),
      "gpt-5{Enter}",
    );
    await userEvent.type(within(dialog).getByRole("combobox", { name: "Target model of route 1" }), "gpt-4o");

    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const body = onSubmit.mock.calls[0]![0] as EndUserUpdateBody;
    expect(body["quota-limits"]?.cost?.day).toBe(100);
    expect(body["quota-limits"]?.tokens?.month).toBe(5_000_000);
    expect(body["model-rules"]).toEqual([
      {
        id: "",
        models: ["claude-opus-*"],
        limits: expect.objectContaining({ requests: expect.objectContaining({ week: 200 }) }),
        "fallback-model": "claude-sonnet-4-5",
      },
    ]);
    expect(body["model-routes"]).toEqual([{ id: "", from: ["gpt-5"], to: "gpt-4o" }]);
    // 没动过的字段不出现。
    expect(body).not.toHaveProperty("allowed-models");
    expect(body).not.toHaveProperty("rpm-limit");
  });

  test("edit: a rule must limit something and its fallback must leave the rule", async () => {
    const onSubmit = vi.fn();
    const dialog = renderEditor({ onSubmit });

    await openSection(dialog, "Model rules");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add rule" }));
    await userEvent.type(within(dialog).getByRole("combobox", { name: "Models for \"Rule 1\"" }), "claude-opus-*{Enter}");
    await userEvent.type(
      within(dialog).getByRole("combobox", { name: "Fallback model for \"Rule 1\"" }),
      "claude-opus-4-5",
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(within(dialog).getByText("Set at least one limit, or this rule does nothing")).toBeInTheDocument();
    expect(
      within(dialog).getByText("The fallback model still matches this rule, so the fallback would never happen"),
    ).toBeInTheDocument();
  });

  test("edit: a template makes the policy read-only and switching back restores what was typed", async () => {
    const onSubmit = vi.fn();
    const dialog = renderEditor({ onSubmit });

    await openSection(dialog, "Rate limits");
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Requests per minute (RPM)" }), "60");

    await openSection(dialog, "Permission source");
    await userEvent.click(within(dialog).getByRole("radio", { name: /Use a permission template/ }));
    expect(within(dialog).getByRole("radio", { name: /Standard/ })).toHaveAttribute("aria-checked", "true");

    await openSection(dialog, "Rate limits");
    const rpm = within(dialog).getByRole("textbox", { name: "Requests per minute (RPM)" });
    expect(rpm).toHaveValue("120");
    expect(rpm).toBeDisabled();
    expect(within(dialog).getByText(/Managed by the permission template "Standard"/)).toBeInTheDocument();

    // 只有累计消费在绑定模板时还能改。
    await openSection(dialog, "Quota");
    expect(within(dialog).queryByRole("textbox", { name: "Spend · Daily" })).toBeNull();
    expect(within(dialog).getByRole("textbox", { name: "Spend · Total" })).toBeEnabled();

    await openSection(dialog, "Permission source");
    await userEvent.click(within(dialog).getByRole("radio", { name: /Set individually/ }));
    await openSection(dialog, "Rate limits");
    expect(within(dialog).getByRole("textbox", { name: "Requests per minute (RPM)" })).toHaveValue("60");
  });

  test("edit: binding a template sends only the template on a new backend", async () => {
    const onSubmit = vi.fn();
    const dialog = renderEditor({ onSubmit });

    await openSection(dialog, "Permission source");
    await userEvent.click(within(dialog).getByRole("radio", { name: /Use a permission template/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(onSubmit).toHaveBeenCalledWith({ "permission-profile-id": "standard" });
  });

  test("edit: unbinding keeps the template's values explicitly", async () => {
    const onSubmit = vi.fn();
    const bound = normalizeEndUser({
      ...alice,
      "permission-profile-id": "standard",
      "quota-limits": standardLimits,
      "model-rules": standard["model-rules"],
      "rpm-limit": 120,
    });
    const dialog = renderEditor({ user: bound, onSubmit });

    await openSection(dialog, "Permission source");
    await userEvent.click(within(dialog).getByRole("radio", { name: /Set individually/ }));
    expect(within(dialog).getByText(/starting from the template's current values/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    const body = onSubmit.mock.calls[0]![0] as EndUserUpdateBody;
    expect(body["permission-profile-id"]).toBe("");
    // 后端解绑时会清掉没带上的规则、路由与访问范围，所以这里全部显式提交。
    expect(body["quota-limits"]?.cost?.day).toBe(300);
    expect(body["model-rules"]).toHaveLength(1);
    expect(body["model-routes"]).toEqual([]);
    expect(body["allowed-models"]).toEqual([]);
    expect(body["rpm-limit"]).toBe(120);
  });

  test("edit: an old backend only edits the cells it can store, with the legacy field names", async () => {
    const onSubmit = vi.fn();
    const dialog = renderEditor({ capabilities: NO_ACCESS_POLICY_CAPABILITIES, onSubmit });

    expect(within(dialog).queryByRole("tab", { name: /Model rules/ })).toBeNull();
    expect(within(dialog).queryByRole("tab", { name: /Model routes/ })).toBeNull();

    await openSection(dialog, "Quota");
    expect(within(dialog).queryByRole("textbox", { name: "Tokens · Daily" })).toBeNull();
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Spend · Daily" }), "100");
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Requests · Daily" }), "1000");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(onSubmit).toHaveBeenCalledWith({
      "daily-limit": 1000,
      "daily-spending-limit": 100,
      "period-spending-limits": { "5h": 0, day: 100, week: 0, month: 0 },
    });
  });

  test("edit: saving an untouched form sends an empty patch", async () => {
    const onSubmit = vi.fn();
    const dialog = renderEditor({ onSubmit });
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(onSubmit).toHaveBeenCalledWith({});
  });

  test("created credentials are one copyable row each, with copy all", () => {
    render(
      <EndUserCreatedSecretsModal
        createdSecrets={{
          user: { ...alice, username: "bob" },
          generated_password: "Gen-Pass-123456!",
          default_api_key: { key: "sk-initial-key" },
        } as never}
        onClose={vi.fn()}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "Copy credentials now" });
    expect(within(dialog).getByText("bob")).toBeInTheDocument();
    expect(within(dialog).getByText("Gen-Pass-123456!")).toBeInTheDocument();
    expect(within(dialog).getByText("sk-initial-key")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Copy Password" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Copy all" })).toBeInTheDocument();
  });

  test("reset password is a warning with the account card, not a delete", () => {
    render(
      <EndUserResetPasswordModal user={alice} busy={false} onClose={vi.fn()} onConfirm={vi.fn()} />,
    );
    const dialog = screen.getByRole("dialog", { name: "Reset Password" });
    expect(within(dialog).getByText("Alice")).toBeInTheDocument();
    expect(within(dialog).getByText("alice")).toBeInTheDocument();
    expect(within(dialog).getByText(/sessions end/i)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Reset password" })).toBeInTheDocument();
    // 文案走 i18n：英文界面下不再出现硬编码的中文。
    expect(dialog.textContent).not.toMatch(/[一-鿿]/);
  });

  test("delete account lists what happens to its keys", async () => {
    const onConfirm = vi.fn();
    render(<EndUserDeleteModal user={alice} busy={false} onClose={vi.fn()} onConfirm={onConfirm} />);
    const dialog = screen.getByRole("dialog", { name: "Delete user account" });
    expect(within(dialog).getByText(/disabled and unassigned/i)).toBeInTheDocument();
    expect(dialog.textContent).not.toMatch(/[一-鿿]/);
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete account" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
