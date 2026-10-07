import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeftRight, ArrowRight } from "lucide-react";
import {
  contentModerationApi,
  extractApiErrorCode,
  isApiClientError,
  type ContentModerationChannelType,
  type ContentModerationProfileView,
} from "@code-proxy/api-client";
import { ConfirmModal, Select, useToast } from "@code-proxy/ui";

export interface ModerationProfileSelectProps {
  channelType: ContentModerationChannelType;
  channelId?: string;
  label?: string;
  hint?: string;
  unpersistedHint?: string;
  className?: string;
  onBindingChanged?: (profileId: string) => void;
  /**
   * Permission flags injected by the consuming page (features cannot read
   * AuthProvider). Default to permissive for auth-less contexts (tests).
   */
  canRead?: boolean;
  canWrite?: boolean;
}

function SelectShell({
  label,
  hint,
  className,
}: {
  label: string;
  hint: string;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className={["space-y-2", className].filter(Boolean).join(" ")}>
      <p className="text-sm font-medium text-ink">{label}</p>
      <Select
        value=""
        onChange={() => undefined}
        options={[{ value: "", label: t("content_moderation.profile_none") }]}
        aria-label={label}
        placeholder={t("content_moderation.profile_select_placeholder")}
        disabled
      />
      <p className="text-xs leading-5 text-ink-3">{hint}</p>
    </div>
  );
}

interface BoundModerationProfileSelectProps extends ModerationProfileSelectProps {
  channelId: string;
  canWrite: boolean;
  resolvedLabel: string;
}

function BoundModerationProfileSelect({
  channelType,
  channelId,
  hint,
  className,
  onBindingChanged,
  canWrite,
  resolvedLabel,
}: BoundModerationProfileSelectProps) {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [profiles, setProfiles] = useState<ContentModerationProfileView[]>([]);
  const [profileId, setProfileId] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingProfileId, setPendingProfileId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void Promise.all([
      contentModerationApi.listProfiles(),
      contentModerationApi.listChannels({
        channel_type: channelType,
        // Backend query is substring-based; narrow by stable id, then exact-match below.
        query: channelId,
        page: 1,
        page_size: 50,
        signal: controller.signal,
      }),
    ])
      .then(([nextProfiles, page]) => {
        const exact = page.items.find(
          (item) => item.channel_type === channelType && item.channel_id === channelId,
        );
        setProfiles(nextProfiles);
        setProfileId(exact?.profile_id ?? "");
      })
      .catch((error: unknown) => {
        if (
          controller.signal.aborted ||
          (error instanceof DOMException && error.name === "AbortError") ||
          (isApiClientError(error) && error.message === "Request was cancelled")
        ) {
          return;
        }
        notify({
          type: "error",
          message:
            error instanceof Error ? error.message : t("content_moderation.load_binding_failed"),
        });
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [channelId, channelType, notify, t]);

  const options = useMemo(
    () => [
      { value: "", label: t("content_moderation.profile_none") },
      ...profiles.map((profile) => ({ value: profile.id, label: profile.name })),
    ],
    [profiles, t],
  );

  const applyBinding = useCallback(
    async (nextProfileId: string, allowRebind: boolean) => {
      setSaving(true);
      try {
        await contentModerationApi.patchBindings({
          allow_rebind: allowRebind,
          operations: [
            {
              channel_type: channelType,
              channel_id: channelId,
              profile_id: nextProfileId || null,
            },
          ],
        });
        setProfileId(nextProfileId);
        setPendingProfileId(null);
        onBindingChanged?.(nextProfileId);
        notify({
          type: "success",
          message: nextProfileId
            ? t("content_moderation.binding_saved")
            : t("content_moderation.binding_removed"),
        });
      } catch (error) {
        if (
          !allowRebind &&
          isApiClientError(error) &&
          extractApiErrorCode(error.payload) === "content_moderation_binding_conflict"
        ) {
          setPendingProfileId(nextProfileId);
          return;
        }
        notify({
          type: "error",
          message:
            error instanceof Error ? error.message : t("content_moderation.binding_save_failed"),
        });
      } finally {
        setSaving(false);
      }
    },
    [channelId, channelType, notify, onBindingChanged, t],
  );

  const profileName = (id: string) =>
    id
      ? (profiles.find((profile) => profile.id === id)?.name ?? id)
      : t("content_moderation.profile_none");

  const handleChange = (nextProfileId: string) => {
    if (nextProfileId === profileId) return;
    if (profileId && nextProfileId) {
      setPendingProfileId(nextProfileId);
      return;
    }
    void applyBinding(nextProfileId, false);
  };

  return (
    <div className={["space-y-2", className].filter(Boolean).join(" ")}>
      <p className="text-sm font-medium text-ink">{resolvedLabel}</p>
      <Select
        value={profileId}
        onChange={handleChange}
        options={options}
        aria-label={resolvedLabel}
        placeholder={t("content_moderation.profile_select_placeholder")}
        disabled={!canWrite || loading || saving}
      />
      <p className="text-xs leading-5 text-ink-3">
        {hint ?? t("content_moderation.profile_select_hint")}
      </p>

      {/* 这是「替换」不是删除：旧绑定换成新配置、随时能改回来，所以用琥珀色 + 双向箭头，
          并把「旧配置 → 新配置」摆在卡片里。本地还没读到旧绑定（服务端报冲突）时显示「另一个配置」。 */}
      <ConfirmModal
        open={pendingProfileId !== null}
        title={t("content_moderation.rebind_title")}
        description={t("content_moderation.rebind_description")}
        variant="warning"
        icon={<ArrowLeftRight />}
        subject={
          pendingProfileId !== null ? (
            <span className="flex min-w-0 items-center gap-2.5">
              <span className="min-w-0 truncate text-ink-3">
                {profileId ? profileName(profileId) : t("content_moderation.rebind_existing_unknown")}
              </span>
              <ArrowRight size={14} className="shrink-0 text-ink-3" aria-hidden="true" />
              <span className="min-w-0 truncate font-medium">{profileName(pendingProfileId)}</span>
            </span>
          ) : null
        }
        consequences={
          pendingProfileId !== null
            ? [t("content_moderation.rebind_consequence", { name: profileName(pendingProfileId) })]
            : []
        }
        confirmText={t("content_moderation.rebind_confirm")}
        busy={saving}
        onClose={() => setPendingProfileId(null)}
        onConfirm={() => {
          if (pendingProfileId === null) return;
          void applyBinding(pendingProfileId, true);
        }}
      />
    </div>
  );
}

export function ModerationProfileSelect(props: ModerationProfileSelectProps) {
  const { t } = useTranslation();
  const canRead = props.canRead ?? true;
  const canWrite = props.canWrite ?? true;
  if (!canRead) return null;

  const resolvedLabel = props.label ?? t("content_moderation.profile_select_label");
  const channelId = props.channelId?.trim() ?? "";
  if (!channelId) {
    return (
      <SelectShell
        label={resolvedLabel}
        hint={props.unpersistedHint ?? t("content_moderation.profile_select_save_first")}
        className={props.className}
      />
    );
  }

  return (
    <BoundModerationProfileSelect
      {...props}
      channelId={channelId}
      canWrite={canWrite}
      resolvedLabel={resolvedLabel}
    />
  );
}
