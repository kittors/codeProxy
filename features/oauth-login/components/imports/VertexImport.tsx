import { AnimatePresence, motion } from "framer-motion";
import { FileJson, ShieldCheck, X } from "lucide-react";
import { useState, type ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import { vertexApi, type ProxyPoolEntry } from "@code-proxy/api-client";
import { Button, TextInput, ScrollFade, iconHueClass } from "@code-proxy/ui";
import type { ProxyPoolSelect } from "@features/proxy-pool";
import { useLoginProblemText } from "../../hooks/useLoginProblemText";
import type { AddedAccount } from "../../model/addedAccount";
import type { AccountProvider } from "../../model/catalog";
import { describeLoginError } from "../../model/loginErrors";
import { LoginOptions, type LoginOptionValues } from "../LoginOptions";
import { FileDropZone } from "./FileDropZone";

export interface ServiceAccountSummary {
  projectId: string;
  clientEmail: string;
}

const REQUIRED_FIELDS = ["project_id", "client_email", "private_key"] as const;

/**
 * Checks a Google Cloud key file before uploading it. People drop OAuth client
 * secrets or user credentials here as often as service-account keys; naming
 * the missing field says which file they grabbed.
 */
export function readServiceAccount(text: string): {
  summary?: ServiceAccountSummary;
  missing?: string;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { missing: "JSON" };
  }
  if (!parsed || typeof parsed !== "object") return { missing: "JSON" };
  const record = parsed as Record<string, unknown>;
  if (record.type !== "service_account") return { missing: 'type: "service_account"' };
  for (const field of REQUIRED_FIELDS) {
    if (typeof record[field] !== "string" || !String(record[field]).trim())
      return { missing: field };
  }
  return {
    summary: { projectId: String(record.project_id), clientEmail: String(record.client_email) },
  };
}

export function VertexImport({
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
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<ServiceAccountSummary | null>(null);
  const [location, setLocation] = useState("");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");

  const pick = async (files: File[]) => {
    const next = files[0];
    if (!next) return;
    setError("");
    const result = readServiceAccount(await next.text());
    if (!result.summary) {
      setFile(null);
      setSummary(null);
      setError(t("add_account.import.vertex_invalid", { field: result.missing }));
      return;
    }
    setFile(next);
    setSummary(result.summary);
  };

  const submit = async () => {
    if (!file || importing) return;
    setImporting(true);
    setError("");
    try {
      const response = await vertexApi.importCredential(file, location.trim() || undefined, {
        proxyId: options.proxyId,
      });
      const authFile = response["auth-file"] ?? response.auth_file;
      onImported({
        account: response.email || summary?.clientEmail,
        details: [
          t("add_account.import.vertex_project", {
            project: response.project_id || summary?.projectId,
          }),
          response.location
            ? t("add_account.import.vertex_location_value", { location: response.location })
            : "",
          typeof authFile === "string" ? authFile : "",
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
        <AnimatePresence initial={false} mode="wait">
          {summary && file ? (
            <motion.div
              key="preview"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="flex items-center gap-3 rounded-2xl bg-subtle px-4 py-3"
            >
              <FileJson size={18} className={`shrink-0 text-ink-3 ${iconHueClass(FileJson)}`} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{summary.clientEmail}</p>
                <p className="truncate text-xs text-ink-3">
                  {t("add_account.import.vertex_project", { project: summary.projectId })} ·{" "}
                  {file.name}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                aria-label={t("add_account.import.vertex_clear")}
                onClick={() => {
                  setFile(null);
                  setSummary(null);
                }}
              >
                <X size={14} aria-hidden="true" />
              </Button>
            </motion.div>
          ) : (
            <motion.div
              key="drop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <FileDropZone
                title={t("add_account.import.vertex_drop")}
                hint={t("add_account.import.vertex_hint")}
                busy={importing}
                onFiles={(files) => void pick(files)}
              />
            </motion.div>
          )}
        </AnimatePresence>
        {error ? (
          <p role="alert" className="text-xs text-rose-600 dark:text-rose-300">
            {error}
          </p>
        ) : null}
        <label className="grid gap-1.5">
          <span className="text-xs font-medium text-ink-2">
            {t("add_account.import.vertex_location")}
          </span>
          <TextInput
            value={location}
            onChange={(event) => setLocation(event.currentTarget.value)}
            placeholder="us-central1"
            aria-label={t("add_account.import.vertex_location")}
          />
          <span className="text-xs text-ink-3">{t("add_account.import.vertex_location_hint")}</span>
        </label>
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
            disabled={!file}
            loading={importing}
            onClick={() => void submit()}
          >
            {importing ? null : <ShieldCheck size={15} aria-hidden="true" />}
            {t("add_account.import.vertex_submit")}
          </Button>
        </div>
      </div>
    </ScrollFade>
  );
}
