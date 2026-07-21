import { Gauge, Leaf } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { VisualConfigValues } from "@features/visual-config-editor";
import { Button, TextInput } from "@code-proxy/ui";
import { HintCard as Card, HintLabel, HintToggle as ToggleSwitch } from "./VisualHint";

type ResourceEfficiencyPanelProps = {
  values: VisualConfigValues;
  disabled?: boolean;
  onChange: (values: Partial<VisualConfigValues>) => void;
};

function ResourceField({
  label,
  hint,
  value,
  placeholder,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  placeholder: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-sm font-semibold text-slate-900 dark:text-white">
        <HintLabel label={label} hint={hint} />
      </div>
      <TextInput
        value={value}
        placeholder={placeholder}
        inputMode="numeric"
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </div>
  );
}

export function ResourceEfficiencyPanel({
  values,
  disabled,
  onChange,
}: ResourceEfficiencyPanelProps) {
  const { t } = useTranslation();
  const recommendedActive = useMemo(
    () =>
      !values.debug &&
      !values.requestLog &&
      !values.requestLogStorage.storeContent &&
      !values.loggingToFile &&
      !values.usageStatisticsEnabled &&
      !values.commercialMode &&
      values.logsMaxTotalSizeMb === "128" &&
      values.errorLogsMaxFiles === "10" &&
      values.systemStatsCacheSeconds === "60" &&
      values.systemStatsWebSocketMaxAgeSeconds === "300" &&
      values.requestLogStorage.retentionDays === "7" &&
      values.requestLogStorage.contentRetentionDays === "3" &&
      values.requestLogStorage.cleanupEnabled &&
      values.requestLogStorage.cleanupIntervalMinutes === "60" &&
      values.requestLogStorage.maxRows === "100000" &&
      values.requestLogStorage.maxMetadataSizeMb === "256" &&
      values.requestLogStorage.maxTotalSizeMb === "128" &&
      !values.requestLogStorage.vacuumOnCleanup,
    [values],
  );

  const applyRecommended = () => {
    onChange({
      debug: false,
      requestLog: false,
      loggingToFile: false,
      usageStatisticsEnabled: false,
      commercialMode: false,
      logsMaxTotalSizeMb: "128",
      errorLogsMaxFiles: "10",
      systemStatsCacheSeconds: "60",
      systemStatsWebSocketMaxAgeSeconds: "300",
      requestLogStorage: {
        ...values.requestLogStorage,
        storeContent: false,
        retentionDays: "7",
        contentRetentionDays: "3",
        cleanupEnabled: true,
        cleanupIntervalMinutes: "60",
        maxRows: "100000",
        maxMetadataSizeMb: "256",
        maxTotalSizeMb: "128",
        vacuumOnCleanup: false,
      },
    });
  };

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50/70 dark:border-emerald-500/20 dark:bg-emerald-500/10">
        <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white dark:bg-emerald-400 dark:text-emerald-950">
              <Leaf size={20} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold text-emerald-950 dark:text-emerald-100">
                  <HintLabel
                    label={t("resource_config.title")}
                    hint={`${t("resource_config.description")}

${t("resource_config.stats_preserved")}`}
                  />
                </h3>
                <span className="rounded-full bg-emerald-200/80 px-2.5 py-1 text-2xs font-semibold text-emerald-900 dark:bg-emerald-300/15 dark:text-emerald-200">
                  {recommendedActive
                    ? t("resource_config.profile_active")
                    : t("resource_config.profile_custom")}
                </span>
              </div>
            </div>
          </div>
          <Button
            variant={recommendedActive ? "success" : "primary"}
            onClick={applyRecommended}
            disabled={disabled || recommendedActive}
          >
            <Gauge size={16} aria-hidden="true" />
            {recommendedActive
              ? t("resource_config.applied")
              : t("resource_config.apply_recommended")}
          </Button>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card
          title={t("resource_config.hot_path_title")}
          description={t("resource_config.hot_path_desc")}
        >
          <div className="space-y-5">
            <ToggleSwitch
              label={t("config_page.request_logs")}
              description={t("config_page.request_logs_desc")}
              checked={values.requestLog}
              onCheckedChange={(requestLog) => onChange({ requestLog })}
              disabled={disabled}
            />
            <ToggleSwitch
              label={t("config_page.request_body_storage")}
              description={t("resource_config.body_storage_desc")}
              checked={values.requestLogStorage.storeContent}
              onCheckedChange={(storeContent) =>
                onChange({
                  requestLogStorage: { ...values.requestLogStorage, storeContent },
                })
              }
              disabled={disabled}
            />
            <ToggleSwitch
              label={t("config_page.log_to_file")}
              description={t("config_page.log_to_file_desc")}
              checked={values.loggingToFile}
              onCheckedChange={(loggingToFile) => onChange({ loggingToFile })}
              disabled={disabled}
            />
            <ToggleSwitch
              label={t("config_page.debug_mode")}
              description={t("config_page.debug_desc")}
              checked={values.debug}
              onCheckedChange={(debug) => onChange({ debug })}
              disabled={disabled}
            />
            <ToggleSwitch
              label={t("config_page.usage_statistics")}
              description={t("resource_config.usage_stats_desc")}
              checked={values.usageStatisticsEnabled}
              onCheckedChange={(usageStatisticsEnabled) => onChange({ usageStatisticsEnabled })}
              disabled={disabled}
            />
          </div>
        </Card>

        <Card
          title={t("resource_config.limits_title")}
          description={t("resource_config.limits_desc")}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <ResourceField
              label={t("resource_config.log_size_label")}
              hint={t("resource_config.log_size_hint")}
              value={values.logsMaxTotalSizeMb}
              placeholder="128"
              disabled={disabled}
              onChange={(logsMaxTotalSizeMb) => onChange({ logsMaxTotalSizeMb })}
            />
            <ResourceField
              label={t("resource_config.error_files_label")}
              hint={t("resource_config.error_files_hint")}
              value={values.errorLogsMaxFiles}
              placeholder="10"
              disabled={disabled}
              onChange={(errorLogsMaxFiles) => onChange({ errorLogsMaxFiles })}
            />
            <ResourceField
              label={t("resource_config.system_cache_label")}
              hint={t("resource_config.system_cache_hint")}
              value={values.systemStatsCacheSeconds}
              placeholder="60"
              disabled={disabled}
              onChange={(systemStatsCacheSeconds) => onChange({ systemStatsCacheSeconds })}
            />
            <ResourceField
              label={t("resource_config.ws_max_age_label")}
              hint={t("resource_config.ws_max_age_hint")}
              value={values.systemStatsWebSocketMaxAgeSeconds}
              placeholder="300"
              disabled={disabled}
              onChange={(systemStatsWebSocketMaxAgeSeconds) =>
                onChange({ systemStatsWebSocketMaxAgeSeconds })
              }
            />
            <ResourceField
              label={t("resource_config.detail_retention_label")}
              hint={t("resource_config.detail_retention_hint")}
              value={values.requestLogStorage.retentionDays}
              placeholder="7"
              disabled={disabled}
              onChange={(retentionDays) =>
                onChange({
                  requestLogStorage: { ...values.requestLogStorage, retentionDays },
                })
              }
            />
            <ResourceField
              label={t("resource_config.body_retention_label")}
              hint={t("resource_config.retention_hint")}
              value={values.requestLogStorage.contentRetentionDays}
              placeholder="3"
              disabled={disabled}
              onChange={(contentRetentionDays) =>
                onChange({
                  requestLogStorage: { ...values.requestLogStorage, contentRetentionDays },
                })
              }
            />
            <ResourceField
              label={t("resource_config.cleanup_label")}
              hint={t("resource_config.cleanup_hint")}
              value={values.requestLogStorage.cleanupIntervalMinutes}
              placeholder="60"
              disabled={disabled}
              onChange={(cleanupIntervalMinutes) =>
                onChange({
                  requestLogStorage: { ...values.requestLogStorage, cleanupIntervalMinutes },
                })
              }
            />
            <ResourceField
              label={t("resource_config.max_rows_label")}
              hint={t("resource_config.max_rows_hint")}
              value={values.requestLogStorage.maxRows}
              placeholder="100000"
              disabled={disabled}
              onChange={(maxRows) =>
                onChange({
                  requestLogStorage: { ...values.requestLogStorage, maxRows },
                })
              }
            />
            <ResourceField
              label={t("resource_config.metadata_cap_label")}
              hint={t("resource_config.metadata_cap_hint")}
              value={values.requestLogStorage.maxMetadataSizeMb}
              placeholder="256"
              disabled={disabled}
              onChange={(maxMetadataSizeMb) =>
                onChange({
                  requestLogStorage: { ...values.requestLogStorage, maxMetadataSizeMb },
                })
              }
            />
            <ResourceField
              label={t("resource_config.body_cap_label")}
              hint={t("resource_config.body_cap_hint")}
              value={values.requestLogStorage.maxTotalSizeMb}
              placeholder="128"
              disabled={disabled}
              onChange={(maxTotalSizeMb) =>
                onChange({
                  requestLogStorage: { ...values.requestLogStorage, maxTotalSizeMb },
                })
              }
            />
          </div>
          <div className="mt-5 space-y-5 border-t border-slate-200 pt-5 dark:border-white/10">
            <ToggleSwitch
              label={t("resource_config.cleanup_enabled_title")}
              description={t("resource_config.cleanup_enabled_desc")}
              checked={values.requestLogStorage.cleanupEnabled}
              onCheckedChange={(cleanupEnabled) =>
                onChange({
                  requestLogStorage: { ...values.requestLogStorage, cleanupEnabled },
                })
              }
              disabled={disabled}
            />
            <ToggleSwitch
              label={t("resource_config.vacuum_title")}
              description={t("resource_config.vacuum_desc")}
              checked={values.requestLogStorage.vacuumOnCleanup}
              onCheckedChange={(vacuumOnCleanup) =>
                onChange({
                  requestLogStorage: { ...values.requestLogStorage, vacuumOnCleanup },
                })
              }
              disabled={disabled}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}
