import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { UserIdentity } from "@code-proxy/api-client";
import i18n from "@code-proxy/i18n";
import { CreateUserModal } from "../CreateUserModal";
import type { CreateUserForm } from "../userForm";
import { DisableUserConfirm, ResetPasswordModal, SetRolesModal } from "../UserDialogs";

const makeUser = (overrides: Partial<UserIdentity> = {}): UserIdentity => ({
  id: "u-1",
  tenant_id: "t-1",
  username: "alice",
  display_name: "Alice",
  status: "active",
  must_change_password: false,
  last_login_at: null,
  role_ids: [],
  role_codes: [],
  version: 1,
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-01T00:00:00Z",
  ...overrides,
});

describe("CreateUserModal", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  test("validates in place and asks for a password only when it is set manually", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async (_form: CreateUserForm): Promise<string | null> => null);
    render(
      <CreateUserModal
        open
        busy={false}
        showRoles={false}
        roleOptions={[]}
        onSubmit={onSubmit}
        onClose={() => undefined}
      />,
    );

    // 自动生成时没有密码框。
    expect(screen.queryByLabelText(/^Initial password$/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Create user" }));
    expect(onSubmit).not.toHaveBeenCalled();

    const username = screen.getByLabelText(/^Username/);
    await waitFor(() => expect(username).toHaveAttribute("aria-invalid", "true"));
    expect(username).toHaveAccessibleDescription(/Required/);

    await user.type(username, "bad name!");
    expect(username).toHaveAccessibleDescription(/Use only letters, digits and \. _ - @/);

    // 切到手动设置后密码框出现并拿到焦点。
    await user.click(screen.getByRole("radio", { name: /^Set manually/ }));
    await waitFor(() => expect(screen.getByLabelText(/^Initial password\*?$/)).toHaveFocus());
  });

  test("shows a server-side password rejection under the password field", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(
      async (_form: CreateUserForm): Promise<string | null> => "Rejected by the server policy.",
    );
    render(
      <CreateUserModal
        open
        busy={false}
        showRoles={false}
        roleOptions={[]}
        onSubmit={onSubmit}
        onClose={() => undefined}
      />,
    );

    await user.type(screen.getByLabelText(/^Username/), "bob");
    await user.type(screen.getByLabelText(/^Display name/), "Bob");
    await user.click(screen.getByRole("radio", { name: /^Set manually/ }));
    await user.type(screen.getByLabelText(/^Initial password\*?$/), "Valid-Password-1");
    await user.click(screen.getByRole("button", { name: "Create user" }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ username: "bob", displayName: "Bob", passwordMode: "manual" }),
      ),
    );
    expect(screen.getByLabelText(/^Initial password\*?$/)).toHaveAccessibleDescription(
      /Rejected by the server policy\./,
    );
  });
});

describe("user dialogs", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  test("reset password explains its effect and blocks a weak password", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async (_password: string): Promise<string | null> => null);
    render(
      <ResetPasswordModal
        user={makeUser()}
        name="Alice"
        busy={false}
        onSubmit={onSubmit}
        onClose={() => undefined}
      />,
    );

    expect(screen.getByText(/All of their sessions end immediately/)).toBeInTheDocument();
    const password = screen.getByLabelText(/^New password/);
    await user.type(password, "short");
    await user.click(screen.getByRole("button", { name: "Reset password" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(password).toHaveAccessibleDescription(/At least 12 characters/);
  });

  test("set roles says why a protected account is locked", () => {
    render(
      <SetRolesModal
        user={makeUser({ role_codes: ["tenant_admin"] })}
        busy={false}
        roleOptions={[{ value: "r-1", label: "Operator" }]}
        lockedReason="A tenant administrator's roles are protected and can't be changed here."
        onSubmit={() => undefined}
        onClose={() => undefined}
      />,
    );

    expect(
      screen.getByText("A tenant administrator's roles are protected and can't be changed here."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save roles" })).toBeDisabled();
  });

  test("disabling a user is a reversible warning, not a delete", () => {
    render(
      <DisableUserConfirm
        user={makeUser()}
        name="Alice"
        busy={false}
        onConfirm={() => undefined}
        onClose={() => undefined}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Disable user" });
    expect(within(dialog).getByText("alice")).toBeInTheDocument();
    expect(within(dialog).getByText(/re-enable it from the list/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Disable user" })).toBeInTheDocument();
  });
});
