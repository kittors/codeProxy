import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  ChevronDown,
  ChevronUp,
  Code2,
  Eye,
  RefreshCw,
  Save,
  Search,
  Settings,
} from "lucide-react";
import { parse as parseYaml } from "yaml";
import { configApi, configFileApi } from "@/lib/http/apis";
import { FloatingSaveBar } from "@/modules/config/FloatingSaveBar";
import { VisualConfigEditor } from "@/modules/config/visual/VisualConfigEditor";
import { useVisualConfig } from "@/modules/config/visual/useVisualConfig";
import { Button } from "@/modules/ui/Button";
import { Card } from "@/modules/ui/Card";
import { ConfirmModal } from "@/modules/ui/ConfirmModal";
import { EmptyState } from "@/modules/ui/EmptyState";
import { TextInput } from "@/modules/ui/Input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/modules/ui/Tabs";
import { ToggleSwitch } from "@/modules/ui/ToggleSwitch";
import { useToast } from "@/modules/ui/ToastProvider";
import { HoverTooltip } from "@/modules/ui/Tooltip";
import { YamlCodeEditor } from "@/modules/config/YamlCodeEditor";

type ConfigTab = "visual" | "source" | "runtime";

const TAB_STORAGE_KEY = "config-panel:tab";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const readString = (obj: Record<string, unknown> | null, ...keys: string[]): string => {
  if (!obj) return "";
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
};

const readBool = (obj: Record<string, unknown> | null, ...keys: string[]): boolean => {
  if (!obj) return false;
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const lowered = value.trim().toLowerCase();
      if (lowered === "true") return true;
      if (lowered === "false") return false;
    }
    if (typeof value === "number") return value !== 0;
  }
  return false;
};

const readNumber = (obj: Record<string, unknown> | null, ...keys: string[]): number | null => {
  if (!obj) return null;
  for (const key of keys) {
    const value = obj[key];
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

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

function RuntimeConfigPanel() {
  const { notify } = useToast();
  const [isPending, startTransition] = useTransition();

  const [loading, setLoading] = useState(true);
  const [rawConfig, setRawConfig] = useState<Record<string, unknown> | null>(null);

  const [debugEnabled, setDebugEnabled] = useState(false);
  const [usageStatisticsEnabled, setUsageStatisticsEnabled] = useState(false);
  const [requestLogEnabled, setRequestLogEnabled] = useState(false);
  const [loggingToFileEnabled, setLoggingToFileEnabled] = useState(false);
  const [wsAuthEnabled, setWsAuthEnabled] = useState(false);
  const [switchProjectEnabled, setSwitchProjectEnabled] = useState(false);
  const [switchPreviewModelEnabled, setSwitchPreviewModelEnabled] = useState(false);
  const [forceModelPrefixEnabled, setForceModelPrefixEnabled] = useState(false);

  const [proxyUrl, setProxyUrl] = useState("");
  const [requestRetry, setRequestRetry] = useState("0");
  const [logsMaxTotalSizeMb, setLogsMaxTotalSizeMb] = useState("0");
  const [routingStrategy, setRoutingStrategy] = useState("round-robin");

  const [baselineText, setBaselineText] = useState<{
    proxyUrl: string;
    requestRetry: string;
    logsMaxTotalSizeMb: string;
    routingStrategy: string;
  }>({
    proxyUrl: "",
    requestRetry: "0",
    logsMaxTotalSizeMb: "0",
    routingStrategy: "round-robin",
  });

  const loadRuntimeConfig = useCallback(async () => {
    setLoading(true);
    try {
      const [config, logsLimit, forcePrefix, strategy] = await Promise.all([
        configApi.getConfig(),
        configApi.getLogsMaxTotalSizeMb().catch(() => 0),
        configApi.getForceModelPrefix().catch(() => false),
        configApi.getRoutingStrategy().catch(() => "round-robin"),
      ]);

      const record = isRecord(config) ? (config as Record<string, unknown>) : null;
      setRawConfig(record);

      setDebugEnabled(readBool(record, "debug", "debug-enabled", "debugEnabled"));
      setUsageStatisticsEnabled(
        readBool(record, "usage-statistics-enabled", "usageStatisticsEnabled"),
      );
      setRequestLogEnabled(readBool(record, "request-log", "requestLog"));
      setLoggingToFileEnabled(readBool(record, "logging-to-file", "loggingToFile"));
      setWsAuthEnabled(readBool(record, "ws-auth", "wsAuth"));
      setSwitchProjectEnabled(readBool(record, "quota-exceeded.switch-project", "switchProject"));
      setSwitchPreviewModelEnabled(
        readBool(record, "quota-exceeded.switch-preview-model", "switchPreviewModel"),
      );

      setProxyUrl(readString(record, "proxy-url", "proxyUrl"));
      const retry = readNumber(record, "request-retry", "requestRetry");
      setRequestRetry(retry !== null ? String(retry) : "0");

      setLogsMaxTotalSizeMb(String(logsLimit ?? 0));
      setForceModelPrefixEnabled(Boolean(forcePrefix));
      setRoutingStrategy(typeof strategy === "string" ? strategy : "round-robin");

      setBaselineText({
        proxyUrl: readString(record, "proxy-url", "proxyUrl"),
        requestRetry: retry !== null ? String(retry) : "0",
        logsMaxTotalSizeMb: String(logsLimit ?? 0),
        routingStrategy: typeof strategy === "string" ? strategy : "round-robin",
      });
    } catch (err: unknown) {
      notify({ type: "error", message: err instanceof Error ? err.message : "Failed to load config" });
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void loadRuntimeConfig();
  }, [loadRuntimeConfig]);

  const updateToggle = useCallback(
    async (key: string, next: boolean) => {
      try {
        if (key === "debug") await configApi.updateDebug(next);
        if (key === "usage") await configApi.updateUsageStatistics(next);
        if (key === "requestLog") await configApi.updateRequestLog(next);
        if (key === "loggingToFile") await configApi.updateLoggingToFile(next);
        if (key === "wsAuth") await configApi.updateWsAuth(next);
        if (key === "switchProject") await configApi.updateSwitchProject(next);
        if (key === "switchPreviewModel") await configApi.updateSwitchPreviewModel(next);
        if (key === "forceModelPrefix") await configApi.updateForceModelPrefix(next);
        notify({ type: "success", message: "Updated" });
      } catch (err: unknown) {
        notify({ type: "error", message: err instanceof Error ? err.message : "Update failed" });
        throw err;
      }
    },
    [notify],
  );

  const runtimeTextDirty =
    proxyUrl.trim() !== baselineText.proxyUrl.trim() ||
    requestRetry.trim() !== baselineText.requestRetry.trim() ||
    logsMaxTotalSizeMb.trim() !== baselineText.logsMaxTotalSizeMb.trim() ||
    routingStrategy.trim() !== baselineText.routingStrategy.trim();

  const saveRuntimeText = useCallback(async () => {
    const trimmedProxy = proxyUrl.trim();
    const retryParsed = Number(requestRetry.trim());
    const logsParsed = Number(logsMaxTotalSizeMb.trim());
    const trimmedStrategy = routingStrategy.trim();

    if (!Number.isFinite(retryParsed) || retryParsed < 0) {
      notify({ type: "error", message: "Retry count must be a non-negative number" });
      return;
    }
    if (!Number.isFinite(logsParsed) || logsParsed < 0) {
      notify({ type: "error", message: "Log size limit must be a non-negative number" });
      return;
    }
    if (!trimmedStrategy) {
      notify({ type: "error", message: "Routing strategy is required" });
      return;
    }

    try {
      if (trimmedProxy !== baselineText.proxyUrl.trim()) {
        if (trimmedProxy) {
          await configApi.updateProxyUrl(trimmedProxy);
        } else {
          await configApi.clearProxyUrl();
        }
      }

      if (requestRetry.trim() !== baselineText.requestRetry.trim()) {
        await configApi.updateRequestRetry(Math.round(retryParsed));
      }

      if (logsMaxTotalSizeMb.trim() !== baselineText.logsMaxTotalSizeMb.trim()) {
        await configApi.updateLogsMaxTotalSizeMb(Math.round(logsParsed));
      }

      if (trimmedStrategy !== baselineText.routingStrategy.trim()) {
        await configApi.updateRoutingStrategy(trimmedStrategy);
      }

      notify({ type: "success", message: "Saved" });
      startTransition(() => void loadRuntimeConfig());
    } catch (err: unknown) {
      notify({ type: "error", message: err instanceof Error ? err.message : "Save failed" });
      startTransition(() => void loadRuntimeConfig());
    }
  }, [
    baselineText.logsMaxTotalSizeMb,
    baselineText.proxyUrl,
    baselineText.requestRetry,
    baselineText.routingStrategy,
    loadRuntimeConfig,
    logsMaxTotalSizeMb,
    notify,
    proxyUrl,
    requestRetry,
    routingStrategy,
    startTransition,
  ]);

  return (
    <div className="space-y-6">
      <Card
        title="Runtime Switches"
        description="These configs are written to server via management API (complements config.yaml)."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void loadRuntimeConfig()}
              disabled={loading || isPending}
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              Refresh
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => void saveRuntimeText()}
              disabled={loading || isPending || !runtimeTextDirty}
            >
              <Save size={14} />
              Save Changes
            </Button>
          </div>
        }
        loading={loading}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3 rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
            <ToggleSwitch
              label="Debug Mode"
              description="Enable verbose debug logs (recommended for temporary use)."
              checked={debugEnabled}
              onCheckedChange={(next) => {
                setDebugEnabled(next);
                void updateToggle("debug", next).catch(() => setDebugEnabled((prev) => !prev));
              }}
            />
            <ToggleSwitch
              label="Usage Statistics"
              description="Track request and token usage."
              checked={usageStatisticsEnabled}
              onCheckedChange={(next) => {
                setUsageStatisticsEnabled(next);
                void updateToggle("usage", next).catch(() =>
                  setUsageStatisticsEnabled((prev) => !prev),
                );
              }}
            />
            <ToggleSwitch
              label="Request Logs"
              description="Record request logs for querying and troubleshooting."
              checked={requestLogEnabled}
              onCheckedChange={(next) => {
                setRequestLogEnabled(next);
                void updateToggle("requestLog", next).catch(() =>
                  setRequestLogEnabled((prev) => !prev),
                );
              }}
            />
            <ToggleSwitch
              label="Log to File"
              description="Write logs to file (for downloading error logs)."
              checked={loggingToFileEnabled}
              onCheckedChange={(next) => {
                setLoggingToFileEnabled(next);
                void updateToggle("loggingToFile", next).catch(() =>
                  setLoggingToFileEnabled((prev) => !prev),
                );
              }}
            />
          </div>

          <div className="space-y-3 rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
            <ToggleSwitch
              label="WebSocket Auth"
              description="Authenticate WebSocket connections."
              checked={wsAuthEnabled}
              onCheckedChange={(next) => {
                setWsAuthEnabled(next);
                void updateToggle("wsAuth", next).catch(() => setWsAuthEnabled((prev) => !prev));
              }}
            />
            <ToggleSwitch
              label="Quota Exceeded: Switch Project"
              description="quota-exceeded.switch-project"
              checked={switchProjectEnabled}
              onCheckedChange={(next) => {
                setSwitchProjectEnabled(next);
                void updateToggle("switchProject", next).catch(() =>
                  setSwitchProjectEnabled((prev) => !prev),
                );
              }}
            />
            <ToggleSwitch
              label="Quota Exceeded: Switch Preview Model"
              description="quota-exceeded.switch-preview-model"
              checked={switchPreviewModelEnabled}
              onCheckedChange={(next) => {
                setSwitchPreviewModelEnabled(next);
                void updateToggle("switchPreviewModel", next).catch(() =>
                  setSwitchPreviewModelEnabled((prev) => !prev),
                );
              }}
            />
            <ToggleSwitch
              label="Force Model Prefix"
              description="force-model-prefix"
              checked={forceModelPrefixEnabled}
              onCheckedChange={(next) => {
                setForceModelPrefixEnabled(next);
                void updateToggle("forceModelPrefix", next).catch(() =>
                  setForceModelPrefixEnabled((prev) => !prev),
                );
              }}
            />
          </div>

          <Card title="Proxy & Retry" description="Request proxy and retry strategy.">
            <div className="space-y-3">
              <TextInput
                value={proxyUrl}
                onChange={(e) => setProxyUrl(e.currentTarget.value)}
                placeholder="proxy-url (empty to clear)"
              />
              <div className="flex flex-wrap items-center gap-2">
                <TextInput
                  value={requestRetry}
                  onChange={(e) => setRequestRetry(e.currentTarget.value)}
                  placeholder="request-retry (non-negative integer)"
                  inputMode="numeric"
                />
              </div>
              <p className="text-xs text-slate-600 dark:text-white/65">
                修改后点击上方“Save Changes”。
              </p>
            </div>
          </Card>

          <Card title="Logs & Routing" description="Log size limit and routing strategy.">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <TextInput
                  value={logsMaxTotalSizeMb}
                  onChange={(e) => setLogsMaxTotalSizeMb(e.currentTarget.value)}
                  placeholder="logs-max-total-size-mb"
                  inputMode="numeric"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <TextInput
                  value={routingStrategy}
                  onChange={(e) => setRoutingStrategy(e.currentTarget.value)}
                  placeholder="routing-strategy (e.g. round-robin)"
                />
              </div>
              <p className="text-xs text-slate-600 dark:text-white/65">
                Current config preview: {rawConfig ? "Loaded" : "Not loaded"}
              </p>
            </div>
          </Card>
        </div>
      </Card>
    </div>
  );
}

export function ConfigPage() {
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
      const message = err instanceof Error ? err.message : "Failed to load config.yaml";
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
      notify({ type: "success", message: "config.yaml saved" });
      if (commercialModeChanged) {
        notify({ type: "info", message: "commercial-mode changed: restart required" });
      }
    } catch (err: unknown) {
      notify({ type: "error", message: err instanceof Error ? err.message : "Save failed" });
    } finally {
      setSaving(false);
    }
  }, [applyVisualChangesToYaml, loadVisualValuesFromYaml, notify, tab, yamlText]);

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
          notify({ type: "info", message: "No match found" });
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
          notify({ type: "info", message: "No match found" });
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
                Visual Editor
              </TabsTrigger>
              <TabsTrigger value="source">
                <Code2 size={14} />
                Source Editor
              </TabsTrigger>
              <TabsTrigger value="runtime">
                <Settings size={14} />
                Runtime Config
              </TabsTrigger>
            </TabsList>
          </div>

          <div className={visualLayoutEnabled ? "mt-4 min-h-0 flex-1" : "mt-4"}>
            <TabsContent value="visual" className="h-full">
              <div className="flex min-h-0 h-full flex-col gap-4">

                <Card
                  title="config.yaml (Visual)"
                  description="Scroll to edit; saves to server."
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
                  title="config.yaml (Source)"
                  description="Supports search, prev/next match & keyboard shortcuts."
                  loading={loading}
                >
                  {error ? (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-400/25 dark:bg-rose-500/15 dark:text-white">
                      {error}
                    </div>
                  ) : null}

                  {!loading && !yamlText ? (
                    <EmptyState
                      title="Empty"
                      description="Server may not have config.yaml or API returned empty."
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
                            placeholder="Search config content"
                            onKeyDown={(e) => {
                              if (e.key !== "Enter") return;
                              e.preventDefault();
                              executeSearch(e.shiftKey ? "prev" : "next");
                            }}
                            disabled={disableControls || loading}
                            endAdornment={
                              <HoverTooltip content="Search (Enter)" placement="bottom">
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
                                ? "Not searched"
                                : searchStats.total
                                  ? `${searchStats.current}/${searchStats.total}`
                                  : "No match"}
                            </span>
                          </p>
                        </div>
                        <div className="flex h-11 items-center justify-end gap-3">
                          <HoverTooltip
                            content="Previous match (Shift+Enter)"
                            placement="top"
                            disabled={!searchStats.total}
                          >
                            <button
                              type="button"
                              onClick={() => executeSearch("prev")}
                              disabled={!searchStats.total}
                              aria-label="Previous match"
                              className="inline-flex h-8 w-8 items-center justify-center text-slate-400 transition hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/35 disabled:cursor-not-allowed disabled:opacity-50 dark:text-white/45 dark:hover:text-white/80 dark:focus-visible:ring-white/15"
                            >
                              <ChevronUp size={18} aria-hidden="true" />
                            </button>
                          </HoverTooltip>
                          <HoverTooltip
                            content="Next match (Enter)"
                            placement="bottom"
                            disabled={!searchStats.total}
                          >
                            <button
                              type="button"
                              onClick={() => executeSearch("next")}
                              disabled={!searchStats.total}
                              aria-label="Next match"
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
                        ariaLabel="config.yaml 编辑器"
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
        title="Discard Unsaved Changes"
        description="You have unsaved changes. Reloading will discard them. Continue?"
        confirmText="Continue Reload"
        cancelText="Cancel"
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
