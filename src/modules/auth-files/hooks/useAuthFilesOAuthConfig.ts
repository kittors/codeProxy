import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useTranslation } from "react-i18next";
import { authFilesApi } from "@/lib/http/apis";
import { useToast } from "@/modules/ui/ToastProvider";
import type { AuthFileModelItem, AliasRow } from "@/modules/auth-files/helpers/authFilesPageUtils";
import {
  buildAliasRows,
  normalizeProviderKey,
} from "@/modules/auth-files/helpers/authFilesPageUtils";
import type { OAuthModelAliasEntry } from "@/lib/http/types";

export function useAuthFilesOAuthConfig(tab: "files" | "excluded" | "alias") {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [isPending, startTransition] = useTransition();

  const [excludedLoading, setExcludedLoading] = useState(false);
  const [excluded, setExcluded] = useState<Record<string, string[]>>({});
  const [excludedDraft, setExcludedDraft] = useState<Record<string, string>>({});
  const [excludedNewProvider, setExcludedNewProvider] = useState("");
  const [excludedUnsupported, setExcludedUnsupported] = useState(false);
  const [excludedLoadAttempted, setExcludedLoadAttempted] = useState(false);

  const [aliasLoading, setAliasLoading] = useState(false);
  const [aliasMap, setAliasMap] = useState<Record<string, OAuthModelAliasEntry[]>>({});
  const [aliasEditing, setAliasEditing] = useState<Record<string, AliasRow[]>>({});
  const [aliasNewChannel, setAliasNewChannel] = useState("");
  const [aliasUnsupported, setAliasUnsupported] = useState(false);
  const [aliasLoadAttempted, setAliasLoadAttempted] = useState(false);

  const [importOpen, setImportOpen] = useState(false);
  const [importChannel, setImportChannel] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importModels, setImportModels] = useState<AuthFileModelItem[]>([]);
  const [importSearch, setImportSearch] = useState("");
  const [importSelected, setImportSelected] = useState<Set<string>>(new Set());

  const refreshExcluded = useCallback(async () => {
    setExcludedLoadAttempted(true);
    setExcludedLoading(true);
    try {
      const map = await authFilesApi.getOauthExcludedModels();
      setExcludedUnsupported(false);
      setExcluded(map);
      setExcludedDraft(
        Object.fromEntries(
          Object.entries(map).map(([key, value]) => [
            key,
            Array.isArray(value) ? value.join("\n") : "",
          ]),
        ),
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "";
      if (/404|not found/i.test(message)) {
        setExcludedUnsupported(true);
        setExcluded({});
        setExcludedDraft({});
        return;
      }
      notify({ type: "error", message: message || t("auth_files.load_excluded_failed") });
    } finally {
      setExcludedLoading(false);
    }
  }, [notify, t]);

  const refreshAlias = useCallback(async () => {
    setAliasLoadAttempted(true);
    setAliasLoading(true);
    try {
      const map = await authFilesApi.getOauthModelAlias();
      setAliasUnsupported(false);
      setAliasMap(map);
      setAliasEditing(
        Object.fromEntries(Object.entries(map).map(([key, value]) => [key, buildAliasRows(value)])),
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "";
      if (/404|not found/i.test(message)) {
        setAliasUnsupported(true);
        setAliasMap({});
        setAliasEditing({});
        return;
      }
      notify({ type: "error", message: message || t("auth_files.load_alias_failed") });
    } finally {
      setAliasLoading(false);
    }
  }, [notify, t]);

  useEffect(() => {
    if (
      tab === "excluded" &&
      !excludedLoadAttempted &&
      !excludedLoading &&
      !excludedUnsupported &&
      Object.keys(excluded).length === 0
    ) {
      void refreshExcluded();
    }
    if (
      tab === "alias" &&
      !aliasLoadAttempted &&
      !aliasLoading &&
      !aliasUnsupported &&
      Object.keys(aliasMap).length === 0
    ) {
      void refreshAlias();
    }
  }, [
    aliasLoading,
    aliasMap,
    aliasUnsupported,
    aliasLoadAttempted,
    excluded,
    excludedLoading,
    excludedUnsupported,
    excludedLoadAttempted,
    refreshAlias,
    refreshExcluded,
    tab,
  ]);

  const saveExcludedProvider = useCallback(
    async (provider: string, text: string) => {
      if (excludedUnsupported) {
        notify({
          type: "error",
          message: t("auth_files.server_no_excluded_api"),
        });
        return;
      }
      const key = normalizeProviderKey(provider);
      const models = text
        .split(/[\n,]+/)
        .map((item) => item.trim())
        .filter(Boolean);
      try {
        await authFilesApi.saveOauthExcludedModels(key, models);
        notify({ type: "success", message: t("auth_files.saved") });
        startTransition(() => void refreshExcluded());
      } catch (err: unknown) {
        notify({
          type: "error",
          message: err instanceof Error ? err.message : t("auth_files.save_failed"),
        });
      }
    },
    [excludedUnsupported, notify, refreshExcluded, startTransition, t],
  );

  const deleteExcludedProvider = useCallback(
    async (provider: string) => {
      if (excludedUnsupported) {
        notify({
          type: "error",
          message:
            "Server does not support OAuth excluded models API (/oauth-excluded-models). Please upgrade.",
        });
        return;
      }
      const key = normalizeProviderKey(provider);
      try {
        await authFilesApi.deleteOauthExcludedEntry(key);
        notify({ type: "success", message: t("auth_files.deleted") });
        startTransition(() => void refreshExcluded());
      } catch (err: unknown) {
        notify({
          type: "error",
          message: err instanceof Error ? err.message : t("auth_files.delete_failed"),
        });
      }
    },
    [excludedUnsupported, notify, refreshExcluded, startTransition, t],
  );

  const addExcludedProvider = useCallback(() => {
    const key = normalizeProviderKey(excludedNewProvider);
    if (!key) {
      notify({ type: "info", message: t("auth_files.please_enter_provider") });
      return;
    }
    setExcluded((prev) => (prev[key] ? prev : { ...prev, [key]: [] }));
    setExcludedDraft((prev) => (prev[key] !== undefined ? prev : { ...prev, [key]: "" }));
    setExcludedNewProvider("");
  }, [excludedNewProvider, notify, t]);

  const addAliasChannel = useCallback(() => {
    const key = normalizeProviderKey(aliasNewChannel);
    if (!key) {
      notify({ type: "info", message: t("auth_files.please_enter_channel") });
      return;
    }
    setAliasMap((prev) => (prev[key] ? prev : { ...prev, [key]: [] }));
    setAliasEditing((prev) => (prev[key] ? prev : { ...prev, [key]: buildAliasRows([]) }));
    setAliasNewChannel("");
  }, [aliasNewChannel, notify, t]);

  const saveAliasChannel = useCallback(
    async (channel: string) => {
      if (aliasUnsupported) {
        notify({
          type: "error",
          message: t("auth_files.server_no_alias_api"),
        });
        return;
      }
      const key = normalizeProviderKey(channel);
      const rows = aliasEditing[key] ?? [];
      const next = rows
        .map((row) => ({
          name: row.name.trim(),
          alias: row.alias.trim(),
          ...(row.fork ? { fork: true } : {}),
        }))
        .filter((row) => row.name && row.alias);

      try {
        await authFilesApi.saveOauthModelAlias(key, next);
        notify({ type: "success", message: t("auth_files.saved") });
        startTransition(() => void refreshAlias());
      } catch (err: unknown) {
        notify({
          type: "error",
          message: err instanceof Error ? err.message : t("auth_files.save_failed"),
        });
      }
    },
    [aliasEditing, aliasUnsupported, notify, refreshAlias, startTransition, t],
  );

  const deleteAliasChannel = useCallback(
    async (channel: string) => {
      if (aliasUnsupported) {
        notify({
          type: "error",
          message: t("auth_files.server_no_alias_api"),
        });
        return;
      }
      const key = normalizeProviderKey(channel);
      try {
        await authFilesApi.deleteOauthModelAlias(key);
        notify({ type: "success", message: t("auth_files.deleted") });
        startTransition(() => void refreshAlias());
      } catch (err: unknown) {
        notify({
          type: "error",
          message: err instanceof Error ? err.message : t("auth_files.delete_failed"),
        });
      }
    },
    [aliasUnsupported, notify, refreshAlias, startTransition, t],
  );

  const openImport = useCallback(
    async (channel: string) => {
      if (aliasUnsupported) return;
      const key = normalizeProviderKey(channel);
      if (!key) return;

      setImportOpen(true);
      setImportChannel(key);
      setImportLoading(true);
      setImportModels([]);
      setImportSearch("");
      setImportSelected(new Set());

      try {
        const models = await authFilesApi.getModelDefinitions(key);
        const list = Array.isArray(models) ? models : [];
        setImportModels(list);
        setImportSelected(new Set(list.map((model) => model.id)));
      } catch (err: unknown) {
        notify({
          type: "error",
          message: err instanceof Error ? err.message : t("auth_files.failed_get_models"),
        });
        setImportOpen(false);
      } finally {
        setImportLoading(false);
      }
    },
    [aliasUnsupported, notify, t],
  );

  const applyImport = useCallback(() => {
    const key = importChannel;
    if (!key) return;

    const selected = new Set(importSelected);
    const picked = importModels.filter((model) => selected.has(model.id));
    if (picked.length === 0) {
      notify({ type: "info", message: t("auth_files.no_models_selected") });
      return;
    }

    setAliasEditing((prev) => {
      const current = prev[key] ?? buildAliasRows([]);
      const seen = new Set(
        current.map(
          (row) => `${row.name.toLowerCase()}::${row.alias.toLowerCase()}::${row.fork ? "1" : "0"}`,
        ),
      );

      const merged = [...current];
      picked.forEach((model) => {
        const name = model.id;
        const alias = model.id;
        const dedupeKey = `${name.toLowerCase()}::${alias.toLowerCase()}::0`;
        if (seen.has(dedupeKey)) return;
        seen.add(dedupeKey);
        merged.push({ id: `row-${Date.now()}-${name}`, name, alias });
      });

      return { ...prev, [key]: merged };
    });

    setImportOpen(false);
    notify({ type: "success", message: t("auth_files.imported_default") });
  }, [importChannel, importModels, importSelected, notify, t]);

  const importFilteredModels = useMemo(() => {
    const query = importSearch.trim().toLowerCase();
    if (!query) return importModels;
    return importModels.filter(
      (model) =>
        model.id.toLowerCase().includes(query) ||
        String(model.display_name ?? "")
          .toLowerCase()
          .includes(query),
    );
  }, [importModels, importSearch]);

  return {
    isPending,
    excludedLoading,
    excluded,
    excludedDraft,
    setExcludedDraft,
    excludedNewProvider,
    setExcludedNewProvider,
    excludedUnsupported,
    aliasLoading,
    aliasEditing,
    setAliasEditing,
    aliasNewChannel,
    setAliasNewChannel,
    aliasUnsupported,
    importOpen,
    setImportOpen,
    importChannel,
    importLoading,
    importModels,
    importSearch,
    setImportSearch,
    importSelected,
    setImportSelected,
    importFilteredModels,
    refreshExcluded,
    refreshAlias,
    saveExcludedProvider,
    deleteExcludedProvider,
    addExcludedProvider,
    addAliasChannel,
    saveAliasChannel,
    deleteAliasChannel,
    openImport,
    applyImport,
  };
}
