import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import type { UsageLogEgressResponse } from "@code-proxy/api-client";
import { parseJsonObject } from "./parsers";
import { PlainPre } from "./rendering";

/**
 * 「请求详情」页签：出口网络、客户端传入、传给上游、上游响应，再加 details 里其余的键。
 *
 * 从 LogContentModal 拆出来（那个文件卡在行数棘轮上），解析规则原样搬过来。
 * 请求体 / 响应体在「输入」「输出」页签里已经有了，这里刻意只保留元数据（地址、头、状态）：
 * 同一份几百 KB 的正文再展开一遍，只会把真正要看的请求头淹没。
 */

type RequestDetailRecord = Record<string, unknown>;
type RequestDetailRow = { label: string; value: string };
type RequestDetailGroup = { title: string; rows: RequestDetailRow[] };
type RequestDetailAttempt = {
  title?: string;
  rows: RequestDetailRow[];
  groups: RequestDetailGroup[];
};
type RequestDetailLabels = {
  request: string;
  response: string;
  fingerprintHeaders: string;
};

function isRecord(value: unknown): value is RequestDetailRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function formatDetailValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => formatDetailValue(item))
      .filter(Boolean)
      .join(", ");
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function hasDetailValue(value: string): boolean {
  return (
    value.trim() !== "" &&
    value.trim() !== "<empty>" &&
    value.trim() !== "<none>"
  );
}

function pushDetailRow(
  rows: RequestDetailRow[],
  label: string,
  value: unknown,
) {
  const text = formatDetailValue(value);
  if (hasDetailValue(text)) rows.push({ label, value: text });
}

function normalizeHeaderRows(value: unknown): RequestDetailRow[] {
  if (!isRecord(value)) return [];
  return Object.entries(value)
    .map(([label, rawValue]) => ({ label, value: formatDetailValue(rawValue) }))
    .filter((row) => hasDetailValue(row.value))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function parseExchangeLog(
  raw: unknown,
  kind: "request" | "response",
  labels: RequestDetailLabels,
): RequestDetailAttempt[] {
  const text = formatDetailValue(raw);
  if (!hasDetailValue(text)) return [];

  const lines = text.split(/\r?\n/);
  const attempts: RequestDetailAttempt[] = [];
  let current: RequestDetailAttempt | null = null;
  let currentGroup: RequestDetailGroup | null = null;
  let readingHeaders = false;
  let skippingBody = false;

  const ensureCurrent = () => {
    if (!current) {
      current = { rows: [], groups: [] };
      attempts.push(current);
    }
    return current;
  };

  const flushGroup = () => {
    if (current && currentGroup && currentGroup.rows.length > 0) {
      current.groups.push(currentGroup);
    }
    currentGroup = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const sectionMatch = line.match(
      /^=== API (REQUEST|RESPONSE)\s*(\d+)? ===$/,
    );
    if (sectionMatch) {
      flushGroup();
      const attemptNumber = sectionMatch[2];
      current = {
        title: attemptNumber ? `#${attemptNumber}` : undefined,
        rows: [],
        groups: [],
      };
      attempts.push(current);
      readingHeaders = false;
      skippingBody = false;
      continue;
    }

    if (!line.trim()) {
      if (readingHeaders) {
        flushGroup();
        readingHeaders = false;
      }
      continue;
    }

    if (/^Body:$/i.test(line)) {
      flushGroup();
      readingHeaders = false;
      skippingBody = true;
      continue;
    }
    if (skippingBody) continue;

    if (/^Headers:$/i.test(line)) {
      flushGroup();
      currentGroup = { title: "Headers", rows: [] };
      readingHeaders = true;
      ensureCurrent();
      continue;
    }

    const separator = line.indexOf(":");
    if (separator === -1) {
      if (line !== "<missing>")
        pushDetailRow(
          ensureCurrent().rows,
          kind === "request" ? labels.request : labels.response,
          line,
        );
      continue;
    }

    const label = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (!hasDetailValue(value)) continue;

    if (readingHeaders) {
      currentGroup?.rows.push({ label, value });
      continue;
    }

    pushDetailRow(ensureCurrent().rows, label, value);
  }

  flushGroup();
  return attempts.filter(
    (attempt) => attempt.rows.length > 0 || attempt.groups.length > 0,
  );
}

const BODY_DETAIL_KEYS = new Set([
  "body",
  "bodytext",
  "body_text",
  "requestbody",
  "request_body",
  "responsebody",
  "response_body",
  "raw",
  "payload",
  "content",
  "input_content",
  "output_content",
  "requestlog",
  "request_log",
  "upstreamlog",
  "upstream_log",
]);

function isBodyDetailKey(key: string): boolean {
  return BODY_DETAIL_KEYS.has(key.trim().toLowerCase());
}

function buildGenericRows(
  record: unknown,
  skipKeys: Iterable<string> = [],
): RequestDetailRow[] {
  if (!isRecord(record)) return [];
  const skip = new Set([...BODY_DETAIL_KEYS, ...skipKeys]);
  return Object.entries(record).reduce<RequestDetailRow[]>(
    (rows, [key, value]) => {
      const normalizedKey = key.trim().toLowerCase();
      if (
        skip.has(normalizedKey) ||
        normalizedKey === "headers" ||
        normalizedKey === "fingerprint_headers"
      ) {
        return rows;
      }
      pushDetailRow(rows, key, value);
      return rows;
    },
    [],
  );
}

function buildClientAttempt(
  client: unknown,
  labels: RequestDetailLabels,
): RequestDetailAttempt {
  const record = isRecord(client) ? client : {};
  const preferredKeys = [
    "ip",
    "remote_addr",
    "method",
    "url",
    "path",
    "query",
    "host",
    "content_length",
  ];
  const rows: RequestDetailRow[] = [];
  preferredKeys.forEach((key) => pushDetailRow(rows, key, record[key]));
  const preferredSet = new Set(preferredKeys);
  buildGenericRows(record, preferredSet).forEach((row) => rows.push(row));

  const groups: RequestDetailGroup[] = [];
  const headers = normalizeHeaderRows(record.headers);
  if (headers.length > 0) groups.push({ title: "Headers", rows: headers });
  const fingerprints = normalizeHeaderRows(record.fingerprint_headers);
  if (fingerprints.length > 0)
    groups.push({ title: labels.fingerprintHeaders, rows: fingerprints });

  return { rows, groups };
}

function buildUpstreamAttempts(
  upstream: unknown,
  labels: RequestDetailLabels,
): RequestDetailAttempt[] {
  if (!isRecord(upstream)) return [];
  const parsed = parseExchangeLog(upstream.request_log, "request", labels);
  if (parsed.length > 0) return parsed;

  const rows = buildGenericRows(upstream);
  const headers = normalizeHeaderRows(upstream.headers);
  return [
    {
      rows,
      groups: headers.length > 0 ? [{ title: "Headers", rows: headers }] : [],
    },
  ];
}

function buildResponseAttempts(
  response: unknown,
  labels: RequestDetailLabels,
): RequestDetailAttempt[] {
  if (!isRecord(response)) return [];
  const parsed = parseExchangeLog(response.upstream_log, "response", labels);
  if (parsed.length > 0) return parsed;

  const rows = buildGenericRows(response);
  const headers = normalizeHeaderRows(response.headers);
  return [
    {
      rows,
      groups: headers.length > 0 ? [{ title: "Headers", rows: headers }] : [],
    },
  ];
}

function buildExtraDetailSections(details: RequestDetailRecord): Array<{
  key: string;
  attempts: RequestDetailAttempt[];
}> {
  return Object.entries(details)
    .filter(
      ([key]) =>
        !["client", "upstream", "response"].includes(key) &&
        !isBodyDetailKey(key),
    )
    .map(([key, value]) => {
      if (isRecord(value)) {
        const rows = buildGenericRows(value);
        const headers = normalizeHeaderRows(value.headers);
        return {
          key,
          attempts: [
            {
              rows,
              groups:
                headers.length > 0 ? [{ title: "Headers", rows: headers }] : [],
            },
          ],
        };
      }
      const text = formatDetailValue(value);
      return {
        key,
        attempts: hasDetailValue(text)
          ? [{ rows: [{ label: key, value: text }], groups: [] }]
          : [],
      };
    })
    .filter((section) =>
      section.attempts.some(
        (attempt) =>
          attempt.rows.length > 0 ||
          attempt.groups.some((group) => group.rows.length > 0),
      ),
    );
}

function RequestDetailRows({ rows }: { rows: RequestDetailRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="divide-y divide-line">
      {rows.map((row) => (
        <div
          key={`${row.label}:${row.value}`}
          className="grid min-w-0 gap-1.5 py-2.5 sm:grid-cols-[minmax(8rem,13rem)_minmax(0,1fr)] sm:gap-3"
        >
          <span className="min-w-0 font-mono text-xs leading-5 break-all text-ink-3">
            {row.label}
          </span>
          <span className="min-w-0 font-mono text-xs leading-5 break-words whitespace-pre-wrap text-ink">
            {row.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function RequestDetailGroupView({ group }: { group: RequestDetailGroup }) {
  if (group.rows.length === 0) return null;
  return (
    <div className="pt-3">
      <div className="pb-1 text-xs font-medium text-ink-3">{group.title}</div>
      <RequestDetailRows rows={group.rows} />
    </div>
  );
}

function RequestDetailAttemptView({
  attempt,
  showTitle,
}: {
  attempt: RequestDetailAttempt;
  showTitle: boolean;
}) {
  // 一次上游尝试不再是分区里又一张描边小卡：多次尝试时只用等宽标题隔开，行仍是数据行的细线。
  return (
    <div className="min-w-0">
      {showTitle && attempt.title ? (
        <div className="pb-1 font-mono text-xs text-ink-3">{attempt.title}</div>
      ) : null}
      <RequestDetailRows rows={attempt.rows} />
      {attempt.groups.map((group) => (
        <RequestDetailGroupView key={group.title} group={group} />
      ))}
    </div>
  );
}

function RequestDetailSection({
  title,
  attempts,
  testId,
  defaultOpen = true,
  headerExtras,
}: {
  title: string;
  attempts: RequestDetailAttempt[];
  testId?: string;
  defaultOpen?: boolean;
  headerExtras?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = testId ? `${testId}-content` : undefined;
  const visibleAttempts = attempts.filter(
    (attempt) =>
      attempt.rows.length > 0 ||
      attempt.groups.some((group) => group.rows.length > 0),
  );
  const showAttemptTitle = visibleAttempts.length > 1;

  return (
    // 分区是弹窗里的一块无描边淡底：以前是「描边分区 → 灰底内衬 → 描边小卡」三层框。
    <section data-testid={testId} className="overflow-hidden rounded-xl bg-subtle">
      {/* 分区是 overflow-hidden 的：焦点环往里画，否则全局的外扩描边会被裁掉。 */}
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full touch-manipulation items-center justify-between gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-hover focus-visible:outline-offset-[-2px]"
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <h3 className="min-w-0 truncate text-sm font-medium text-ink">
            {title}
          </h3>
          {headerExtras ? (
            <div className="flex flex-wrap items-center gap-1">
              {headerExtras}
            </div>
          ) : null}
        </div>
        <ChevronDown
          size={16}
          className={`shrink-0 text-ink-3 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            id={contentId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-4 px-3.5 pb-3">
              {visibleAttempts.length > 0 ? (
                visibleAttempts.map((attempt, index) => (
                  <RequestDetailAttemptView
                    key={`${attempt.title ?? "attempt"}-${index}`}
                    attempt={attempt}
                    showTitle={showAttemptTitle}
                  />
                ))
              ) : (
                <span className="block py-1 text-sm text-ink-3">--</span>
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

// 出口网络的小标签：只用状态色的淡底，深浅色由同一组类名覆盖。
const BADGE_TONE = {
  neutral: "bg-ink/[0.05] text-ink-2 dark:bg-white/[0.07]",
  info: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  warning: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  danger: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
} as const;

function Badge({ tone, children }: { tone: keyof typeof BADGE_TONE; children: ReactNode }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${BADGE_TONE[tone]}`}>
      {children}
    </span>
  );
}

function useEgressSection(
  egressInfo: UsageLogEgressResponse | null,
  egressLoading: boolean,
  egressError: string | null,
) {
  const { t } = useTranslation();
  const egressRows: RequestDetailRow[] = [];
  const egressBadges: ReactNode[] = [];

  const routeLabel = egressInfo?.using_proxy
    ? t("log_content.egress_route_proxy")
    : t("log_content.egress_route_direct");
  if (egressInfo) {
    pushDetailRow(egressRows, t("log_content.egress_upstream_ip"), egressInfo.effective_ip);
    pushDetailRow(egressRows, t("log_content.egress_server_ip"), egressInfo.server_ip);
    pushDetailRow(egressRows, t("log_content.egress_route"), routeLabel);
    pushDetailRow(
      egressRows,
      t("log_content.egress_proxy_source"),
      egressInfo.proxy_source === "proxy_id"
        ? t("log_content.egress_source_proxy_id")
        : egressInfo.proxy_source === "auth_proxy_url"
          ? t("log_content.egress_source_auth_proxy_url")
          : egressInfo.proxy_source === "global_proxy_url"
            ? t("log_content.egress_source_global_proxy_url")
            : egressInfo.proxy_source === "direct"
              ? t("log_content.egress_source_direct")
              : egressInfo.proxy_source === "proxy_url"
                ? t("log_content.egress_source_proxy_url")
                : egressInfo.proxy_source,
    );
    pushDetailRow(egressRows, t("log_content.egress_proxy_id"), egressInfo.proxy_id);
    pushDetailRow(egressRows, t("log_content.egress_proxy_name"), egressInfo.proxy_name);
    pushDetailRow(egressRows, t("log_content.egress_proxy_host"), egressInfo.proxy_url_host);
    if (typeof egressInfo.matches_server_ip === "boolean") {
      pushDetailRow(
        egressRows,
        t("log_content.egress_compare"),
        egressInfo.matches_server_ip
          ? t("log_content.egress_compare_same")
          : t("log_content.egress_compare_different"),
      );
    }
    pushDetailRow(egressRows, t("log_content.egress_error"), egressInfo.error);
  } else if (egressLoading) {
    pushDetailRow(egressRows, t("log_content.egress_status"), t("common.loading"));
  } else if (egressError) {
    pushDetailRow(egressRows, t("log_content.egress_error"), egressError);
  }

  if (egressLoading) {
    egressBadges.push(
      <Badge key="loading" tone="neutral">
        {t("log_content.egress_badge_verifying")}
      </Badge>,
    );
  } else if (egressInfo?.using_proxy) {
    egressBadges.push(
      <Badge key="proxy" tone="info">
        {t("log_content.egress_badge_proxy")}
      </Badge>,
    );
  } else if (egressInfo) {
    egressBadges.push(
      <Badge key="direct" tone="neutral">
        {t("log_content.egress_badge_server")}
      </Badge>,
    );
  }
  if (egressInfo && typeof egressInfo.matches_server_ip === "boolean") {
    // 沿用原来的配色语义：出口 IP 与服务器相同用琥珀提醒，不同用绿色。
    egressBadges.push(
      <Badge key="compare" tone={egressInfo.matches_server_ip ? "warning" : "success"}>
        {egressInfo.matches_server_ip
          ? t("log_content.egress_badge_same")
          : t("log_content.egress_badge_different")}
      </Badge>,
    );
  }
  if ((egressInfo?.error || egressError) && !egressLoading) {
    egressBadges.push(
      <Badge key="error" tone="danger">
        {t("log_content.egress_badge_failed")}
      </Badge>,
    );
  }

  return { egressRows, egressBadges };
}

export function RequestDetailsView({
  content,
  egressInfo,
  egressLoading,
  egressError,
}: {
  content: string;
  egressInfo: UsageLogEgressResponse | null;
  egressLoading: boolean;
  egressError: string | null;
}) {
  const { t } = useTranslation();
  const labels = useMemo(
    () => ({
      request: t("log_content.detail_label_request"),
      response: t("log_content.detail_label_response"),
      fingerprintHeaders: t("log_content.detail_group_fingerprint_headers"),
    }),
    [t],
  );
  const { egressRows, egressBadges } = useEgressSection(egressInfo, egressLoading, egressError);

  const details = parseJsonObject(content);
  if (!details) return <PlainPre text={content} />;
  const clientAttempt = buildClientAttempt(details.client, labels);
  const upstreamAttempts = buildUpstreamAttempts(details.upstream, labels);
  const responseAttempts = buildResponseAttempts(details.response, labels);
  const extraSections = buildExtraDetailSections(details);

  return (
    <div className="space-y-3 p-1">
      <RequestDetailSection
        testId="request-detail-section-egress"
        title={t("log_content.details_egress")}
        attempts={egressRows.length > 0 ? [{ rows: egressRows, groups: [] }] : []}
        headerExtras={egressBadges}
      />
      <RequestDetailSection
        testId="request-detail-section-client"
        title={t("log_content.details_client")}
        attempts={[clientAttempt]}
      />
      <RequestDetailSection
        testId="request-detail-section-upstream"
        title={t("log_content.details_upstream")}
        attempts={upstreamAttempts}
      />
      <RequestDetailSection
        testId="request-detail-section-response"
        title={t("log_content.details_response")}
        attempts={responseAttempts}
      />
      {extraSections.map((section) => (
        <RequestDetailSection key={section.key} title={section.key} attempts={section.attempts} />
      ))}
    </div>
  );
}
