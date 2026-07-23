import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Activity, FlaskConical, Link2, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import {
  contentModerationApi,
  type ContentModerationProfileView,
  type CreateContentModerationProfileInput,
  type PatchContentModerationProfileInput,
} from "@code-proxy/api-client";
import {
  Button,
  Card,
  ConfirmModal,
  DataTable,
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
        width: "w-[220px] min-w-[220px]",
        render: (profile) => (
          <div className="min-w-0">
            <p className="truncate font-semibold text-slate-900 dark:text-white">{profile.name}</p>
            <p className="mt-0.5 truncate font-mono text-xs text-slate-500 dark:text-white/50">
              {profile.id}
            </p>
          </div>
        ),
      },
      {
        key: "mode",
        label: t("content_moderation.enabled"),
        width: "w-40 min-w-40",
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
              <span className="text-xs text-slate-600 dark:text-white/60">
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
        width: "w-[200px] min-w-[200px]",
        render: (profile) => t(`content_moderation.keyword_mode_${profile.keyword_mode}`),
      },
      {
        key: "endpoint",
        label: t("content_moderation.endpoint_model"),
        width: "w-[280px] min-w-[280px]",
        render: (profile) => (
          <div className="min-w-0 text-xs">
            <p className="truncate font-mono text-slate-700 dark:text-white/75">
              {profile.base_url}
            </p>
            <p className="mt-1 truncate text-slate-500 dark:text-white/50">{profile.model}</p>
          </div>
        ),
      },
      {
        key: "apiKey",
        label: t("content_moderation.api_key"),
        width: "w-36 min-w-36",
        render: (profile) =>
          profile.api_key_configured ? (
            <span className="font-mono text-xs text-emerald-700 dark:text-emerald-200">
              {profile.api_key_masked ?? "****"}
            </span>
          ) : (
            <span className="text-xs text-slate-400 dark:text-white/40">
              {t("content_moderation.not_configured")}
            </span>
          ),
      },
      {
        key: "bindings",
        label: t("content_moderation.bindings"),
        width: "w-40 min-w-40",
        render: (profile) => (
          <div className="text-xs text-slate-700 dark:text-white/70">
            <p>{t("content_moderation.binding_total", { count: bindingCount(profile) })}</p>
            <p className="mt-1 text-slate-500 dark:text-white/50">
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
        width: "w-44 min-w-44",
        render: (profile) => (
          <span className="text-xs tabular-nums text-slate-600 dark:text-white/60">
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
    <section className="flex min-h-0 flex-1 flex-col gap-5 md:h-[calc(100dvh-112px)] md:overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">
            {t("content_moderation.title")}
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-white/65">
            {t("content_moderation.description")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" onClick={() => void loadProfiles()} disabled={loading}>
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            {t("common.refresh")}
          </Button>
          {canWrite ? (
            <Button size="sm" variant="primary" onClick={openCreate}>
              <Plus size={15} />
              {t("content_moderation.create_profile")}
            </Button>
          ) : null}
        </div>
      </div>

      <Card
        className="overflow-hidden md:flex md:min-h-0 md:flex-1 md:flex-col"
        bodyClassName="md:flex md:min-h-0 md:flex-1 md:flex-col"
        loading={loading && profiles.length === 0}
      >
        <DataTable<ContentModerationProfileView>
          tableId="content-moderation-profiles"
          rows={profiles}
          columns={columns}
          rowKey={(profile) => profile.id}
          rowHeight={62}
          minWidth="min-w-[1500px]"
          height="h-auto max-h-[70vh] md:max-h-none md:flex-1"
          minHeight="min-h-[280px] md:min-h-0"
          caption={t("content_moderation.table_caption")}
          emptyText={t("content_moderation.empty_title")}
          emptyDescription={t("content_moderation.empty_description")}
          showAllLoadedMessage={false}
        />
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
        title={t("content_moderation.delete_profile")}
        description={t("content_moderation.delete_description", {
          name: deleteTarget?.name ?? "",
          count: deleteTarget ? bindingCount(deleteTarget) : 0,
        })}
        confirmText={t("content_moderation.delete_confirm")}
        busy={deleting}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void deleteProfile()}
      />
    </section>
  );
}
