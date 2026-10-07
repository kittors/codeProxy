import { Check, ShieldCheck, TriangleAlert } from "lucide-react";
import { useState, type ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import { oauthApi, type ProxyPoolEntry } from "@code-proxy/api-client";
import { Button, Textarea, ScrollFade } from "@code-proxy/ui";
import type { ProxyPoolSelect } from "@features/proxy-pool";
import { describeLoginError } from "../../model/loginErrors";
import type { AddedAccount } from "../../model/addedAccount";
import type { AccountProvider } from "../../model/catalog";
import { useLoginProblemText } from "../../hooks/useLoginProblemText";
import { LoginOptions, type LoginOptionValues } from "../LoginOptions";

/** The server only accepts iFlow cookies that carry the BXAuth session token. */
export const hasIFlowSessionCookie = (cookie: string) => /(^|[;\s])BXAuth=/.test(cookie.trim());

/**
 * iFlow by cookie, for operators who already have a signed-in browser session
 * and cannot use the browser login (e.g. the callback port is blocked).
 */
export function IFlowCookieImport({
  provider,
  options,
  onOptionsChange,
  proxyEntries,
  proxyCheckState,
  onImported,
}: {
  provider: AccountProvider;
  options: LoginOptionValues;
  onOptionsChange: (next: Partial<LoginOptionValues>) => void;
  proxyEntries: ProxyPoolEntry[];
  proxyCheckState: ComponentProps<typeof ProxyPoolSelect>["checkState"];
  onImported: (account: AddedAccount) => void;
}) {
  const { t } = useTranslation();
  const describeProblem = useLoginProblemText();
  const [cookie, setCookie] = useState("");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");

  const trimmed = cookie.trim();
  const valid = hasIFlowSessionCookie(trimmed);

  const submit = async () => {
    if (!valid || importing) return;
    setImporting(true);
    setError("");
    try {
      const response = await oauthApi.iflowCookieAuth(trimmed, { proxyId: options.proxyId });
      if (response.status !== "ok") {
        setError(response.error || t("add_account.import.failed_generic"));
        return;
      }
      onImported({
        account: response.email,
        details: [
          response.expired ? t("add_account.import.iflow_expires", { time: response.expired }) : "",
          response.saved_path ?? "",
        ].filter(Boolean),
      });
    } catch (err) {
      setError(describeProblem(describeLoginError(err)));
    } finally {
      setImporting(false);
    }
  };

  return (
    <ScrollFade className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
      <div className="grid gap-4">
        <ol className="grid list-decimal gap-1 pl-5 text-sm text-ink-2 marker:text-ink-3">
          <li>{t("add_account.import.iflow_step_1")}</li>
          <li>{t("add_account.import.iflow_step_2")}</li>
          <li>{t("add_account.import.iflow_step_3")}</li>
        </ol>
        <div className="grid gap-2">
          <Textarea
            value={cookie}
            onChange={(event) => {
              setCookie(event.currentTarget.value);
              setError("");
            }}
            placeholder={t("add_account.import.iflow_placeholder")}
            aria-label={t("add_account.import.iflow_label")}
            spellCheck={false}
            className="min-h-32 font-mono text-xs"
          />
          {trimmed ? (
            <p
              className={[
                "inline-flex items-center gap-1.5 text-xs",
                valid
                  ? "text-emerald-700 dark:text-emerald-300"
                  : "text-amber-700 dark:text-amber-300",
              ].join(" ")}
            >
              {valid ? (
                <Check size={13} aria-hidden="true" />
              ) : (
                <TriangleAlert size={13} aria-hidden="true" />
              )}
              {t(valid ? "add_account.import.iflow_ok" : "add_account.import.iflow_missing_bxauth")}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-xs text-rose-600 dark:text-rose-300">
              {error}
            </p>
          ) : null}
        </div>
        <LoginOptions
          provider={provider}
          values={options}
          onChange={onOptionsChange}
          proxyEntries={proxyEntries}
          proxyCheckState={proxyCheckState}
          disabled={importing}
        />
        <div>
          <Button
            variant="primary"
            disabled={!valid}
            loading={importing}
            onClick={() => void submit()}
          >
            {importing ? null : <ShieldCheck size={15} aria-hidden="true" />}
            {t("add_account.import.iflow_submit")}
          </Button>
        </div>
      </div>
    </ScrollFade>
  );
}
