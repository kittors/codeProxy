import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Check, RefreshCw } from "lucide-react";
import {
  identityFingerprintApi,
  type CodexFingerprintRecommendation,
  type CodexIdentityFingerprint,
} from "@code-proxy/api-client/endpoints/identity-fingerprint";
import { Button, ConfirmModal, DataTable, Modal, type DataTableColumn } from "@code-proxy/ui";

const RECOMMENDATIONS_TIMEOUT_MS = 15000;

type RecommendationDiff = {
  key: string;
  label: string;
  current: string;
  next: string;
};

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
  const { t } = useTranslation();
  const requestSeqRef = useRef(0);
  const [items, setItems] = useState<CodexFingerprintRecommendation[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState("");
  const [confirmApplyOpen, setConfirmApplyOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [summary, setSummary] = useState({ inspected: 0, matched: 0, days: 7 });

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
          days: 7,
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
      map.set(item.id, diffRecommendation(current, currentCustomHeaders, item.recommended, t));
    }
    return map;
  }, [current, currentCustomHeaders, items, t]);

  const columns = useMemo<DataTableColumn<CodexFingerprintRecommendation>[]>(
    () => [
      {
        key: "last_seen",
        label: t("identity_fingerprint.recommend_last_seen"),
        width: "w-36",
        resizable: false,
        reorderable: false,
        render: (item) => (
          <div className="text-xs">
            <div className="font-medium text-slate-900 dark:text-white">
              {formatDateTime(item.last_seen_at)}
            </div>
            <div className="mt-1 text-slate-500 dark:text-white/45">
              {t("identity_fingerprint.recommend_count", { count: item.count })}
            </div>
          </div>
        ),
      },
      {
        key: "originator",
        label: t("identity_fingerprint.originator"),
        width: "w-44",
        resizable: false,
        reorderable: false,
        overflowTooltip: (item) => item.headers.Originator || item.recommended.originator || "",
        render: (item) => (
          <span className="block truncate font-mono text-xs text-slate-700 dark:text-white/70">
            {item.headers.Originator || item.recommended.originator || "-"}
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
        description={t("identity_fingerprint.recommend_modal_desc", {
          days: summary.days,
          inspected: summary.inspected,
          matched: summary.matched,
        })}
        maxWidth="max-w-5xl"
        bodyHeightClassName="max-h-[70vh]"
        bodyOverflowClassName="overflow-y-auto overflow-x-hidden"
        bodyClassName="space-y-4"
        onClose={onClose}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => void loadRecommendations()}
              disabled={loading}
            >
              <RefreshCw size={15} className={loading ? "motion-safe:animate-spin" : ""} />
              {t("common.refresh")}
            </Button>
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
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-200">
            {error}
          </div>
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
                  ? "[&>td]:!bg-sky-100 dark:[&>td]:!bg-sky-400/15"
                  : "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-sky-500"
              }
            />
          </div>

          <RecommendationDetail
            item={selected}
            diffs={selected ? (diffById.get(selected.id) ?? []) : []}
          />
        </div>
      </Modal>
      <ConfirmModal
        open={confirmApplyOpen}
        title={t("identity_fingerprint.recommend_confirm_title")}
        description={t("identity_fingerprint.recommend_confirm_desc", {
          originator: selected?.recommended.originator || selected?.headers.Originator || "-",
          version: selected?.recommended.version || selected?.headers.Version || "-",
        })}
        confirmText={t("identity_fingerprint.recommend_apply_confirm")}
        variant="primary"
        busy={applying}
        onClose={() => {
          if (!applying) setConfirmApplyOpen(false);
        }}
        onConfirm={() => void confirmApply()}
      />
    </>
  );
}

function RecommendationDetail({
  item,
  diffs,
}: {
  item: CodexFingerprintRecommendation | null;
  diffs: RecommendationDiff[];
}) {
  const { t } = useTranslation();
  if (!item) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500 dark:border-neutral-800 dark:text-white/50">
        {t("identity_fingerprint.recommend_detail_empty")}
      </div>
    );
  }

  return (
    <aside className="min-w-0 overflow-y-auto rounded-xl bg-slate-50/70 p-4 ring-1 ring-slate-200 dark:bg-neutral-900/35 dark:ring-neutral-800 lg:max-h-[430px]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            {t("identity_fingerprint.recommend_detail_title")}
          </h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-white/50">
            {t("identity_fingerprint.recommend_seen_range", {
              first: formatDateTime(item.first_seen_at),
              last: formatDateTime(item.last_seen_at),
            })}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 dark:bg-neutral-950 dark:text-white/65 dark:ring-neutral-800">
          {t("identity_fingerprint.recommend_count", { count: item.count })}
        </span>
      </div>

      <DetailSection title={t("identity_fingerprint.recommend_will_apply")}>
        <HeaderValueList values={fingerprintValues(item.recommended)} />
      </DetailSection>

      <DetailSection title={t("identity_fingerprint.recommend_diff")}>
        {diffs.length > 0 ? (
          <div className="space-y-2">
            {diffs.map((diff) => (
              <div key={diff.key} className="rounded-lg bg-white px-3 py-2 dark:bg-neutral-950/70">
                <div className="text-xs font-semibold text-slate-500 dark:text-white/45">
                  {diff.label}
                </div>
                <div className="mt-1 grid gap-1 text-xs">
                  <DiffLine
                    label={t("identity_fingerprint.recommend_current")}
                    value={diff.current}
                  />
                  <DiffLine label={t("identity_fingerprint.recommend_next")} value={diff.next} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500 dark:text-white/50">
            {t("identity_fingerprint.recommend_same_detail")}
          </p>
        )}
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
              className="rounded-lg bg-white px-3 py-2 text-xs text-slate-600 dark:bg-neutral-950/70 dark:text-white/65"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono">#{sample.log_id}</span>
                <span>{formatDateTime(sample.timestamp)}</span>
              </div>
              <div className="mt-1 truncate font-mono text-xs text-slate-500 dark:text-white/45">
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
    <section className="mt-4">
      <h4 className="mb-2 text-xs font-semibold uppercase text-slate-500 dark:text-white/45">
        {title}
      </h4>
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
  if (entries.length === 0)
    return <span className="text-xs text-slate-500 dark:text-white/45">-</span>;
  return (
    <div className="space-y-2">
      {entries.map(([key, value]) => (
        <div key={key} className="min-w-0 rounded-lg bg-white px-3 py-2 dark:bg-neutral-950/70">
          <div className="text-xs font-semibold text-slate-500 dark:text-white/45">{key}</div>
          <div
            className={[
              "mt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere] font-mono text-xs leading-relaxed",
              muted ? "text-slate-500 dark:text-white/50" : "text-slate-800 dark:text-white/80",
            ].join(" ")}
          >
            {value}
          </div>
        </div>
      ))}
    </div>
  );
}

function DiffLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2">
      <span className="text-slate-400 dark:text-white/35">{label}</span>
      <span className="min-w-0 break-words [overflow-wrap:anywhere] font-mono text-slate-700 dark:text-white/70">
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

function diffRecommendation(
  current: Required<CodexIdentityFingerprint>,
  currentCustomHeaders: Record<string, string>,
  recommendation: CodexIdentityFingerprint,
  t: (key: string) => string,
): RecommendationDiff[] {
  const diffs: RecommendationDiff[] = [];
  const add = (key: string, label: string, currentValue: string, nextValue: string | undefined) => {
    const next = String(nextValue ?? "").trim();
    if (!next || String(currentValue ?? "").trim() === next) return;
    diffs.push({ key, label, current: currentValue || "-", next });
  };

  add(
    "user-agent",
    t("identity_fingerprint.user_agent"),
    current["user-agent"],
    recommendation["user-agent"],
  );
  add("version", t("identity_fingerprint.version"), current.version, recommendation.version);
  add(
    "originator",
    t("identity_fingerprint.originator"),
    current.originator,
    recommendation.originator,
  );
  add(
    "websocket-beta",
    t("identity_fingerprint.websocket_beta"),
    current["websocket-beta"],
    recommendation["websocket-beta"],
  );

  if (!current.enabled && recommendation.enabled) {
    diffs.unshift({
      key: "enabled",
      label: t("identity_fingerprint.codex_enabled"),
      current: "false",
      next: "true",
    });
  }

  for (const [key, value] of Object.entries(recommendation["custom-headers"] ?? {})) {
    add(`custom:${key}`, key, currentCustomHeaders[key] ?? "", value);
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
