import {
  useCallback,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { useTranslation } from "react-i18next";
import { Copy, Share2 } from "lucide-react";
import {
  authFileSharingId,
  authFilesApi,
  normalizeTenantRefs,
  readAuthFileSharing,
  toRawResourceSharing,
  type AuthFileItem,
  type ResourceSharingCapability,
  type ResourceSharingInput,
} from "@code-proxy/api-client";
import {
  isRuntimeOnlyAuthFile,
  maskSensitiveIdentity,
  resolveAuthFileDisplayName,
} from "@code-proxy/domain";
import { Button, COLUMN_WIDTH, useToast, type DataTableColumn } from "@code-proxy/ui";
import {
  ResourceSharingModal,
  SharingNoticeBadge,
  SharingStatusBadge,
  TenantRefsBadge,
  commonResourceSharing,
  useSharingTenants,
} from "@features/resource-sharing";
import { AuthFilesScopeTabs, type AuthFilesScope } from "../components/SharedAuthFilesPanel";

/**
 * AI 账号页的平台共享：
 * - 系统租户视角：账号上的共享徽标、「N 个租户有副本」提示；平台管理员（manageable）还能在单个
 *   账号菜单、批量工具栏、表格的共享列里打开共享设置；
 * - 其它租户：自有账号与平台共享账号是同一上游账号时的「重复」提示，以及顶部「平台共享账号」切换。
 *
 * 一切以后端的 `sharing.supported` 为准：旧后端（面板会自动更新到旧后端上）没有这个字段，
 * 这里什么都不渲染，页面与以前完全相同。
 */
export function useAuthFilesSharing({
  files,
  setFiles,
  capability,
  sharedFiles,
  fileColumns,
  masked,
}: {
  files: AuthFileItem[];
  setFiles: Dispatch<SetStateAction<AuthFileItem[]>>;
  capability: ResourceSharingCapability;
  sharedFiles: AuthFileItem[];
  fileColumns: DataTableColumn<AuthFileItem>[];
  masked: boolean;
}) {
  const { t } = useTranslation();
  const { notify } = useToast();
  const manageable = capability.supported && capability.manageable;
  const tenants = useSharingTenants(manageable);
  const [targets, setTargets] = useState<AuthFileItem[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [scope, setScope] = useState<AuthFilesScope>("own");
  // 共享账号被收回（列表变空）时自动回到本租户账号。
  const activeScope: AuthFilesScope =
    scope === "shared" && sharedFiles.length > 0 ? "shared" : "own";

  const displayName = useCallback(
    (file: AuthFileItem) => {
      const name = resolveAuthFileDisplayName(file) || file.name;
      return masked ? maskSensitiveIdentity(name) : name;
    },
    [masked],
  );

  const openShareFiles = useCallback(
    (names: string[]) => {
      const wanted = new Set(names);
      // 虚拟账号（运行时生成、没有凭据文件）不能共享，批量里一并略过。
      const picked = files.filter((file) => wanted.has(file.name) && !isRuntimeOnlyAuthFile(file));
      if (picked.length > 0) setTargets(picked);
    },
    [files],
  );

  const saveSharing = useCallback(
    async (input: ResourceSharingInput) => {
      if (!targets) return;
      setSaving(true);
      try {
        const result = await authFilesApi.updateSharing({
          ids: targets.map(authFileSharingId),
          ...input,
        });
        const updated = new Set(result.ids);
        const raw = toRawResourceSharing(result.sharing);
        setFiles((prev) =>
          prev.map((file) =>
            updated.has(authFileSharingId(file)) ? { ...file, sharing: raw } : file,
          ),
        );
        notify({
          type: "success",
          message:
            targets.length > 1
              ? t("auth_files.sharing_saved_batch", { count: targets.length })
              : t("auth_files.sharing_saved", { name: displayName(targets[0]!) }),
        });
        setTargets(null);
      } catch (error) {
        notify({
          type: "error",
          message: error instanceof Error ? error.message : t("common.error"),
        });
      } finally {
        setSaving(false);
      }
    },
    [displayName, notify, setFiles, t, targets],
  );

  const renderSharingBadges = useCallback(
    (file: AuthFileItem): ReactNode | null => {
      if (!capability.supported) return null;
      const sharing = readAuthFileSharing(file);
      const copies = normalizeTenantRefs(file.tenant_copies);
      const duplicate = file.duplicates_shared === true;
      if (!sharing && copies.length === 0 && !duplicate) return null;
      return (
        <>
          <SharingStatusBadge sharing={sharing} tenantNames={tenants.names} />
          <TenantRefsBadge
            tenants={copies}
            label={t("auth_files.tenant_copies_badge", { count: copies.length })}
            lead={t("auth_files.tenant_copies_lead")}
            icon={<Copy size={11} aria-hidden="true" />}
            testId="auth-file-tenant-copies"
          />
          {duplicate ? (
            <SharingNoticeBadge
              tone="warning"
              label={t("auth_files.duplicates_shared_badge")}
              tooltip={t("auth_files.duplicates_shared_tooltip")}
              icon={<Copy size={11} aria-hidden="true" />}
              testId="auth-file-duplicates-shared"
            />
          ) : null}
        </>
      );
    },
    [capability.supported, t, tenants.names],
  );

  // 列表视图：在名称列后面插一列「共享」。非系统租户只有出现重复账号时才需要这一列。
  const showSharingColumn = useMemo(
    () =>
      capability.supported &&
      (manageable ||
        files.some(
          (file) =>
            readAuthFileSharing(file) !== null ||
            normalizeTenantRefs(file.tenant_copies).length > 0 ||
            file.duplicates_shared === true,
        )),
    [capability.supported, files, manageable],
  );
  const tableColumns = useMemo(() => {
    if (!showSharingColumn) return fileColumns;
    const column: DataTableColumn<AuthFileItem> = {
      key: "sharing",
      label: t("resource_sharing.column"),
      // 共享状态 + 副本提示 + 共享按钮，一行放得下。
      width: COLUMN_WIDTH.composite,
      render: (file) => {
        const badges = renderSharingBadges(file);
        const canShare = manageable && !isRuntimeOnlyAuthFile(file);
        if (!badges && !canShare) return <span className="text-xs text-ink-3">--</span>;
        return (
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            {badges ?? (
              <span className="text-xs text-ink-3">{t("resource_sharing.not_shared")}</span>
            )}
            {canShare ? (
              <Button
                variant="ghost"
                size="xs"
                aria-label={t("resource_sharing.share_file_label", { name: displayName(file) })}
                title={t("resource_sharing.share_file_label", { name: displayName(file) })}
                onClick={() => openShareFiles([file.name])}
              >
                <Share2 size={14} />
              </Button>
            ) : null}
          </div>
        );
      },
    };
    const next = [...fileColumns];
    const nameIndex = next.findIndex((item) => item.key === "name");
    next.splice(nameIndex >= 0 ? nameIndex + 1 : next.length, 0, column);
    return next;
  }, [
    displayName,
    fileColumns,
    manageable,
    openShareFiles,
    renderSharingBadges,
    showSharingColumn,
    t,
  ]);

  const { value: initialSharing, mixed } = useMemo(
    () => commonResourceSharing((targets ?? []).map((file) => readAuthFileSharing(file))),
    [targets],
  );

  const dialog = (
    <ResourceSharingModal
      open={targets !== null}
      kind="auth"
      resourceName={targets?.[0] ? displayName(targets[0]) : undefined}
      count={targets?.length ?? 1}
      value={initialSharing}
      mixed={mixed}
      tenants={tenants.tenants}
      tenantsLoading={tenants.loading}
      tenantsError={tenants.error}
      saving={saving}
      onSave={(input) => void saveSharing(input)}
      onClose={() => setTargets(null)}
    />
  );

  // 删除确认要点名：这几个账号共享给了其它租户，删掉它们那些租户也就用不了了。
  const countShared = useCallback(
    (names: string[]) => {
      if (!capability.supported) return 0;
      const wanted = new Set(names);
      return files.filter((file) => wanted.has(file.name) && readAuthFileSharing(file) !== null)
        .length;
    },
    [capability.supported, files],
  );

  const scopeSwitch =
    capability.supported && sharedFiles.length > 0 ? (
      <AuthFilesScopeTabs
        value={activeScope}
        onChange={setScope}
        ownCount={files.length}
        sharedCount={sharedFiles.length}
      />
    ) : null;

  return {
    scope: activeScope,
    scopeSwitch,
    renderSharingBadges,
    onShareFiles: manageable ? openShareFiles : undefined,
    tableColumns,
    countShared,
    dialog,
  };
}
