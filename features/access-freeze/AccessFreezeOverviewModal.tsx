import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { Eye, Lock, RefreshCw, Unlock } from "@code-proxy/ui/icons";
import { useTranslation } from "react-i18next";
import type { AccessFreeze } from "@code-proxy/api-client";
import {
  Button,
  DataGrid,
  GridRowActions,
  Modal,
  ProviderTag,
  gridRowActionsColumn,
  type DataGridColumn,
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

  const columns = useMemo<DataGridColumn<AccessFreeze>[]>(
    () => [
      {
        id: "subject",
        header: t("access_freeze.col_subject"),
        width: 160,
        minWidth: 144,
        grow: true,
        cell: (row) => {
          const subject = subjectOf(row);
          return (
            <div className="min-w-0">
              <div className="truncate font-medium text-sn-label">{subject.name}</div>
              <div className="text-2xs text-sn-label3">
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
        id: "provider",
        header: t("access_freeze.col_provider"),
        width: 128,
        minWidth: 112,
        cell: (row) => (
          <ProviderTag vendor={row.provider} withLogo>
            {freezeProviderName(t, row)}
          </ProviderTag>
        ),
      },
      {
        id: "model",
        header: t("access_freeze.col_model"),
        width: 144,
        minWidth: 128,
        cell: (row) => (
          <span className="truncate font-mono text-xs text-sn-label2">{row.model || "—"}</span>
        ),
      },
      {
        id: "frozen_at",
        header: t("access_freeze.col_frozen_at"),
        width: 184,
        minWidth: 170,
        cell: (row) => (
          <span className="truncate whitespace-nowrap tabular-nums text-sn-label2">
            {formatFreezeTime(row.frozen_at, language)}
          </span>
        ),
      },
      {
        id: "strikes",
        header: t("access_freeze.col_strikes"),
        align: "end",
        width: 96,
        minWidth: 80,
        cell: (row) => <span className="tabular-nums text-sn-label2">{row.strike_count}</span>,
      },
      {
        id: "actions",
        header: t("common.action"),
        ...gridRowActionsColumn(2),
        cell: (row) => (
          <GridRowActions
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
            <h3 className="mb-2 text-sm font-medium text-sn-label">
              {t("access_freeze.threshold_title")}
            </h3>
            <FreezeThresholdSetting canWrite={canWrite} />
          </section>

          <section aria-labelledby={headingId}>
            <h3 id={headingId} className="mb-2 text-sm font-medium text-sn-label">
              {t("access_freeze.overview_active_title")}
              <span className="ml-2 text-xs font-normal tabular-nums text-sn-label3">
                {freezes.length}
              </span>
            </h3>
            {/* 弹窗里的小表：不套外框，按行收高、最高 360px 后表内滚动；读取失败也落在同一个框里，
                表头不消失，「重试」就在原处。 */}
            <DataGrid
              frame={false}
              label={t("access_freeze.overview_active_title")}
              columns={columns}
              rows={freezes}
              rowKey={(row) => String(row.id)}
              loading={loading && freezes.length === 0}
              error={error ? describeFreezeError(t, error, t("access_freeze.load_failed")) : null}
              onRetry={() => void refresh()}
              empty={{ title: t("access_freeze.overview_empty") }}
              maxHeight="360px"
            />
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
