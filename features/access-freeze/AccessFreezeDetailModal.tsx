import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Lock, RefreshCw, Unlock } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  accessFreezesApi,
  type AccessFreeze,
  type AccessFreezeStrike,
} from "@code-proxy/api-client";
import {
  Button,
  Callout,
  DataTable,
  DetailList,
  Modal,
  ProviderTag,
  SkeletonLines,
  type DataTableColumn,
  type DetailItem,
} from "@code-proxy/ui";
import {
  describeFreezeError,
  formatFreezeTime,
  freezeProviderName,
  type AccessFreezeSubjectRef,
} from "./format";
import { ReleaseFreezeModal } from "./ReleaseFreezeModal";

/** 一方的冻结和拒绝记录各取这么多条：足够翻完一个账号的历史，又不会把弹窗拖得很长。 */
const DETAIL_LIMIT = 200;

interface DetailData {
  freezes: AccessFreeze[];
  strikes: AccessFreezeStrike[];
}

type Translate = (key: string, options?: Record<string, unknown>) => string;

function ActiveFreezeCard({
  freeze,
  canWrite,
  onRelease,
}: {
  freeze: AccessFreeze;
  canWrite: boolean;
  onRelease: () => void;
}) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage;
  const items: DetailItem[] = [
    { label: t("access_freeze.field_model"), value: freeze.model, mono: true },
    { label: t("access_freeze.field_reason"), value: freeze.reason_code, mono: true },
    { label: t("access_freeze.field_upstream_account"), value: freeze.auth_label, mono: true },
    {
      label: t("access_freeze.field_request_id"),
      value: freeze.request_id,
      mono: true,
      copyValue: freeze.request_id,
    },
  ];
  return (
    <li className="rounded-2xl bg-subtle p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <ProviderTag vendor={freeze.provider} withLogo>
          {freezeProviderName(t, freeze)}
        </ProviderTag>
        <span className="text-xs text-ink-3">
          {t("access_freeze.frozen_at", { time: formatFreezeTime(freeze.frozen_at, language) })}
        </span>
        <span className="text-xs tabular-nums text-ink-3">
          {t("access_freeze.strikes", { count: freeze.strike_count })}
        </span>
        {canWrite ? (
          <Button size="sm" variant="secondary" className="ml-auto" onClick={onRelease}>
            <Unlock size={14} aria-hidden="true" />
            {t("access_freeze.release_action")}
          </Button>
        ) : null}
      </div>
      {freeze.upstream_message ? (
        <div className="mt-3">
          <div className="text-xs text-ink-3">{t("access_freeze.upstream_message")}</div>
          <p className="mt-1 text-sm leading-6 text-ink-2 [overflow-wrap:anywhere]">
            {freeze.upstream_message}
          </p>
        </div>
      ) : null}
      <DetailList items={items} columns={2} className="mt-3" />
      {freeze.notice ? (
        // 被冻结方收到的就是这段话（中英双语）：管理员要知道用户读到的是什么，但它是附带信息，收起来。
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer select-none text-xs text-ink-3 hover:text-ink-2">
            {t("access_freeze.notice_title")}
          </summary>
          <p className="mt-1.5 whitespace-pre-line leading-6 text-ink-2 [overflow-wrap:anywhere]">
            {freeze.notice}
          </p>
        </details>
      ) : null}
    </li>
  );
}

/** 已解冻的历史：一条一行，说清哪一段时间被冻结、谁在何时解冻、留了什么备注。 */
function ReleasedFreezeRow({ freeze }: { freeze: AccessFreeze }) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage;
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <ProviderTag vendor={freeze.provider} withLogo>
          {freezeProviderName(t, freeze)}
        </ProviderTag>
        <span className="text-xs text-ink-3">
          {t("access_freeze.frozen_at", { time: formatFreezeTime(freeze.frozen_at, language) })}
        </span>
        <span className="text-xs tabular-nums text-ink-3">
          {t("access_freeze.strikes", { count: freeze.strike_count })}
        </span>
      </div>
      <p className="mt-1.5 text-sm text-ink-2">
        {freeze.released_by
          ? t("access_freeze.released_by", {
              time: formatFreezeTime(freeze.released_at, language),
              by: freeze.released_by,
            })
          : t("access_freeze.released_at", {
              time: formatFreezeTime(freeze.released_at, language),
            })}
      </p>
      {freeze.release_note ? (
        <p className="mt-1 text-sm text-ink-2 [overflow-wrap:anywhere]">
          <span className="text-ink-3">{t("access_freeze.release_note_label")}</span>
          {" · "}
          {freeze.release_note}
        </p>
      ) : null}
    </li>
  );
}

const CELL = "whitespace-nowrap tabular-nums text-ink-2";

/** 每次被上游拒绝的证据：冻结是据此做出的，管理员解冻前要看的也是它。 */
function strikeColumns(
  t: Translate,
  language: string | undefined,
): DataTableColumn<AccessFreezeStrike>[] {
  return [
    {
      key: "created_at",
      label: t("access_freeze.col_time"),
      width: "w-[184px] min-w-[170px]",
      cellClassName: CELL,
      render: (row) => formatFreezeTime(row.created_at, language),
    },
    {
      key: "provider",
      label: t("access_freeze.col_provider"),
      width: "w-28 min-w-[6rem]",
      render: (row) => freezeProviderName(t, row),
    },
    {
      key: "model",
      label: t("access_freeze.col_model"),
      width: "w-36 min-w-[7rem]",
      cellClassName: "font-mono text-xs text-ink-2",
      render: (row) => row.model || "—",
    },
    {
      key: "message",
      label: t("access_freeze.col_message"),
      width: "w-48 min-w-[10rem]",
      cellClassName: "text-ink-2",
      render: (row) => row.upstream_message || "—",
    },
    {
      key: "auth_label",
      label: t("access_freeze.col_upstream_account"),
      width: "w-40 min-w-[8rem]",
      cellClassName: "font-mono text-xs text-ink-2",
      render: (row) => row.auth_label || "—",
    },
    {
      key: "request_id",
      label: t("access_freeze.col_request_id"),
      width: "w-32 min-w-[6rem]",
      cellClassName: "font-mono text-xs text-ink-2",
      render: (row) => row.request_id || "—",
    },
  ];
}

/**
 * 一个被冻结方（门户账号，或不属于任何门户账号的 Key）的冻结详情：生效中的冻结在上，每条能解冻；
 * 已解冻的历史在下；最后是它每次被上游拒绝的记录（冻结所依据的证据）。
 *
 * 读取在这里自己做：详情要的是这一方的全部历史（含已解冻），页面级的总览只有生效中的。解冻之后重新
 * 读取，并通知调用方刷新它那份。
 */
export function AccessFreezeDetailModal({
  subject,
  canWrite,
  onClose,
  onChanged,
}: {
  subject: AccessFreezeSubjectRef | null;
  canWrite: boolean;
  onClose: () => void;
  /** 解冻成功（或发现冻结已经不在了）之后：调用方据此刷新列表上的标签和计数。 */
  onChanged: () => void;
}) {
  const { t, i18n } = useTranslation();
  const headingId = useId();
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [releaseTarget, setReleaseTarget] = useState<AccessFreeze | null>(null);
  // 较晚发出的读取才有资格写入：解冻后立刻重读、或连续切换被冻结方时，先发出的请求后到。
  const latest = useRef(0);

  const kind = subject?.kind;
  const subjectId = subject?.id;

  const load = useCallback(async () => {
    const ticket = ++latest.current;
    if (!kind || !subjectId) return;
    setLoading(true);
    setError(null);
    try {
      const [freezes, strikes] = await Promise.all([
        accessFreezesApi.list({ status: "all", subjectKind: kind, subjectId, limit: DETAIL_LIMIT }),
        accessFreezesApi.strikes({ subjectKind: kind, subjectId, limit: DETAIL_LIMIT }),
      ]);
      if (ticket !== latest.current) return;
      setData({ freezes, strikes });
    } catch (err) {
      if (ticket !== latest.current) return;
      setError(err);
    } finally {
      if (ticket === latest.current) setLoading(false);
    }
  }, [kind, subjectId]);

  useEffect(() => {
    if (!kind || !subjectId) return;
    // 换了一个被冻结方：不要在新数据到来之前显示上一个的冻结。
    setData(null);
    setReleaseTarget(null);
    void load();
    return () => {
      latest.current += 1;
    };
  }, [kind, subjectId, load]);

  const { active, released } = useMemo(() => {
    const freezes = data?.freezes ?? [];
    return {
      active: freezes.filter((freeze) => !freeze.released_at),
      released: freezes.filter((freeze) => Boolean(freeze.released_at)),
    };
  }, [data]);

  const language = i18n.resolvedLanguage;
  const columns = useMemo(() => strikeColumns(t, language), [language, t]);

  return (
    <>
      <Modal
        open={subject !== null}
        onClose={onClose}
        title={t("access_freeze.detail_title", { name: subject?.name ?? "" })}
        description={t(
          subject?.kind === "api_key"
            ? "access_freeze.detail_desc_api_key"
            : "access_freeze.detail_desc_end_user",
        )}
        icon={<Lock />}
        size="xl"
        footerStart={
          <Button size="sm" variant="ghost" disabled={loading} onClick={() => void load()}>
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
        {error ? (
          <Callout
            tone="danger"
            role="alert"
            title={t("access_freeze.load_failed")}
            actions={
              <Button size="sm" variant="secondary" onClick={() => void load()}>
                {t("common.retry")}
              </Button>
            }
          >
            {describeFreezeError(t, error, t("access_freeze.load_failed"))}
          </Callout>
        ) : !data ? (
          <div aria-busy="true">
            <SkeletonLines rows={6} />
          </div>
        ) : (
          <div className="space-y-6">
            <section aria-labelledby={`${headingId}-active`}>
              <h3 id={`${headingId}-active`} className="mb-2 text-sm font-medium text-ink">
                {t("access_freeze.active_title")}
              </h3>
              {active.length === 0 ? (
                <p className="text-sm text-ink-3">{t("access_freeze.active_empty")}</p>
              ) : (
                <ul className="space-y-3">
                  {active.map((freeze) => (
                    <ActiveFreezeCard
                      key={freeze.id}
                      freeze={freeze}
                      canWrite={canWrite}
                      onRelease={() => setReleaseTarget(freeze)}
                    />
                  ))}
                </ul>
              )}
            </section>

            {released.length > 0 ? (
              <section aria-labelledby={`${headingId}-released`}>
                <h3 id={`${headingId}-released`} className="mb-2 text-sm font-medium text-ink">
                  {t("access_freeze.released_title")}
                </h3>
                <ul className="divide-y divide-line">
                  {released.map((freeze) => (
                    <ReleasedFreezeRow key={freeze.id} freeze={freeze} />
                  ))}
                </ul>
              </section>
            ) : null}

            <section aria-labelledby={`${headingId}-strikes`}>
              <h3 id={`${headingId}-strikes`} className="mb-2 text-sm font-medium text-ink">
                {t("access_freeze.strikes_title")}
              </h3>
              <DataTable
                columns={columns}
                rows={data.strikes}
                rowKey={(row) => String(row.id)}
                emptyText={t("access_freeze.strikes_empty")}
                maxHeight="max-h-[320px]"
                // 与总览同理：放得进约 870px 的弹窗内容区，长的上游原话在单元格里截断并带悬浮提示。
                minWidth="min-w-[860px]"
              />
            </section>
          </div>
        )}
      </Modal>
      <ReleaseFreezeModal
        freeze={releaseTarget}
        subjectName={subject?.name ?? ""}
        onClose={() => setReleaseTarget(null)}
        onChanged={() => {
          void load();
          onChanged();
        }}
      />
    </>
  );
}
