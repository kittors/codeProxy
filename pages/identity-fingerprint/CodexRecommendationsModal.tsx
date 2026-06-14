import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Check, Eye, RefreshCw } from "lucide-react";
import {
  identityFingerprintApi,
  type CodexFingerprintRecommendation,
  type CodexIdentityFingerprint,
} from "@code-proxy/api-client/endpoints/identity-fingerprint";
import { Button, DataTable, HoverTooltip, Modal, type DataTableColumn } from "@code-proxy/ui";

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
  onApply: (recommendation: CodexFingerprintRecommendation) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [items, setItems] = useState<CodexFingerprintRecommendation[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState({ inspected: 0, matched: 0, days: 7 });

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) ?? items[0] ?? null,
    [items, selectedId],
  );

  const loadRecommendations = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await identityFingerprintApi.getCodexRecommendations({
        days: 7,
        limit: 200,
      });
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
      setError(
        err instanceof Error ? err.message : t("identity_fingerprint.recommend_load_failed"),
      );
      setItems([]);
      setSelectedId("");
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!open) return;
    void loadRecommendations();
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
        key: "user_agent",
        label: t("identity_fingerprint.user_agent"),
        width: "w-[300px]",
        overflowTooltip: (item) =>
          item.headers["User-Agent"] || item.recommended["user-agent"] || "",
        render: (item) => (
          <span className="block truncate font-mono text-xs text-slate-700 dark:text-white/70">
            {item.headers["User-Agent"] || item.recommended["user-agent"] || "-"}
          </span>
        ),
      },
      {
        key: "originator",
        label: t("identity_fingerprint.originator"),
        width: "w-32",
        render: (item) => (
          <span className="font-mono text-xs text-slate-700 dark:text-white/70">
            {item.headers.Originator || item.recommended.originator || "-"}
          </span>
        ),
      },
      {
        key: "version",
        label: t("identity_fingerprint.version"),
        width: "w-28",
        render: (item) => (
          <span className="font-mono text-xs text-slate-700 dark:text-white/70">
            {item.headers.Version || item.recommended.version || "-"}
          </span>
        ),
      },
      {
        key: "diff",
        label: t("identity_fingerprint.recommend_diff"),
        width: "w-36",
        render: (item) => {
          const diff = diffById.get(item.id) ?? [];
          return (
            <span
              className={[
                "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
                diff.length > 0
                  ? "bg-sky-50 text-sky-700 dark:bg-sky-400/10 dark:text-sky-200"
                  : "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200",
              ].join(" ")}
            >
              {diff.length > 0
                ? t("identity_fingerprint.recommend_diff_count", { count: diff.length })
                : t("identity_fingerprint.recommend_same")}
            </span>
          );
        },
      },
      {
        key: "actions",
        label: t("identity_fingerprint.recommend_actions"),
        width: "w-28",
        headerClassName: "text-right",
        cellClassName: "text-right",
        render: (item) => (
          <div className="flex justify-end gap-1">
            <Button
              size="xs"
              variant={selected?.id === item.id ? "primary" : "ghost"}
              onClick={() => setSelectedId(item.id)}
              title={t("identity_fingerprint.recommend_view_detail")}
            >
              <Eye size={14} />
            </Button>
            <Button
              size="xs"
              variant="primary"
              onClick={() => onApply(item)}
              title={t("identity_fingerprint.recommend_apply")}
            >
              <Check size={14} />
            </Button>
          </div>
        ),
      },
    ],
    [diffById, onApply, selected?.id, t],
  );

  return (
    <Modal
      open={open}
      title={t("identity_fingerprint.recommend_modal_title")}
      description={t("identity_fingerprint.recommend_modal_desc", {
        days: summary.days,
        inspected: summary.inspected,
        matched: summary.matched,
      })}
      maxWidth="max-w-6xl"
      bodyHeightClassName="max-h-[56vh]"
      bodyClassName="space-y-4"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={() => void loadRecommendations()} disabled={loading}>
            <RefreshCw size={15} className={loading ? "motion-safe:animate-spin" : ""} />
            {t("common.refresh")}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              if (selected) onApply(selected);
            }}
            disabled={!selected}
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

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.75fr)]">
        <div className="min-w-0 overflow-hidden rounded-xl border border-slate-200 dark:border-neutral-800">
          <DataTable<CodexFingerprintRecommendation>
            tableId="codex-fingerprint-recommendations"
            rows={items}
            columns={columns}
            rowKey={(item) => item.id}
            loading={loading}
            rowHeight={58}
            height="h-[340px]"
            minHeight="min-h-[260px]"
            minWidth="min-w-[960px]"
            caption={t("identity_fingerprint.recommend_table_caption")}
            emptyText={t("identity_fingerprint.recommend_empty")}
            showAllLoadedMessage={false}
            rowClassName={(item) =>
              item.id === selected?.id ? "bg-sky-50/60 dark:bg-sky-400/10" : ""
            }
          />
        </div>

        <RecommendationDetail
          item={selected}
          diffs={selected ? (diffById.get(selected.id) ?? []) : []}
        />
      </div>
    </Modal>
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
    <aside className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-neutral-800 dark:bg-neutral-900/35">
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
        <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200 dark:bg-neutral-950 dark:text-white/65 dark:ring-neutral-800">
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
                <div className="text-[11px] font-semibold text-slate-500 dark:text-white/45">
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
              <div className="mt-1 truncate font-mono text-[11px] text-slate-500 dark:text-white/45">
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
      <h4 className="mb-2 text-[11px] font-semibold uppercase text-slate-500 dark:text-white/45">
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
          <div className="text-[11px] font-semibold text-slate-500 dark:text-white/45">{key}</div>
          <HoverTooltip content={value} disabled={value.length < 48}>
            <div
              className={[
                "mt-1 truncate font-mono text-xs",
                muted ? "text-slate-500 dark:text-white/50" : "text-slate-800 dark:text-white/80",
              ].join(" ")}
            >
              {value}
            </div>
          </HoverTooltip>
        </div>
      ))}
    </div>
  );
}

function DiffLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[56px_minmax(0,1fr)] gap-2">
      <span className="text-slate-400 dark:text-white/35">{label}</span>
      <span className="truncate font-mono text-slate-700 dark:text-white/70">{value || "-"}</span>
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
