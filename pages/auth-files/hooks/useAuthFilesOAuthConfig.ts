import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useTranslation } from "react-i18next";
import { authFilesApi } from "@code-proxy/api-client";
import { invalidateConfiguredModelAvailability } from "@features/model-availability";
import { useToast } from "@code-proxy/ui";
import type { AuthFileModelItem, AliasRow } from "@code-proxy/domain";
import { buildAliasRows, normalizeProviderKey } from "@code-proxy/domain";

export function useAuthFilesOAuthConfig(tab: "files" | "excluded" | "alias") {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [isPending, startTransition] = useTransition();

  const [excludedLoading, setExcludedLoading] = useState(false);
  const [excluded, setExcluded] = useState<Record<string, string[]>>({});
  const [excludedDraft, setExcludedDraft] = useState<Record<string, string>>({});
  const [excludedNewProvider, setExcludedNewProvider] = useState("");
  const [excludedUnsupported, setExcludedUnsupported] = useState(false);

  const [aliasLoading, setAliasLoading] = useState(false);
  const [aliasEditing, setAliasEditing] = useState<Record<string, AliasRow[]>>({});
  const [aliasSavedChannels, setAliasSavedChannels] = useState<string[]>([]);
  const [aliasNewChannel, setAliasNewChannel] = useState("");
  const [aliasUnsupported, setAliasUnsupported] = useState(false);

  const [importOpen, setImportOpen] = useState(false);
  const [importChannel, setImportChannel] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importModels, setImportModels] = useState<AuthFileModelItem[]>([]);
  const [importSearch, setImportSearch] = useState("");
  const [importSelected, setImportSelected] = useState<Set<string>>(new Set());
  const previousTabRef = useRef<"files" | "excluded" | "alias" | null>(null);

  const refreshExcluded = useCallback(async () => {
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
    setAliasLoading(true);
    try {
      const map = await authFilesApi.getOauthModelAlias();
      setAliasUnsupported(false);
      setAliasSavedChannels(Object.keys(map).map((key) => normalizeProviderKey(key)));
      setAliasEditing(
        Object.fromEntries(Object.entries(map).map(([key, value]) => [key, buildAliasRows(value)])),
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "";
      if (/404|not found/i.test(message)) {
        setAliasUnsupported(true);
        setAliasSavedChannels([]);
        setAliasEditing({});
        return;
      }
      notify({ type: "error", message: message || t("auth_files.load_alias_failed") });
    } finally {
      setAliasLoading(false);
    }
  }, [notify, t]);

  useEffect(() => {
    const previousTab = previousTabRef.current;
    previousTabRef.current = tab;
    if (previousTab === tab) return;

    if (tab === "excluded") {
      void refreshExcluded();
    }
    if (tab === "alias") {
      void refreshAlias();
    }
  }, [refreshAlias, refreshExcluded, tab]);

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
        invalidateConfiguredModelAvailability();
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
    (provider: string) => {
      const key = normalizeProviderKey(provider);
      setExcluded((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      setExcludedDraft((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    },
    [],
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
        invalidateConfiguredModelAvailability();
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
    (channel: string) => {
      const key = normalizeProviderKey(channel);
      setAliasEditing((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    },
    [],
  );

  const saveExcludedAll = useCallback(async (): Promise<boolean> => {
    if (excludedUnsupported) {
      notify({ type: "error", message: t("auth_files.server_no_excluded_api") });
      return false;
    }

    const nextMap = Object.fromEntries(
      Object.entries(excludedDraft).flatMap(([provider, text]) => {
        const key = normalizeProviderKey(provider);
        if (!key) return [];
        const models = text
          .split(/[\n,]+/)
          .map((item) => item.trim())
          .filter(Boolean);
        return [[key, models]];
      }),
    );

    try {
      await authFilesApi.replaceOauthExcludedModels(nextMap);
      setExcluded(nextMap);
      setExcludedDraft(
        Object.fromEntries(Object.entries(nextMap).map(([key, value]) => [key, value.join("\n")])),
      );
      invalidateConfiguredModelAvailability();
      notify({ type: "success", message: t("auth_files.saved") });
      return true;
    } catch (err: unknown) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("auth_files.save_failed"),
      });
      return false;
    }
  }, [excludedDraft, excludedUnsupported, notify, t]);

  const saveAliasAll = useCallback(async (): Promise<boolean> => {
    if (aliasUnsupported) {
      notify({ type: "error", message: t("auth_files.server_no_alias_api") });
      return false;
    }

    const currentEntries = Object.entries(aliasEditing).flatMap(([channel, rows]) => {
      const key = normalizeProviderKey(channel);
      return key ? ([[key, rows]] as const) : [];
    });
    const currentChannels = currentEntries.map(([channel]) => channel);
    const currentSet = new Set(currentChannels);
    const removedChannels = aliasSavedChannels.filter((channel) => !currentSet.has(channel));

    try {
      for (const [channel, rows] of currentEntries) {
        const next = rows
          .map((row) => ({
            name: row.name.trim(),
            alias: row.alias.trim(),
            ...(row.fork ? { fork: true } : {}),
          }))
          .filter((row) => row.name && row.alias);
        await authFilesApi.saveOauthModelAlias(channel, next);
      }
      for (const channel of removedChannels) {
        await authFilesApi.deleteOauthModelAlias(channel);
      }

      setAliasSavedChannels(currentChannels);
      invalidateConfiguredModelAvailability();
      notify({ type: "success", message: t("auth_files.saved") });
      return true;
    } catch (err: unknown) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("auth_files.save_failed"),
      });
      return false;
    }
  }, [aliasEditing, aliasSavedChannels, aliasUnsupported, notify, t]);

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
    saveExcludedAll,
    saveAliasAll,
    openImport,
    applyImport,
  };
}
