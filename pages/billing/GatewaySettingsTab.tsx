import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, PlugZap, Save, Undo2, XCircle } from "lucide-react";
import {
  billingAdminApi,
  type BillingSettings,
  type BillingTestChannelResult,
} from "@code-proxy/api-client";
import {
  Button,
  Callout,
  Card,
  CopyButton,
  FormField,
  TextInput,
  ToggleSwitch,
  surface,
  useToast,
} from "@code-proxy/ui";

interface SettingsDraft {
  enabled: boolean;
  public_base_url: string;
  xunhu_gateway_url: string;
  xunhu_query_url: string;
  xunhu_wechat_enabled: boolean;
  xunhu_wechat_appid: string;
  xunhu_wechat_appsecret: string;
  xunhu_alipay_enabled: boolean;
  xunhu_alipay_appid: string;
  xunhu_alipay_appsecret: string;
  order_expire_minutes: string;
}

const toDraft = (s: BillingSettings): SettingsDraft => ({
  enabled: s.enabled,
  public_base_url: s.public_base_url || "",
  xunhu_gateway_url: s.xunhu_gateway_url || "https://api.xunhupay.com/payment/do.html",
  xunhu_query_url: s.xunhu_query_url || "https://api.xunhupay.com/payment/query.html",
  xunhu_wechat_enabled: s.xunhu_wechat_enabled,
  xunhu_wechat_appid: s.xunhu_wechat_appid || "",
  xunhu_wechat_appsecret: s.xunhu_wechat_appsecret || "",
  xunhu_alipay_enabled: s.xunhu_alipay_enabled,
  xunhu_alipay_appid: s.xunhu_alipay_appid || "",
  xunhu_alipay_appsecret: s.xunhu_alipay_appsecret || "",
  order_expire_minutes: String(s.order_expire_minutes || 15),
});

export function GatewaySettingsTab({
  settings,
  canWrite,
  onSaved,
}: {
  settings: BillingSettings;
  canWrite: boolean;
  onSaved: (next: BillingSettings) => void;
}) {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [draft, setDraft] = useState<SettingsDraft>(() => toDraft(settings));
  const [saving, setSaving] = useState(false);
  const [testingChannel, setTestingChannel] = useState<"wechat" | "alipay" | null>(null);
  const [testResults, setTestResults] = useState<
    Partial<Record<"wechat" | "alipay", BillingTestChannelResult>>
  >({});

  useEffect(() => {
    setDraft(toDraft(settings));
  }, [settings]);

  const initial = toDraft(settings);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const disabled = !canWrite || !settings.persistent || saving;

  const handleSave = async () => {
    setSaving(true);
    try {
      const expireMins = Number.parseInt(draft.order_expire_minutes, 10);
      const updated = await billingAdminApi.updateSettings({
        enabled: draft.enabled,
        provider: "xunhupay",
        public_base_url: draft.public_base_url.trim(),
        xunhu_gateway_url: draft.xunhu_gateway_url.trim(),
        xunhu_query_url: draft.xunhu_query_url.trim(),
        xunhu_wechat_enabled: draft.xunhu_wechat_enabled,
        xunhu_wechat_appid: draft.xunhu_wechat_appid.trim(),
        xunhu_wechat_appsecret: draft.xunhu_wechat_appsecret.trim(),
        xunhu_alipay_enabled: draft.xunhu_alipay_enabled,
        xunhu_alipay_appid: draft.xunhu_alipay_appid.trim(),
        xunhu_alipay_appsecret: draft.xunhu_alipay_appsecret.trim(),
        order_expire_minutes: Number.isFinite(expireMins) ? expireMins : 15,
      });
      onSaved(updated);
      notify({ type: "success", message: t("billing_admin.settings_saved") });
    } catch (err) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("billing_admin.settings_save_failed"),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (channel: "wechat" | "alipay") => {
    setTestingChannel(channel);
    try {
      const result = await billingAdminApi.testChannel({
        channel,
        gateway_url: draft.xunhu_gateway_url.trim(),
        query_url: draft.xunhu_query_url.trim(),
        appid: channel === "wechat" ? draft.xunhu_wechat_appid.trim() : draft.xunhu_alipay_appid.trim(),
        appsecret:
          channel === "wechat"
            ? draft.xunhu_wechat_appsecret.trim()
            : draft.xunhu_alipay_appsecret.trim(),
      });
      setTestResults((prev) => ({ ...prev, [channel]: result }));
      notify({
        type: result.ok ? "success" : "error",
        message: result.message,
      });
    } catch (err) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("billing_admin.test_failed"),
      });
    } finally {
      setTestingChannel(null);
    }
  };

  const renderChannelCard = (
    channel: "wechat" | "alipay",
    title: string,
    enabledVal: boolean,
    onToggle: (next: boolean) => void,
    appIdVal: string,
    onAppId: (next: string) => void,
    secretVal: string,
    onSecret: (next: string) => void,
    notifyUrl: string,
  ) => {
    const result = testResults[channel];
    return (
      <Card
        title={title}
        actions={
          <ToggleSwitch
            checked={enabledVal}
            onCheckedChange={onToggle}
            disabled={disabled}
            ariaLabel={title}
          />
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t("billing_admin.xunhu_appid_label")}>
              <TextInput
                value={appIdVal}
                disabled={disabled}
                placeholder="201906xxxxxx"
                onChange={(e) => onAppId(e.target.value)}
              />
            </FormField>
            <FormField
              label={t("billing_admin.xunhu_appsecret_label")}
              description={t("billing_admin.secret_keep_hint")}
            >
              <TextInput
                type="password"
                value={secretVal}
                disabled={disabled}
                placeholder={t("billing_admin.xunhu_appsecret_placeholder")}
                onChange={(e) => onSecret(e.target.value)}
              />
            </FormField>
          </div>

          <div
            className={`${surface({ tone: "inset", radius: "xl" })} flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 text-xs`}
          >
            <div className="min-w-0 flex-1">
              <div className="text-2xs text-ink-3">{t("billing_admin.notify_url_label")}</div>
              <div className="truncate font-mono text-ink-2">{notifyUrl}</div>
            </div>
            <CopyButton value={notifyUrl} label={t("common.copy")} />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs">
              {result ? (
                <span
                  className={
                    result.ok
                      ? "inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400"
                      : "inline-flex items-center gap-1.5 text-rose-600 dark:text-rose-400"
                  }
                >
                  {result.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                  <span>
                    {result.message} ({result.duration_ms}ms)
                  </span>
                </span>
              ) : null}
            </div>
            <Button
              size="sm"
              variant="secondary"
              disabled={!canWrite || testingChannel !== null}
              onClick={() => void handleTest(channel)}
            >
              <PlugZap size={14} />
              {testingChannel === channel
                ? t("billing_admin.testing_channel")
                : t("billing_admin.test_channel")}
            </Button>
          </div>
        </div>
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      <Callout tone="info" title={t("billing_admin.xunhu_guide_title")}>
        {t("billing_admin.xunhu_guide_body")}
      </Callout>

      <Card
        title={t("billing_admin.general_card_title")}
        actions={
          <div className="flex items-center gap-2">
            {dirty ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={saving}
                onClick={() => setDraft(toDraft(settings))}
              >
                <Undo2 size={14} />
                {t("common.reset")}
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="primary"
              disabled={disabled || !dirty}
              onClick={() => void handleSave()}
            >
              <Save size={14} />
              {saving ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-ink">
                {t("billing_admin.enable_billing_label")}
              </div>
              <p className="text-xs text-ink-3">{t("billing_admin.enable_billing_desc")}</p>
            </div>
            <ToggleSwitch
              checked={draft.enabled}
              onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, enabled: checked }))}
              disabled={disabled}
              ariaLabel={t("billing_admin.enable_billing_label")}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label={t("billing_admin.public_base_url_label")}
              description={t("billing_admin.public_base_url_desc")}
            >
              <TextInput
                value={draft.public_base_url}
                disabled={disabled}
                placeholder="https://relay.example.com"
                onChange={(e) => setDraft((prev) => ({ ...prev, public_base_url: e.target.value }))}
              />
            </FormField>
            <FormField
              label={t("billing_admin.order_expire_label")}
              description={t("billing_admin.order_expire_desc")}
            >
              <TextInput
                type="number"
                min={1}
                max={1440}
                value={draft.order_expire_minutes}
                disabled={disabled}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, order_expire_minutes: e.target.value }))
                }
              />
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t("billing_admin.xunhu_gateway_label")}>
              <TextInput
                value={draft.xunhu_gateway_url}
                disabled={disabled}
                placeholder="https://api.xunhupay.com/payment/do.html"
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, xunhu_gateway_url: e.target.value }))
                }
              />
            </FormField>
            <FormField label={t("billing_admin.xunhu_query_label")}>
              <TextInput
                value={draft.xunhu_query_url}
                disabled={disabled}
                placeholder="https://api.xunhupay.com/payment/query.html"
                onChange={(e) => setDraft((prev) => ({ ...prev, xunhu_query_url: e.target.value }))}
              />
            </FormField>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {renderChannelCard(
          "wechat",
          t("billing_admin.xunhu_wechat_card"),
          draft.xunhu_wechat_enabled,
          (checked) => setDraft((prev) => ({ ...prev, xunhu_wechat_enabled: checked })),
          draft.xunhu_wechat_appid,
          (v) => setDraft((prev) => ({ ...prev, xunhu_wechat_appid: v })),
          draft.xunhu_wechat_appsecret,
          (v) => setDraft((prev) => ({ ...prev, xunhu_wechat_appsecret: v })),
          settings.wechat_notify_url,
        )}
        {renderChannelCard(
          "alipay",
          t("billing_admin.xunhu_alipay_card"),
          draft.xunhu_alipay_enabled,
          (checked) => setDraft((prev) => ({ ...prev, xunhu_alipay_enabled: checked })),
          draft.xunhu_alipay_appid,
          (v) => setDraft((prev) => ({ ...prev, xunhu_alipay_appid: v })),
          draft.xunhu_alipay_appsecret,
          (v) => setDraft((prev) => ({ ...prev, xunhu_alipay_appsecret: v })),
          settings.alipay_notify_url,
        )}
      </div>
    </div>
  );
}
