import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { Eye, Lock, RefreshCw, Unlock } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AccessFreeze } from "@code-proxy/api-client";
import {
  Button,
  Callout,
  DataTable,
  Modal,
  ProviderTag,
  TABLE_ROW_ACTIONS_COLUMN,
  TableRowActions,
  type DataTableColumn,
} from "@code-proxy/ui";
import { FreezeThresholdSetting } from "./FreezeThresholdSetting";
import { ReleaseFreezeModal } from "./ReleaseFreezeModal";
import {
  describeFreezeError,
  formatFreezeTime,
  freezeProviderName,
  shortKeyId,
  type AccessFreezeSubjectRef,
} from "./format";
import type { AccessFreezeOverview } from "./useAccessFreezeOverview";

/**
 * 页面级的冻结总览：本租户所有生效中的冻结（含不属于任何门户账号的 Key），和冻结阈值的设置。
 * 每条能直接解冻，也能进到那一方的详情（历史与拒绝记录）。
 *
 * 数据来自调用方持有的 overview（列表行上的标签读的是同一份），打开时刷新一次。
 */
export function AccessFreezeOverviewModal({
  open,
  onClose,
  canWrite,
  overview,
  endUserName,
  onOpenSubject,
}: {
  open: boolean;
  onClose: () => void;
  canWrite: boolean;
  overview: AccessFreezeOverview;
  /** 门户账号 id → 界面上的称呼；列表里没有这个账号时为 undefined。 */
  endUserName: (id: string) => string | undefined;
  /** 进到某一方的详情：详情弹窗叠在总览上面。 */
  onOpenSubject: (subject: AccessFreezeSubjectRef) => void;
}) {
  const { t, i18n } = useTranslation();
  const headingId = useId();
  const [releaseTarget, setReleaseTarget] = useState<AccessFreeze | null>(null);
  const { freezes, loading, error, refresh } = overview;
  const language = i18n.resolvedLanguage;

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  // 名字由后端在列表里给出（subject_name），不再为了一个 Key 名去读整份带明文的 Key 清单；
  // 旧后端没有这个字段时，门户账号退回列表里的称呼，Key 退回 id 前 8 位。
  const subjectOf = useCallback(
    (freeze: AccessFreeze): AccessFreezeSubjectRef => {
      const { id } = freeze.subject;
      if (freeze.subject.kind === "api_key") {
        return {
          kind: "api_key",
          id,
          name: freeze.subject_name || t("access_freeze.key_name", { id: shortKeyId(id) }),
        };
      }
      return {
        kind: "end_user",
        id,
        name:
          freeze.subject_name ||
          endUserName(id) ||
          t("access_freeze.account_name", { id: shortKeyId(id) }),
      };
    },
    [endUserName, t],
  );

  const columns = useMemo<DataTableColumn<AccessFreeze>[]>(
    () => [
      {
        key: "subject",
        label: t("access_freeze.col_subject"),
        width: "w-40 min-w-[9rem]",
        render: (row) => {
          const subject = subjectOf(row);
          return (
            <div className="min-w-0">
              <div className="truncate font-medium text-ink">{subject.name}</div>
              <div className="text-2xs text-ink-3">
                {t(
                  row.subject.kind === "api_key"
                    ? "access_freeze.kind_api_key"
                    : "access_freeze.kind_end_user",
                )}
              </div>
            </div>
          );
        },
      },
      {
        key: "provider",
        label: t("access_freeze.col_provider"),
        width: "w-32 min-w-[7rem]",
        render: (row) => (
          <ProviderTag vendor={row.provider} withLogo>
            {freezeProviderName(t, row)}
          </ProviderTag>
        ),
      },
      {
        key: "model",
        label: t("access_freeze.col_model"),
        width: "w-36 min-w-[8rem]",
        cellClassName: "font-mono text-xs text-ink-2",
        render: (row) => row.model || "—",
      },
      {
        key: "frozen_at",
        label: t("access_freeze.col_frozen_at"),
        width: "w-[184px] min-w-[170px]",
        cellClassName: "whitespace-nowrap tabular-nums text-ink-2",
        render: (row) => formatFreezeTime(row.frozen_at, language),
      },
      {
        key: "strikes",
        label: t("access_freeze.col_strikes"),
        width: "w-24 min-w-[5rem]",
        cellClassName: "tabular-nums text-ink-2",
        render: (row) => row.strike_count,
      },
      {
        key: "actions",
        label: t("common.action"),
        ...TABLE_ROW_ACTIONS_COLUMN,
        render: (row) => (
          <TableRowActions
            moreLabel={t("common.more_actions")}
            actions={[
              {
                key: "detail",
                label: t("access_freeze.view_detail"),
                icon: <Eye />,
                onClick: () => onOpenSubject(subjectOf(row)),
              },
              {
                key: "release",
                label: t("access_freeze.release_action"),
                icon: <Unlock />,
                visible: canWrite,
                onClick: () => setReleaseTarget(row),
              },
            ]}
          />
        ),
      },
    ],
    [canWrite, language, onOpenSubject, subjectOf, t],
  );

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={t("access_freeze.overview_title")}
        description={t("access_freeze.overview_desc")}
        icon={<Lock />}
        size="xl"
        footerStart={
          <Button size="sm" variant="ghost" disabled={loading} onClick={() => void refresh()}>
            <RefreshCw size={14} aria-hidden="true" />
            {t("common.refresh")}
          </Button>
        }
        footer={
          <Button variant="secondary" onClick={onClose}>
            {t("common.close")}
          </Button>
        }
      >
        <div className="space-y-6">
          <section aria-label={t("access_freeze.threshold_title")}>
            <h3 className="mb-2 text-sm font-medium text-ink">
              {t("access_freeze.threshold_title")}
            </h3>
            <FreezeThresholdSetting canWrite={canWrite} />
          </section>

          <section aria-labelledby={headingId}>
            <h3 id={headingId} className="mb-2 text-sm font-medium text-ink">
              {t("access_freeze.overview_active_title")}
              <span className="ml-2 text-xs font-normal tabular-nums text-ink-3">
                {freezes.length}
              </span>
            </h3>
            {error ? (
              <Callout
                tone="danger"
                role="alert"
                title={t("access_freeze.load_failed")}
                actions={
                  <Button size="sm" variant="secondary" onClick={() => void refresh()}>
                    {t("common.retry")}
                  </Button>
                }
              >
                {describeFreezeError(t, error, t("access_freeze.load_failed"))}
              </Callout>
            ) : (
              <DataTable
                columns={columns}
                rows={freezes}
                rowKey={(row) => String(row.id)}
                loading={loading && freezes.length === 0}
                emptyText={t("access_freeze.overview_empty")}
                maxHeight="max-h-[360px]"
                // 弹窗内容区在 1280px 视口下约 870px：最小宽度比它小，操作列才不会被挤到横向滚动区外。
                minWidth="min-w-[820px]"
              />
            )}
          </section>
        </div>
      </Modal>
      <ReleaseFreezeModal
        freeze={releaseTarget}
        subjectName={releaseTarget ? subjectOf(releaseTarget).name : ""}
        onClose={() => setReleaseTarget(null)}
        onChanged={() => void refresh()}
      />
    </>
  );
}
