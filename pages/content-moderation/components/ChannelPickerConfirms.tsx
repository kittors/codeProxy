import { useTranslation } from "react-i18next";
import { ArrowLeftRight, ArrowRight, Tags } from "lucide-react";
import type {
  ContentModerationBindingOperation,
  ContentModerationChannelView,
  ContentModerationTagMode,
} from "@code-proxy/api-client";
import { ConfirmModal } from "@code-proxy/ui";

export interface TagBindingPreview {
  tags: string[];
  tagMode: ContentModerationTagMode;
  matchedCount: number;
  rebindCount: number;
  operations: ContentModerationBindingOperation[];
}

/**
 * 按标签批量绑定的确认：标签与匹配方式放在对象卡片里，匹配数、要改的绑定数、会被替换的绑定数逐条列出。
 * 有替换时用琥珀色（会改掉别的配置的绑定），否则是普通确认。
 */
export function TagBindingConfirm({
  preview,
  profileName,
  busy,
  onConfirm,
  onClose,
}: {
  preview: TagBindingPreview | null;
  profileName: string;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const consequences = preview
    ? [
        t("content_moderation.tag_bind_consequence_count", {
          count: preview.matchedCount,
          changeCount: preview.operations.length,
        }),
        preview.rebindCount > 0
          ? t("content_moderation.tag_bind_rebind_warning", { count: preview.rebindCount })
          : null,
        t("content_moderation.tag_bind_hint"),
      ].filter((item): item is string => Boolean(item))
    : [];
  return (
    <ConfirmModal
      open={preview !== null}
      title={t("content_moderation.tag_bind_title")}
      description={t("content_moderation.tag_bind_lead", { name: profileName })}
      variant={preview && preview.rebindCount > 0 ? "warning" : "primary"}
      icon={<Tags />}
      subject={
        preview ? (
          <span className="block min-w-0">
            <span className="flex flex-wrap gap-1.5">
              {preview.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-ink/[0.05] px-2 py-0.5 text-xs font-medium text-ink-2 dark:bg-white/[0.07]"
                >
                  {tag}
                </span>
              ))}
            </span>
            <span className="mt-1.5 block text-xs text-ink-3">
              {t(`content_moderation.tag_mode_${preview.tagMode}`)}
            </span>
          </span>
        ) : null
      }
      consequences={consequences}
      confirmText={t("content_moderation.tag_bind_confirm")}
      busy={busy}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}

/**
 * 勾选的渠道里有已绑定到其他配置的：说明是「N 个渠道 → 当前配置」，并列出本页能认出的几个
 * 「渠道 · 原配置」。这是替换而不是删除，所以用琥珀色 + 双向箭头。
 */
export function RebindChannelsConfirm({
  operationCount,
  affected,
  profileName,
  profileNames,
  busy,
  onConfirm,
  onClose,
}: {
  /** null 表示确认框关闭。 */
  operationCount: number | null;
  /** 本页里会被替换绑定的渠道（找不到的不列出）。 */
  affected: ContentModerationChannelView[];
  profileName: string;
  profileNames: ReadonlyMap<string, string>;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const shown = affected.slice(0, 3);
  return (
    <ConfirmModal
      open={operationCount !== null}
      title={t("content_moderation.rebind_title")}
      description={t("content_moderation.rebind_selected_description", {
        count: operationCount ?? 0,
      })}
      variant="warning"
      icon={<ArrowLeftRight />}
      subject={
        operationCount !== null ? (
          <span className="block min-w-0">
            <span className="flex min-w-0 items-center gap-2.5">
              <span className="shrink-0 text-ink-3">
                {t("content_moderation.channel_count", { count: operationCount })}
              </span>
              <ArrowRight size={14} className="shrink-0 text-ink-3" aria-hidden="true" />
              <span className="min-w-0 truncate font-medium">{profileName}</span>
            </span>
            {shown.length ? (
              <span className="mt-2 block space-y-0.5 text-xs text-ink-3">
                {shown.map((row) => (
                  <span key={`${row.channel_type}:${row.channel_id}`} className="block truncate">
                    {t("content_moderation.rebind_from", {
                      channel: row.name,
                      name: profileNames.get(row.profile_id ?? "") ?? row.profile_id ?? "",
                    })}
                  </span>
                ))}
                {affected.length > shown.length ? (
                  <span className="block">
                    {t("content_moderation.rebind_more", { count: affected.length - shown.length })}
                  </span>
                ) : null}
              </span>
            ) : null}
          </span>
        ) : null
      }
      consequences={[t("content_moderation.rebind_consequence", { name: profileName })]}
      confirmText={t("content_moderation.rebind_confirm")}
      busy={busy}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}
