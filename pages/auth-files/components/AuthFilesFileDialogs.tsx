import { motion, useReducedMotion } from "framer-motion";
import { FileJson, Layers, Loader2, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Callout,
  EmptyState,
  FormField,
  Modal,
  SearchableSelect,
  SettingRow,
  Skeleton,
  Textarea,
  ToggleSwitch,
  type SearchableSelectOption,
} from "@code-proxy/ui";

/**
 * AI 账号文件页的三个弹窗（从 AuthFilesFilesTab 拆出来，那个文件卡在行数棘轮上）。
 * 只负责展示；状态与提交逻辑仍在 AuthFilesFilesTab / 它的 hooks 里。
 */

export interface UploadProgressView {
  phase: string;
  completed: number;
  total: number;
  success: number;
  failed: number;
  skipped: number;
  activeFileNames: string[];
}

/** 上传进度：一条会动的进度条 + 成功 / 失败 / 跳过三色计数；可以收到后台继续。 */
export function UploadProgressDialog({
  open,
  title,
  description,
  progress,
  percent,
  onDismiss,
}: {
  open: boolean;
  title: string;
  description: string;
  progress: UploadProgressView;
  percent: number;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const counts = [
    { key: "success", dot: "bg-emerald-500", label: t("auth_files.upload_progress_success", { count: progress.success }) },
    { key: "failed", dot: "bg-rose-500", label: t("auth_files.upload_progress_failed", { count: progress.failed }) },
    { key: "skipped", dot: "bg-ink-4", label: t("auth_files.upload_progress_skipped", { count: progress.skipped }) },
  ];
  return (
    <Modal
      open={open}
      title={t("auth_files.upload_progress_dialog_title")}
      description={description}
      icon={<Upload />}
      size="sm"
      onClose={onDismiss}
      footer={
        <Button variant="secondary" onClick={onDismiss}>
          {t("auth_files.upload_progress_background")}
        </Button>
      }
    >
      <div className="space-y-4" data-testid="auth-files-upload-progress" aria-live="polite">
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <p className="flex min-w-0 items-center gap-2 text-sm font-medium text-ink">
              <Loader2 size={15} className="shrink-0 animate-spin text-ink-3" aria-hidden="true" />
              <span className="truncate" data-testid="auth-files-upload-progress-title">
                {title}
              </span>
            </p>
            <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">{percent}%</span>
          </div>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-track"
          >
            <motion.div
              className="h-full rounded-full bg-accent bar-semantic:bg-gradient-to-r bar-semantic:from-teal-400 bar-semantic:to-sky-500"
              initial={false}
              animate={{ width: `${percent}%` }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
          <p className="mt-2 text-xs text-ink-3" data-testid="auth-files-upload-progress-detail">
            {progress.phase === "refreshing" ? t("auth_files.upload_progress_refreshing_short") : description}
          </p>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-2">
          {counts.map((item) => (
            <span key={item.key} className="inline-flex items-center gap-1.5 tabular-nums">
              <span aria-hidden="true" className={["h-1.5 w-1.5 rounded-full", item.dot].join(" ")} />
              {item.label}
            </span>
          ))}
        </div>

        {progress.activeFileNames.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {progress.activeFileNames.map((name) => (
              <span
                key={name}
                className="inline-flex max-w-full items-center rounded-full bg-subtle px-2.5 py-1 font-mono text-2xs text-ink-2"
              >
                <span className="truncate">{name}</span>
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

/** 粘贴认证 JSON：一行一个或整段导出包都行；⌘/Ctrl + Enter 直接上传。 */
export function PasteJsonDialog({
  open,
  text,
  onTextChange,
  error,
  uploading,
  uploadLabel,
  uploadTitle,
  uploadDescription,
  onSubmit,
  onClose,
}: {
  open: boolean;
  text: string;
  onTextChange: (value: string) => void;
  error: string;
  uploading: boolean;
  uploadLabel: string;
  uploadTitle: string;
  uploadDescription: string;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const canSubmit = !uploading && text.trim().length > 0;
  return (
    <Modal
      open={open}
      title={t("auth_files.paste_json_title")}
      description={t("auth_files.paste_json_description")}
      icon={<FileJson />}
      size="lg"
      bodyHeightClassName="max-h-[72vh]"
      onClose={onClose}
      onSubmitShortcut={canSubmit ? onSubmit : undefined}
      footerStart={t("auth_files.paste_json_shortcut")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={uploading}>
            {t("auth_files.cancel")}
          </Button>
          <Button variant="primary" onClick={onSubmit} disabled={!canSubmit} loading={uploading}>
            {uploading ? uploadLabel : t("auth_files.paste_json_upload")}
          </Button>
        </>
      }
    >
      <FormField
        htmlFor="auth-files-json-import"
        label={t("auth_files.paste_json_label")}
        description={error ? undefined : t("auth_files.paste_json_hint")}
        error={error || undefined}
        reserveMeta={false}
      >
        <Textarea
          value={text}
          onChange={(event) => onTextChange(event.currentTarget.value)}
          spellCheck={false}
          className="min-h-[320px] font-mono text-xs leading-5"
          placeholder={t("auth_files.paste_json_placeholder")}
        />
      </FormField>
      {uploading && !error ? (
        <Callout tone="info" className="mt-3" icon={<Loader2 className="animate-spin" />} title={uploadTitle}>
          <span data-testid="auth-files-json-upload-progress">{uploadDescription}</span>
        </Callout>
      ) : null}
    </Modal>
  );
}

export interface OwnerGroupModel {
  id: string;
  display_name?: string;
  owned_by?: string;
}

/** 模型归属分组：开关 + 选择分组，右侧 / 下方实时预览这个分组会带来哪些模型。 */
export function ModelOwnerGroupDialog({
  open,
  filter,
  enabled,
  onEnabledChange,
  owner,
  onOwnerChange,
  options,
  models,
  loading,
  saving,
  onSave,
  onClose,
}: {
  open: boolean;
  filter: string;
  enabled: boolean;
  onEnabledChange: (value: boolean) => void;
  owner: string;
  onOwnerChange: (value: string) => void;
  options: SearchableSelectOption[];
  /** null 表示还没选分组。 */
  models: OwnerGroupModel[] | null;
  loading: boolean;
  saving: boolean;
  onSave: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal
      open={open}
      title={t("auth_files.model_owner_group")}
      description={t("auth_files.model_owner_group_dialog_desc", { type: filter })}
      icon={<Layers />}
      size="lg"
      bodyHeightClassName="max-h-[68vh]"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            onClick={onSave}
            loading={saving}
            disabled={enabled && !owner}
          >
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* 弹窗里不用 SettingGroup（它是带细边和投影的卡片）：一层无边淡底就够了。 */}
        <div className="overflow-hidden rounded-2xl bg-subtle">
          <SettingRow
            label={t("auth_files.model_owner_group_enabled")}
            description={t("auth_files.model_owner_group_enabled_desc")}
            controlWidth="auto"
            control={
              <ToggleSwitch
                checked={enabled}
                onCheckedChange={onEnabledChange}
                ariaLabel={t("auth_files.model_owner_group_enabled")}
                disabled={saving}
              />
            }
          />
        </div>

        <FormField
          label={t("auth_files.model_owner_group")}
          description={t("auth_files.model_owner_group_applies_to", { type: filter })}
          reserveMeta={false}
        >
          <SearchableSelect
            value={owner}
            onChange={onOwnerChange}
            options={options}
            placeholder={t("auth_files.auth_file_models_option")}
            searchPlaceholder={t("auth_files.model_owner_group_search_placeholder")}
            aria-label={t("auth_files.model_owner_group")}
            disabled={!enabled || saving}
          />
        </FormField>

        {/* 标题行 + 模型行（淡底），不再套一个描边框、也不再用分隔线切出表头。 */}
        <section>
          <header className="mb-2 flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-ink">{t("auth_files.detail_tab_models")}</p>
            {models ? (
              <span className="rounded-full bg-ink/[0.05] px-2 py-0.5 text-xs font-medium text-ink-2 tabular-nums dark:bg-white/[0.07]">
                {t("auth_files.count_items", { count: models.length })}
              </span>
            ) : null}
          </header>
          <div>
            {loading ? (
              <div className="space-y-2" aria-busy="true">
                <Skeleton className="h-10 rounded-xl" />
                <Skeleton className="h-10 rounded-xl" />
                <Skeleton className="h-10 rounded-xl" />
              </div>
            ) : models ? (
              models.length === 0 ? (
                <EmptyState
                  title={t("common.no_model_data")}
                  description={t("auth_files.no_owner_group_models")}
                />
              ) : (
                <ul className="max-h-[340px] space-y-1.5 overflow-y-auto pr-1">
                  {models.map((model) => {
                    const modelMeta = [
                      model.display_name ? `display_name: ${model.display_name}` : "",
                      model.owned_by ? `owned_by: ${model.owned_by}` : "",
                    ].filter(Boolean);
                    return (
                      <li key={model.id} className="rounded-xl bg-subtle px-3 py-2">
                        <p className="truncate font-mono text-xs font-medium text-ink">{model.id}</p>
                        {modelMeta.length > 0 ? (
                          <p className="mt-0.5 truncate text-xs text-ink-3">{modelMeta.join(" · ")}</p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )
            ) : (
              <EmptyState
                title={t("common.no_model_data")}
                description={t("auth_files.auth_file_models_option")}
              />
            )}
          </div>
        </section>
      </div>
    </Modal>
  );
}
