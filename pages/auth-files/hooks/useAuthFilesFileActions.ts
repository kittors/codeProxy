import { useCallback, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { authFilesApi } from "@code-proxy/api-client";
import type { AuthFileItem } from "@code-proxy/api-client";
import { invalidateConfiguredModelAvailability } from "@features/model-availability";
import { useToast } from "@code-proxy/ui";
import {
  buildAuthFilesBatchZipName,
  createStoreZipBlob,
  downloadBlobAsFile,
  formatFileSize,
  MAX_AUTH_FILE_SIZE,
  readAuthFileDefaultTags,
} from "@code-proxy/domain";

const AUTH_FILES_UPLOAD_CONCURRENCY = 4;

interface UseAuthFilesFileActionsOptions {
  loadAll: () => Promise<AuthFileItem[]>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  detailFile: AuthFileItem | null;
  setDetailFile: Dispatch<SetStateAction<AuthFileItem | null>>;
  setDetailOpen: Dispatch<SetStateAction<boolean>>;
  setFiles: Dispatch<SetStateAction<AuthFileItem[]>>;
  setSelectedFileNames: Dispatch<SetStateAction<string[]>>;
}

export type AuthFilesUploadResult = {
  files: AuthFileItem[];
  uploadedNames: string[];
};

export type AuthFilesUploadProgress = {
  phase: "idle" | "uploading" | "refreshing";
  total: number;
  completed: number;
  success: number;
  failed: number;
  skipped: number;
  activeFileNames: string[];
};

const IDLE_UPLOAD_PROGRESS: AuthFilesUploadProgress = {
  phase: "idle",
  total: 0,
  completed: 0,
  success: 0,
  failed: 0,
  skipped: 0,
  activeFileNames: [],
};

export function useAuthFilesFileActions({
  loadAll,
  fileInputRef,
  detailFile,
  setDetailFile,
  setDetailOpen,
  setFiles,
  setSelectedFileNames,
}: UseAuthFilesFileActionsOptions) {
  const { t } = useTranslation();
  const { notify } = useToast();

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<AuthFilesUploadProgress>(IDLE_UPLOAD_PROGRESS);
  const [deletingAll, setDeletingAll] = useState(false);
  const [batchStatusUpdating, setBatchStatusUpdating] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState<Record<string, boolean>>({});
  const [tagSavingByName, setTagSavingByName] = useState<Record<string, boolean>>({});

  const downloadAuthFile = useCallback(
    async (file: AuthFileItem) => {
      const confirmed = window.confirm(
        t(
          "auth_files.download_sensitive_confirm",
          "This downloads the full auth file and may include sensitive credentials. Continue?",
        ),
      );
      if (!confirmed) return;

      try {
        await authFilesApi.downloadFile(file.name);
      } catch (err: unknown) {
        notify({
          type: "error",
          message: err instanceof Error ? err.message : t("auth_files.download_failed"),
        });
      }
    },
    [notify, t],
  );

  const handleDownloadSelection = useCallback(
    async (names: string[]) => {
      const targets = Array.from(new Set(names.map((name) => name.trim()).filter(Boolean)));
      if (targets.length === 0) return;

      const confirmed = window.confirm(
        t("auth_files.batch_download_sensitive_confirm", {
          count: targets.length,
          defaultValue:
            "This downloads {{count}} full auth file(s) and may include sensitive credentials. Continue?",
        }),
      );
      if (!confirmed) return;

      // Single selection: keep one-file download UX.
      if (targets.length === 1) {
        try {
          await authFilesApi.downloadFile(targets[0]!);
          notify({
            type: "success",
            message: t("auth_files.batch_download_success", { count: 1 }),
          });
        } catch (err: unknown) {
          notify({
            type: "error",
            message: err instanceof Error ? err.message : t("auth_files.download_failed"),
          });
        }
        return;
      }

      // Multiple selection: pack into one zip so the browser gets a single artifact.
      const zipEntries: { name: string; data: Uint8Array }[] = [];
      let failed = 0;
      const usedNames = new Set<string>();

      for (const name of targets) {
        try {
          const blob = await authFilesApi.downloadBlob(name);
          const buffer = new Uint8Array(await blob.arrayBuffer());
          let entryName = name;
          if (usedNames.has(entryName)) {
            const extIndex = entryName.lastIndexOf(".");
            const base = extIndex > 0 ? entryName.slice(0, extIndex) : entryName;
            const ext = extIndex > 0 ? entryName.slice(extIndex) : "";
            let i = 2;
            while (usedNames.has(`${base} (${i})${ext}`)) i += 1;
            entryName = `${base} (${i})${ext}`;
          }
          usedNames.add(entryName);
          zipEntries.push({ name: entryName, data: buffer });
        } catch {
          failed += 1;
        }
      }

      const success = zipEntries.length;
      if (success === 0) {
        notify({
          type: "error",
          message: t("auth_files.batch_download_partial", { success: 0, failed }),
        });
        return;
      }

      try {
        const zipBlob = createStoreZipBlob(zipEntries);
        downloadBlobAsFile(zipBlob, buildAuthFilesBatchZipName(success));
        if (failed === 0) {
          notify({
            type: "success",
            message: t("auth_files.batch_download_zip_success", {
              count: success,
              defaultValue: "Downloaded {{count}} auth file(s) as a zip archive",
            }),
          });
        } else {
          notify({
            type: "error",
            message: t("auth_files.batch_download_zip_partial", {
              success,
              failed,
              defaultValue:
                "Zip download finished: {{success}} packed, {{failed}} failed",
            }),
          });
        }
      } catch (err: unknown) {
        notify({
          type: "error",
          message: err instanceof Error ? err.message : t("auth_files.download_failed"),
        });
      }
    },
    [notify, t],
  );

  const handleUpload = useCallback(
    async (input: FileList | File[] | null): Promise<AuthFilesUploadResult | null> => {
      const list = Array.isArray(input) ? input : input ? Array.from(input) : [];
      const files = list.filter(Boolean);
      if (files.length === 0) return null;

      const tooLarge: File[] = [];
      const valid: File[] = [];

      files.forEach((file) => {
        if (file.size > MAX_AUTH_FILE_SIZE) {
          tooLarge.push(file);
          return;
        }
        valid.push(file);
      });

      if (tooLarge.length > 0 && valid.length === 0) {
        const first = tooLarge[0];
        notify({
          type: "error",
          message: t("auth_files.file_too_large_detail", {
            size: formatFileSize(first.size),
            name: first.name,
            maxSize: formatFileSize(MAX_AUTH_FILE_SIZE),
          }),
        });
        return null;
      }

      setUploading(true);
      try {
        const uploadedNames: string[] = [];
        const queue = [...valid];
        setUploadProgress({
          phase: "uploading",
          total: files.length,
          completed: tooLarge.length,
          success: 0,
          failed: 0,
          skipped: tooLarge.length,
          activeFileNames: [],
        });

        const workerCount = Math.min(AUTH_FILES_UPLOAD_CONCURRENCY, queue.length);
        await Promise.all(
          Array.from({ length: workerCount }, async () => {
            while (true) {
              const file = queue.shift();
              if (!file) return;

              setUploadProgress((prev) => ({
                ...prev,
                activeFileNames: [...prev.activeFileNames, file.name],
              }));

              try {
                await authFilesApi.upload(file);
                uploadedNames.push(file.name);
                setUploadProgress((prev) => ({
                  ...prev,
                  completed: prev.completed + 1,
                  success: prev.success + 1,
                  activeFileNames: prev.activeFileNames.filter((name) => name !== file.name),
                }));
              } catch {
                setUploadProgress((prev) => ({
                  ...prev,
                  completed: prev.completed + 1,
                  failed: prev.failed + 1,
                  activeFileNames: prev.activeFileNames.filter((name) => name !== file.name),
                }));
              }
            }
          }),
        );

        const success = uploadedNames.length;
        const failed = valid.length - success;

        if (success > 0) invalidateConfiguredModelAvailability();

        if (failed === 0 && tooLarge.length === 0) {
          notify({ type: "success", message: t("auth_files.upload_success", { count: success }) });
        } else {
          notify({
            type: failed > 0 ? "error" : "info",
            message: t("auth_files.upload_partial", { success, failed, skipped: tooLarge.length }),
          });
        }

        if (success === 0) return null;

        setUploadProgress((prev) => ({
          ...prev,
          phase: "refreshing",
          activeFileNames: [],
        }));
        const nextFiles = await loadAll();
        return { files: nextFiles, uploadedNames };
      } catch (err: unknown) {
        notify({
          type: "error",
          message: err instanceof Error ? err.message : t("auth_files.upload_failed"),
        });
        return null;
      } finally {
        setUploading(false);
        setUploadProgress(IDLE_UPLOAD_PROGRESS);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [fileInputRef, loadAll, notify, t],
  );

  const handleDeleteSelection = useCallback(
    async (names: string[]) => {
      const targets = Array.from(new Set(names.map((name) => name.trim()).filter(Boolean)));
      if (targets.length === 0) return;

      setDeletingAll(true);
      try {
        const deletedNames = new Set<string>();
        const requestFailures = new Set<string>();

        for (const name of targets) {
          try {
            await authFilesApi.deleteFile(name);
            deletedNames.add(name);
          } catch {
            requestFailures.add(name);
          }
        }

        // Re-read authoritative state: deletion can succeed before a trailing cleanup/response fails.
        const refreshedFiles = await loadAll();
        const remainingNames = new Set(refreshedFiles.map((file) => file.name));
        requestFailures.forEach((name) => {
          if (!remainingNames.has(name)) deletedNames.add(name);
        });

        if (deletedNames.size > 0) {
          invalidateConfiguredModelAvailability();
          const deleted = Array.from(deletedNames);
          setSelectedFileNames((prev) => prev.filter((name) => !deletedNames.has(name)));
          setDetailFile((prev) => (prev && deletedNames.has(prev.name) ? null : prev));
          setDetailOpen((prev) =>
            prev && detailFile && deletedNames.has(detailFile.name) ? false : prev,
          );
          // loadAll normally replaced the list; this also covers aborted/stale refreshes.
          setFiles((prev) => prev.filter((file) => !deleted.includes(file.name)));
        }

        const success = deletedNames.size;
        const failed = targets.length - success;
        notify({
          type: failed === 0 ? "success" : "error",
          message:
            failed === 0
              ? t("auth_files.batch_deleted_selected", { count: success })
              : t("auth_files.batch_delete_partial", { success, failed }),
        });
      } catch (err: unknown) {
        notify({
          type: "error",
          message: err instanceof Error ? err.message : t("auth_files.delete_failed"),
        });
      } finally {
        setDeletingAll(false);
      }
    },
    [detailFile, loadAll, notify, setDetailFile, setDetailOpen, setFiles, setSelectedFileNames, t],
  );

  const handleDisableSelection = useCallback(
    async (names: string[]) => {
      const targets = Array.from(new Set(names.map((name) => name.trim()).filter(Boolean)));
      if (targets.length === 0) return;

      setBatchStatusUpdating(true);
      setStatusUpdating((prev) => ({
        ...prev,
        ...Object.fromEntries(targets.map((name) => [name, true])),
      }));
      try {
        const disabledNames = new Set<string>();
        const requestFailures = new Set<string>();

        for (const name of targets) {
          try {
            const result = await authFilesApi.setStatus(name, true);
            if (result.disabled) disabledNames.add(name);
            else requestFailures.add(name);
          } catch {
            requestFailures.add(name);
          }
        }

        const refreshedFiles = await loadAll();
        const filesByName = new Map(refreshedFiles.map((file) => [file.name, file]));
        requestFailures.forEach((name) => {
          if (filesByName.get(name)?.disabled === true) disabledNames.add(name);
        });

        if (disabledNames.size > 0) {
          invalidateConfiguredModelAvailability();
          setFiles((prev) =>
            prev.map((file) =>
              disabledNames.has(file.name) ? { ...file, disabled: true } : file,
            ),
          );
          setDetailFile((prev) =>
            prev && disabledNames.has(prev.name) ? { ...prev, disabled: true } : prev,
          );
        }

        const success = disabledNames.size;
        const failed = targets.length - success;
        notify({
          type: failed === 0 ? "success" : "error",
          message:
            failed === 0
              ? t("auth_files.batch_status_success", { count: success })
              : t("auth_files.batch_status_partial", { success, failed }),
        });
      } finally {
        setBatchStatusUpdating(false);
        setStatusUpdating((prev) => {
          const next = { ...prev };
          targets.forEach((name) => delete next[name]);
          return next;
        });
      }
    },
    [loadAll, notify, setDetailFile, setFiles, t],
  );

  const setFileEnabled = useCallback(
    async (file: AuthFileItem, enabled: boolean) => {
      const name = file.name;
      const prevDisabled = Boolean(file.disabled);
      const nextDisabled = !enabled;

      setStatusUpdating((prev) => ({ ...prev, [name]: true }));
      setFiles((prev) =>
        prev.map((item) => (item.name === name ? { ...item, disabled: nextDisabled } : item)),
      );

      try {
        const res = await authFilesApi.setStatus(name, nextDisabled);
        invalidateConfiguredModelAvailability();
        setFiles((prev) =>
          prev.map((item) => (item.name === name ? { ...item, disabled: res.disabled } : item)),
        );
        notify({
          type: "success",
          message: enabled ? t("auth_files.enabled") : t("auth_files.disabled"),
        });
      } catch (err: unknown) {
        setFiles((prev) =>
          prev.map((item) => (item.name === name ? { ...item, disabled: prevDisabled } : item)),
        );
        notify({
          type: "error",
          message: err instanceof Error ? err.message : t("auth_files.status_update_failed"),
        });
      } finally {
        setStatusUpdating((prev) => {
          const next = { ...prev };
          delete next[name];
          return next;
        });
      }
    },
    [notify, setFiles, t],
  );

  const saveAuthFileTags = useCallback(
    async (file: AuthFileItem, customTags: string[], displayTags: string[]) => {
      const name = file.name;
      setTagSavingByName((prev) => ({ ...prev, [name]: true }));
      try {
        const defaultTags = readAuthFileDefaultTags(file);
        const displayTagSet = new Set(displayTags);
        const hiddenDefaultTags = defaultTags.filter((tag) => !displayTagSet.has(tag));
        await authFilesApi.patchFields({
          name,
          custom_tags: customTags,
          hidden_default_tags: hiddenDefaultTags,
          display_tags: displayTags,
        });
        const applyPatch = (item: AuthFileItem): AuthFileItem =>
          item.name === name
            ? {
                ...item,
                default_tags: defaultTags,
                custom_tags: customTags,
                hidden_default_tags: hiddenDefaultTags,
                display_tags: displayTags,
              }
            : item;
        setFiles((prev) => prev.map(applyPatch));
        setDetailFile((prev) => (prev && prev.name === name ? applyPatch(prev) : prev));
        notify({
          type: "success",
          message: t("auth_files.prefix_proxy_saved_success", { name }),
        });
        return true;
      } catch (err: unknown) {
        notify({
          type: "error",
          message: err instanceof Error ? err.message : t("auth_files.save_failed"),
        });
        return false;
      } finally {
        setTagSavingByName((prev) => {
          const next = { ...prev };
          delete next[name];
          return next;
        });
      }
    },
    [notify, setDetailFile, setFiles, t],
  );

  return {
    uploading,
    uploadProgress,
    deletingAll,
    batchStatusUpdating,
    statusUpdating,
    tagSavingByName,
    downloadAuthFile,
    handleDownloadSelection,
    handleUpload,
    handleDeleteSelection,
    handleDisableSelection,
    setFileEnabled,
    saveAuthFileTags,
  };
}
