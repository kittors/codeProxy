import type { TFunction } from "i18next";
import type { ApiKeyEntry } from "@code-proxy/api-client/endpoints/api-keys";
import { CheckboxField, ConfirmModal } from "@code-proxy/ui";
import { ApiKeySubject } from "./ApiKeySubject";

type DeleteApiKeyModalProps = {
  t: TFunction;
  entry: ApiKeyEntry | null;
  selectedCount?: number;
  open: boolean;
  saving: boolean;
  deleteLogsOnDelete: boolean;
  onDeleteLogsChange: (value: boolean) => void;
  /**
   * 是否提供「同时清理历史请求记录」。用户账号名下的 Key 走账号接口删除，
   * 那条接口不处理日志，勾了也不会生效，所以不显示这个选项。
   */
  allowDeleteLogs?: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
};

/**
 * 删除单把 / 批量删除 API Key：对象卡片写清删的是哪把（名称 + 掩码），后果逐条列出；
 * 「同时清理历史请求记录」是会多删东西的附加选项，用红色描边的勾选项。删除进行中取消也禁用，
 * 避免请求发出去之后弹窗先关掉、结果却不知道成没成。
 */
export function DeleteApiKeyModal({
  t,
  entry,
  selectedCount = 0,
  open,
  saving,
  deleteLogsOnDelete,
  onDeleteLogsChange,
  allowDeleteLogs = true,
  onClose,
  onConfirm,
}: DeleteApiKeyModalProps) {
  const isBatchDelete = selectedCount > 0;

  return (
    <ConfirmModal
      open={open}
      onClose={onClose}
      title={
        isBatchDelete
          ? t("api_keys_page.confirm_batch_delete", { count: selectedCount })
          : t("api_keys_page.delete_key_title")
      }
      description={t("api_keys_page.delete_lead")}
      subject={
        isBatchDelete ? (
          t("api_keys_page.batch_delete_selected_count", { count: selectedCount })
        ) : entry ? (
          <ApiKeySubject entry={entry} />
        ) : null
      }
      consequences={[
        isBatchDelete
          ? t("api_keys_page.batch_delete_consequence_clients")
          : t("api_keys_page.delete_consequence_clients"),
      ]}
      confirmText={t("api_keys_page.confirm_delete_btn")}
      busy={saving}
      onConfirm={() => void onConfirm()}
    >
      {!isBatchDelete && entry && allowDeleteLogs ? (
        <CheckboxField
          tone="danger"
          checked={deleteLogsOnDelete}
          onCheckedChange={onDeleteLogsChange}
          disabled={saving}
          label={t("api_keys_page.delete_logs_option")}
          description={t("api_keys_page.delete_logs_option_hint")}
        />
      ) : null}
    </ConfirmModal>
  );
}
