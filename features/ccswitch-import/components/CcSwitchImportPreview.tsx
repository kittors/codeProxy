import { useId, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { CodeBlock, CopyButton, type SnippetLanguage } from "@code-proxy/ui";
import type { CcSwitchImportPlan } from "@code-proxy/domain/ccswitch/ccswitchImportPlan";
import {
  buildCcSwitchImportPreview,
  type CcSwitchPreviewLanguage,
} from "@code-proxy/domain/ccswitch/ccswitchImportPreview";

/** The code block only colours shell / python / javascript; JSON reads fine as javascript. */
const HIGHLIGHT_LANGUAGE: Record<CcSwitchPreviewLanguage, SnippetLanguage> = {
  json: "javascript",
  toml: "shell",
  dotenv: "shell",
  yaml: "shell",
};

/**
 * What the desktop app will hold after the import: the endpoint, then each file CC Switch
 * writes, rendered from the same plan as the deep link (key masked).
 */
export function CcSwitchImportPreview({ plan }: { plan: CcSwitchImportPlan }) {
  const { t } = useTranslation();
  const titleId = useId();
  const codexLoginNote = t("ccswitch.preview_codex_login_note");
  const files = useMemo(
    () => buildCcSwitchImportPreview(plan, { codexLoginNote }),
    [codexLoginNote, plan],
  );
  const clientLabel = t(plan.client.labelKey);
  const tiersFollowMain =
    plan.claudeTiers !== null && Object.values(plan.claudeTiers).some((model) => !model);

  return (
    <section aria-labelledby={titleId} data-testid="ccswitch-import-preview" className="space-y-3">
      <header>
        <h3 id={titleId} className="text-sm font-semibold text-ink">
          {t("ccswitch.preview_title")}
        </h3>
        <p className="mt-0.5 text-xs leading-5 text-ink-3">
          {t("ccswitch.preview_description", { client: clientLabel })}
        </p>
      </header>

      <div className="flex items-start gap-2 rounded-xl bg-subtle px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-ink-3">{t("ccswitch.config_full_base_url")}</div>
          <div
            data-testid="ccswitch-config-endpoint-preview"
            className="mt-0.5 break-all font-mono text-xs text-ink-2"
          >
            {plan.endpoint}
          </div>
        </div>
        <CopyButton value={plan.endpoint} />
      </div>

      {files.map((file) => (
        <CodeBlock
          key={file.path}
          code={file.content}
          language={HIGHLIGHT_LANGUAGE[file.language]}
          // The block's caption is upper-cased for "curl"-style labels; paths keep their case.
          label={<span className="normal-case tracking-normal">{file.path}</span>}
          className="[&_pre]:text-xs [&_pre]:leading-5"
        />
      ))}

      <ul className="space-y-1 text-xs leading-5 text-ink-3">
        {tiersFollowMain ? <li>{t("ccswitch.preview_claude_tiers")}</li> : null}
        {plan.client.additive ? (
          <li>{t("ccswitch.preview_additive", { client: clientLabel })}</li>
        ) : null}
        <li>
          {plan.usage
            ? t("ccswitch.preview_usage_enabled", { minutes: plan.usage.autoInterval })
            : t("ccswitch.preview_usage_disabled")}
        </li>
      </ul>
    </section>
  );
}
