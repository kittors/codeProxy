import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy, RefreshCw } from "lucide-react";
import {
  detectApiBaseFromLocation,
  observabilityApi,
  type ObservabilityMetricsSettings,
} from "@code-proxy/api-client";
import {
  Button,
  Callout,
  CodeBlock,
  ConfirmModal,
  SecretRevealModal,
  SettingGroup,
  SettingRow,
  ToggleSwitch,
  copyTextToClipboard,
  useToast,
} from "@code-proxy/ui";
import { useOptionalAuth } from "@app/providers/AuthProvider";
import { CREDENTIALS_FILE, prometheusScrapeConfig, scrapeTarget } from "./scrapeConfig";

type PendingAction = "disable" | "rotate" | null;

/** 令牌明文只交给「只显示一次」的弹窗，不留在页面状态里。 */
function withoutToken(settings: ObservabilityMetricsSettings): ObservabilityMetricsSettings {
  const next = { ...settings };
  delete next.token;
  return next;
}

function formatTime(value: string | undefined, locale: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

/** 代码块标题栏是深底，按钮跟着用浅色字。 */
function SnippetCopyButton({ text }: { text: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-2xs text-white/60 transition-colors hover:bg-white/10 hover:text-white"
      onClick={() =>
        void copyTextToClipboard(text).then((ok) => {
          if (ok) setCopied(true);
        })
      }
      onMouseLeave={() => setCopied(false)}
    >
      {copied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
      {copied ? t("common.copied") : t("metrics_export.copy_snippet")}
    </button>
  );
}

/**
 * 「指标接口」分区：开关、抓取令牌、抓取地址和 Prometheus 配置片段。
 *
 * 只在后端有这个接口时由配置页挂上（见 useObservabilityMetrics）。令牌在后端只存哈希，
 * 开启时首次生成或重新生成那一刻是唯一能看到明文的时候，所以用不能误关的一次性弹窗展示。
 */
export function ObservabilityMetricsPanel({ initial }: { initial: ObservabilityMetricsSettings }) {
  const { t, i18n } = useTranslation();
  const { notify } = useToast();
  const auth = useOptionalAuth();
  const canWrite = auth?.can("system.config.write") ?? true;
  const [settings, setSettings] = useState(() => withoutToken(initial));
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingAction>(null);
  const [revealed, setRevealed] = useState<string | null>(null);

  // 没接数据库的后端写不进设置（后端回 503），开关直接锁住并说明原因。
  const locked = !settings.persistent || !canWrite;
  const path = settings.path || "/metrics";
  const target = scrapeTarget(auth?.state.apiBase || detectApiBaseFromLocation(), path);
  const snippet = target ? prometheusScrapeConfig(target, CREDENTIALS_FILE) : "";

  const apply = async (request: () => Promise<ObservabilityMetricsSettings>) => {
    setBusy(true);
    try {
      const next = await request();
      setSettings(withoutToken(next));
      if (next.token) setRevealed(next.token);
      notify({ type: "success", message: t("config_page.toast_updated") });
    } catch (error: unknown) {
      notify({
        type: "error",
        message: error instanceof Error ? error.message : t("config_page.toast_update_failed"),
      });
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  const tokenDescription = settings.token_configured
    ? t("metrics_export.token_configured", {
        hint: settings.token_hint ?? "",
        time: formatTime(settings.token_created_at, i18n.language),
      })
    : t("metrics_export.token_missing");

  return (
    <div data-testid="observability-metrics-panel" className="space-y-3">
      {!settings.persistent ? (
        <Callout tone="warning">{t("metrics_export.not_persistent")}</Callout>
      ) : !canWrite ? (
        <Callout tone="neutral">{t("metrics_export.read_only")}</Callout>
      ) : null}

      <SettingGroup>
        <SettingRow
          label={t("metrics_export.enable_label")}
          description={t("metrics_export.enable_desc", { path })}
          controlWidth="auto"
          htmlFor="observability-metrics-enabled"
          control={
            <ToggleSwitch
              id="observability-metrics-enabled"
              checked={settings.enabled}
              disabled={locked || busy}
              onCheckedChange={(next) => {
                if (next) void apply(() => observabilityApi.setMetricsEnabled(true));
                else setPending("disable");
              }}
            />
          }
        />
        <SettingRow
          label={t("metrics_export.token_label")}
          description={tokenDescription}
          controlWidth="auto"
          control={
            settings.token_configured ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={locked || busy}
                onClick={() => setPending("rotate")}
              >
                <RefreshCw size={14} aria-hidden="true" />
                {t("metrics_export.rotate")}
              </Button>
            ) : null
          }
        />
        {settings.enabled && target ? (
          <SettingRow
            label={t("metrics_export.address_label")}
            description={<span className="break-all font-mono text-xs">{target.url}</span>}
            controlWidth="auto"
            control={
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  void copyTextToClipboard(target.url).then((ok) => {
                    if (ok) notify({ type: "success", message: t("common.copied") });
                  })
                }
              >
                <Copy size={14} aria-hidden="true" />
                {t("metrics_export.copy_address")}
              </Button>
            }
          />
        ) : null}
      </SettingGroup>

      {settings.enabled && target ? (
        <>
          <CodeBlock
            code={snippet}
            // 和 CC Switch 导入预览一样，YAML 借 shell 的分词：只有注释和字符串上色，不会渲染错。
            language="shell"
            label={<span className="normal-case tracking-normal">prometheus.yml</span>}
            action={<SnippetCopyButton text={snippet} />}
            className="[&_pre]:text-xs [&_pre]:leading-5"
          />
          <p className="text-xs leading-5 text-ink-3">
            {t("metrics_export.snippet_hint", { file: CREDENTIALS_FILE })}
          </p>
        </>
      ) : null}

      <ConfirmModal
        open={pending !== null}
        title={
          pending === "rotate"
            ? t("metrics_export.rotate_title")
            : t("metrics_export.disable_title")
        }
        description={
          pending === "rotate" ? t("metrics_export.rotate_desc") : t("metrics_export.disable_desc")
        }
        confirmText={
          pending === "rotate"
            ? t("metrics_export.rotate_confirm")
            : t("metrics_export.disable_confirm")
        }
        cancelText={t("ui.cancel_default")}
        variant="warning"
        busy={busy}
        onClose={() => {
          if (!busy) setPending(null);
        }}
        onConfirm={() =>
          void apply(() =>
            pending === "rotate"
              ? observabilityApi.rotateMetricsToken()
              : observabilityApi.setMetricsEnabled(false),
          )
        }
      />

      <SecretRevealModal
        open={revealed !== null}
        title={t("metrics_export.reveal_title")}
        secret={revealed ?? ""}
        secretLabel={t("metrics_export.token_label")}
        warning={t("metrics_export.reveal_warning", { file: CREDENTIALS_FILE })}
        onClose={() => setRevealed(null)}
      />
    </div>
  );
}
