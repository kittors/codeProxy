import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { AddedAccount } from "../../model/addedAccount";
import { FileDropZone } from "./FileDropZone";
import { ScrollFade } from "@code-proxy/ui";

/**
 * Existing auth files (CLIProxyAPI exports and the like), several at once. The
 * upload itself is the page's: it already validates sizes, reports partial
 * failures and refreshes quotas for what arrived.
 */
export function AuthFileImport({
  onImportFiles,
  onImported,
}: {
  /** Resolves with the names of the files that were stored. */
  onImportFiles: (files: File[]) => Promise<string[]>;
  onImported: (account: AddedAccount) => void;
}) {
  const { t } = useTranslation();
  const [importing, setImporting] = useState(false);

  const upload = async (files: File[]) => {
    setImporting(true);
    try {
      const stored = await onImportFiles(files);
      if (stored.length > 0) {
        onImported({
          account: t("add_account.import.files_imported", { count: stored.length }),
          details: stored.slice(0, 4),
        });
      }
    } finally {
      setImporting(false);
    }
  };

  return (
    <ScrollFade className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
      <FileDropZone
        multiple
        busy={importing}
        title={t(
          importing ? "add_account.import.files_uploading" : "add_account.import.files_drop",
        )}
        hint={t("add_account.import.files_hint")}
        onFiles={(files) => void upload(files)}
      />
    </ScrollFade>
  );
}
