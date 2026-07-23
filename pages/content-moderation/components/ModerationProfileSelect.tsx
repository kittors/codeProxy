import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  contentModerationApi,
  extractApiErrorCode,
  isApiClientError,
  type ContentModerationChannelType,
  type ContentModerationProfileView,
} from "@code-proxy/api-client";
import { ConfirmModal, Select, useToast } from "@code-proxy/ui";
import { useOptionalAuth } from "@app/providers/AuthProvider";

export interface ModerationProfileSelectProps {
  channelType: ContentModerationChannelType;
  channelId?: string;
  label?: string;
  hint?: string;
  unpersistedHint?: string;
  className?: string;
  onBindingChanged?: (profileId: string) => void;
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
      <p className="text-sm font-semibold text-slate-900 dark:text-white">{label}</p>
      <Select
        value=""
        onChange={() => undefined}
        options={[{ value: "", label: t("content_moderation.profile_none") }]}
        aria-label={label}
        placeholder={t("content_moderation.profile_select_placeholder")}
        disabled
      />
      <p className="text-xs text-slate-500 dark:text-white/55">{hint}</p>
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
        if (error instanceof DOMException && error.name === "AbortError") return;
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
      <p className="text-sm font-semibold text-slate-900 dark:text-white">{resolvedLabel}</p>
      <Select
        value={profileId}
        onChange={handleChange}
        options={options}
        aria-label={resolvedLabel}
        placeholder={t("content_moderation.profile_select_placeholder")}
        disabled={!canWrite || loading || saving}
      />
      <p className="text-xs text-slate-500 dark:text-white/55">
        {hint ?? t("content_moderation.profile_select_hint")}
      </p>

      <ConfirmModal
        open={pendingProfileId !== null}
        title={t("content_moderation.rebind_title")}
        description={t("content_moderation.rebind_description")}
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
  const auth = useOptionalAuth();
  const canRead = auth?.can("content_moderation.read") ?? true;
  const canWrite = auth?.can("content_moderation.write") ?? true;
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
