import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { AuditLogsPage } from "../AuditLogsPage";

const auditLogs = vi.fn();
const auditLog = vi.fn();
const deleteAuditLog = vi.fn();
const clearAuditLogs = vi.fn();

vi.mock("@code-proxy/api-client", () => ({
  identityApi: {
    auditLogs: (...args: unknown[]) => auditLogs(...args),
    auditLog: (...args: unknown[]) => auditLog(...args),
    deleteAuditLog: (...args: unknown[]) => deleteAuditLog(...args),
    clearAuditLogs: (...args: unknown[]) => clearAuditLogs(...args),
  },
}));

vi.mock("@app/guards/PermissionGate", () => ({
  PermissionGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      if (!params) return key;
      return `${key}:${JSON.stringify(params)}`;
    },
    i18n: { language: "en" },
  }),
}));

vi.mock("@code-proxy/ui", async () => {
  const actual = await vi.importActual<typeof import("@code-proxy/ui")>("@code-proxy/ui");
  return {
    ...actual,
    useToast: () => ({ notify: vi.fn() }),
  };
});

describe("AuditLogsPage", () => {
  beforeEach(() => {
    auditLogs.mockReset();
    auditLog.mockReset();
    deleteAuditLog.mockReset();
    clearAuditLogs.mockReset();
    clearAuditLogs.mockResolvedValue({ deleted: 2 });
    auditLogs.mockResolvedValue({
      items: [
        {
          id: 11,
          tenant_id: "t-1",
          tenant_name: "Acme",
          tenant_slug: "acme",
          actor_kind: "user_session",
          actor_user_id: "u-1",
          actor_username: "alice",
          actor_display_name: "Alice",
          action: "user.create",
          resource_type: "user",
          resource_id: "u-2",
          result: "success",
          request_id: "req-1",
          created_at: "2026-07-13T10:00:00Z",
        },
        {
          id: 12,
          tenant_id: "t-1",
          tenant_name: "Acme",
          tenant_slug: "acme",
          actor_kind: "user_session",
          actor_user_id: "u-1",
          actor_username: "alice",
          actor_display_name: "Alice",
          action: "role.delete",
          resource_type: "role",
          resource_id: "r-9",
          result: "failed",
          request_id: "req-2",
          created_at: "2026-07-13T11:00:00Z",
        },
      ],
      total: 2,
      page: 1,
      size: 50,
    });
    auditLog.mockResolvedValue({
      id: 11,
      tenant_id: "t-1",
      tenant_name: "Acme",
      actor_kind: "user_session",
      actor_user_id: "u-1",
      actor_username: "alice",
      actor_display_name: "Alice",
      action: "user.create",
      resource_type: "user",
      resource_id: "u-2",
      result: "success",
      request_id: "req-1",
      created_at: "2026-07-13T10:00:00Z",
      changes: {
        call_chain: [
          { step: 1, layer: "http", name: "POST /v0/management/users" },
          {
            step: 2,
            layer: "handler",
            name: "POST /users",
            package: "internal/api/handlers/management",
          },
        ],
        project_method: {
          package: "internal/api/handlers/management",
          handler: "POST /users",
          route: "/users",
          resource: "users",
        },
      },
    });
  });

  test("renders actor tenant/user, result badges, and hides raw action column", async () => {
    render(<AuditLogsPage />);

    await waitFor(() => {
      expect(auditLogs).toHaveBeenCalledWith({ page: 1, size: 50 });
    });

    expect((await screen.findAllByText("Acme / Alice")).length).toBeGreaterThan(0);
    expect(screen.getByText("user · u-2")).toBeInTheDocument();
    expect(screen.getByText("identity_admin.result_success")).toBeInTheDocument();
    expect(screen.getByText("identity_admin.result_failed")).toBeInTheDocument();
    expect(screen.queryByText("user.create")).not.toBeInTheDocument();
    // Column headers should not include the raw "action" label.
    expect(
      screen.queryByRole("columnheader", { name: "identity_admin.action" }),
    ).not.toBeInTheDocument();
  });

  test("opens detail with call chain and project method", async () => {
    const user = userEvent.setup();
    render(<AuditLogsPage />);

    await waitFor(() => {
      expect(screen.getAllByText("Acme / Alice").length).toBeGreaterThan(0);
    });

    const viewButtons = screen.getAllByRole("button", {
      name: "identity_admin.view",
    });
    await user.click(viewButtons[0]!);

    await waitFor(() => {
      expect(auditLog).toHaveBeenCalledWith(11);
    });

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText("identity_admin.audit_log_detail_title"),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("POST /v0/management/users")).toBeInTheDocument();
    expect(
      within(dialog).getByText("internal/api/handlers/management · POST /users"),
    ).toBeInTheDocument();
  });

  test("clears all audit logs from header action", async () => {
    const user = userEvent.setup();
    render(<AuditLogsPage />);

    await waitFor(() => {
      expect(screen.getAllByText("Acme / Alice").length).toBeGreaterThan(0);
    });

    await user.click(
      screen.getByRole("button", { name: "identity_admin.clear_audit_logs" }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "identity_admin.clear_audit_logs_confirm_button",
      }),
    );

    await waitFor(() => {
      expect(clearAuditLogs).toHaveBeenCalledTimes(1);
    });
    expect(auditLogs).toHaveBeenLastCalledWith({ page: 1, size: 50 });
  });
});
