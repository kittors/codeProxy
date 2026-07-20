import { apiClient } from "../client/client";

export const IDENTITY_MENUS_UPDATED_EVENT = "identity-menus-updated";
/** Fired after tenant create / update / delete so shell switchers can refresh. */
export const IDENTITY_TENANTS_UPDATED_EVENT = "identity-tenants-updated";

function notifyTenantsUpdated() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(IDENTITY_TENANTS_UPDATED_EVENT));
  }
}

export interface TenantIdentity {
  id: string;
  slug: string;
  name: string;
  type: "system" | "standard";
  status: "active" | "suspended" | "disabled";
  effective_status: "active" | "suspended" | "disabled" | "expired";
  expires_at: string | null;
  description: string;
  access_token_ttl_seconds?: number;
  refresh_token_ttl_seconds?: number;
  version: number;
  created_at: string;
  updated_at: string;
}

export type MenuType = "directory" | "menu" | "button" | "embed" | "link";

export interface MenuIdentity {
  code: string;
  parent_code: string;
  type: MenuType;
  path: string;
  component: string;
  link_url: string;
  label_key: string;
  title: string;
  icon: string;
  permission_code: string;
  sort_order: number;
  visible: boolean;
  enabled: boolean;
  badge_type: string;
  badge_content: string;
  hide_menu: boolean;
  system_protected: boolean;
  version: number;
}

export type MenuWriteBody = {
  code?: string;
  parent_code: string;
  type: MenuType;
  path: string;
  component: string;
  link_url: string;
  label_key: string;
  title: string;
  icon: string;
  permission_code: string;
  sort_order: number;
  visible: boolean;
  enabled: boolean;
  badge_type: string;
  badge_content: string;
  hide_menu: boolean;
  version?: number;
};

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
  menus?: MenuIdentity[];
  permissions: string[];
  platform_admin: boolean;
  session_id?: string;
  session_expires_at?: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token?: string;
  token_type: "Bearer";
  expires_at: string;
  refresh_expires_at?: string;
  principal: ManagementPrincipal;
}

export interface PermissionIdentity {
  code: string;
  name: string;
  scope: "platform" | "tenant";
  resource: string;
  action: string;
  menu_code: string;
  sensitive: boolean;
}

export interface AuditLogCallChainStep {
  step?: number;
  layer?: string;
  name?: string;
  detail?: string;
  package?: string;
  method?: string;
  resource?: string;
  resource_id?: string;
  [key: string]: unknown;
}

export interface AuditLogProjectMethod {
  package?: string;
  handler?: string;
  method?: string;
  resource?: string;
  route?: string;
  [key: string]: unknown;
}

export interface AuditLogChanges {
  http?: {
    method?: string;
    path?: string;
    status?: number;
  };
  permission?: string;
  call_chain?: AuditLogCallChainStep[];
  project_method?: AuditLogProjectMethod;
  [key: string]: unknown;
}

export interface AuditLogIdentity {
  id: number;
  tenant_id: string | null;
  tenant_name?: string;
  tenant_slug?: string;
  actor_kind: string;
  actor_user_id: string | null;
  actor_username?: string;
  actor_display_name?: string;
  action: string;
  resource_type: string;
  resource_id: string;
  result: string;
  request_id: string;
  changes?: AuditLogChanges;
  created_at: string;
}

export interface AuditLogsResponse {
  items: AuditLogIdentity[];
  total: number;
  page: number;
  size: number;
}

export const identityApi = {
  login: (body: { username: string; password: string; remember_me: boolean }) =>
    apiClient.post<LoginResponse>("/../auth/login", body),
  refresh: (refresh_token: string) =>
    apiClient.post<LoginResponse>("/../auth/refresh", { refresh_token }),
  me: () => apiClient.get<{ principal: ManagementPrincipal }>("/../auth/me"),
  logout: () => apiClient.post<void>("/../auth/logout"),
  changePassword: (body: { current_password: string; new_password: string }) =>
    apiClient.put<void>("/../auth/password", body),
  tenants: () => apiClient.get<{ items: TenantIdentity[] }>("/tenants"),
  createTenant: async (body: {
    name: string;
    description: string;
    expires_at: string;
    admin_username: string;
    admin_display_name: string;
    admin_password: string;
  }) => {
    const result = await apiClient.post<{ tenant: TenantIdentity; admin: UserIdentity }>(
      "/tenants",
      body,
    );
    notifyTenantsUpdated();
    return result;
  },
  updateTenant: async (
    id: string,
    body: {
      name?: string;
      description?: string;
      status?: string;
      expires_at?: string;
      access_token_ttl_seconds?: number;
      refresh_token_ttl_seconds?: number;
      version: number;
    },
  ) => {
    const tenant = await apiClient.patch<TenantIdentity>(
      `/tenants/${encodeURIComponent(id)}`,
      body,
    );
    notifyTenantsUpdated();
    return tenant;
  },
  deleteTenant: async (id: string, version: number) => {
    const tenant = await apiClient.delete<TenantIdentity>(`/tenants/${encodeURIComponent(id)}`, {
      version,
    });
    notifyTenantsUpdated();
    return tenant;
  },
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
  menus: () => apiClient.get<{ items: MenuIdentity[] }>("/menus"),
  createMenu: async (body: MenuWriteBody) => {
    const menu = await apiClient.post<MenuIdentity>("/menus", body);
    if (typeof window !== "undefined")
      window.dispatchEvent(new Event(IDENTITY_MENUS_UPDATED_EVENT));
    return menu;
  },
  updateMenu: async (code: string, body: MenuWriteBody) => {
    const menu = await apiClient.patch<MenuIdentity>(`/menus/${encodeURIComponent(code)}`, body);
    if (typeof window !== "undefined")
      window.dispatchEvent(new Event(IDENTITY_MENUS_UPDATED_EVENT));
    return menu;
  },
  deleteMenu: async (code: string, version: number) => {
    await apiClient.delete<void>(`/menus/${encodeURIComponent(code)}`, { version });
    if (typeof window !== "undefined")
      window.dispatchEvent(new Event(IDENTITY_MENUS_UPDATED_EVENT));
  },
  permissions: () => apiClient.get<{ items: PermissionIdentity[] }>("/permissions"),
  createRole: (body: { name: string; description: string; permissions: string[] }) =>
    apiClient.post<RoleIdentity>("/roles", body),
  auditLogs: (params?: { page?: number; size?: number }) =>
    apiClient.get<AuditLogsResponse>("/audit-logs", {
      params: {
        page: params?.page ?? 1,
        size: params?.size ?? 50,
      },
    }),
  auditLog: (id: number) =>
    apiClient.get<AuditLogIdentity>(`/audit-logs/${encodeURIComponent(String(id))}`),
  deleteAuditLog: (id: number) =>
    apiClient.delete<void>(`/audit-logs/${encodeURIComponent(String(id))}`),
  deleteRole: (id: string) => apiClient.delete<void>(`/roles/${encodeURIComponent(id)}`),
  replaceRolePermissions: (id: string, permissions: string[], version: number) =>
    apiClient.put<RoleIdentity>(`/roles/${encodeURIComponent(id)}/permissions`, {
      permissions,
      version,
    }),
  replaceRoleUsers: (id: string, user_ids: string[], version: number) =>
    apiClient.put<void>(`/roles/${encodeURIComponent(id)}/users`, { user_ids, version }),
};
