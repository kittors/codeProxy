/**
 * 平台共享资源：系统租户的代理与 AI 账号，由平台管理员授权给「全部租户」或「指定租户」。
 * 这里是代理和账号两边共用的类型与归一化。
 *
 * 能力字段 `sharing: {supported, manageable}` 由 GET /proxy-pool、GET /auth-files 返回。
 * 面板会自动更新到旧后端上（CliRelay 定时从 codeProxy 的最新 release 拉面板），旧后端没有这个
 * 字段，所以缺省一律当作「不支持」——所有共享界面都按它降级，不能假设前后端同版本。
 */

/** 资源共享给了谁。`all` 表示所有租户（含以后新建的租户），此时 tenantIds 为空。 */
export interface ResourceSharing {
  all: boolean;
  tenantIds: string[];
}

export interface ResourceSharingCapability {
  /** 后端支持平台共享（新后端且启用了数据库）。 */
  supported: boolean;
  /** 当前调用者能改共享设置：只有平台管理员处于系统租户视角时为 true。 */
  manageable: boolean;
}

/** 响应里点名的租户（覆盖了共享代理的、持有账号副本的、刚被切换的……）。 */
export interface TenantRef {
  id: string;
  name: string;
}

/** 写共享设置：`all` 与 `tenantIds` 都为空表示取消共享。 */
export interface ResourceSharingInput {
  all: boolean;
  tenantIds: string[];
}

export const NO_SHARING_CAPABILITY: ResourceSharingCapability = {
  supported: false,
  manageable: false,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const uniqueTrimmedStrings = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (trimmed) seen.add(trimmed);
  }
  return [...seen];
};

export const normalizeSharingCapability = (raw: unknown): ResourceSharingCapability => {
  if (!isRecord(raw) || raw.supported !== true) return NO_SHARING_CAPABILITY;
  return { supported: true, manageable: raw.manageable === true };
};

/** 原样的 `{all, tenant_ids}` → ResourceSharing；未共享（缺省、两者都空）返回 null。 */
export const normalizeResourceSharing = (raw: unknown): ResourceSharing | null => {
  if (!isRecord(raw)) return null;
  if (raw.all === true) return { all: true, tenantIds: [] };
  const tenantIds = uniqueTrimmedStrings(raw.tenant_ids ?? raw.tenantIds);
  return tenantIds.length > 0 ? { all: false, tenantIds } : null;
};

export const normalizeTenantRefs = (raw: unknown): TenantRef[] => {
  if (!Array.isArray(raw)) return [];
  const refs: TenantRef[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const id = typeof item.id === "string" ? item.id.trim() : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const name = typeof item.name === "string" && item.name.trim() ? item.name.trim() : id;
    refs.push({ id, name });
  }
  return refs;
};

/** 写接口的请求体。共享给全部租户时不再带具体租户：后端以 all 为准。 */
export const toSharingRequestBody = (input: ResourceSharingInput) => ({
  all: input.all,
  tenant_ids: input.all ? [] : uniqueTrimmedStrings(input.tenantIds),
});

/** 把归一化后的共享设置写回原样形状，便于就地更新列表里的条目。 */
export const toRawResourceSharing = (
  sharing: ResourceSharing | null,
): { all: boolean; tenant_ids: string[] } | undefined =>
  sharing ? { all: sharing.all, tenant_ids: [...sharing.tenantIds] } : undefined;
