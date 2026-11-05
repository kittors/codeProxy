import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Repeat } from "lucide-react";
import { Button, Callout, FormSection } from "@code-proxy/ui";
import { LoopGuardFields } from "./LoopGuardFields";
import type { LoopGuardKeyOverride } from "./useLoopGuardKey";

/**
 * 这一节有没有东西可显示：后端有循环保护、且当前账号读得到这把 Key 的设置（读取失败也算，
 * 失败要在这一节里说出来）。读取期间、旧后端、没有读权限都不显示——面板会自动更新到没有这个
 * 功能的旧后端，那里的弹窗必须和以前一模一样，所以读取期间也不先摆出骨架再收回去。
 */
export function isLoopGuardKeyShown(override: LoopGuardKeyOverride): boolean {
  return override.state.status === "ready" || override.state.status === "failed";
}

/**
 * API Key 编辑弹窗里的「循环保护」一节：这把 Key 对租户设置的覆盖。
 *
 * 新后端上这一节在弹窗末尾稍后出现，不会挤动上面已有的字段。读取失败只在这一节里提示，
 * 不挡住 Key 本身的保存。
 *
 * 两种放法：表单式弹窗里是带标题的一节（默认）；分段式编辑器里标题和说明由那一段自己写，
 * 传 bare 只出内容（见 useLoopGuardKeyPane）。
 */
export function LoopGuardKeySection({
  override,
  disabled,
  bare = false,
}: {
  override: LoopGuardKeyOverride;
  /** 弹窗正在保存，或当前账号没有改 Key 的权限。 */
  disabled: boolean;
  /** 不带标题和说明，只出内容。 */
  bare?: boolean;
}) {
  const { t } = useTranslation();
  const idPrefix = useId().replace(/:/g, "");
  const { state, view, saving, saveError } = override;
  if (!isLoopGuardKeyShown(override)) return null;

  const body =
    state.status === "failed" ? (
      <Callout
        tone="warning"
        role="alert"
        actions={
          <Button size="xs" variant="secondary" onClick={override.reload}>
            {t("loop_guard.key_retry")}
          </Button>
        }
      >
        {t("loop_guard.key_load_failed")}
      </Callout>
    ) : view ? (
      <>
        {!view.persistent ? (
          <Callout tone="warning">{t("loop_guard.not_persistent")}</Callout>
        ) : null}
        <LoopGuardFields
          scope="key"
          flat
          idPrefix={`${idPrefix}-key`}
          draft={override.form.draft}
          info={view}
          errors={override.form.errors}
          fallbacks={{
            replyWindow: view.tenant.reply.window || view.defaults.reply_window,
            replyMaxDistinct: view.tenant.reply.max_distinct || view.defaults.reply_max_distinct,
            toolRepeats: view.tenant.tool.repeats || view.defaults.tool_repeats,
          }}
          tenantOn={{ reply: view.tenant.reply.enabled, tool: view.tenant.tool.enabled }}
          effective={view.effective}
          disabled={disabled || saving || !view.persistent}
          onChange={override.form.patch}
          onTouch={override.form.touch}
        />
        {saveError ? (
          <Callout tone="danger" role="alert">
            {saveError}
          </Callout>
        ) : null}
      </>
    ) : null;

  if (bare) return <div className="space-y-4">{body}</div>;
  return (
    <FormSection
      title={t("loop_guard.key_section_title")}
      description={t("loop_guard.key_section_hint")}
      icon={<Repeat />}
    >
      {body}
    </FormSection>
  );
}
