import { useCallback, useRef, type MutableRefObject } from "react";
import type { AuthFileItem } from "@code-proxy/api-client";
import {
  normalizeProviderKey,
  resolveAuthFileDisplayName,
  resolveFileType,
} from "@code-proxy/domain";
import type { AddedAccount } from "@features/oauth-login";
import { buildAuthFilesSignature, findChangedAuthFile } from "../helpers/authFilesSignatures";
import type { AuthFilesUploadResult } from "./useAuthFilesFileActions";

const REFRESH_TIMEOUT_MS = 12_000;
const REFRESH_INTERVAL_MS = 600;

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/**
 * Keeps the AI accounts list in step with the add-account dialog.
 *
 * The list is snapshotted when the dialog opens. After a login the list is
 * polled until the new account appears (the server writes it a moment after it
 * reports success), the view switches to that account's provider, and the
 * account is handed back so the success screen can name it. The snapshot then
 * moves forward, so "add another" reports the next account rather than this one
 * again — and files uploaded from the dialog are folded in the same way.
 */
export function useAddAccountDialogSync({
  filesRef,
  loadAll,
  setDialogOpen,
  showProviderFiles,
  handleUpload,
  refreshQuotaForUploadedFiles,
}: {
  filesRef: MutableRefObject<AuthFileItem[]>;
  loadAll: () => Promise<AuthFileItem[]>;
  setDialogOpen: (open: boolean) => void;
  showProviderFiles: (provider: string) => void;
  handleUpload: (input: File[]) => Promise<AuthFilesUploadResult | null>;
  refreshQuotaForUploadedFiles: (
    result: AuthFilesUploadResult | null,
    previousNames: Set<string>,
  ) => Promise<void>;
}) {
  const baselineFilesRef = useRef<AuthFileItem[]>([]);
  const baselineSignatureRef = useRef("");

  const moveBaseline = useCallback((files: AuthFileItem[]) => {
    baselineFilesRef.current = files;
    baselineSignatureRef.current = buildAuthFilesSignature(files);
  }, []);

  const setDialogOpenWithBaseline = useCallback(
    (open: boolean) => {
      if (open) moveBaseline(filesRef.current);
      setDialogOpen(open);
    },
    [filesRef, moveBaseline, setDialogOpen],
  );

  const waitForFilesChanged = useCallback(async (): Promise<AuthFileItem[]> => {
    const previousSignature =
      baselineSignatureRef.current || buildAuthFilesSignature(filesRef.current);
    const deadline = Date.now() + REFRESH_TIMEOUT_MS;
    while (true) {
      if (buildAuthFilesSignature(filesRef.current) !== previousSignature) return filesRef.current;
      const nextFiles = await loadAll();
      if (buildAuthFilesSignature(nextFiles) !== previousSignature || Date.now() >= deadline) {
        return nextFiles;
      }
      await wait(REFRESH_INTERVAL_MS);
    }
  }, [filesRef, loadAll]);

  const refreshAfterAuthorized = useCallback(async (): Promise<AddedAccount | null> => {
    const files = await waitForFilesChanged();
    const changedFile = findChangedAuthFile(baselineFilesRef.current, files);
    moveBaseline(files);
    if (!changedFile) return null;

    const provider = normalizeProviderKey(resolveFileType(changedFile));
    if (provider && provider !== "all" && provider !== "unknown") showProviderFiles(provider);
    return {
      account:
        String(changedFile.email || changedFile.label || "").trim() ||
        resolveAuthFileDisplayName(changedFile),
    };
  }, [moveBaseline, showProviderFiles, waitForFilesChanged]);

  /** Uploads through the page's own handler and returns the names that were stored. */
  const importAuthFiles = useCallback(
    async (files: File[]): Promise<string[]> => {
      const previousNames = new Set(filesRef.current.map((file) => file.name));
      const result = await handleUpload(files);
      void refreshQuotaForUploadedFiles(result, previousNames);
      if (result) moveBaseline(result.files);
      return result?.uploadedNames ?? [];
    },
    [filesRef, handleUpload, moveBaseline, refreshQuotaForUploadedFiles],
  );

  return { setDialogOpenWithBaseline, refreshAfterAuthorized, importAuthFiles };
}
