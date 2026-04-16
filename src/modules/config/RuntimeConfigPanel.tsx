import { useCallback, useEffect, useState, useTransition } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw, Save } from "lucide-react";
import { configApi } from "@/lib/http/apis";
import { Button } from "@/modules/ui/Button";
import { Card } from "@/modules/ui/Card";
import { TextInput } from "@/modules/ui/Input";
import { Select } from "@/modules/ui/Select";
import { ToggleSwitch } from "@/modules/ui/ToggleSwitch";
import { useToast } from "@/modules/ui/ToastProvider";

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

const normalizeUpdateChannel = (value: string) => {
  const channel = value.trim().toLowerCase();
  return channel === "dev" || channel === "auto" ? channel : "main";
};

export function RuntimeConfigPanel() {
  const { t } = useTranslation();
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
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(true);
  const [autoUpdateChannel, setAutoUpdateChannel] = useState("main");

  const [proxyUrl, setProxyUrl] = useState("");
  const [requestRetry, setRequestRetry] = useState("0");
  const [logsMaxTotalSizeMb, setLogsMaxTotalSizeMb] = useState("0");
  const [routingStrategy, setRoutingStrategy] = useState("round-robin");

  const [baselineText, setBaselineText] = useState({
    proxyUrl: "",
    requestRetry: "0",
    logsMaxTotalSizeMb: "0",
    routingStrategy: "round-robin",
  });

  const loadRuntimeConfig = useCallback(async () => {
    setLoading(true);
    try {
      const [config, logsLimit, forcePrefix, strategy, autoUpdate, autoUpdateChannelValue] =
        await Promise.all([
          configApi.getConfig(),
          configApi.getLogsMaxTotalSizeMb().catch(() => 0),
          configApi.getForceModelPrefix().catch(() => false),
          configApi.getRoutingStrategy().catch(() => "round-robin"),
          configApi.getAutoUpdateEnabled().catch(() => true),
          configApi.getAutoUpdateChannel().catch(() => "main"),
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
      setAutoUpdateEnabled(Boolean(autoUpdate));
      setAutoUpdateChannel(
        normalizeUpdateChannel(
          typeof autoUpdateChannelValue === "string" ? autoUpdateChannelValue : "main",
        ),
      );

      setBaselineText({
        proxyUrl: readString(record, "proxy-url", "proxyUrl"),
        requestRetry: retry !== null ? String(retry) : "0",
        logsMaxTotalSizeMb: String(logsLimit ?? 0),
        routingStrategy: typeof strategy === "string" ? strategy : "round-robin",
      });
    } catch (err: unknown) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("config_page.toast_load_failed"),
      });
    } finally {
      setLoading(false);
    }
  }, [notify, t]);

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
        if (key === "autoUpdate") await configApi.updateAutoUpdateEnabled(next);
        notify({ type: "success", message: t("config_page.toast_updated") });
      } catch (err: unknown) {
        notify({
          type: "error",
          message: err instanceof Error ? err.message : t("config_page.toast_update_failed"),
        });
        throw err;
      }
    },
    [notify, t],
  );

  const updateAutoUpdateChannel = useCallback(
    async (next: string) => {
      const previous = autoUpdateChannel;
      const normalized = normalizeUpdateChannel(next);
      setAutoUpdateChannel(normalized);
      try {
        await configApi.updateAutoUpdateChannel(normalized);
        notify({ type: "success", message: t("config_page.toast_updated") });
      } catch (err: unknown) {
        setAutoUpdateChannel(previous);
        notify({
          type: "error",
          message: err instanceof Error ? err.message : t("config_page.toast_update_failed"),
        });
      }
    },
    [autoUpdateChannel, notify, t],
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
      notify({ type: "error", message: t("config_page.retry_non_negative") });
      return;
    }
    if (!Number.isFinite(logsParsed) || logsParsed < 0) {
      notify({ type: "error", message: t("config_page.log_size_non_negative") });
      return;
    }
    if (!trimmedStrategy) {
      notify({ type: "error", message: t("config_page.routing_required") });
      return;
    }

    try {
      if (trimmedProxy !== baselineText.proxyUrl.trim()) {
        if (trimmedProxy) await configApi.updateProxyUrl(trimmedProxy);
        else await configApi.clearProxyUrl();
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

      notify({ type: "success", message: t("config_page.toast_updated") });
      startTransition(() => void loadRuntimeConfig());
    } catch (err: unknown) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("config_page.toast_save_failed"),
      });
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
    t,
  ]);

  return (
    <div className="space-y-6">
      <Card
        title={t("config_page.runtime_switches")}
        description={t("config_page.runtime_desc")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void loadRuntimeConfig()}
              disabled={loading || isPending}
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              {t("common.refresh")}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => void saveRuntimeText()}
              disabled={loading || isPending || !runtimeTextDirty}
            >
              <Save size={14} />
              {t("config_page.save_changes")}
            </Button>
          </div>
        }
        loading={loading}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3 rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
            <ToggleSwitch
              label={t("config_page.debug_mode")}
              description={t("config_page.debug_desc")}
              checked={debugEnabled}
              onCheckedChange={(next) => {
                setDebugEnabled(next);
                void updateToggle("debug", next).catch(() => setDebugEnabled((prev) => !prev));
              }}
            />
            <ToggleSwitch
              label={t("config_page.usage_statistics")}
              description={t("config_page.usage_desc")}
              checked={usageStatisticsEnabled}
              onCheckedChange={(next) => {
                setUsageStatisticsEnabled(next);
                void updateToggle("usage", next).catch(() =>
                  setUsageStatisticsEnabled((prev) => !prev),
                );
              }}
            />
            <ToggleSwitch
              label={t("config_page.request_logs")}
              description={t("config_page.request_logs_desc")}
              checked={requestLogEnabled}
              onCheckedChange={(next) => {
                setRequestLogEnabled(next);
                void updateToggle("requestLog", next).catch(() =>
                  setRequestLogEnabled((prev) => !prev),
                );
              }}
            />
            <ToggleSwitch
              label={t("config_page.log_to_file")}
              description={t("config_page.log_to_file_desc")}
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
              label={t("config_page.ws_auth")}
              description={t("config_page.ws_auth_desc")}
              checked={wsAuthEnabled}
              onCheckedChange={(next) => {
                setWsAuthEnabled(next);
                void updateToggle("wsAuth", next).catch(() => setWsAuthEnabled((prev) => !prev));
              }}
            />
            <ToggleSwitch
              label={t("config_page.quota_switch_project")}
              description={t("config_page.quota_switch_project_desc")}
              checked={switchProjectEnabled}
              onCheckedChange={(next) => {
                setSwitchProjectEnabled(next);
                void updateToggle("switchProject", next).catch(() =>
                  setSwitchProjectEnabled((prev) => !prev),
                );
              }}
            />
            <ToggleSwitch
              label={t("config_page.quota_switch_preview")}
              description={t("config_page.quota_switch_preview_desc")}
              checked={switchPreviewModelEnabled}
              onCheckedChange={(next) => {
                setSwitchPreviewModelEnabled(next);
                void updateToggle("switchPreviewModel", next).catch(() =>
                  setSwitchPreviewModelEnabled((prev) => !prev),
                );
              }}
            />
            <ToggleSwitch
              label={t("config_page.force_model_prefix")}
              description={t("config_page.force_prefix_desc")}
              checked={forceModelPrefixEnabled}
              onCheckedChange={(next) => {
                setForceModelPrefixEnabled(next);
                void updateToggle("forceModelPrefix", next).catch(() =>
                  setForceModelPrefixEnabled((prev) => !prev),
                );
              }}
            />
            <ToggleSwitch
              label={t("config_page.auto_update")}
              description={t("config_page.auto_update_desc")}
              checked={autoUpdateEnabled}
              onCheckedChange={(next) => {
                setAutoUpdateEnabled(next);
                void updateToggle("autoUpdate", next).catch(() =>
                  setAutoUpdateEnabled((prev) => !prev),
                );
              }}
            />
            <div className="space-y-1.5 rounded-xl border border-slate-200 bg-white/70 p-3 dark:border-neutral-800 dark:bg-neutral-950/50">
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-white">
                  {t("config_page.auto_update_channel")}
                </p>
                <p className="text-xs text-slate-600 dark:text-white/65">
                  {t("config_page.auto_update_channel_desc")}
                </p>
              </div>
              <Select
                aria-label={t("config_page.auto_update_channel")}
                value={autoUpdateChannel}
                onChange={(value) => void updateAutoUpdateChannel(value)}
                options={[
                  { value: "main", label: t("config_page.auto_update_channel_main") },
                  { value: "dev", label: t("config_page.auto_update_channel_dev") },
                  { value: "auto", label: t("config_page.auto_update_channel_auto") },
                ]}
              />
            </div>
          </div>

          <Card
            title={t("config_page.proxy_retry")}
            description={t("config_page.proxy_retry_desc")}
          >
            <div className="space-y-3">
              <TextInput
                value={proxyUrl}
                onChange={(e) => setProxyUrl(e.currentTarget.value)}
                placeholder={t("config_page.proxy_url_placeholder")}
              />
              <div className="flex flex-wrap items-center gap-2">
                <TextInput
                  value={requestRetry}
                  onChange={(e) => setRequestRetry(e.currentTarget.value)}
                  placeholder={t("config_page.retry_placeholder")}
                  inputMode="numeric"
                />
              </div>
              <p className="text-xs text-slate-600 dark:text-white/65">
                {t("config_page.save_hint")}
              </p>
            </div>
          </Card>

          <Card
            title={t("config_page.logs_routing")}
            description={t("config_page.logs_routing_desc")}
          >
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
                  placeholder={t("config_page.routing_placeholder")}
                />
              </div>
              <p className="text-xs text-slate-600 dark:text-white/65">
                {t("config_page.config_preview", {
                  status: rawConfig
                    ? t("config_page.config_loaded")
                    : t("config_page.config_not_loaded"),
                })}
              </p>
            </div>
          </Card>
        </div>
      </Card>
    </div>
  );
}
