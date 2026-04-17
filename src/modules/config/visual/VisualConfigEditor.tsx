import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { VisualConfigValues } from "@/modules/config/visual/types";
import { Card } from "@/modules/ui/Card";
import { TextInput } from "@/modules/ui/Input";
import { Select } from "@/modules/ui/Select";
import { ToggleSwitch } from "@/modules/ui/ToggleSwitch";
import {
  PayloadFilterRulesEditor,
  PayloadRulesEditor,
} from "@/modules/config/visual/PayloadRuleEditors";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="text-sm font-semibold text-slate-900 dark:text-white">{label}</div>
      {hint ? <div className="text-xs text-slate-600 dark:text-white/65">{hint}</div> : null}
      <div className="pt-1">{children}</div>
    </div>
  );
}

function MultilineField({
  value,
  onChange,
  disabled,
  ariaLabel,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  ariaLabel: string;
  placeholder: string;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.currentTarget.value)}
      disabled={disabled}
      aria-label={ariaLabel}
      placeholder={placeholder}
      rows={6}
      spellCheck={false}
      className={[
        "min-h-36 w-full resize-y rounded-2xl border border-black/[0.04] bg-white px-3.5 py-3 font-mono text-xs leading-5 text-[#3F3F46] shadow-[2px_2px_6px_rgb(0_0_0_/_0.055)] outline-none transition-colors",
        "placeholder:text-[#96969B] hover:bg-[#FAFAFA] hover:text-[#18181B] focus-visible:ring-2 focus-visible:ring-slate-400/35",
        "dark:border-transparent dark:bg-[#27272A] dark:text-[#E4E4E7] dark:shadow-[0_8px_24px_rgb(0_0_0_/_0.24)] dark:placeholder:text-[#9F9FA8] dark:hover:bg-[#303036] dark:hover:text-white dark:focus-visible:ring-white/15",
        disabled ? "cursor-not-allowed opacity-60" : null,
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
}

export function VisualConfigEditor({
  values,
  disabled,
  onChange,
}: {
  values: VisualConfigValues;
  disabled?: boolean;
  onChange: (values: Partial<VisualConfigValues>) => void;
}) {
  const { t } = useTranslation();
  const update = useCallback(
    (patch: Partial<VisualConfigValues>) => {
      onChange(patch);
    },
    [onChange],
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={t("visual_config.basics")} description={t("visual_config.basics_desc")}>
          <div className="space-y-4">
            <div className="grid gap-3 lg:grid-cols-2">
              <Field label="host" hint={t("visual_config.empty_default")}>
                <TextInput
                  value={values.host}
                  onChange={(e) => update({ host: e.currentTarget.value })}
                  placeholder="0.0.0.0"
                  disabled={disabled}
                />
              </Field>
              <Field label="port" hint={t("visual_config.retry_count")}>
                <TextInput
                  value={values.port}
                  onChange={(e) => update({ port: e.currentTarget.value })}
                  placeholder="8080"
                  inputMode="numeric"
                  disabled={disabled}
                />
              </Field>
            </div>

            <Field label="auth-dir" hint={t("visual_config.auth_dir")}>
              <TextInput
                value={values.authDir}
                onChange={(e) => update({ authDir: e.currentTarget.value })}
                placeholder="./auth"
                disabled={disabled}
              />
            </Field>

            <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 px-4 py-3 dark:border-indigo-800 dark:bg-indigo-950/30">
              <p className="text-sm text-indigo-800 dark:text-indigo-300">
                {t("visual_config.api_migrated")}
                <a
                  href="#/api-keys"
                  className="ml-1 font-semibold underline underline-offset-2 hover:text-indigo-600 dark:hover:text-indigo-200"
                >
                  {t("visual_config.go_to_api_keys")}
                </a>
              </p>
            </div>
          </div>
        </Card>

        <Card title={t("visual_config.tls")} description={t("visual_config.tls_desc")}>
          <div className="space-y-4">
            <ToggleSwitch
              label={t("visual_config.enable_tls")}
              description={t("visual_config.tls_uses")}
              checked={values.tlsEnable}
              onCheckedChange={(next) => update({ tlsEnable: next })}
              disabled={disabled}
            />
            <div className="grid gap-3">
              <Field label="tls.cert" hint={t("visual_config.cert_path")}>
                <TextInput
                  value={values.tlsCert}
                  onChange={(e) => update({ tlsCert: e.currentTarget.value })}
                  placeholder="./cert.pem"
                  disabled={disabled}
                />
              </Field>
              <Field label="tls.key" hint={t("visual_config.key_path")}>
                <TextInput
                  value={values.tlsKey}
                  onChange={(e) => update({ tlsKey: e.currentTarget.value })}
                  placeholder="./key.pem"
                  disabled={disabled}
                />
              </Field>
            </div>
          </div>
        </Card>
      </div>

      <Card title={t("visual_config.remote_mgmt")} description={t("visual_config.remote_desc")}>
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-4">
            <ToggleSwitch
              label={t("visual_config.allow_remote")}
              description={t("visual_config.remote_allow_desc")}
              checked={values.rmAllowRemote}
              onCheckedChange={(next) => update({ rmAllowRemote: next })}
              disabled={disabled}
            />
            <ToggleSwitch
              label={t("visual_config.disable_panel")}
              description={t("visual_config.remote_disable_desc")}
              checked={values.rmDisableControlPanel}
              onCheckedChange={(next) => update({ rmDisableControlPanel: next })}
              disabled={disabled}
            />
          </div>
          <div className="space-y-4">
            <Field label="secret-key" hint={t("visual_config.remote_key")}>
              <TextInput
                value={values.rmSecretKey}
                onChange={(e) => update({ rmSecretKey: e.currentTarget.value })}
                placeholder="******"
                disabled={disabled}
              />
            </Field>
            <Field label="panel-github-repository" hint={t("visual_config.panel_url")}>
              <TextInput
                value={values.rmPanelRepo}
                onChange={(e) => update({ rmPanelRepo: e.currentTarget.value })}
                placeholder="owner/repo"
                disabled={disabled}
              />
            </Field>
          </div>
        </div>
      </Card>

      <Card title={t("visual_config.cors_title")} description={t("visual_config.cors_desc")}>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <Field
            label={t("visual_config.cors_origins_label")}
            hint={t("visual_config.cors_origins_hint")}
          >
            <MultilineField
              value={values.corsAllowOriginsText}
              onChange={(next) => update({ corsAllowOriginsText: next })}
              disabled={disabled}
              ariaLabel={t("visual_config.cors_origins_label")}
              placeholder={[
                "chrome-extension://abcdefghijklmnop",
                "http://localhost:5173",
                "https://admin.example.com",
              ].join("\n")}
            />
          </Field>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-xs leading-5 text-emerald-900 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-100">
            <div className="font-semibold">{t("visual_config.cors_default_title")}</div>
            <p className="mt-1">{t("visual_config.cors_default_desc")}</p>
            <p className="mt-3 rounded-xl bg-white/65 px-3 py-2 font-mono text-[11px] text-emerald-950 dark:bg-black/20 dark:text-emerald-100">
              chrome-extension://&lt;extension-id&gt;
            </p>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={t("visual_config.switches")} description={t("visual_config.runtime_desc")}>
          <div className="space-y-4">
            <ToggleSwitch
              label={t("visual_config.debug_label")}
              description={t("visual_config.debug_desc")}
              checked={values.debug}
              onCheckedChange={(next) => update({ debug: next })}
              disabled={disabled}
            />
            <ToggleSwitch
              label={t("visual_config.commercial")}
              description={t("visual_config.commercial_mode")}
              checked={values.commercialMode}
              onCheckedChange={(next) => update({ commercialMode: next })}
              disabled={disabled}
            />
            <ToggleSwitch
              label={t("visual_config.log_to_file_label")}
              description={t("visual_config.log_to_file_desc")}
              checked={values.loggingToFile}
              onCheckedChange={(next) => update({ loggingToFile: next })}
              disabled={disabled}
            />
            <ToggleSwitch
              label={t("visual_config.usage_stats_label")}
              description={t("visual_config.usage_stats_desc")}
              checked={values.usageStatisticsEnabled}
              onCheckedChange={(next) => update({ usageStatisticsEnabled: next })}
              disabled={disabled}
            />
            <ToggleSwitch
              label={t("config_page.auto_update")}
              description={t("config_page.auto_update_desc")}
              checked={values.autoUpdateEnabled}
              onCheckedChange={(next) => update({ autoUpdateEnabled: next })}
              disabled={disabled}
            />
            <Field
              label={t("config_page.auto_update_channel")}
              hint={t("config_page.auto_update_channel_desc")}
            >
              <Select
                aria-label={t("config_page.auto_update_channel")}
                value={values.autoUpdateChannel}
                onChange={(value) =>
                  update({ autoUpdateChannel: value === "dev" ? "dev" : "main" })
                }
                options={[
                  { value: "main", label: t("config_page.auto_update_channel_main") },
                  { value: "dev", label: t("config_page.auto_update_channel_dev") },
                ]}
              />
            </Field>
            <Field
              label={t("config_page.auto_update_docker_image")}
              hint={t("config_page.auto_update_docker_image_desc")}
            >
              <TextInput
                aria-label={t("config_page.auto_update_docker_image")}
                value={values.autoUpdateDockerImage}
                onChange={(e) => update({ autoUpdateDockerImage: e.currentTarget.value })}
                placeholder="ghcr.io/kittors/clirelay"
                disabled={disabled}
              />
              <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
                {t("config_page.auto_update_docker_image_warning")}
              </p>
            </Field>
          </div>
        </Card>

        <Card
          title={t("visual_config.proxy_retry")}
          description={t("visual_config.proxy_retry_card_desc")}
        >
          <div className="space-y-4">
            <Field label="proxy-url" hint={t("visual_config.empty_no_proxy")}>
              <TextInput
                value={values.proxyUrl}
                onChange={(e) => update({ proxyUrl: e.currentTarget.value })}
                placeholder="http://127.0.0.1:7890"
                disabled={disabled}
              />
            </Field>
            <div className="grid gap-3 lg:grid-cols-2">
              <Field label="request-retry" hint={t("visual_config.non_negative_int")}>
                <TextInput
                  value={values.requestRetry}
                  onChange={(e) => update({ requestRetry: e.currentTarget.value })}
                  placeholder="0"
                  inputMode="numeric"
                  disabled={disabled}
                />
              </Field>
              <Field label="max-retry-interval" hint={t("visual_config.retry_hint")}>
                <TextInput
                  value={values.maxRetryInterval}
                  onChange={(e) => update({ maxRetryInterval: e.currentTarget.value })}
                  placeholder="0"
                  inputMode="numeric"
                  disabled={disabled}
                />
              </Field>
            </div>
            <ToggleSwitch
              label={t("visual_config.force_prefix_label")}
              description={t("visual_config.force_prefix_desc")}
              checked={values.forceModelPrefix}
              onCheckedChange={(next) => update({ forceModelPrefix: next })}
              disabled={disabled}
            />
            <ToggleSwitch
              label={t("visual_config.ws_auth_label")}
              description={t("visual_config.ws_auth_desc")}
              checked={values.wsAuth}
              onCheckedChange={(next) => update({ wsAuth: next })}
              disabled={disabled}
            />
          </div>
        </Card>
      </div>

      <Card
        title={t("visual_config.kimi_headers")}
        description={t("visual_config.kimi_headers_desc")}
      >
        <div className="grid gap-4 lg:grid-cols-3">
          <Field label="User-Agent" hint={t("visual_config.kimi_user_agent_hint")}>
            <TextInput
              value={values.kimiHeaderDefaults.userAgent}
              onChange={(e) =>
                update({
                  kimiHeaderDefaults: {
                    ...values.kimiHeaderDefaults,
                    userAgent: e.currentTarget.value,
                  },
                })
              }
              placeholder="KimiCLI/1.10.6"
              disabled={disabled}
            />
          </Field>
          <Field label="X-Msh-Platform" hint={t("visual_config.kimi_platform_hint")}>
            <TextInput
              value={values.kimiHeaderDefaults.platform}
              onChange={(e) =>
                update({
                  kimiHeaderDefaults: {
                    ...values.kimiHeaderDefaults,
                    platform: e.currentTarget.value,
                  },
                })
              }
              placeholder="kimi_cli"
              disabled={disabled}
            />
          </Field>
          <Field label="X-Msh-Version" hint={t("visual_config.kimi_version_hint")}>
            <TextInput
              value={values.kimiHeaderDefaults.version}
              onChange={(e) =>
                update({
                  kimiHeaderDefaults: {
                    ...values.kimiHeaderDefaults,
                    version: e.currentTarget.value,
                  },
                })
              }
              placeholder="1.10.6"
              disabled={disabled}
            />
          </Field>
        </div>
        <p className="mt-4 text-xs text-slate-600 dark:text-white/65">
          {t("visual_config.kimi_headers_note")}
        </p>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title={t("visual_config.log_limits")}
          description={t("visual_config.log_limits_desc")}
        >
          <div className="space-y-4">
            <Field label="logs-max-total-size-mb" hint={t("visual_config.log_max")}>
              <TextInput
                value={values.logsMaxTotalSizeMb}
                onChange={(e) => update({ logsMaxTotalSizeMb: e.currentTarget.value })}
                placeholder="0"
                inputMode="numeric"
                disabled={disabled}
              />
            </Field>
          </div>
        </Card>

        <Card
          title={t("visual_config.quota_strategy")}
          description={t("visual_config.quota_strategy_desc")}
        >
          <div className="space-y-4">
            <ToggleSwitch
              label={t("visual_config.switch_project")}
              description={t("visual_config.quota_switch_project_desc")}
              checked={values.quotaSwitchProject}
              onCheckedChange={(next) => update({ quotaSwitchProject: next })}
              disabled={disabled}
            />
            <ToggleSwitch
              label={t("visual_config.switch_preview")}
              description={t("visual_config.quota_switch_preview_desc")}
              checked={values.quotaSwitchPreviewModel}
              onCheckedChange={(next) => update({ quotaSwitchPreviewModel: next })}
              disabled={disabled}
            />
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={t("visual_config.streaming")} description={t("visual_config.streaming_desc")}>
          <div className="space-y-4">
            <div className="grid gap-3 lg:grid-cols-2">
              <Field
                label="streaming.keepalive-seconds"
                hint={t("visual_config.non_negative_int_sec")}
              >
                <TextInput
                  value={values.streaming.keepaliveSeconds}
                  onChange={(e) =>
                    update({
                      streaming: { ...values.streaming, keepaliveSeconds: e.currentTarget.value },
                    })
                  }
                  placeholder="0"
                  inputMode="numeric"
                  disabled={disabled}
                />
              </Field>
              <Field label="streaming.bootstrap-retries" hint={t("visual_config.non_negative_int")}>
                <TextInput
                  value={values.streaming.bootstrapRetries}
                  onChange={(e) =>
                    update({
                      streaming: { ...values.streaming, bootstrapRetries: e.currentTarget.value },
                    })
                  }
                  placeholder="0"
                  inputMode="numeric"
                  disabled={disabled}
                />
              </Field>
            </div>
            <Field
              label="nonstream-keepalive-interval"
              hint={t("visual_config.non_negative_int_sec")}
            >
              <TextInput
                value={values.streaming.nonstreamKeepaliveInterval}
                onChange={(e) =>
                  update({
                    streaming: {
                      ...values.streaming,
                      nonstreamKeepaliveInterval: e.currentTarget.value,
                    },
                  })
                }
                placeholder="0"
                inputMode="numeric"
                disabled={disabled}
              />
            </Field>
          </div>
        </Card>
      </div>

      <div className="space-y-6">
        <PayloadRulesEditor
          title={t("visual_config.payload_default")}
          description={t("visual_config.payload_default_desc")}
          rules={values.payloadDefaultRules}
          disabled={disabled}
          onChange={(payloadDefaultRules) => update({ payloadDefaultRules })}
        />
        <PayloadRulesEditor
          title={t("visual_config.payload_override")}
          description={t("visual_config.payload_override_desc")}
          rules={values.payloadOverrideRules}
          disabled={disabled}
          onChange={(payloadOverrideRules) => update({ payloadOverrideRules })}
        />
        <PayloadFilterRulesEditor
          rules={values.payloadFilterRules}
          disabled={disabled}
          onChange={(payloadFilterRules) => update({ payloadFilterRules })}
        />
      </div>
    </div>
  );
}
