import { apiClient } from "../client/client";

export interface TenantIdentity {
  id: string;
  slug: string;
  name: string;
  type: "system" | "standard";
  status: "active" | "suspended" | "disabled";
  effective_status: "active" | "suspended" | "disabled" | "expired";
  expires_at: string | null;
  description: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface UserIdentity {
  id: string;
  tenant_id: string;
  username: string;
  display_name: string;
  status: "active" | "disabled" | "locked";
  must_change_password: boolean;
  last_login_at: string | null;
  role_ids: string[];
  role_codes: string[];
  version: number;
  created_at: string;
  updated_at: string;
}

export interface RoleIdentity {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  description: string;
  scope: "platform" | "tenant";
  system_protected: boolean;
  permissions: string[];
  version: number;
}

export interface ManagementPrincipal {
  kind: "user_session" | "service_credential";
  user: UserIdentity;
  home_tenant: TenantIdentity;
  effective_tenant: TenantIdentity;
  roles: RoleIdentity[];
  permissions: string[];
  platform_admin: boolean;
  session_id?: string;
  session_expires_at?: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: "Bearer";
  expires_at: string;
  principal: ManagementPrincipal;
}

export interface PermissionIdentity {
  code: string;
  name: string;
  scope: "platform" | "tenant";
  resource: string;
  action: string;
  sensitive: boolean;
}

export interface AuditLogIdentity {
  id: number;
  tenant_id: string | null;
  actor_kind: string;
  actor_user_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string;
  result: string;
  request_id: string;
  created_at: string;
}

export const identityApi = {
  login: (body: { username: string; password: string; remember_me: boolean }) =>
    apiClient.post<LoginResponse>("/../auth/login", body),
  me: () => apiClient.get<{ principal: ManagementPrincipal }>("/../auth/me"),
  logout: () => apiClient.post<void>("/../auth/logout"),
  changePassword: (body: { current_password: string; new_password: string }) =>
    apiClient.put<void>("/../auth/password", body),
  tenants: () => apiClient.get<{ items: TenantIdentity[] }>("/tenants"),
  createTenant: (body: {
    slug: string;
    name: string;
    description: string;
    expires_at: string;
    admin_username: string;
    admin_display_name: string;
    admin_password: string;
  }) => apiClient.post<{ tenant: TenantIdentity; admin: UserIdentity }>("/tenants", body),
  updateTenant: (
    id: string,
    body: {
      name?: string;
      description?: string;
      status?: string;
      expires_at?: string;
      version: number;
    },
  ) => apiClient.patch<TenantIdentity>(`/tenants/${encodeURIComponent(id)}`, body),
  deleteTenant: (id: string, version: number) =>
    apiClient.delete<TenantIdentity>(`/tenants/${encodeURIComponent(id)}`, {
      version,
    }),
  users: () => apiClient.get<{ items: UserIdentity[] }>("/users"),
  createUser: (body: {
    username: string;
    display_name: string;
    password: string;
    role_ids: string[];
  }) => apiClient.post<UserIdentity>("/users", body),
  resetPassword: (id: string, password: string) =>
    apiClient.post<void>(`/users/${encodeURIComponent(id)}/reset-password`, {
      password,
    }),
  updateUser: (id: string, body: { status: string; version: number }) =>
    apiClient.patch<UserIdentity>(`/users/${encodeURIComponent(id)}`, body),
  assignUserRoles: (id: string, role_ids: string[]) =>
    apiClient.put<void>(`/users/${encodeURIComponent(id)}/roles`, { role_ids }),
  deleteUser: (id: string) => apiClient.delete<void>(`/users/${encodeURIComponent(id)}`),
  roles: () => apiClient.get<{ items: RoleIdentity[] }>("/roles"),
  permissions: () => apiClient.get<{ items: PermissionIdentity[] }>("/permissions"),
  createRole: (body: { code: string; name: string; description: string; permissions: string[] }) =>
    apiClient.post<RoleIdentity>("/roles", body),
  auditLogs: () => apiClient.get<{ items: AuditLogIdentity[] }>("/audit-logs"),
  deleteRole: (id: string) => apiClient.delete<void>(`/roles/${encodeURIComponent(id)}`),
  replaceRolePermissions: (id: string, permissions: string[], version: number) =>
    apiClient.put<RoleIdentity>(`/roles/${encodeURIComponent(id)}/permissions`, {
      permissions,
      version,
    }),
};
