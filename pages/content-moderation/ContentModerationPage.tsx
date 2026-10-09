import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Activity,
  FlaskConical,
  Link2,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import {
  contentModerationApi,
  type ContentModerationProfileView,
  type CreateContentModerationProfileInput,
  type PatchContentModerationProfileInput,
} from "@code-proxy/api-client";
import {
  Button,
  COLUMN_WIDTH,
  Callout,
  Card,
  ConfirmModal,
  DataTable,
  EmptyState,
  TABLE_ROW_ACTIONS_COLUMN,
  TableRowActions,
  ToggleSwitch,
  useToast,
  type DataTableColumn,
} from "@code-proxy/ui";
import { useOptionalAuth } from "@app/providers/AuthProvider";
import { ModerationChannelPickerModal } from "./components/ModerationChannelPickerModal";
import { ModerationMetricsModal } from "./components/ModerationMetricsModal";
import { ModerationTestModal } from "./components/ModerationTestModal";
import { ProfileEditorModal } from "./components/ProfileEditorModal";

const bindingCount = (profile: ContentModerationProfileView) =>
  Object.values(profile.binding_counts ?? {}).reduce((sum, count) => sum + (count ?? 0), 0);

const isPatchProfileInput = (
  input: CreateContentModerationProfileInput | PatchContentModerationProfileInput,
): input is PatchContentModerationProfileInput => "version" in input;

export function ContentModerationPage() {
  const { t } = useTranslation();
  const { notify } = useToast();
  const auth = useOptionalAuth();
  const canWrite = auth?.can("content_moderation.write") ?? true;
  const canTest = auth?.can("content_moderation.test") ?? true;
  const [profiles, setProfiles] = useState<ContentModerationProfileView[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modeUpdatingId, setModeUpdatingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorProfile, setEditorProfile] = useState<ContentModerationProfileView | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ContentModerationProfileView | null>(null);
  const [pickerProfile, setPickerProfile] = useState<ContentModerationProfileView | null>(null);
  const [testProfile, setTestProfile] = useState<ContentModerationProfileView | null>(null);
  const [metricsOpen, setMetricsOpen] = useState(false);

  const loadProfiles = useCallback(async () => {
    setLoading(true);
    try {
      setProfiles(await contentModerationApi.listProfiles());
    } catch (error) {
      notify({
        type: "error",
        message:
          error instanceof Error ? error.message : t("content_moderation.profiles_load_failed"),
      });
    } finally {
      setLoading(false);
    }
  }, [notify, t]);

  useEffect(() => {
    void loadProfiles();
  }, [loadProfiles]);

  const openCreate = () => {
    setEditorProfile(null);
    setEditorOpen(true);
  };

  const openEdit = (profile: ContentModerationProfileView) => {
    setEditorProfile(profile);
    setEditorOpen(true);
  };

  const saveProfile = async (
    input: CreateContentModerationProfileInput | PatchContentModerationProfileInput,
  ) => {
    setSaving(true);
    try {
      let saved: ContentModerationProfileView;
      if (isPatchProfileInput(input)) {
        if (!editorProfile) return;
        saved = await contentModerationApi.patchProfile(editorProfile.id, input);
      } else {
        saved = await contentModerationApi.createProfile(input);
      }
      setProfiles((current) => {
        const exists = current.some((profile) => profile.id === saved.id);
        return exists
          ? current.map((profile) => (profile.id === saved.id ? saved : profile))
          : [...current, saved];
      });
      setEditorOpen(false);
      setEditorProfile(null);
      notify({ type: "success", message: t("content_moderation.profile_saved") });
    } catch (error) {
      notify({
        type: "error",
        message:
          error instanceof Error ? error.message : t("content_moderation.profile_save_failed"),
      });
    } finally {
      setSaving(false);
    }
  };

  const deleteProfile = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await contentModerationApi.deleteProfile(deleteTarget.id);
      setProfiles((current) => current.filter((profile) => profile.id !== deleteTarget.id));
      setDeleteTarget(null);
      notify({ type: "success", message: t("content_moderation.profile_deleted") });
    } catch (error) {
      notify({
        type: "error",
        message:
          error instanceof Error ? error.message : t("content_moderation.profile_delete_failed"),
      });
    } finally {
      setDeleting(false);
    }
  };

  const updateProfileMode = useCallback(
    async (profile: ContentModerationProfileView, enabled: boolean) => {
      if (enabled && profile.keyword_mode !== "keyword_only" && !profile.api_key_configured) {
        notify({
          type: "error",
          message: t("content_moderation.enable_api_key_required"),
        });
        return;
      }

      setModeUpdatingId(profile.id);
      try {
        const saved = await contentModerationApi.patchProfile(profile.id, {
          mode: enabled ? "pre_block" : "off",
          version: profile.version,
        });
        setProfiles((current) => current.map((item) => (item.id === saved.id ? saved : item)));
        notify({ type: "success", message: t("content_moderation.profile_mode_updated") });
      } catch (error) {
        notify({
          type: "error",
          message:
            error instanceof Error
              ? error.message
              : t("content_moderation.profile_mode_update_failed"),
        });
        await loadProfiles();
      } finally {
        setModeUpdatingId(null);
      }
    },
    [loadProfiles, notify, t],
  );

  const columns = useMemo<DataTableColumn<ContentModerationProfileView>[]>(
    () => [
      {
        key: "name",
        label: t("content_moderation.profile_name"),
        width: COLUMN_WIDTH.badgeGroup,
        cellClassName: "font-medium text-ink",
        render: (profile) => profile.name,
      },
      {
        key: "mode",
        label: t("content_moderation.enabled"),
        width: COLUMN_WIDTH.toggle,
        render: (profile) => {
          const enabled = profile.mode === "pre_block";
          return (
            <div className="flex items-center gap-2.5">
              <ToggleSwitch
                checked={enabled}
                disabled={!canWrite || modeUpdatingId !== null}
                ariaLabel={t("content_moderation.toggle_enabled", { name: profile.name })}
                onCheckedChange={(next) => void updateProfileMode(profile, next)}
              />
              <span className="text-xs text-ink-2">
                {enabled
                  ? t("content_moderation.mode_pre_block")
                  : t("content_moderation.mode_off")}
              </span>
            </div>
          );
        },
      },
      {
        key: "method",
        label: t("content_moderation.moderation_method"),
        width: COLUMN_WIDTH.badgeGroup,
        cellClassName: "text-ink-2",
        render: (profile) => t(`content_moderation.keyword_mode_${profile.keyword_mode}`),
      },
      {
        key: "backend",
        label: t("content_moderation.backend"),
        width: COLUMN_WIDTH.badgeGroup,
        render: (profile) => (
          <span className="rounded-full bg-ink/[0.05] px-2.5 py-1 text-xs font-medium text-ink-2 dark:bg-white/[0.07]">
            {t(`content_moderation.backend_${profile.backend}`)}
          </span>
        ),
      },
      {
        key: "endpoint",
        label: t("content_moderation.endpoint_model"),
        width: "w-[240px] min-w-[240px]",
        render: (profile) => (
          <div className="min-w-0 text-xs">
            <p className="truncate font-mono text-ink-2">
              {profile.base_url}
            </p>
            <p className="mt-1 truncate text-ink-3">{profile.model}</p>
          </div>
        ),
      },
      {
        key: "apiKey",
        label: t("content_moderation.api_key"),
        width: COLUMN_WIDTH.name,
        render: (profile) =>
          profile.api_key_configured ? (
            <span className="font-mono text-xs text-ink-2 colorful:text-emerald-700 colorful:dark:text-emerald-200">
              {profile.api_key_masked ?? "****"}
            </span>
          ) : (
            <span className="text-xs text-ink-3">{t("content_moderation.not_configured")}</span>
          ),
      },
      {
        key: "bindings",
        label: t("content_moderation.bindings"),
        width: COLUMN_WIDTH.badgeStacked,
        render: (profile) => (
          <div className="text-xs text-ink-2">
            <p>{t("content_moderation.binding_total", { count: bindingCount(profile) })}</p>
            <p className="mt-1 text-ink-3">
              {t("content_moderation.binding_breakdown", {
                auth: profile.binding_counts.auth_file ?? 0,
                keys: profile.binding_counts.provider_key ?? 0,
                providers: profile.binding_counts.provider ?? 0,
              })}
            </p>
          </div>
        ),
      },
      {
        key: "updated",
        label: t("content_moderation.updated_at"),
        width: COLUMN_WIDTH.timestamp,
        render: (profile) => (
          <span className="text-xs tabular-nums text-ink-2">
            {new Intl.DateTimeFormat(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(profile.updated_at))}
          </span>
        ),
      },
      {
        key: "actions",
        label: t("content_moderation.actions"),
        ...TABLE_ROW_ACTIONS_COLUMN,
        render: (profile) => (
          <TableRowActions
            maxInline={5}
            align="start"
            moreLabel={t("content_moderation.more_actions")}
            actions={[
              {
                key: "metrics",
                label: t("content_moderation.view_status"),
                icon: <Activity size={15} />,
                onClick: () => setMetricsOpen(true),
              },
              {
                key: "channels",
                label: t("content_moderation.manage_channels"),
                icon: <Link2 size={15} />,
                onClick: () => setPickerProfile(profile),
                visible: canWrite,
              },
              {
                key: "test",
                label: t("content_moderation.test_profile"),
                icon: <FlaskConical size={15} />,
                onClick: () => setTestProfile(profile),
                visible: canTest,
              },
              {
                key: "edit",
                label: t("content_moderation.edit_profile"),
                icon: <Pencil size={15} />,
                onClick: () => openEdit(profile),
                visible: canWrite,
              },
              {
                key: "delete",
                label: t("content_moderation.delete_profile"),
                icon: <Trash2 size={15} />,
                onClick: () => setDeleteTarget(profile),
                destructive: true,
                visible: canWrite,
              },
            ]}
          />
        ),
      },
    ],
    [canTest, canWrite, modeUpdatingId, t, updateProfileMode],
  );

  return (
    <div data-page-fill="always" className="flex flex-1 flex-col">
      {/* 外壳内容区就是页面面板：这里是页面分区（flat），不再包一张大卡。 */}
      <Card
        flat
        className="md:flex md:min-h-0 md:flex-1 md:flex-col"
        bodyClassName="md:flex md:min-h-0 md:flex-1 md:flex-col"
        title={t("content_moderation.title")}
        description={t("content_moderation.description")}
        actions={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void loadProfiles()}
              disabled={loading}
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              {t("common.refresh")}
            </Button>
            {canWrite ? (
              <Button size="sm" variant="primary" onClick={openCreate}>
                <Plus size={14} />
                {t("content_moderation.create_profile")}
              </Button>
            ) : null}
          </div>
        }
        loading={loading}
      >
        {profiles.length === 0 ? (
          <EmptyState
            title={t("content_moderation.empty_title")}
            description={t("content_moderation.empty_description")}
            icon={<ShieldCheck size={32} />}
          />
        ) : (
          <DataTable<ContentModerationProfileView>
            tableId="content-moderation-profiles"
            rows={profiles}
            columns={columns}
            rowKey={(profile) => profile.id}
            loading={loading}
            virtualize={false}
            minWidth="min-w-[1280px]"
            height="h-[calc(100dvh-260px)] md:h-auto md:flex-1"
            minHeight="min-h-[320px] md:min-h-0"
            caption={t("content_moderation.table_caption")}
            emptyText={t("content_moderation.empty_title")}
            showAllLoadedMessage={false}
          />
        )}
      </Card>

      <ProfileEditorModal
        open={editorOpen}
        profile={editorProfile}
        saving={saving}
        onClose={() => {
          if (saving) return;
          setEditorOpen(false);
          setEditorProfile(null);
        }}
        onSave={saveProfile}
      />

      <ModerationChannelPickerModal
        open={pickerProfile !== null}
        profile={pickerProfile}
        profiles={profiles}
        onClose={() => setPickerProfile(null)}
        onBindingsChanged={() => void loadProfiles()}
      />

      <ModerationTestModal profile={testProfile} onClose={() => setTestProfile(null)} />

      <ModerationMetricsModal open={metricsOpen} onClose={() => setMetricsOpen(false)} />

      <ConfirmModal
        open={deleteTarget !== null}
        title={t("content_moderation.delete_profile_title", { name: deleteTarget?.name ?? "" })}
        description={t("content_moderation.delete_lead")}
        subject={
          deleteTarget ? (
            <span className="flex min-w-0 items-center justify-between gap-3">
              <span className="truncate font-medium">{deleteTarget.name}</span>
              <span className="shrink-0 text-xs text-ink-3">
                {t(`content_moderation.backend_${deleteTarget.backend}`)} ·{" "}
                {t(`content_moderation.keyword_mode_${deleteTarget.keyword_mode}`)}
              </span>
            </span>
          ) : null
        }
        consequences={[t("content_moderation.delete_consequence_settings")]}
        confirmText={t("content_moderation.delete_confirm")}
        busy={deleting}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void deleteProfile()}
      >
        {/* 服务端拒绝删除仍有渠道绑定的配置：提前说清楚，并指向能解绑的地方。 */}
        {deleteTarget && bindingCount(deleteTarget) > 0 ? (
          <Callout tone="warning">
            {t("content_moderation.delete_blocked_bindings", {
              count: bindingCount(deleteTarget),
            })}
          </Callout>
        ) : null}
      </ConfirmModal>
    </div>
  );
}
