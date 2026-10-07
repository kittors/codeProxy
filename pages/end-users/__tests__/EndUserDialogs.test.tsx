import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import type { ApiKeyPermissionProfile, EndUser } from "@code-proxy/api-client";
import { EndUserCreateModal } from "../components/EndUserCreateModal";
import { EndUserCreatedSecretsModal } from "../components/EndUserCreatedSecretsModal";
import { EndUserDeleteModal, EndUserResetPasswordModal } from "../components/EndUserConfirmModals";
import { EndUserEditModal } from "../components/EndUserEditModal";
import { emptyForm, type EndUserForm } from "../endUserForm";

const t = i18n.t.bind(i18n);

const alice: EndUser = {
  id: "user-1",
  tenant_id: "tenant-1",
  username: "alice",
  display_name: "Alice",
  status: "active",
  must_change_password: false,
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-01T00:00:00Z",
  version: 1,
} as EndUser;

const standard = {
  id: "standard",
  name: "Standard",
  "daily-limit": 15000,
  "total-quota": 50000,
  "daily-spending-limit": 300,
  "period-spending-limits": { "5h": 100, day: 300, week: 800, month: 4000 },
  "concurrency-limit": 4,
  "rpm-limit": 120,
  "tpm-limit": 50000,
  "allowed-channel-groups": [],
  "allowed-channels": [],
  "allowed-models": [],
  "system-prompt": "",
} as ApiKeyPermissionProfile;

function CreateHarness({ onSubmit }: { onSubmit: () => void }) {
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
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      onClose={vi.fn()}
    />
  );
}

function EditHarness() {
  const [form, setForm] = useState<EndUserForm>(() => ({
    ...emptyForm(),
    username: "alice",
    displayName: "Alice",
  }));
  return (
    <EndUserEditModal
      t={t}
      open
      user={alice}
      form={form}
      onFormChange={setForm}
      permissionProfiles={[standard]}
      permissionProfileOptions={[
        { value: "", label: "Default: unrestricted" },
        { value: "standard", label: "Standard" },
      ]}
      selectedProfile={form.permissionProfileId === "standard" ? standard : null}
      busy={false}
      onSubmit={(event) => event.preventDefault()}
      onClose={vi.fn()}
    />
  );
}

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

  test("edit: picking a template says it overwrites the limits, and unpicking restores them", async () => {
    render(<EditHarness />);
    const dialog = screen.getByRole("dialog", { name: "Edit user account" });

    const rpm = within(dialog).getByRole("spinbutton", { name: "RPM limit" });
    await userEvent.type(rpm, "60");
    expect(within(dialog).queryByText(/replaces the period quotas/i)).toBeNull();

    await userEvent.click(within(dialog).getByRole("combobox", { name: "Account Permission Profile" }));
    await userEvent.click(await screen.findByRole("option", { name: "Standard" }));
    expect(within(dialog).getByText(/replaces the period quotas/i)).toBeInTheDocument();
    expect(within(dialog).getByRole("spinbutton", { name: "RPM limit" })).toHaveValue(120);
    expect(within(dialog).getByRole("spinbutton", { name: "RPM limit" })).toBeDisabled();

    await userEvent.click(within(dialog).getByRole("combobox", { name: "Account Permission Profile" }));
    await userEvent.click(await screen.findByRole("option", { name: "Default: unrestricted" }));
    expect(within(dialog).getByRole("spinbutton", { name: "RPM limit" })).toHaveValue(60);
    expect(within(dialog).queryByText(/replaces the period quotas/i)).toBeNull();
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
