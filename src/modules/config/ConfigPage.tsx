import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Code2, Eye, Search, Settings } from "lucide-react";
import { parse as parseYaml } from "yaml";
import { configFileApi } from "@/lib/http/apis";
import { FloatingSaveBar } from "@/modules/config/FloatingSaveBar";
import { RuntimeConfigPanel } from "@/modules/config/RuntimeConfigPanel";
import { VisualConfigEditor } from "@/modules/config/visual/VisualConfigEditor";
import { useVisualConfig } from "@/modules/config/visual/useVisualConfig";
import { Card } from "@/modules/ui/Card";
import { ConfirmModal } from "@/modules/ui/ConfirmModal";
import { EmptyState } from "@/modules/ui/EmptyState";
import { TextInput } from "@/modules/ui/Input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/modules/ui/Tabs";
import { useToast } from "@/modules/ui/ToastProvider";
import { useTranslation } from "react-i18next";
import { HoverTooltip } from "@/modules/ui/Tooltip";
import { YamlCodeEditor } from "@/modules/config/YamlCodeEditor";

type ConfigTab = "visual" | "source" | "runtime";

const TAB_STORAGE_KEY = "config-panel:tab";

function readCommercialModeFromYaml(yamlContent: string): boolean {
  try {
    const parsed = parseYaml(yamlContent);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
    return Boolean((parsed as Record<string, unknown>)["commercial-mode"]);
  } catch {
    return false;
  }
}

function useStickyTab(): [ConfigTab, (next: ConfigTab) => void] {
  const [tab, setTab] = useState<ConfigTab>(() => {
    try {
      const saved = localStorage.getItem(TAB_STORAGE_KEY);
      if (saved === "visual" || saved === "source" || saved === "runtime") return saved;
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
      const text = await configFileApi.fetchConfigYaml();
      setYamlText(text);
      setYamlDirty(false);
      setSearchPositions([]);
      setSearchIndex(0);
      setLastSearchedQuery("");
      loadVisualValuesFromYaml(text);
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

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const previousCommercialMode = readCommercialModeFromYaml(yamlText);
      const nextYaml = tab === "visual" ? applyVisualChangesToYaml(yamlText) : yamlText;
      const nextCommercialMode = readCommercialModeFromYaml(nextYaml);
      const commercialModeChanged = previousCommercialMode !== nextCommercialMode;

      await configFileApi.saveConfigYaml(nextYaml);
      const latest = await configFileApi.fetchConfigYaml();
      setYamlText(latest);
      setYamlDirty(false);
      loadVisualValuesFromYaml(latest);
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
  }, [applyVisualChangesToYaml, loadVisualValuesFromYaml, notify, t, tab, yamlText]);

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
  const showFloatingBar = tab !== "runtime";

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
              <TabsTrigger value="runtime">
                <Settings size={14} />
                {t("config_page.runtime_config")}
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
                          <p className="text-[11px] text-slate-500 dark:text-white/55">
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

            <TabsContent value="runtime">
              <RuntimeConfigPanel />
            </TabsContent>
          </div>
        </Tabs>
      </div>

      {showFloatingBar && (
        <FloatingSaveBar
          status={saveBarStatus}
          onSave={() => void handleSave()}
          onReload={requestReload}
          saveDisabled={saveDisabled}
          reloadDisabled={reloadDisabled}
        />
      )}

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
