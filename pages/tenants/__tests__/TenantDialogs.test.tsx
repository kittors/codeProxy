import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { TenantIdentity } from "@code-proxy/api-client";
import i18n from "@code-proxy/i18n";
import { CreateTenantModal, type CreateTenantForm } from "../CreateTenantModal";
import { EditTenantModal } from "../EditTenantModal";
import { DisableTenantConfirm, TenantDetailsModal } from "../TenantDialogs";

const tenant: TenantIdentity = {
  id: "t-acme",
  slug: "tenant-acme",
  name: "Acme Team",
  type: "standard",
  status: "active",
  effective_status: "active",
  expires_at: "2030-01-01T00:00:00Z",
  description: "Primary tenant",
  access_token_ttl_seconds: 43200,
  refresh_token_ttl_seconds: 2592000,
  version: 3,
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-02T00:00:00Z",
};

const pickerLabels = {
  picker: "Picker",
  open: "Open picker",
  previousMonth: "Previous month",
  nextMonth: "Next month",
  today: "Today",
  clear: "Clear",
  hour: "Hour",
  minute: "Minute",
};

describe("tenant dialogs", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  test("new tenant separates tenant details from its first administrator", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async (_form: CreateTenantForm): Promise<string | null> => null);
    render(
      <CreateTenantModal
        open
        busy={false}
        locale="en"
        dateTimePickerLabels={pickerLabels}
        onSubmit={onSubmit}
        onClose={() => undefined}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "New tenant" });
    expect(within(dialog).getByRole("heading", { name: "Tenant" })).toBeInTheDocument();
    expect(
      within(dialog).getByRole("heading", { name: "First administrator" }),
    ).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText("Admin username", { exact: true }), "bad name");
    await user.click(within(dialog).getByRole("button", { name: "Create tenant" }));

    expect(onSubmit).not.toHaveBeenCalled();
    // 焦点落在第一处错误（名称）；日期选择器和其他输入框一样标红并带上错误说明。
    await waitFor(() =>
      expect(within(dialog).getByLabelText("Name", { exact: true })).toHaveFocus(),
    );
    const expiry = within(dialog).getByRole("textbox", { name: "Expires at" });
    expect(expiry).toHaveAttribute("aria-invalid", "true");
    expect(expiry).toHaveAccessibleDescription(/Required/);
    const username = within(dialog).getByLabelText("Admin username", { exact: true });
    await waitFor(() => expect(username).toHaveAttribute("aria-invalid", "true"));
    expect(username).toHaveAccessibleDescription(/Use only letters, digits and \. _ - @/);
  });

  test("edit tenant converts TTL seconds and enforces the server's range", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <EditTenantModal
        tenant={tenant}
        busy={false}
        locale="en"
        onSubmit={onSubmit}
        onClose={() => undefined}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Edit tenant" });
    const access = within(dialog).getByLabelText(/^Access token lifetime \(seconds\)/);
    expect(access).toHaveAccessibleDescription(/= 12 hours/);

    await user.clear(access);
    await user.type(access, "59");
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));
    expect(onSubmit).not.toHaveBeenCalled();
    await waitFor(() => expect(access).toHaveAttribute("aria-invalid", "true"));
    expect(access).toHaveAccessibleDescription(/Enter a whole number from 60 to 2592000/);

    // 从「正常」改成「已暂停」时提醒会撤销全部登录。
    await user.click(within(dialog).getByRole("radio", { name: /^Suspended/ }));
    expect(
      within(dialog).getByText(/every account in this tenant is signed out/),
    ).toBeInTheDocument();

    await user.clear(access);
    await user.type(access, "3600");
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));
    expect(onSubmit).toHaveBeenCalledWith({
      name: "Acme Team",
      description: "Primary tenant",
      status: "suspended",
      access_token_ttl_seconds: 3600,
      refresh_token_ttl_seconds: 2592000,
    });
  });

  test("tenant details use a copyable slug and readable lifetimes", () => {
    render(
      <TenantDetailsModal
        tenant={tenant}
        name="Acme Team"
        statusLabel={() => "Active"}
        locale="en"
        onClose={() => undefined}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Acme Team" });
    expect(within(dialog).getByText("tenant-acme")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Copy" })).toBeInTheDocument();
    expect(within(dialog).getByText("30 days")).toBeInTheDocument();
  });

  test("disabling a tenant is a recoverable warning", () => {
    render(
      <DisableTenantConfirm
        tenant={tenant}
        name="Acme Team"
        busy={false}
        onConfirm={() => undefined}
        onClose={() => undefined}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Disable tenant “Acme Team”?" });
    expect(within(dialog).getByText("tenant-acme")).toBeInTheDocument();
    expect(within(dialog).getByText(/set the status back to Active/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Disable tenant" })).toBeInTheDocument();
  });
});
