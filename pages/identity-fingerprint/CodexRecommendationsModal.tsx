import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Check, Fingerprint, RefreshCw } from "lucide-react";
import {
  identityFingerprintApi,
  type CodexFingerprintRecommendation,
  type CodexIdentityFingerprint,
} from "@code-proxy/api-client/endpoints/identity-fingerprint";
import {
  Button,
  Callout,
  COLUMN_WIDTH,
  ConfirmModal,
  DataTable,
  EmptyState,
  Modal,
  Skeleton,
  SkeletonLines,
  surface,
  type DataTableColumn,
} from "@code-proxy/ui";
import { codexFromRecommendation } from "./codexRecommendation";

const RECOMMENDATIONS_TIMEOUT_MS = 15000;
const RECOMMENDATIONS_DAYS = 7;
/** 确认框里最多点名几个会被覆盖的字段，再多就写「等 N 项」。 */
const MAX_LISTED_DIFFS = 4;

type RecommendationDiff = {
  key: string;
  label: string;
  current: string;
  next: string;
};

/** 候选的「客户端 + 版本」：列表、详情标题和确认框都用它认出是哪一条。 */
function candidateName(item: CodexFingerprintRecommendation): string {
  const originator = item.recommended.originator || item.headers.Originator || "-";
  const version = item.recommended.version || item.headers.Version || "";
  return version ? `${originator} ${version}` : originator;
}

/**
 * 从近期真实的 Codex 请求里挑一条指纹，应用并保存为当前生效的 Codex 指纹。
 *
 * 左边是候选列表，右边是选中候选与当前表单的差异（先看「会变什么」）以及将要写入的完整值。
 * 「应用并保存」会直接写到服务端，所以中间再过一道确认：点名客户端与版本，列出会被覆盖的字段。
 */
export function CodexRecommendationsModal({
  open,
  current,
  currentCustomHeaders,
  onApply,
  onClose,
}: {
  open: boolean;
  current: Required<CodexIdentityFingerprint>;
  currentCustomHeaders: Record<string, string>;
  onApply: (recommendation: CodexFingerprintRecommendation) => Promise<void>;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const requestSeqRef = useRef(0);
  const [items, setItems] = useState<CodexFingerprintRecommendation[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState("");
  const [confirmApplyOpen, setConfirmApplyOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [summary, setSummary] = useState({ inspected: 0, matched: 0, days: RECOMMENDATIONS_DAYS });

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) ?? items[0] ?? null,
    [items, selectedId],
  );

  const loadRecommendations = useCallback(async (options?: { reset?: boolean }) => {
    const requestId = requestSeqRef.current + 1;
    requestSeqRef.current = requestId;
    setLoading(true);
    setError("");
    if (options?.reset) {
      setHasLoaded(false);
      setItems([]);
      setSelectedId("");
    }
    try {
      const payload = await identityFingerprintApi.getCodexRecommendations(
        {
          days: RECOMMENDATIONS_DAYS,
          limit: 200,
        },
        {
          timeoutMs: RECOMMENDATIONS_TIMEOUT_MS,
        },
      );
      if (requestSeqRef.current !== requestId) return;
      setItems(payload.items);
      setSummary({
        inspected: payload.inspected,
        matched: payload.matched,
        days: payload.days,
      });
      setSelectedId((currentId) =>
        payload.items.some((item) => item.id === currentId)
          ? currentId
          : (payload.items[0]?.id ?? ""),
      );
    } catch (err: unknown) {
      if (requestSeqRef.current !== requestId) return;
      setError(
        err instanceof Error ? err.message : t("identity_fingerprint.recommend_load_failed"),
      );
      if (options?.reset) {
        setItems([]);
        setSelectedId("");
      }
    } finally {
      if (requestSeqRef.current === requestId) {
        setLoading(false);
        setHasLoaded(true);
      }
    }
  }, [t]);

  const confirmApply = useCallback(async () => {
    if (!selected) return;
    setApplying(true);
    setError("");
    try {
      await onApply(selected);
      setConfirmApplyOpen(false);
    } catch (err: unknown) {
      setConfirmApplyOpen(false);
      setError(err instanceof Error ? err.message : t("identity_fingerprint.save_failed"));
    } finally {
      setApplying(false);
    }
  }, [onApply, selected, t]);

  useEffect(() => {
    if (!open) {
      requestSeqRef.current += 1;
      setLoading(false);
      setConfirmApplyOpen(false);
      setApplying(false);
      return;
    }
    void loadRecommendations({ reset: true });
  }, [loadRecommendations, open]);

  const diffById = useMemo(() => {
    const map = new Map<string, RecommendationDiff[]>();
    for (const item of items) {
      map.set(item.id, diffRecommendation(current, currentCustomHeaders, item, t));
    }
    return map;
  }, [current, currentCustomHeaders, items, t]);
  const selectedDiffs = useMemo(
    () => (selected ? (diffById.get(selected.id) ?? []) : []),
    [diffById, selected],
  );

  // 确认框的后果：启用开关单独成一条；其余字段点名列出，太多时只列前几个。
  // 自定义请求头是整体替换（不是合并），要明确告诉用户原来的不会保留。
  const applyConsequences = useMemo(() => {
    const enabling = selectedDiffs.some((diff) => diff.key === "enabled");
    const fields = selectedDiffs.filter((diff) => diff.key !== "enabled").map((diff) => diff.label);
    const list = new Intl.ListFormat(i18n.resolvedLanguage, { type: "conjunction" });
    const lines: ReactNode[] = [];
    if (enabling) lines.push(t("identity_fingerprint.recommend_confirm_enables"));
    if (fields.length > MAX_LISTED_DIFFS) {
      lines.push(
        t("identity_fingerprint.recommend_confirm_overwrites_more", {
          fields: list.format(fields.slice(0, MAX_LISTED_DIFFS)),
          count: fields.length,
        }),
      );
    } else if (fields.length > 0) {
      lines.push(t("identity_fingerprint.recommend_confirm_overwrites", { fields: list.format(fields) }));
    } else if (!enabling) {
      lines.push(t("identity_fingerprint.recommend_confirm_no_diff"));
    }
    lines.push(t("identity_fingerprint.recommend_confirm_custom_headers"));
    return lines;
  }, [i18n.resolvedLanguage, selectedDiffs, t]);

  const columns = useMemo<DataTableColumn<CodexFingerprintRecommendation>[]>(
    () => [
      {
        key: "last_seen",
        label: t("identity_fingerprint.recommend_last_seen"),
        width: COLUMN_WIDTH.numericWide,
        resizable: false,
        reorderable: false,
        render: (item) => (
          <div className="text-xs">
            <div className="font-medium text-ink">{formatDateTime(item.last_seen_at)}</div>
            <div className="mt-1 text-ink-3">
              {t("identity_fingerprint.recommend_count", { count: item.count })}
            </div>
          </div>
        ),
      },
      {
        key: "originator",
        label: t("identity_fingerprint.originator"),
        width: COLUMN_WIDTH.badgeGroup,
        resizable: false,
        reorderable: false,
        overflowTooltip: (item) => item.headers.Originator || item.recommended.originator || "",
        render: (item) => (
          <span className="block truncate font-mono text-xs text-ink-2">
            {item.headers.Originator || item.recommended.originator || "-"}
          </span>
        ),
      },
      {
        key: "version",
        label: t("identity_fingerprint.version"),
        resizable: false,
        reorderable: false,
        overflowTooltip: (item) => item.recommended.version || item.headers.Version || "",
        render: (item) => (
          <span className="block truncate font-mono text-xs text-ink-2">
            {item.recommended.version || item.headers.Version || "-"}
          </span>
        ),
      },
    ],
    [t],
  );

  return (
    <>
      <Modal
        open={open}
        title={t("identity_fingerprint.recommend_modal_title")}
        description={
          hasLoaded
            ? t("identity_fingerprint.recommend_modal_desc", {
                days: summary.days,
                inspected: summary.inspected,
                matched: summary.matched,
              })
            : t("identity_fingerprint.recommend_modal_loading", { days: RECOMMENDATIONS_DAYS })
        }
        icon={<Fingerprint />}
        size="xl"
        bodyOverflowClassName="overflow-y-auto overflow-x-hidden"
        bodyClassName="space-y-4"
        onClose={onClose}
        footerStart={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void loadRecommendations()}
            disabled={loading}
          >
            <RefreshCw size={15} className={loading ? "motion-safe:animate-spin" : ""} />
            {t("common.refresh")}
          </Button>
        }
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="primary"
              onClick={() => setConfirmApplyOpen(true)}
              disabled={!selected || (loading && items.length === 0) || applying}
            >
              <Check size={15} />
              {t("identity_fingerprint.recommend_apply_selected")}
            </Button>
          </>
        }
      >
        {error ? (
          <Callout tone="danger" role="alert">
            {error}
          </Callout>
        ) : null}

        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(460px,0.95fr)_minmax(0,1.05fr)]">
          <div className="min-w-0">
            <DataTable<CodexFingerprintRecommendation>
              rows={items}
              columns={columns}
              rowKey={(item) => item.id}
              loading={loading && !hasLoaded && items.length === 0}
              rowHeight={58}
              height="h-[220px] sm:h-[300px] lg:h-[430px]"
              minHeight="min-h-[180px]"
              minWidth="min-w-full"
              caption={t("identity_fingerprint.recommend_table_caption")}
              emptyText={t("identity_fingerprint.recommend_empty")}
              showAllLoadedMessage={false}
              columnReorderable={false}
              onRowClick={(item) => setSelectedId(item.id)}
              rowAriaSelected={(item) => item.id === selected?.id}
              rowClassName={(item) =>
                item.id === selected?.id
                  ? "[&>td]:!bg-accent-soft colorful:[&>td]:!bg-sky-500/10"
                  : "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent colorful:focus-visible:outline-sky-500"
              }
            />
          </div>

          <RecommendationDetail
            item={selected}
            diffs={selectedDiffs}
            loading={loading && !hasLoaded}
          />
        </div>
      </Modal>
      <ConfirmModal
        open={confirmApplyOpen}
        variant="primary"
        icon={<Fingerprint />}
        title={t("identity_fingerprint.recommend_confirm_title")}
        description={t("identity_fingerprint.recommend_confirm_lead")}
        subject={
          selected ? (
            <span className="block min-w-0">
              <span className="block truncate font-medium">{candidateName(selected)}</span>
              {selected.recommended["user-agent"] ? (
                <span className="mt-0.5 block truncate font-mono text-xs text-ink-3">
                  {selected.recommended["user-agent"]}
                </span>
              ) : null}
            </span>
          ) : undefined
        }
        consequences={applyConsequences}
        confirmText={t("identity_fingerprint.recommend_apply_confirm")}
        busy={applying}
        onClose={() => {
          if (!applying) setConfirmApplyOpen(false);
        }}
        onConfirm={() => void confirmApply()}
      />
    </>
  );
}

// 详情区是一层无边淡底；里面的差异、样本、请求头只是一行行文字，不再各垫一块白底（弹窗里叠三层）。
const DETAIL_BOX = [surface({ tone: "inset", radius: "2xl" }), "min-w-0 p-4"].join(" ");

function RecommendationDetail({
  item,
  diffs,
  loading,
}: {
  item: CodexFingerprintRecommendation | null;
  diffs: RecommendationDiff[];
  loading: boolean;
}) {
  const { t } = useTranslation();
  if (loading) {
    return (
      <div className={DETAIL_BOX} aria-busy="true">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-2 h-3.5 w-28" />
        <SkeletonLines rows={6} className="mt-5" />
      </div>
    );
  }
  if (!item) {
    return (
      <div className={[DETAIL_BOX, "grid place-items-center"].join(" ")}>
        <EmptyState
          icon={<Fingerprint size={20} aria-hidden />}
          title={t("identity_fingerprint.recommend_detail_empty")}
        />
      </div>
    );
  }

  return (
    <aside
      aria-label={t("identity_fingerprint.recommend_detail_title")}
      className={[DETAIL_BOX, "overflow-y-auto lg:max-h-[430px]"].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-ink">{candidateName(item)}</h3>
          <p className="mt-1 text-xs text-ink-3">
            {t("identity_fingerprint.recommend_seen_range", {
              first: formatDateTime(item.first_seen_at),
              last: formatDateTime(item.last_seen_at),
            })}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-selected px-2 py-0.5 text-xs font-semibold text-ink-2 tabular-nums">
          {t("identity_fingerprint.recommend_count", { count: item.count })}
        </span>
      </div>

      {/* 先看「和现在有什么不同」，再看完整的将写入值。 */}
      <DetailSection title={t("identity_fingerprint.recommend_diff")}>
        {diffs.length > 0 ? (
          <div className="space-y-2">
            {diffs.map((diff) => (
              <div key={diff.key} className="py-1">
                <div className="text-xs font-medium text-ink-3">{diff.label}</div>
                <div className="mt-1 grid gap-1 text-xs">
                  <DiffLine
                    label={t("identity_fingerprint.recommend_current")}
                    value={diff.current}
                    kind="current"
                  />
                  <DiffLine
                    label={t("identity_fingerprint.recommend_next")}
                    value={diff.next}
                    kind="next"
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-ink-3">{t("identity_fingerprint.recommend_same_detail")}</p>
        )}
      </DetailSection>

      <DetailSection title={t("identity_fingerprint.recommend_will_apply")}>
        <HeaderValueList values={fingerprintValues(item.recommended)} />
      </DetailSection>

      {item.ignored_headers && Object.keys(item.ignored_headers).length > 0 ? (
        <DetailSection title={t("identity_fingerprint.recommend_not_applied")}>
          <HeaderValueList values={item.ignored_headers} muted />
        </DetailSection>
      ) : null}

      <DetailSection title={t("identity_fingerprint.recommend_samples")}>
        <div className="space-y-2">
          {item.samples.map((sample) => (
            <div
              key={`${sample.log_id}:${sample.timestamp}`}
              className="py-1 text-xs text-ink-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono">#{sample.log_id}</span>
                <span>{formatDateTime(sample.timestamp)}</span>
              </div>
              <div className="mt-1 truncate font-mono text-xs text-ink-3">
                {sample.method || "POST"} {sample.path || "-"}
              </div>
            </div>
          ))}
        </div>
      </DetailSection>
    </aside>
  );
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-5">
      <h4 className="mb-2 text-xs font-medium text-ink-3">{title}</h4>
      {children}
    </section>
  );
}

function HeaderValueList({
  values,
  muted = false,
}: {
  values: Record<string, string>;
  muted?: boolean;
}) {
  const entries = Object.entries(values).filter(([, value]) => String(value ?? "").trim() !== "");
  if (entries.length === 0) return <span className="text-xs text-ink-3">-</span>;
  return (
    <div className="space-y-2">
      {entries.map(([key, value]) => (
        <div key={key} className="min-w-0 py-1">
          <div className="text-xs font-medium text-ink-3">{key}</div>
          <div
            className={[
              "mt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere] font-mono text-xs leading-relaxed",
              muted ? "text-ink-3" : "text-ink",
            ].join(" ")}
          >
            {value}
          </div>
        </div>
      ))}
    </div>
  );
}

/** 差异的一行：当前值划掉（会被覆盖），推荐值用绿色（会写入）。 */
function DiffLine({
  label,
  value,
  kind,
}: {
  label: string;
  value: string;
  kind: "current" | "next";
}) {
  const empty = !value || value === "-";
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2">
      <span className="text-ink-3">{label}</span>
      <span
        className={[
          "min-w-0 break-words [overflow-wrap:anywhere] font-mono",
          empty
            ? "text-ink-4"
            : kind === "current"
              ? "text-ink-3 line-through decoration-rose-400/70"
              : "text-emerald-700 dark:text-emerald-300",
        ].join(" ")}
      >
        {value || "-"}
      </span>
    </div>
  );
}

function fingerprintValues(fingerprint: CodexIdentityFingerprint): Record<string, string> {
  return {
    "User-Agent": fingerprint["user-agent"] ?? "",
    Version: fingerprint.version ?? "",
    Originator: fingerprint.originator ?? "",
    "OpenAI-Beta": fingerprint["websocket-beta"] ?? "",
    ...Object.fromEntries(
      Object.entries(fingerprint["custom-headers"] ?? {}).map(([key, value]) => [key, value]),
    ),
  };
}

const SESSION_MODE_LABEL_KEY: Record<string, string> = {
  "server-stable": "identity_fingerprint.session_server_stable",
  fixed: "identity_fingerprint.session_fixed",
  "per-request": "identity_fingerprint.session_per_request",
};

/**
 * 当前表单与「应用这条推荐之后」的差异。直接拿 codexFromRecommendation 的结果来比，
 * 列出的就是保存时真正会改的：客户端字段、会话设置、自定义请求头（新增、改动、被移除）。
 */
function diffRecommendation(
  current: Required<CodexIdentityFingerprint>,
  currentCustomHeaders: Record<string, string>,
  recommendation: CodexFingerprintRecommendation,
  t: (key: string) => string,
): RecommendationDiff[] {
  const next = codexFromRecommendation(current, recommendation);
  const diffs: RecommendationDiff[] = [];
  const add = (key: string, label: string, before: string | undefined, after: string | undefined) => {
    const from = String(before ?? "").trim();
    const to = String(after ?? "").trim();
    if (from === to) return;
    diffs.push({ key, label, current: from || "-", next: to || "-" });
  };
  const sessionMode = (mode: string | undefined) =>
    mode ? t(SESSION_MODE_LABEL_KEY[mode] ?? mode) : "";

  if (!current.enabled && next.enabled) {
    diffs.push({
      key: "enabled",
      label: t("identity_fingerprint.codex_enabled"),
      current: "false",
      next: "true",
    });
  }
  add("user-agent", t("identity_fingerprint.user_agent"), current["user-agent"], next["user-agent"]);
  add("version", t("identity_fingerprint.version"), current.version, next.version);
  add("originator", t("identity_fingerprint.originator"), current.originator, next.originator);
  add(
    "websocket-beta",
    t("identity_fingerprint.websocket_beta"),
    current["websocket-beta"],
    next["websocket-beta"],
  );
  add(
    "x-codex-beta-features",
    t("identity_fingerprint.codex_beta_features"),
    current["x-codex-beta-features"],
    next["x-codex-beta-features"],
  );
  add(
    "session-mode",
    t("identity_fingerprint.session_mode"),
    sessionMode(current["session-mode"]),
    sessionMode(next["session-mode"]),
  );
  add("session-id", t("identity_fingerprint.session_id"), current["session-id"], next["session-id"]);

  const nextHeaders = next["custom-headers"];
  for (const [key, value] of Object.entries(nextHeaders)) {
    add(`custom:${key}`, key, currentCustomHeaders[key], value);
  }
  // 自定义请求头是整体替换：原来有、推荐里没有的会被删掉，同样列出来。
  for (const [key, value] of Object.entries(currentCustomHeaders)) {
    if (!Object.prototype.hasOwnProperty.call(nextHeaders, key)) add(`custom:${key}`, key, value, "");
  }
  return diffs;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "-";
  return new Intl.DateTimeFormat(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
