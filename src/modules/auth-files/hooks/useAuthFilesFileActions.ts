import { useCallback, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { authFilesApi } from "@/lib/http/apis";
import type { AuthFileItem } from "@/lib/http/types";
import { useToast } from "@/modules/ui/ToastProvider";
import {
  formatFileSize,
  MAX_AUTH_FILE_SIZE,
  readAuthFileDefaultTags,
} from "@/modules/auth-files/helpers/authFilesPageUtils";

interface UseAuthFilesFileActionsOptions {
  loadAll: () => Promise<AuthFileItem[]>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  detailFile: AuthFileItem | null;
  setDetailFile: Dispatch<SetStateAction<AuthFileItem | null>>;
  setDetailOpen: Dispatch<SetStateAction<boolean>>;
  setFiles: Dispatch<SetStateAction<AuthFileItem[]>>;
  setSelectedFileNames: Dispatch<SetStateAction<string[]>>;
}

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
  const [deletingAll, setDeletingAll] = useState(false);
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

  const handleUpload = useCallback(
    async (input: FileList | File[] | null) => {
      const list = Array.isArray(input) ? input : input ? Array.from(input) : [];
      const files = list.filter(Boolean);
      if (files.length === 0) return;

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
        return;
      }

      setUploading(true);
      try {
        let success = 0;
        let failed = 0;

        for (const file of valid) {
          try {
            await authFilesApi.upload(file);
            success += 1;
          } catch {
            failed += 1;
          }
        }

        if (failed === 0 && tooLarge.length === 0) {
          notify({ type: "success", message: t("auth_files.upload_success", { count: success }) });
        } else {
          notify({
            type: failed > 0 ? "error" : "info",
            message: t("auth_files.upload_partial", { success, failed, skipped: tooLarge.length }),
          });
        }

        await loadAll();
      } catch (err: unknown) {
        notify({
          type: "error",
          message: err instanceof Error ? err.message : t("auth_files.upload_failed"),
        });
      } finally {
        setUploading(false);
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
        let success = 0;
        let failed = 0;
        const deletedNames: string[] = [];

        for (const name of targets) {
          try {
            await authFilesApi.deleteFile(name);
            success += 1;
            deletedNames.push(name);
          } catch {
            failed += 1;
          }
        }

        if (deletedNames.length > 0) {
          setFiles((prev) => prev.filter((file) => !deletedNames.includes(file.name)));
          setSelectedFileNames((prev) => prev.filter((name) => !deletedNames.includes(name)));
          setDetailFile((prev) => (prev && deletedNames.includes(prev.name) ? null : prev));
          setDetailOpen((prev) =>
            prev && detailFile && deletedNames.includes(detailFile.name) ? false : prev,
          );
        }

        if (failed === 0) {
          notify({
            type: "success",
            message: t("auth_files.batch_deleted_selected", { count: success }),
          });
        } else {
          notify({
            type: "error",
            message: t("auth_files.batch_delete_partial", { success, failed }),
          });
        }
      } catch (err: unknown) {
        notify({
          type: "error",
          message: err instanceof Error ? err.message : t("auth_files.delete_failed"),
        });
      } finally {
        setDeletingAll(false);
      }
    },
    [detailFile, notify, setDetailFile, setDetailOpen, setFiles, setSelectedFileNames, t],
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
    deletingAll,
    statusUpdating,
    tagSavingByName,
    downloadAuthFile,
    handleUpload,
    handleDeleteSelection,
    setFileEnabled,
    saveAuthFileTags,
  };
}
