import { Database } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ClearUsageLogsPayload } from "@code-proxy/api-client/endpoints/usage";
import { CheckboxField, ConfirmModal, iconHueClass } from "@code-proxy/ui";

export const DEFAULT_CLEAR_OPTIONS: ClearUsageLogsPayload = {
  clear_body_content: true,
  clear_detail_content: true,
  clear_request_records: false,
};

/**
 * 清空数据库里的请求日志：勾选要清理哪几类数据，至少勾一项才能确认。
 *
 * 默认只清正文和请求详情（最占空间、又不影响统计）；「请求记录」是高风险项，勾上后
 * 正文和详情跟着锁定为勾选——记录都删了，它们不可能单独留下。
 * 后端只认这三个开关，不带筛选条件：清理范围与列表当前的筛选、时间范围无关，弹窗里明确写出来。
 * 范围按当前生效租户限定（服务端 `ClearRequestLogs` 会带上 tenant），所以写「当前租户的全部」。
 * 从 RequestLogsPage 拆出（那个文件已接近 800 行上限）。
 */
export function ClearDatabaseLogsDialog({
  open,
  options,
  busy,
  onOptionsChange,
  onConfirm,
  onClose,
}: {
  open: boolean;
  options: ClearUsageLogsPayload;
  busy: boolean;
  onOptionsChange: (next: ClearUsageLogsPayload) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const records = options.clear_request_records;
  const canConfirm = options.clear_body_content || options.clear_detail_content || records;

  const toggleContent = (key: "clear_body_content" | "clear_detail_content", checked: boolean) => {
    if (records) return;
    onOptionsChange({ ...options, [key]: checked });
  };
  const toggleRecords = (checked: boolean) =>
    onOptionsChange(
      checked
        ? { clear_body_content: true, clear_detail_content: true, clear_request_records: true }
        : { ...options, clear_request_records: false },
    );

  return (
    <ConfirmModal
      open={open}
      variant="danger"
      title={t("request_logs.clear_database_logs_title")}
      description={t("request_logs.clear_database_logs_lead")}
      subject={
        <span className="flex items-center gap-3">
          <Database
            size={18}
            className={`shrink-0 text-ink-3 ${iconHueClass(Database)}`}
            aria-hidden="true"
          />
          <span className="min-w-0">
            <span className="block font-medium">{t("request_logs.clear_scope_title")}</span>
            <span className="mt-0.5 block text-xs text-ink-3">
              {t("request_logs.clear_scope_hint")}
            </span>
          </span>
        </span>
      }
      consequences={[
        records
          ? t("request_logs.clear_consequence_records")
          : t("request_logs.clear_consequence_content"),
      ]}
      confirmText={t("request_logs.clear_database_logs_confirm_button")}
      confirmDisabled={!canConfirm}
      busy={busy}
      onConfirm={onConfirm}
      onClose={onClose}
    >
      <div className="space-y-2">
        <CheckboxField
          checked={options.clear_body_content}
          disabled={busy || records}
          label={t("request_logs.clear_option_body")}
          description={t("request_logs.clear_option_body_desc")}
          onCheckedChange={(checked) => toggleContent("clear_body_content", checked)}
        />
        <CheckboxField
          checked={options.clear_detail_content}
          disabled={busy || records}
          label={t("request_logs.clear_option_details")}
          description={t("request_logs.clear_option_details_desc")}
          onCheckedChange={(checked) => toggleContent("clear_detail_content", checked)}
        />
        <CheckboxField
          tone="danger"
          checked={records}
          disabled={busy}
          label={t("request_logs.clear_option_records")}
          description={t("request_logs.clear_option_records_desc")}
          onCheckedChange={toggleRecords}
        />
      </div>
    </ConfirmModal>
  );
}
