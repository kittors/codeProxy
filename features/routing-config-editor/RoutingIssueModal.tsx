import { TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, Callout, Modal, OverflowTooltip } from "@code-proxy/ui";

/**
 * 渠道分组的「异常原因」：分组里引用了已经删除的渠道。列出这些渠道，并给出「查看并清理」直达编辑器。
 * 从 RoutingConfigEditor 拆出来（那个文件卡在行数棘轮上）。
 */
export function RoutingIssueModal({
  open,
  groupName,
  staleChannels,
  disabled,
  onClose,
  onCleanup,
}: {
  open: boolean;
  groupName: string;
  staleChannels: { id: string; name: string }[];
  disabled?: boolean;
  onClose: () => void;
  onCleanup: () => void;
}) {
  const { t } = useTranslation();
  const hasIssues = staleChannels.length > 0;
  return (
    <Modal
      open={open}
      title={t("channel_groups_page.issue_modal_title")}
      description={t("channel_groups_page.issue_modal_desc", { group: groupName })}
      icon={<TriangleAlert />}
      tone={hasIssues ? "danger" : "neutral"}
      onClose={onClose}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("common.close")}
          </Button>
          {hasIssues ? (
            <Button variant="primary" onClick={onCleanup} disabled={disabled}>
              {t("channel_groups_page.view_and_cleanup")}
            </Button>
          ) : null}
        </>
      }
    >
      {hasIssues ? (
        <div className="space-y-4">
          <Callout
            tone="danger"
            title={t("channel_groups_page.stale_alert_title")}
            actions={
              <span className="rounded-full bg-surface px-2.5 py-1 text-xs font-medium text-rose-700 dark:text-rose-300">
                {t("channel_groups_page.deleted_channels_count", { count: staleChannels.length })}
              </span>
            }
          >
            {t("channel_groups_page.stale_alert_message", { count: staleChannels.length })}
          </Callout>
          {/* 弹窗里不再套描边表格框：表头一条淡底，行与行之间只留数据分隔线。 */}
          <div>
            <div className="grid grid-cols-[minmax(0,1fr)_88px] rounded-lg bg-subtle px-3 py-2 text-xs font-medium text-ink-3">
              <span>{t("channel_groups_page.table_channels")}</span>
              <span className="text-center">{t("channel_groups_page.table_status")}</span>
            </div>
            <ul className="divide-y divide-line">
              {staleChannels.map((channel) => (
                <li
                  key={channel.id}
                  className="grid grid-cols-[minmax(0,1fr)_88px] items-center gap-3 px-3 py-2.5 text-sm"
                >
                  <OverflowTooltip content={channel.name} className="block min-w-0">
                    <span className="block truncate font-medium text-ink">{channel.name}</span>
                  </OverflowTooltip>
                  <span className="inline-flex justify-center rounded-full bg-rose-500/10 px-2 py-0.5 text-xs font-medium text-rose-700 dark:text-rose-300">
                    {t("channel_groups_page.deleted_badge")}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <p className="rounded-2xl bg-subtle px-4 py-6 text-center text-sm text-ink-3">
          {t("channel_groups_page.issue_modal_empty")}
        </p>
      )}
    </Modal>
  );
}
