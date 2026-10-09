import { FileDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, Callout, ConfirmModal, Modal } from "@code-proxy/ui";
import type { ProviderImportDiff } from "../provider-import-export";

/**
 * 供应商页的两个弹窗（从 ProvidersPageContent 拆出，那个文件卡在行数棘轮上）。
 */

/** 删除一条供应商 / 凭证配置：把要删的那一条（名称 + 掩码密钥或地址）摆在卡片里。 */
export function ProviderDeleteConfirm({
  open,
  name,
  detail,
  openai,
  onClose,
  onConfirm,
}: {
  open: boolean;
  name: string;
  /** 掩码后的密钥或 Base URL，帮助认出是哪一条。 */
  detail?: string;
  openai: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  return (
    <ConfirmModal
      open={open}
      title={openai ? t("providers.delete_openai_title") : t("providers.delete_config_title")}
      description={t("providers.delete_lead")}
      subject={
        <span className="block min-w-0">
          <span className="block truncate font-medium">{name || t("providers.unnamed")}</span>
          {detail ? (
            <span className="mt-0.5 block truncate font-mono text-xs text-ink-3">{detail}</span>
          ) : null}
        </span>
      }
      consequences={[
        openai
          ? t("providers.delete_consequence_openai")
          : t("providers.delete_consequence_config"),
      ]}
      confirmText={t("providers.delete")}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}

// 名称前的小圆点始终带颜色（新增绿、更新蓝、删除红）；大数字简约风格一律墨色，
// 多彩风格跟圆点同色系。
const TILES = [
  { key: "added", dot: "bg-emerald-500", tone: "colorful:text-emerald-700 colorful:dark:text-emerald-300" },
  { key: "changed", dot: "bg-sky-500", tone: "colorful:text-sky-700 colorful:dark:text-sky-300" },
  { key: "removed", dot: "bg-rose-500", tone: "colorful:text-rose-700 colorful:dark:text-rose-300" },
  { key: "duplicateEntriesRemoved", dot: "bg-ink-4", tone: "" },
] as const;

// 读屏用完整句子（沿用原来的「新增：N」文案），视觉上拆成小标签 + 大数字。
const TILE_ARIA: Record<(typeof TILES)[number]["key"], string> = {
  added: "providers.diff_added",
  changed: "providers.diff_updated",
  removed: "providers.diff_removed",
  duplicateEntriesRemoved: "providers.diff_duplicates_cleaned",
};

const TILE_LABEL: Record<(typeof TILES)[number]["key"], string> = {
  added: "providers.diff_tile_added",
  changed: "providers.diff_tile_updated",
  removed: "providers.diff_tile_removed",
  duplicateEntriesRemoved: "providers.diff_tile_duplicates",
};

const CHIP: Record<"added" | "changed" | "removed", string> = {
  added: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  changed: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  removed: "bg-rose-500/10 text-rose-700 line-through decoration-rose-400/60 dark:text-rose-300",
};

/**
 * 导入预览：四格计数（新增 / 更新 / 删除 / 清理重复）+ 逐项清单。
 * 导入会删掉现有配置时，顶部明确提示删几项，确认按钮转为红色——以前删除项只是一排红色小标签，
 * 确认按钮却和普通导入一样，很容易被当成「只是新增」。
 */
export function ProviderImportPreviewModal({
  preview,
  importing,
  onClose,
  onConfirm,
}: {
  preview: { diff: ProviderImportDiff; filename: string } | null;
  importing: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const diff = preview?.diff;
  const removes = (diff?.removed ?? 0) > 0;
  const groups = diff
    ? ([
        ["added", diff.addedLabels, "providers.diff_added_label"],
        ["changed", diff.changedLabels, "providers.diff_updated_label"],
        ["removed", diff.removedLabels, "providers.diff_removed_label"],
      ] as const)
    : [];

  return (
    <Modal
      open={preview !== null}
      title={t("providers.import_preview_title")}
      description={
        preview ? t("providers.import_preview_desc", { filename: preview.filename }) : undefined
      }
      icon={<FileDown />}
      tone={removes ? "warning" : "neutral"}
      size="lg"
      onClose={() => {
        if (!importing) onClose();
      }}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={importing}>
            {t("common.cancel")}
          </Button>
          <Button
            variant={removes ? "danger" : "primary"}
            onClick={onConfirm}
            disabled={!diff?.hasChanges}
            loading={importing}
          >
            {removes
              ? t("providers.confirm_import_with_removals", { count: diff?.removed ?? 0 })
              : t("providers.confirm_import")}
          </Button>
        </>
      }
    >
      {diff ? (
        <div className="space-y-5 text-sm">
          {removes ? (
            <Callout tone="warning" title={t("providers.import_removes_title", { count: diff.removed })}>
              {t("providers.import_removes_desc")}
            </Callout>
          ) : null}
          {!diff.hasChanges ? <Callout tone="info">{t("providers.import_no_changes")}</Callout> : null}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {TILES.map((tile) => (
              <div
                key={tile.key}
                role="group"
                aria-label={t(TILE_ARIA[tile.key], { count: diff[tile.key] })}
                className="rounded-2xl bg-subtle px-3.5 py-3"
              >
                <p className="flex items-center gap-1.5 text-xs text-ink-3">
                  <span aria-hidden="true" className={["h-1.5 w-1.5 rounded-full", tile.dot].join(" ")} />
                  {t(TILE_LABEL[tile.key])}
                </p>
                <p className={["mt-1 text-2xl font-semibold tabular-nums text-ink", tile.tone].join(" ")}>
                  {diff[tile.key]}
                </p>
              </div>
            ))}
          </div>

          {groups.map(([kind, labels, titleKey]) =>
            labels.length ? (
              <section key={kind}>
                <h3 className="text-xs font-medium text-ink-2">{t(titleKey)}</h3>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {labels.map((label) => (
                    <span key={`${kind}-${label}`} className={["rounded-full px-2.5 py-1 text-xs", CHIP[kind]].join(" ")}>
                      {label}
                    </span>
                  ))}
                </div>
              </section>
            ) : null,
          )}
        </div>
      ) : null}
    </Modal>
  );
}
