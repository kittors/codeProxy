import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import type { EndUserAPIKey } from "@code-proxy/api-client";
import {
  PortalChangePasswordModal,
  type PortalPasswordForm,
} from "../PortalChangePasswordModal";
import { PortalDeleteKeyModal } from "../PortalDeleteKeyModal";

const t = i18n.t.bind(i18n);

function PasswordHarness({ forced, onSubmit }: { forced: boolean; onSubmit: () => void }) {
  const [form, setForm] = useState<PortalPasswordForm>({ current: "", next: "" });
  return (
    <PortalChangePasswordModal
      t={t}
      open
      form={form}
      setForm={setForm}
      error={null}
      busy={false}
      forced={forced}
      onSubmit={onSubmit}
      onClose={vi.fn()}
    />
  );
}

const secondKey = {
  id: "k2",
  tenant_id: "t1",
  end_user_id: "u1",
  name: "secondary",
  key_masked: "sk-****2",
  disabled: false,
  is_default: false,
  created_at: "",
  updated_at: "",
} as EndUserAPIKey;

describe("portal dialogs", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  test("change password keeps the policy visible and checks the confirmation", async () => {
    const onSubmit = vi.fn();
    render(<PasswordHarness forced={false} onSubmit={onSubmit} />);
    const dialog = screen.getByRole("dialog", { name: "Change password" });

    // 策略常驻在新密码下方，不再只写在占位文字里。
    expect(within(dialog).getByText(/At least 12 characters/)).toBeInTheDocument();

    const [current, next, confirm] = Array.from(
      dialog.querySelectorAll<HTMLInputElement>('input[type="password"]'),
    );
    await userEvent.type(current!, "Old-Password-1!");
    await userEvent.type(next!, "New-Password-1!");
    await userEvent.type(confirm!, "New-Password-2!");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save new password" }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(within(dialog).getByText("The passwords don't match")).toBeInTheDocument();

    await userEvent.clear(confirm!);
    await userEvent.type(confirm!, "New-Password-1!");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save new password" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  test("a forced change explains why the dialog can't be dismissed", async () => {
    render(<PasswordHarness forced onSubmit={vi.fn()} />);
    const dialog = screen.getByRole("dialog", { name: "Change password" });

    expect(within(dialog).queryByRole("button", { name: "Cancel" })).toBeNull();
    expect(within(dialog).getByText(/set a new password first/i)).toBeInTheDocument();
    expect(within(dialog).queryByRole("alert")).toBeNull();

    // 不可关闭：没有关闭按钮；按 Esc 不关，只亮出原因。
    expect(within(dialog).queryByRole("button", { name: "Close" })).toBeNull();
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: "Change password" })).toBeInTheDocument();
    expect(within(dialog).getByRole("alert")).toHaveTextContent(/set a new password first/i);
  });

  test("delete key keeps a failure inside the dialog instead of failing silently", async () => {
    const onConfirm = vi.fn(async () => {
      throw new Error("key is still referenced");
    });
    render(
      <PortalDeleteKeyModal
        t={t}
        target={secondKey}
        busy={false}
        isLastKey={false}
        describeError={(error) => (error instanceof Error ? error.message : "failed")}
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "Delete API key?" });
    expect(within(dialog).getByText("secondary")).toBeInTheDocument();
    expect(within(dialog).getByText("sk-****2")).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledWith(secondKey);
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("key is still referenced");
  });

  test("the last key explains why it can't be deleted", async () => {
    const onConfirm = vi.fn(async () => undefined);
    render(
      <PortalDeleteKeyModal
        t={t}
        target={secondKey}
        busy={false}
        isLastKey
        describeError={() => "failed"}
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "Delete API key?" });
    expect(within(dialog).getByText(/must keep at least one key/i)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(within(dialog).getByRole("alert")).toHaveTextContent(/must keep at least one key/i);
  });
});
