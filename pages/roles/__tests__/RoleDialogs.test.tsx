import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { RoleIdentity, UserIdentity } from "@code-proxy/api-client";
import i18n from "@code-proxy/i18n";
import {
  AssignRoleUsersModal,
  CreateRoleModal,
  DeleteRoleConfirm,
  RolePermissionsModal,
} from "../RoleDialogs";

const role: RoleIdentity = {
  id: "r-operator",
  tenant_id: "t-1",
  code: "role_operator",
  name: "Operator",
  description: "",
  scope: "tenant",
  system_protected: false,
  permissions: ["tenant.users.read", "tenant.users.update"],
  version: 2,
};

const makeUser = (overrides: Partial<UserIdentity>): UserIdentity => ({
  id: "u-1",
  tenant_id: "t-1",
  username: "member",
  display_name: "Member User",
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

describe("role dialogs", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  test("new role requires a name and submits trimmed values", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<CreateRoleModal open busy={false} onSubmit={onSubmit} onClose={() => undefined} />);

    const dialog = screen.getByRole("dialog", { name: "New role" });
    await user.click(within(dialog).getByRole("button", { name: "Create role" }));
    expect(onSubmit).not.toHaveBeenCalled();
    const name = within(dialog).getByLabelText(/^Role name/);
    await waitFor(() => expect(name).toHaveAttribute("aria-invalid", "true"));

    await user.type(name, "  Auditor  ");
    await user.type(within(dialog).getByLabelText(/^Description/), "Read-only reviewers");
    await user.click(within(dialog).getByRole("button", { name: "Create role" }));
    expect(onSubmit).toHaveBeenCalledWith({ name: "Auditor", description: "Read-only reviewers" });
  });

  test("assigning users is searchable and explains locked rows", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <AssignRoleUsersModal
        role={role}
        title="Assign users to Operator"
        users={[
          makeUser({ id: "u-1" }),
          makeUser({
            id: "u-2",
            username: "tadmin",
            display_name: "Tenant Admin User",
            role_codes: ["tenant_admin"],
          }),
        ]}
        loading={false}
        selected={new Set(["u-2"])}
        isLocked={(item) => Boolean(item.role_codes?.includes("tenant_admin"))}
        userName={(item) => item.display_name}
        busy={false}
        onChange={onChange}
        onSave={() => undefined}
        onClose={() => undefined}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Assign users to Operator" });
    const locked = within(dialog).getByRole("checkbox", { name: /Tenant Admin User/ });
    expect(locked).toBeChecked();
    expect(locked).toBeDisabled();
    expect(within(dialog).getByText(/protected role assignment/)).toBeInTheDocument();
    expect(within(dialog).getByText("1 user selected")).toBeInTheDocument();

    const search = within(dialog).getByRole("textbox", { name: "Search users" });
    await user.type(search, "member");
    expect(within(dialog).queryByText("Tenant Admin User")).toBeNull();
    await user.click(within(dialog).getByRole("checkbox", { name: "Member User" }));
    expect(onChange).toHaveBeenCalledWith(new Set(["u-2", "u-1"]));

    await user.clear(search);
    await user.type(search, "nobody");
    expect(within(dialog).getByText("No matching users")).toBeInTheDocument();
  });

  test("read-only permissions say why they cannot be edited", () => {
    render(
      <RolePermissionsModal
        role={{ ...role, system_protected: true }}
        title="Permissions for Operator"
        readOnlyReason="This is a protected built-in role."
        selectedCount={2}
        busy={false}
        onSave={() => undefined}
        onClose={() => undefined}
      >
        <div />
      </RolePermissionsModal>,
    );

    const dialog = screen.getByRole("dialog", { name: "Permissions for Operator" });
    expect(within(dialog).getByText("This is a protected built-in role.")).toBeInTheDocument();
    expect(within(dialog).getByText("2 permissions selected")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Save permissions" })).toBeNull();
  });

  test("deleting a role that is still assigned warns before the server refuses", () => {
    render(
      <DeleteRoleConfirm
        role={role}
        name="Operator"
        assignedCount={2}
        busy={false}
        onConfirm={() => undefined}
        onClose={() => undefined}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Delete role “Operator”?" });
    expect(
      within(dialog).getByText(/2 users still have this role, so the server will refuse/),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Delete role" })).toBeInTheDocument();
  });
});
