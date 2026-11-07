import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, ChevronDown, ChevronUp, ShieldAlert, ShieldCheck } from "lucide-react";
import { VendorIcon } from "@code-proxy/assets";
import { Button, Drawer, SegmentedControl } from "@code-proxy/ui";
import type { MaskRecord, MaskRecordDetail, MaskValueHit } from "@code-proxy/api-client";
import { ACTION_CHIP, FINDER_KEYS, clientMeta, kindStyle, valueShape } from "./maskKinds";
import { KindDot, useKindLabel } from "./KindChip";

const PLACEHOLDER = /\{\{[A-Z][A-Z0-9_]*_[a-z2-7]{8}(?:[a-z2-7]{8})?\}\}/g;

type View = "upstream" | "yours";

/**
 * 一个请求的脱敏详情：这一路发生了什么（收到 → 找到 → 替换 → 发出或拦下 → 换回），上游看到的
 * 原文片段（占位符按类目上色），以及每个值是什么、谁找到的、在哪、回复里换回了几处。
 *
 * 原值不在服务器上留存，「你的请求」一栏把占位符显示成值的样子（开头几个字符和长度），
 * 不是原值。选中一个值，片段里它出现的地方亮起，其余淡下去。
 */
export function MaskingRecordDrawer({
  record,
  detail,
  loading,
  onClose,
  onPrev,
  onNext,
}: {
  record: MaskRecord | null;
  detail: MaskRecordDetail | null;
  loading: boolean;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const kindLabel = useKindLabel();
  const [view, setView] = useState<View>("upstream");
  const [picked, setPicked] = useState<string>("");
  const data: MaskRecord | null = detail ?? record;
  const byPlaceholder = useMemo(() => {
    const map = new Map<string, MaskValueHit>();
    for (const value of detail?.values ?? []) if (value.placeholder) map.set(value.placeholder, value);
    return map;
  }, [detail]);

  if (!data) return null;
  const client = clientMeta(data.client);
  const clientName = client.label ?? t("privacy_masking.client.other");
  const when = new Date(data.at).toLocaleString(i18n.language, {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const restored = data.restored ?? data.values.reduce((sum, v) => sum + (v.restored ?? 0), 0);
  const took = data.took_us ? (data.took_us >= 1000 ? `${(data.took_us / 1000).toFixed(1)} ms` : `${data.took_us} µs`) : "";

  const steps: Array<{ title: string; sub: string; tone?: "held" | "muted" }> = [
    { title: t("privacy_masking.detail.step_received"), sub: t("privacy_masking.detail.from", { client: clientName }) },
    {
      title: t("privacy_masking.detail.step_found", { count: data.distinct }),
      sub: took ? t("privacy_masking.detail.took", { took }) : t("privacy_masking.detail.by_rules"),
    },
    { title: t("privacy_masking.detail.step_replaced", { count: data.places }), sub: t("privacy_masking.detail.with_placeholders") },
    data.blocked
      ? { title: t("privacy_masking.detail.step_held"), sub: t("privacy_masking.detail.not_sent"), tone: "held" }
      : { title: t("privacy_masking.detail.step_sent"), sub: data.channel ?? "" },
    data.blocked
      ? { title: t("privacy_masking.detail.step_back"), sub: t("privacy_masking.detail.nothing_sent"), tone: "muted" }
      : restored > 0
        ? { title: t("privacy_masking.detail.step_back_n", { count: restored }), sub: t("privacy_masking.detail.before_client", { client: clientName }) }
        : { title: t("privacy_masking.detail.step_back"), sub: t("privacy_masking.detail.nothing_named"), tone: "muted" },
  ];

  const ink = (text: string): ReactNode[] => {
    const out: ReactNode[] = [];
    let last = 0;
    for (const match of text.matchAll(PLACEHOLDER)) {
      const p = match[0];
      const at = match.index ?? 0;
      out.push(text.slice(last, at));
      const hit = byPlaceholder.get(p);
      const kind = hit?.kind ?? p.slice(2, p.lastIndexOf("_"));
      const lit = picked === "" || picked === p;
      out.push(
        <mark
          key={`${at}-${p}`}
          className={`rounded px-0.5 transition-opacity ${kindStyle(kind).mark} ${lit ? "" : "opacity-35"}`}
        >
          {view === "upstream" ? p : `${valueShape(hit?.head)}${hit ? ` (${hit.len})` : ""}`}
        </mark>,
      );
      last = at + p.length;
    }
    out.push(text.slice(last));
    return out;
  };

  return (
    <Drawer
      open={!!record}
      onClose={onClose}
      title={t("privacy_masking.detail.title", { when })}
      description={
        <span className="inline-flex flex-wrap items-center gap-1.5">
          {client.vendor ? <VendorIcon modelId={client.vendor} size={13} /> : null}
          {clientName}
          <ArrowRight size={12} aria-hidden="true" />
          {data.blocked ? (
            <span className="text-rose-600 dark:text-rose-300">{t("privacy_masking.feed.not_sent")}</span>
          ) : (
            <>
              {data.provider ? <VendorIcon modelId={data.provider} size={13} /> : null}
              {data.channel}
            </>
          )}
          {data.model ? <span className="text-ink-3">· {data.model}</span> : null}
        </span>
      }
      icon={<ShieldCheck size={18} aria-hidden="true" />}
      widthClassName="sm:max-w-2xl"
      footer={
        <div className="flex w-full items-center gap-2">
          <p className="min-w-0 flex-1 text-xs text-ink-3">{t("privacy_masking.detail.no_values_kept")}</p>
          <Button size="sm" variant="ghost" onClick={onPrev} disabled={!onPrev} aria-label={t("privacy_masking.detail.newer")}>
            <ChevronUp size={14} aria-hidden="true" />
          </Button>
          <Button size="sm" variant="ghost" onClick={onNext} disabled={!onNext} aria-label={t("privacy_masking.detail.older")}>
            <ChevronDown size={14} aria-hidden="true" />
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <ol className="grid grid-cols-5 gap-1.5" aria-label={t("privacy_masking.detail.what_happened")}>
          {steps.map((step, index) => (
            <li key={index} className="relative min-w-0">
              <div
                className={[
                  "mb-2 h-1 rounded-full",
                  step.tone === "held" ? "bg-rose-500" : step.tone === "muted" ? "bg-ink/[0.08] dark:bg-white/[0.1]" : "bg-violet-500 dark:bg-violet-400",
                ].join(" ")}
              />
              <p className={`text-xs font-medium ${step.tone === "held" ? "text-rose-600 dark:text-rose-300" : step.tone === "muted" ? "text-ink-3" : "text-ink"}`}>
                {step.title}
              </p>
              <p className="mt-0.5 truncate text-2xs text-ink-3" title={step.sub}>
                {step.sub}
              </p>
            </li>
          ))}
        </ol>

        {data.blocked ? (
          <div className="flex gap-3 rounded-2xl bg-rose-500/[0.07] p-3.5 dark:bg-rose-400/10">
            <ShieldAlert size={18} className="mt-0.5 shrink-0 text-rose-600 dark:text-rose-300" aria-hidden="true" />
            <div className="min-w-0 text-sm">
              <p className="font-medium text-rose-700 dark:text-rose-200">{t("privacy_masking.detail.held_title")}</p>
              <p className="mt-0.5 text-xs text-ink-2">
                {t("privacy_masking.detail.held_body", {
                  kinds: [...new Set(data.values.filter((v) => v.action === "block").map((v) => kindLabel(v.kind)))].join("、"),
                })}
              </p>
            </div>
          </div>
        ) : null}

        <section>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium text-ink">{t("privacy_masking.detail.content")}</h3>
            <SegmentedControl
              size="sm"
              ariaLabel={t("privacy_masking.detail.content")}
              value={view}
              onChange={setView}
              options={[
                { value: "upstream", label: t("privacy_masking.detail.view_upstream") },
                { value: "yours", label: t("privacy_masking.detail.view_yours") },
              ]}
            />
          </div>
          {loading ? (
            <p className="rounded-2xl bg-subtle px-4 py-6 text-center text-xs text-ink-3">{t("common.loading")}</p>
          ) : detail?.snippets && detail.snippets.length > 0 ? (
            <ul className="space-y-2">
              {detail.snippets.map((snippet, index) => (
                <li key={index} className="rounded-2xl bg-subtle px-3.5 py-3">
                  <p className="mb-1.5 flex items-center gap-2 text-2xs text-ink-3">
                    {snippet.role ? <span className="rounded bg-ink/[0.06] px-1.5 py-px font-medium text-ink-2 dark:bg-white/[0.08]">{snippet.role}</span> : null}
                    <span className="truncate font-mono">{snippet.field}</span>
                  </p>
                  <p className="font-mono text-xs leading-relaxed break-words whitespace-pre-wrap text-ink-2">{ink(snippet.text)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-2xl bg-subtle px-4 py-6 text-center text-xs text-ink-3">{t("privacy_masking.detail.snippets_gone")}</p>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-sm font-medium text-ink">
            {t("privacy_masking.detail.values", { count: data.distinct, places: data.places })}
          </h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {(detail?.values ?? data.values).map((value, index) => {
              const key = value.placeholder ?? `${value.kind}-${index}`;
              const active = picked !== "" && picked === value.placeholder;
              return (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => setPicked(active || !value.placeholder ? "" : value.placeholder)}
                    aria-pressed={active}
                    className={[
                      "w-full rounded-2xl px-3.5 py-3 text-left transition-colors",
                      active ? "bg-violet-500/10 dark:bg-violet-400/15" : "bg-subtle hover:bg-ink/[0.05] dark:hover:bg-white/[0.07]",
                    ].join(" ")}
                  >
                    <span className="flex items-center gap-1.5 text-xs">
                      <KindDot kind={value.kind} />
                      <span className="font-medium text-ink">{kindLabel(value.kind)}</span>
                      {value.action ? (
                        <span className={`rounded px-1.5 py-px text-2xs font-medium ${ACTION_CHIP[value.action]}`}>
                          {t(`privacy_masking.action.${value.action}`)}
                        </span>
                      ) : null}
                      <span className="flex-1" />
                      <span className="text-ink-3 tabular-nums">×{value.n}</span>
                    </span>
                    <span className="mt-2 flex min-w-0 items-center gap-1.5 font-mono text-xs">
                      <span className="text-ink">{valueShape(value.head)}</span>
                      <span className="text-2xs text-ink-3">{t("privacy_masking.values.length", { count: value.len })}</span>
                      <ArrowRight size={11} aria-hidden="true" className="shrink-0 text-ink-3" />
                      <span className="truncate text-violet-700 dark:text-violet-300">
                        {value.action === "warn" ? t("privacy_masking.detail.as_written") : (value.placeholder ?? "{{…}}")}
                      </span>
                    </span>
                    <span className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-2xs text-ink-3">
                      <span>{t(FINDER_KEYS[value.by])}</span>
                      {value.field ? <span className="truncate font-mono">{value.field}</span> : null}
                      <span>
                        {data.blocked
                          ? t("privacy_masking.detail.not_sent_short")
                          : value.restored
                            ? t("privacy_masking.detail.restored_n", { count: value.restored })
                            : t("privacy_masking.detail.not_named")}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </Drawer>
  );
}
