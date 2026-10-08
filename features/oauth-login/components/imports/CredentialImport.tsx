import { ArrowUpRight, Check, KeyRound, Loader2, RotateCcw, ShieldCheck, X } from "lucide-react";
import { useMemo, useState, type ComponentProps } from "react";
import { Trans, useTranslation } from "react-i18next";
import type { ProxyPoolEntry } from "@code-proxy/api-client";
import { Button, Callout, Textarea, ScrollFade } from "@code-proxy/ui";
import type { ProxyPoolSelect } from "@features/proxy-pool";
import type { AccountProvider } from "../../model/catalog";
import {
  classifyCredential,
  extractCredentials,
  type CredentialImportSpec,
} from "../../model/credentialImport";
import { importProblemCopyKey } from "../../model/importErrors";
import { useCredentialImportBatch, type ImportRow } from "../../hooks/useCredentialImportBatch";
import { LoginOptions, type LoginOptionValues } from "../LoginOptions";

export interface CredentialImportProps {
  provider: AccountProvider;
  spec: CredentialImportSpec;
  options: LoginOptionValues;
  onOptionsChange: (next: Partial<LoginOptionValues>) => void;
  proxyEntries: ProxyPoolEntry[];
  proxyCheckState: ComponentProps<typeof ProxyPoolSelect>["checkState"];
  /** Refreshes the AI-account list after at least one import succeeds. */
  onRefreshList: () => void;
  onClose: () => void;
}

const STATUS_TONE: Record<ImportRow["status"], string> = {
  pending: "text-ink-3",
  running: "text-accent-ink colorful:text-sky-600 colorful:dark:text-sky-300",
  ok: "text-emerald-700 dark:text-emerald-300",
  error: "text-rose-600 dark:text-rose-300",
};

/** Shortens a credential for display without revealing the middle. */
const maskCredential = (value: string): string =>
  value.length <= 12 ? value : `${value.slice(0, 6)}…${value.slice(-4)}`;

function RowIcon({ status }: { status: ImportRow["status"] }) {
  if (status === "ok") return <Check size={14} aria-hidden="true" />;
  if (status === "error") return <X size={14} aria-hidden="true" />;
  if (status === "running") return <Loader2 size={14} className="animate-spin" aria-hidden="true" />;
  return <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />;
}

/**
 * Credential import for Claude sessionKey, OpenAI / Antigravity refresh tokens
 * and Grok SSO cookies: paste one or many, see where to get them and the risk
 * of doing so, then watch each turn into an account row by row.
 */
export function CredentialImport({
  provider,
  spec,
  options,
  onOptionsChange,
  proxyEntries,
  proxyCheckState,
  onRefreshList,
  onClose,
}: CredentialImportProps) {
  const { t } = useTranslation();
  const [raw, setRaw] = useState("");
  const { rows, running, start, retryFailed, reset } = useCredentialImportBatch(onRefreshList);

  const base = `add_account.credential.${spec.copyKey}`;
  const steps = t(`${base}.steps`, { returnObjects: true, defaultValue: [] }) as string[];
  const credentials = useMemo(() => extractCredentials(spec, raw), [spec, raw]);
  const suspectCount = useMemo(
    () => credentials.filter((value) => classifyCredential(spec, value) === "suspect").length,
    [spec, credentials],
  );

  const runOptions = { proxyId: options.proxyId, usingApi: options.usingApi };
  const failedCount = rows.filter((row) => row.status === "error").length;
  const okCount = rows.filter((row) => row.status === "ok").length;

  if (rows.length > 0) {
    return (
      <ScrollFade className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
        <div className="grid gap-4">
          <p className="text-sm text-ink-2">
            {t("add_account.credential.results_summary", {
              ok: okCount,
              total: rows.length,
            })}
          </p>
          <ul className="grid gap-1.5">
            {rows.map((row) => (
              <li
                key={row.id}
                className="flex items-center gap-2.5 rounded-lg bg-subtle px-3 py-2"
              >
                <span className={["shrink-0", STATUS_TONE[row.status]].join(" ")}>
                  <RowIcon status={row.status} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink">
                    {row.account ?? maskCredential(row.credential)}
                  </span>
                  {row.status === "error" && row.problem ? (
                    <span className="block truncate text-xs text-rose-600 dark:text-rose-300">
                      {row.problem.kind === "failed"
                        ? row.problem.message || t("add_account.import.failed_generic")
                        : t(importProblemCopyKey(row.problem))}
                    </span>
                  ) : row.detail ? (
                    <span className="block truncate text-xs text-ink-3">{row.detail}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            {failedCount > 0 ? (
              <Button
                variant="secondary"
                loading={running}
                onClick={() => void retryFailed(spec, runOptions)}
              >
                {running ? null : <RotateCcw size={15} aria-hidden="true" />}
                {t("add_account.credential.retry_failed", { count: failedCount })}
              </Button>
            ) : null}
            <Button
              variant="ghost"
              disabled={running}
              onClick={() => {
                reset();
                setRaw("");
              }}
            >
              {t("add_account.credential.import_more")}
            </Button>
            <Button variant="primary" disabled={running} onClick={onClose}>
              {t("add_account.success.done")}
            </Button>
          </div>
        </div>
      </ScrollFade>
    );
  }

  return (
    <ScrollFade className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
      <div className="grid gap-4">
        {/* 风险提示用共享的提示条：淡底 + 琥珀图标；简约风格正文保持中性色，多彩风格正文是琥珀字。 */}
        <Callout tone="warning" className="colorful:text-amber-800 colorful:dark:text-amber-200">
          {t(`${base}.risk`)}
        </Callout>
        {steps.length > 0 ? (
          <ol className="grid list-decimal gap-1 pl-5 text-sm text-ink-2 marker:text-ink-3">
            {steps.map((step, index) => (
              <li key={index}>{step}</li>
            ))}
          </ol>
        ) : null}
        <p className="text-xs text-ink-3">
          <Trans
            i18nKey={`${base}.where`}
            components={{
              link: (
                <a
                  className="inline-flex items-center gap-0.5 text-accent-ink underline-offset-2 hover:underline colorful:text-sky-600 colorful:dark:text-sky-300"
                  href={t(`${base}.where_url`)}
                  target="_blank"
                  rel="noreferrer noopener"
                />
              ),
              icon: <ArrowUpRight size={11} aria-hidden="true" className="inline" />,
            }}
          />
        </p>
        <div className="grid gap-2">
          <Textarea
            value={raw}
            onChange={(event) => setRaw(event.currentTarget.value)}
            placeholder={t(`${base}.placeholder`)}
            aria-label={t(`${base}.label`)}
            spellCheck={false}
            className="min-h-32 font-mono text-xs"
          />
          {credentials.length > 0 ? (
            <p className="inline-flex items-center gap-1.5 text-xs text-ink-2">
              <KeyRound size={13} aria-hidden="true" />
              {t("add_account.credential.found", { count: credentials.length })}
              {suspectCount > 0 ? (
                <span className="text-amber-700 dark:text-amber-300">
                  {t("add_account.credential.found_suspect", { count: suspectCount })}
                </span>
              ) : null}
            </p>
          ) : (
            <p className="text-xs text-ink-3">{t("add_account.credential.hint_multi")}</p>
          )}
        </div>
        <LoginOptions
          provider={provider}
          values={options}
          onChange={onOptionsChange}
          proxyEntries={proxyEntries}
          proxyCheckState={proxyCheckState}
          disabled={running}
        />
        <div>
          <Button
            variant="primary"
            disabled={credentials.length === 0}
            loading={running}
            onClick={() => void start(spec, credentials, runOptions)}
          >
            {running ? null : <ShieldCheck size={15} aria-hidden="true" />}
            {credentials.length === 0
              ? t("add_account.credential.submit_empty")
              : t("add_account.credential.submit", { count: credentials.length })}
          </Button>
        </div>
      </div>
    </ScrollFade>
  );
}
