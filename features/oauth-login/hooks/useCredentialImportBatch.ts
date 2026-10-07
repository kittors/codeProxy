import { useCallback, useRef, useState } from "react";
import { oauthApi, type CredentialImportResponse } from "@code-proxy/api-client";
import { describeImportError, type ImportProblem } from "../model/importErrors";
import type { CredentialImportSpec } from "../model/credentialImport";

export type ImportRowStatus = "pending" | "running" | "ok" | "error";

export interface ImportRow {
  /** Stable per paste, so React keys and retries survive a re-render. */
  id: string;
  credential: string;
  status: ImportRowStatus;
  account?: string;
  detail?: string;
  problem?: ImportProblem;
}

export interface ImportRunOptions {
  proxyId: string;
  usingApi: boolean;
}

/** How many credentials exchange at once: gentle on the upstreams, still brisk. */
const CONCURRENCY = 2;

const rowSummary = (response: CredentialImportResponse): Pick<ImportRow, "account" | "detail"> => ({
  account: response.email || response.label || undefined,
  detail: response.organization || response.plan || undefined,
});

/**
 * Runs a batch of credential imports with small concurrency and keeps each
 * row's live status, so the panel shows progress one row at a time and a failed
 * row can be retried on its own. Every exchange is one POST; there is no
 * server-side batch to lose on a node restart.
 */
export function useCredentialImportBatch(onAnySuccess?: () => void) {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [running, setRunning] = useState(false);
  // Guards against a stale run writing over a newer paste's rows.
  const runRef = useRef(0);

  const patch = useCallback((id: string, next: Partial<ImportRow>) => {
    setRows((previous) => previous.map((row) => (row.id === id ? { ...row, ...next } : row)));
  }, []);

  const exchangeOne = useCallback(
    async (spec: CredentialImportSpec, row: ImportRow, options: ImportRunOptions) => {
      patch(row.id, { status: "running", problem: undefined, detail: undefined });
      try {
        const response = await oauthApi.importCredential(spec.kind, {
          credential: row.credential,
          proxyId: options.proxyId,
          usingApi: options.usingApi,
        });
        if (response.status !== "ok") {
          patch(row.id, { status: "error", problem: { kind: "failed", message: response.error ?? "" } });
          return false;
        }
        patch(row.id, { status: "ok", ...rowSummary(response) });
        return true;
      } catch (error) {
        patch(row.id, { status: "error", problem: describeImportError(error) });
        return false;
      }
    },
    [patch],
  );

  const drain = useCallback(
    async (spec: CredentialImportSpec, queue: ImportRow[], options: ImportRunOptions, run: number) => {
      let index = 0;
      let anyOk = false;
      const worker = async () => {
        while (index < queue.length) {
          if (runRef.current !== run) return;
          const row = queue[index++]!;
          const ok = await exchangeOne(spec, row, options);
          anyOk = anyOk || ok;
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
      if (runRef.current === run && anyOk) onAnySuccess?.();
    },
    [exchangeOne, onAnySuccess],
  );

  /** Starts a fresh batch from the extracted, de-duplicated credentials. */
  const start = useCallback(
    async (spec: CredentialImportSpec, credentials: string[], options: ImportRunOptions) => {
      const run = ++runRef.current;
      const queue: ImportRow[] = credentials.map((credential, i) => ({
        id: `${run}-${i}`,
        credential,
        status: "pending",
      }));
      setRows(queue);
      if (queue.length === 0) return;
      setRunning(true);
      try {
        await drain(spec, queue, options, run);
      } finally {
        if (runRef.current === run) setRunning(false);
      }
    },
    [drain],
  );

  /** Re-runs only the rows that failed, leaving successes in place. */
  const retryFailed = useCallback(
    async (spec: CredentialImportSpec, options: ImportRunOptions) => {
      const run = runRef.current;
      const failed = rows.filter((row) => row.status === "error");
      if (failed.length === 0 || running) return;
      setRunning(true);
      try {
        await drain(spec, failed, options, run);
      } finally {
        if (runRef.current === run) setRunning(false);
      }
    },
    [drain, rows, running],
  );

  const reset = useCallback(() => {
    runRef.current += 1;
    setRows([]);
    setRunning(false);
  }, []);

  return { rows, running, start, retryFailed, reset };
}
