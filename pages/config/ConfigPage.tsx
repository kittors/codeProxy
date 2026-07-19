import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Code2, Eye, Search } from "lucide-react";
import { parse as parseYaml } from "yaml";
import { configApi, configFileApi } from "@code-proxy/api-client";
import { FloatingSaveBar } from "./FloatingSaveBar";
import { CodexOAuthAdmissionPanel } from "./CodexOAuthAdmissionPanel";
import { VisualConfigEditor } from "./visual/VisualConfigEditor";
import { useVisualConfig } from "@features/visual-config-editor";
import { Card } from "@code-proxy/ui";
import { ConfirmModal } from "@code-proxy/ui";
import { EmptyState } from "@code-proxy/ui";
import { TextInput } from "@code-proxy/ui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@code-proxy/ui";
import { useToast } from "@code-proxy/ui";
import { useTranslation } from "react-i18next";
import { HoverTooltip } from "@code-proxy/ui";
import { YamlCodeEditor } from "./YamlCodeEditor";

type ConfigTab = "visual" | "source";

const TAB_STORAGE_KEY = "config-panel:tab";

type ConfigRiskSnapshot = {
  commercialMode: boolean;
  debug: boolean;
  loggingToFile: boolean;
  requestLog: boolean;
  storeContent: boolean;
  websocketAuth: boolean;
  allowRemote: boolean;
  autoUpdateChannel: string;
  autoUpdateDockerImage: string;
  contentRetentionDays: number;
  bodyStorageMaxTotalSizeMb: number;
  logsMaxTotalSizeMb: number;
  listener: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readConfigRiskSnapshot(yamlContent: string): ConfigRiskSnapshot {
  try {
    const parsed = asRecord(parseYaml(yamlContent)) ?? {};
    const requestLogStorage = asRecord(parsed["request-log-storage"]);
    const remoteManagement = asRecord(parsed["remote-management"]);
    const autoUpdate = asRecord(parsed["auto-update"]);
    const tls = asRecord(parsed.tls);
    return {
      commercialMode: Boolean(parsed["commercial-mode"]),
      debug: Boolean(parsed.debug),
      loggingToFile: Boolean(parsed["logging-to-file"]),
      requestLog: Boolean(parsed["request-log"]),
      storeContent: Boolean(requestLogStorage?.["store-content"]),
      websocketAuth: Boolean(parsed["ws-auth"]),
      allowRemote: Boolean(remoteManagement?.["allow-remote"]),
      autoUpdateChannel: String(autoUpdate?.channel ?? "main"),
      autoUpdateDockerImage: String(autoUpdate?.["docker-image"] ?? "ghcr.io/kittors/clirelay"),
      contentRetentionDays: Number(requestLogStorage?.["content-retention-days"] ?? 30),
      bodyStorageMaxTotalSizeMb: Number(requestLogStorage?.["max-total-size-mb"] ?? 1024),
      logsMaxTotalSizeMb: Number(parsed["logs-max-total-size-mb"] ?? 0),
      listener: JSON.stringify({
        host: parsed.host ?? "",
        port: parsed.port ?? "",
        tls: tls ?? {},
      }),
    };
  } catch {
    return {
      commercialMode: false,
      debug: false,
      loggingToFile: false,
      requestLog: false,
      storeContent: false,
      websocketAuth: false,
      allowRemote: false,
      autoUpdateChannel: "main",
      autoUpdateDockerImage: "ghcr.io/kittors/clirelay",
      contentRetentionDays: 30,
      bodyStorageMaxTotalSizeMb: 1024,
      logsMaxTotalSizeMb: 0,
      listener: "",
    };
  }
}

function collectSaveWarningKeys(previous: ConfigRiskSnapshot, next: ConfigRiskSnapshot): string[] {
  const warnings: string[] = [];
  if (!previous.requestLog && next.requestLog) warnings.push("request_log");
  if (!previous.storeContent && next.storeContent) warnings.push("body_storage_enable");
  if (previous.storeContent && !next.storeContent) warnings.push("body_storage_disable");
  if (!previous.debug && next.debug) warnings.push("debug");
  if (!previous.loggingToFile && next.loggingToFile) warnings.push("file_logging");
  if (previous.websocketAuth && !next.websocketAuth) warnings.push("ws_auth_disable");
  if (!previous.allowRemote && next.allowRemote) warnings.push("remote_management");
  if (previous.commercialMode !== next.commercialMode) warnings.push("commercial_mode");
  if (previous.autoUpdateChannel !== "dev" && next.autoUpdateChannel === "dev") {
    warnings.push("dev_updates");
  }
  if (
    previous.autoUpdateDockerImage !== next.autoUpdateDockerImage &&
    next.autoUpdateDockerImage !== "ghcr.io/kittors/clirelay"
  ) {
    warnings.push("custom_image");
  }
  if (next.storeContent && next.contentRetentionDays <= 0) warnings.push("unlimited_retention");
  if (next.storeContent && next.bodyStorageMaxTotalSizeMb <= 0) {
    warnings.push("unbounded_body_size");
  }
  if (next.loggingToFile && next.logsMaxTotalSizeMb <= 0) {
    warnings.push("unbounded_file_logs");
  }
  if (previous.listener !== next.listener) warnings.push("listener");
  return warnings;
}

function isValidResourceNumber(value: string, minimum: number): boolean {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return false;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed >= minimum;
}

function useStickyTab(): [ConfigTab, (next: ConfigTab) => void] {
  const [tab, setTab] = useState<ConfigTab>(() => {
    try {
      const saved = localStorage.getItem(TAB_STORAGE_KEY);
      if (saved === "visual" || saved === "source") return saved;
      return "visual";
    } catch {
      return "visual";
    }
  });

  const update = useCallback((next: ConfigTab) => {
    setTab(next);
    try {
      localStorage.setItem(TAB_STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  return [tab, update];
}

export function ConfigPage() {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [tab, setTab] = useStickyTab();

  const {
    visualValues,
    visualDirty,
    loadVisualValuesFromYaml,
    applyVisualChangesToYaml,
    setVisualValues,
  } = useVisualConfig();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [yamlText, setYamlText] = useState("");
  const [yamlDirty, setYamlDirty] = useState(false);

  const [confirmReloadOpen, setConfirmReloadOpen] = useState(false);
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);
  const [pendingSaveYaml, setPendingSaveYaml] = useState("");
  const [pendingSaveWarnings, setPendingSaveWarnings] = useState<string[]>([]);

  const [searchQuery, setSearchQuery] = useState("");
  const [lastSearchedQuery, setLastSearchedQuery] = useState("");
  const [searchPositions, setSearchPositions] = useState<number[]>([]);
  const [searchIndex, setSearchIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const online = typeof navigator === "undefined" ? true : navigator.onLine;
  const disableControls = !online;
  const isDirty = yamlDirty || visualDirty;

  const loadYaml = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [text, runtimeConfig] = await Promise.all([
        configFileApi.fetchConfigYaml(),
        configApi.getConfig().catch(() => undefined),
      ]);
      setYamlText(text);
      setYamlDirty(false);
      setSearchPositions([]);
      setSearchIndex(0);
      setLastSearchedQuery("");
      loadVisualValuesFromYaml(text, runtimeConfig);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t("config_page.toast_load_failed");
      setError(message);
      notify({ type: "error", message });
    } finally {
      setLoading(false);
    }
  }, [loadVisualValuesFromYaml, notify]);

  useEffect(() => {
    void loadYaml();
  }, [loadYaml]);

  useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  const saveConfig = useCallback(
    async (nextYaml: string) => {
      setSaving(true);
      const previous = readConfigRiskSnapshot(yamlText);
      const next = readConfigRiskSnapshot(nextYaml);
      const commercialModeChanged = previous.commercialMode !== next.commercialMode;
      const disablingBodyStorage = previous.storeContent && !next.storeContent;

      try {
        await configFileApi.saveConfigYaml(nextYaml);
        if (disablingBodyStorage) {
          try {
            const cleanup = await configApi.updateRequestLogBodyStorage(false, true);
            if (cleanup.cleanup?.physical_reclaim_deferred) {
              notify({ type: "info", message: t("config_page.body_cleanup_deferred") });
            }
          } catch (cleanupError: unknown) {
            await loadYaml();
            notify({
              type: "error",
              message:
                cleanupError instanceof Error
                  ? t("config_page.body_cleanup_failed_after_save", {
                      error: cleanupError.message,
                    })
                  : t("config_page.body_cleanup_failed_after_save", { error: "" }),
            });
            return;
          }
        }

        const [latest, runtimeConfig] = await Promise.all([
          configFileApi.fetchConfigYaml(),
          configApi.getConfig().catch(() => undefined),
        ]);
        setYamlText(latest);
        setYamlDirty(false);
        loadVisualValuesFromYaml(latest, runtimeConfig);
        notify({ type: "success", message: t("config_page.toast_saved") });
        if (commercialModeChanged) {
          notify({ type: "info", message: t("config_page.toast_commercial_changed") });
        }
      } catch (err: unknown) {
        notify({
          type: "error",
          message: err instanceof Error ? err.message : t("config_page.toast_save_failed"),
        });
      } finally {
        setSaving(false);
      }
    },
    [loadVisualValuesFromYaml, loadYaml, notify, t, yamlText],
  );

  const requestSave = useCallback(() => {
    if (
      tab === "visual" &&
      (!isValidResourceNumber(visualValues.logsMaxTotalSizeMb || "0", 0) ||
        !isValidResourceNumber(visualValues.errorLogsMaxFiles, 0) ||
        !isValidResourceNumber(visualValues.systemStatsCacheSeconds, 10) ||
        !isValidResourceNumber(visualValues.requestLogStorage.contentRetentionDays, 0) ||
        !isValidResourceNumber(visualValues.requestLogStorage.cleanupIntervalMinutes, 60) ||
        !isValidResourceNumber(visualValues.requestLogStorage.maxTotalSizeMb, 0))
    ) {
      notify({ type: "error", message: t("resource_config.invalid_number") });
      return;
    }
    const nextYaml = tab === "visual" ? applyVisualChangesToYaml(yamlText) : yamlText;
    const warnings = collectSaveWarningKeys(
      readConfigRiskSnapshot(yamlText),
      readConfigRiskSnapshot(nextYaml),
    );
    if (warnings.length > 0) {
      setPendingSaveYaml(nextYaml);
      setPendingSaveWarnings(warnings);
      setConfirmSaveOpen(true);
      return;
    }
    void saveConfig(nextYaml);
  }, [applyVisualChangesToYaml, notify, saveConfig, t, tab, visualValues, yamlText]);

  const buildSearchPositions = useCallback(
    (query: string) => {
      const text = yamlText;
      const q = query.trim();
      if (!q) return [];
      const lowerText = text.toLowerCase();
      const lowerQ = q.toLowerCase();
      const positions: number[] = [];
      let pos = 0;
      while (pos < lowerText.length) {
        const idx = lowerText.indexOf(lowerQ, pos);
        if (idx === -1) break;
        positions.push(idx);
        pos = idx + 1;
        if (positions.length >= 2000) break;
      }
      return positions;
    },
    [yamlText],
  );

  const jumpToMatch = useCallback(
    (index: number, query: string) => {
      const el = textareaRef.current;
      if (!el) return;
      const q = query.trim();
      if (!q) return;
      const positions = searchPositions;
      if (!positions.length) return;
      const safe = ((index % positions.length) + positions.length) % positions.length;
      const start = positions[safe];
      el.focus();
      el.setSelectionRange(start, start + q.length);
      setSearchIndex(safe);
    },
    [searchPositions],
  );

  const executeSearch = useCallback(
    (direction: "next" | "prev" = "next") => {
      const q = searchQuery.trim();
      if (!q) return;

      if (lastSearchedQuery !== q) {
        const positions = buildSearchPositions(q);
        setSearchPositions(positions);
        setSearchIndex(0);
        setLastSearchedQuery(q);
        if (!positions.length) {
          notify({ type: "info", message: t("config_page.no_match_found") });
          return;
        }
        jumpToMatch(0, q);
        return;
      }

      if (!searchPositions.length) {
        const positions = buildSearchPositions(q);
        setSearchPositions(positions);
        setSearchIndex(0);
        if (!positions.length) {
          notify({ type: "info", message: t("config_page.no_match_found") });
          return;
        }
        jumpToMatch(0, q);
        return;
      }

      jumpToMatch(direction === "prev" ? searchIndex - 1 : searchIndex + 1, q);
    },
    [
      buildSearchPositions,
      jumpToMatch,
      lastSearchedQuery,
      notify,
      searchIndex,
      searchPositions.length,
      searchQuery,
    ],
  );

  const searchStats = useMemo(() => {
    if (!lastSearchedQuery || lastSearchedQuery !== searchQuery.trim() || !searchPositions.length) {
      return { current: 0, total: 0 };
    }
    return { current: searchIndex + 1, total: searchPositions.length };
  }, [lastSearchedQuery, searchIndex, searchPositions.length, searchQuery]);

  const editorHighlight = useMemo(() => {
    const q = lastSearchedQuery.trim();
    if (!q) return null;
    if (q !== searchQuery.trim()) return null;
    if (!searchPositions.length) return null;
    return { query: q, positions: searchPositions, activeIndex: searchIndex };
  }, [lastSearchedQuery, searchIndex, searchPositions, searchQuery]);

  const saveBarStatus = (() => {
    if (!online) return "offline" as const;
    if (error) return "error" as const;
    if (saving) return "saving" as const;
    if (loading) return "loading" as const;
    if (isDirty) return "dirty" as const;
    return "saved" as const;
  })();

  const handleTabChange = useCallback(
    (next: ConfigTab) => {
      if (next === tab) return;

      if (tab === "visual" && visualDirty) {
        const nextText = applyVisualChangesToYaml(yamlText);
        if (nextText !== yamlText) {
          setYamlText(nextText);
          setYamlDirty(true);
          setSearchPositions([]);
          setSearchIndex(0);
          setLastSearchedQuery("");
        }
      }

      if (next === "visual") {
        loadVisualValuesFromYaml(yamlText);
      }

      setTab(next);
    },
    [applyVisualChangesToYaml, loadVisualValuesFromYaml, setTab, tab, visualDirty, yamlText],
  );

  const requestReload = useCallback(() => {
    if (isDirty) {
      setConfirmReloadOpen(true);
      return;
    }
    void loadYaml();
  }, [isDirty, loadYaml]);

  const visualLayoutEnabled = tab === "visual";
  const saveDisabled = disableControls || loading || saving || !isDirty;
  const reloadDisabled = loading || saving;
  const showFloatingBar = true;

  return (
    <div
      className={
        visualLayoutEnabled
          ? "flex h-[calc(100dvh-112px)] min-h-0 flex-col gap-6 overflow-x-hidden"
          : "space-y-6 overflow-x-hidden"
      }
    >
      <div className={visualLayoutEnabled ? "flex min-h-0 flex-1 flex-col gap-4" : undefined}>
        <Tabs value={tab} onValueChange={(next) => handleTabChange(next as ConfigTab)}>
          <div className="flex">
            <TabsList>
              <TabsTrigger value="visual">
                <Eye size={14} />
                {t("config_page.visual_editor")}
              </TabsTrigger>
              <TabsTrigger value="source">
                <Code2 size={14} />
                {t("config_page.source_editor")}
              </TabsTrigger>
            </TabsList>
          </div>

          <div className={visualLayoutEnabled ? "mt-4 min-h-0 flex-1" : "mt-4"}>
            <TabsContent value="visual" className="h-full">
              <div className="flex min-h-0 h-full flex-col gap-4">
                <Card
                  title={t("config_page.visual_title")}
                  description={t("config_page.visual_desc")}
                  loading={loading}
                  className="flex min-h-0 flex-1 flex-col"
                  bodyClassName="min-h-0 flex-1 overflow-y-auto"
                >
                  {error ? (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-400/25 dark:bg-rose-500/15 dark:text-white">
                      {error}
                    </div>
                  ) : null}

                  <div className={error ? "mt-4" : ""}>
                    <VisualConfigEditor
                      values={visualValues}
                      disabled={disableControls || loading || saving}
                      onChange={setVisualValues}
                    />
                    <div className="mt-6">
                      <CodexOAuthAdmissionPanel />
                    </div>
                  </div>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="source">
              <div className="space-y-4">
                <Card
                  title={t("config_page.source_title")}
                  description={t("config_page.search_hint")}
                  loading={loading}
                >
                  {error ? (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-400/25 dark:bg-rose-500/15 dark:text-white">
                      {error}
                    </div>
                  ) : null}

                  {!loading && !yamlText ? (
                    <EmptyState
                      title={t("config_page.empty")}
                      description={t("config_page.empty_desc")}
                    />
                  ) : (
                    <div className="space-y-3">
                      <div className="grid gap-3 lg:grid-cols-3">
                        <div className="lg:col-span-2 space-y-1">
                          <TextInput
                            value={searchQuery}
                            onChange={(e) => {
                              setSearchQuery(e.currentTarget.value);
                              if (!e.currentTarget.value) {
                                setLastSearchedQuery("");
                                setSearchPositions([]);
                                setSearchIndex(0);
                              }
                            }}
                            placeholder={t("config_page.search_placeholder")}
                            onKeyDown={(e) => {
                              if (e.key !== "Enter") return;
                              e.preventDefault();
                              executeSearch(e.shiftKey ? "prev" : "next");
                            }}
                            disabled={disableControls || loading}
                            endAdornment={
                              <HoverTooltip
                                content={t("config_page.search_hint")}
                                placement="bottom"
                              >
                                <span className="inline-flex h-6 w-6 items-center justify-center text-slate-400 dark:text-white/45">
                                  <Search size={16} aria-hidden="true" />
                                </span>
                              </HoverTooltip>
                            }
                          />
                          <p className="text-xs text-slate-500 dark:text-white/55">
                            Enter: next · Shift+Enter: prev · Results:
                            <span className="ml-1 font-mono tabular-nums">
                              {!lastSearchedQuery.trim()
                                ? t("config_page.not_searched")
                                : searchStats.total
                                  ? `${searchStats.current}/${searchStats.total}`
                                  : t("config_page.no_match")}
                            </span>
                          </p>
                        </div>
                        <div className="flex h-11 items-center justify-end gap-3">
                          <HoverTooltip
                            content={t("config_page.prev_match_hint")}
                            placement="top"
                            disabled={!searchStats.total}
                          >
                            <button
                              type="button"
                              onClick={() => executeSearch("prev")}
                              disabled={!searchStats.total}
                              aria-label={t("config_page.prev_match")}
                              className="inline-flex h-8 w-8 items-center justify-center text-slate-400 transition hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/35 disabled:cursor-not-allowed disabled:opacity-50 dark:text-white/45 dark:hover:text-white/80 dark:focus-visible:ring-white/15"
                            >
                              <ChevronUp size={18} aria-hidden="true" />
                            </button>
                          </HoverTooltip>
                          <HoverTooltip
                            content={t("config_page.next_match_hint")}
                            placement="bottom"
                            disabled={!searchStats.total}
                          >
                            <button
                              type="button"
                              onClick={() => executeSearch("next")}
                              disabled={!searchStats.total}
                              aria-label={t("config_page.next_match")}
                              className="inline-flex h-8 w-8 items-center justify-center text-slate-400 transition hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/35 disabled:cursor-not-allowed disabled:opacity-50 dark:text-white/45 dark:hover:text-white/80 dark:focus-visible:ring-white/15"
                            >
                              <ChevronDown size={18} aria-hidden="true" />
                            </button>
                          </HoverTooltip>
                        </div>
                      </div>

                      <YamlCodeEditor
                        ref={textareaRef}
                        value={yamlText}
                        onChange={(next) => {
                          setYamlText(next);
                          setYamlDirty(true);
                          setSearchPositions([]);
                          setSearchIndex(0);
                          setLastSearchedQuery("");
                        }}
                        disabled={disableControls || loading}
                        ariaLabel="config.yaml editor"
                        highlight={editorHighlight}
                      />
                    </div>
                  )}
                </Card>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </div>

      {showFloatingBar && (
        <FloatingSaveBar
          status={saveBarStatus}
          onSave={requestSave}
          onReload={requestReload}
          saveDisabled={saveDisabled}
          reloadDisabled={reloadDisabled}
        />
      )}

      <ConfirmModal
        open={confirmSaveOpen}
        title={t("config_page.save_warning_title")}
        description={t("config_page.save_warning_desc", {
          warnings: pendingSaveWarnings
            .map((key) => t(`config_page.save_warning_${key}`))
            .join(t("config_page.save_warning_separator")),
        })}
        confirmText={saving ? t("config_page.saving") : t("config_page.save_warning_confirm")}
        cancelText={t("ui.cancel_default")}
        variant={
          pendingSaveWarnings.some((key) =>
            [
              "body_storage_disable",
              "ws_auth_disable",
              "remote_management",
              "listener",
            ].includes(key),
          )
            ? "danger"
            : "primary"
        }
        busy={saving}
        onClose={() => {
          if (!saving) setConfirmSaveOpen(false);
        }}
        onConfirm={() => {
          setConfirmSaveOpen(false);
          const nextYaml = pendingSaveYaml;
          setPendingSaveYaml("");
          setPendingSaveWarnings([]);
          void saveConfig(nextYaml);
        }}
      />

      <ConfirmModal
        open={confirmReloadOpen}
        title={t("config_page.discard_title")}
        description={t("config_page.discard_desc")}
        confirmText={t("config_page.confirm_reload")}
        cancelText={t("ui.cancel_default")}
        variant="danger"
        onClose={() => setConfirmReloadOpen(false)}
        onConfirm={() => {
          setConfirmReloadOpen(false);
          void loadYaml();
        }}
      />
    </div>
  );
}
