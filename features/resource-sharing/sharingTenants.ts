import type { ResourceSharing, TenantIdentity } from "@code-proxy/api-client";

/** 共享弹窗与徽标里用到的租户信息。 */
export interface SharingTenant {
  id: string;
  name: string;
  /** effective_status：active / suspended / disabled / expired。 */
  status: string;
  /** 系统租户是共享资源的所有者，不能被授权，不出现在可选列表里。 */
  system: boolean;
}

export const toSharingTenants = (items: readonly TenantIdentity[]): SharingTenant[] =>
  items
    .filter((item) => Boolean(item?.id))
    .map((item) => ({
      id: item.id,
      name: item.name?.trim() || item.slug || item.id,
      status: item.effective_status || item.status || "active",
      system: item.type === "system",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

/** 已停用、暂停或过期的租户：仍可授权（恢复后即可使用），列表里标灰。 */
export const isSharingTenantInactive = (tenant: Pick<SharingTenant, "status">): boolean =>
  tenant.status !== "active";

export const sharingTenantNames = (tenants: readonly SharingTenant[]): Map<string, string> =>
  new Map(tenants.map((tenant) => [tenant.id, tenant.name]));

/** 租户 ID → 名称；目录里查不到的按 ID 显示，不能悄悄丢掉（否则这条授权在界面上看不见）。 */
export const resolveTenantNames = (
  ids: readonly string[],
  names?: ReadonlyMap<string, string>,
): string[] => ids.map((id) => names?.get(id) || id);

/** 两份共享设置是否相同（租户顺序无关）。 */
export const sameResourceSharing = (
  left: ResourceSharing | null,
  right: ResourceSharing | null,
): boolean => {
  if (!left || !right) return left === right;
  if (left.all || right.all) return left.all === right.all;
  if (left.tenantIds.length !== right.tenantIds.length) return false;
  const ids = new Set(left.tenantIds);
  return right.tenantIds.every((id) => ids.has(id));
};

/**
 * 批量编辑时的初始值：所有资源设置相同就用它，否则标记为不一致（弹窗提示保存后会统一）。
 */
export const commonResourceSharing = (
  values: readonly (ResourceSharing | null)[],
): { value: ResourceSharing | null; mixed: boolean } => {
  const [first = null, ...rest] = values;
  const mixed = rest.some((value) => !sameResourceSharing(first, value));
  return { value: mixed ? null : first, mixed };
};

/** 「土豆服务器、无境科技和 X」这样的自然语言列举，用在 toast 与确认文案里。 */
export const formatTenantList = (names: readonly string[], language?: string): string => {
  try {
    return new Intl.ListFormat(language || undefined, { type: "conjunction" }).format(names);
  } catch {
    return names.join(", ");
  }
};
