import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { LoopGuardInfo, LoopGuardKeyView } from "@code-proxy/api-client";
import {
  FormField,
  Select,
  SettingGroup,
  SettingRow,
  TextInput,
  ToggleSwitch,
} from "@code-proxy/ui";
import {
  maxDistinctFor,
  showsReplyThresholds,
  showsToolThresholds,
  type LoopGuardDraft,
  type LoopGuardDraftErrors,
  type LoopGuardField,
  type LoopGuardMode,
  type LoopGuardScope,
} from "./loopGuardDraft";

/** 阈值输入框留空时回落到的值：租户一层是内置默认值，Key 一层是租户自己的值（没设就是默认值）。 */
export interface LoopGuardFallbacks {
  replyWindow: number;
  replyMaxDistinct: number;
  toolRepeats: number;
}

export interface LoopGuardFieldsProps {
  scope: LoopGuardScope;
  draft: LoopGuardDraft;
  info: LoopGuardInfo;
  errors: LoopGuardDraftErrors;
  fallbacks: LoopGuardFallbacks;
  disabled: boolean;
  /** 控件 id 的前缀：租户面板和 Key 弹窗可能同时在页面上。 */
  idPrefix: string;
  onChange: (patch: Partial<LoopGuardDraft>) => void;
  onTouch: (field: LoopGuardField) => void;
  /** 仅 Key：租户一层现在是开还是关，用在「跟随租户（现在开 / 关）」。 */
  tenantOn?: { reply: boolean; tool: boolean };
  /** 仅 Key：网关此刻对这把 Key 实际怎么做（已保存的状态，不含未保存的改动）。 */
  effective?: LoopGuardKeyView["effective"];
  /** 放进弹窗时去掉卡片边，只留行间分隔线。 */
  flat?: boolean;
}

function ThresholdInput({
  id,
  label,
  hint,
  error,
  value,
  placeholder,
  disabled,
  onChange,
  onBlur,
}: {
  id: string;
  label: string;
  hint: string;
  error?: string;
  value: string;
  placeholder: number;
  disabled: boolean;
  onChange: (value: string) => void;
  onBlur: () => void;
}) {
  return (
    <FormField label={label} description={hint} error={error} htmlFor={id} reserveMeta={false}>
      <TextInput
        id={id}
        inputMode="numeric"
        autoComplete="off"
        value={value}
        placeholder={String(placeholder)}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
      />
    </FormField>
  );
}

/**
 * 循环保护的两项检查：每项一个开关（租户）或一个三选一（Key：跟随租户 / 开 / 关），
 * 开着时下面是阈值。租户面板和 Key 编辑弹窗共用，所以文案、范围提示、校验都只有这一份。
 *
 * 阈值留空表示「用默认」，输入框的占位符就是那个默认值，不是一个要用户去猜的空格。
 * 范围来自后端随响应返回的 bounds，不在前端抄数字。
 */
export function LoopGuardFields({
  scope,
  draft,
  info,
  errors,
  fallbacks,
  disabled,
  idPrefix,
  onChange,
  onTouch,
  tenantOn,
  effective,
  flat = false,
}: LoopGuardFieldsProps) {
  const { t } = useTranslation();
  const { bounds } = info;

  const errorText = (field: LoopGuardField): string | undefined => {
    const error = errors[field];
    return error ? t(error.key, error.values) : undefined;
  };

  const modeControl = (
    id: string,
    label: string,
    mode: LoopGuardMode,
    onMode: (next: LoopGuardMode) => void,
    followingTenantOn: boolean,
  ): ReactNode =>
    scope === "tenant" ? (
      <ToggleSwitch
        id={id}
        ariaLabel={label}
        checked={mode === "on"}
        disabled={disabled}
        onCheckedChange={(next) => onMode(next ? "on" : "off")}
      />
    ) : (
      <Select
        id={id}
        aria-label={label}
        value={mode}
        disabled={disabled}
        onChange={(next) => onMode(next as LoopGuardMode)}
        options={[
          {
            value: "inherit",
            label: t("loop_guard.mode_inherit", {
              state: t(followingTenantOn ? "loop_guard.state_on" : "loop_guard.state_off"),
            }),
          },
          { value: "on", label: t("loop_guard.mode_on") },
          { value: "off", label: t("loop_guard.mode_off") },
        ]}
      />
    );

  const effectiveLine = (on: boolean, source: string): string | null => {
    if (!effective) return null;
    if (!on) return t("loop_guard.effective_off");
    return t(
      source === "api_key" ? "loop_guard.effective_on_key" : "loop_guard.effective_on_tenant",
    );
  };
  const replyEffective = effectiveLine(
    effective?.reply.enabled === true,
    effective?.reply.source ?? "",
  );
  const toolEffective = effectiveLine(
    effective?.tool.enabled === true,
    effective?.tool.source ?? "",
  );

  // 窗口没填时 max_distinct 的上限按回落的窗口算，与后端校验一致。
  const windowForDistinct = Number(draft.replyWindow.trim()) || fallbacks.replyWindow;
  const distinctMax = maxDistinctFor(windowForDistinct, info);

  const effectiveNote = (line: string | null) =>
    line ? <p className="mt-3 text-xs text-ink-3">{line}</p> : null;

  return (
    <SettingGroup flat={flat}>
      <SettingRow
        label={t("loop_guard.reply_label")}
        description={t("loop_guard.reply_desc")}
        controlWidth={scope === "tenant" ? "auto" : "md"}
        htmlFor={`${idPrefix}-reply-mode`}
        control={modeControl(
          `${idPrefix}-reply-mode`,
          t("loop_guard.reply_label"),
          draft.replyMode,
          (replyMode) => onChange({ replyMode }),
          tenantOn?.reply ?? false,
        )}
      >
        {showsReplyThresholds(draft) ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <ThresholdInput
              id={`${idPrefix}-reply-window`}
              label={t("loop_guard.window_label")}
              hint={t("loop_guard.window_hint", {
                value: fallbacks.replyWindow,
                min: bounds.min_reply_window,
                max: bounds.max_reply_window,
              })}
              error={errorText("replyWindow")}
              value={draft.replyWindow}
              placeholder={fallbacks.replyWindow}
              disabled={disabled}
              onChange={(replyWindow) => onChange({ replyWindow })}
              onBlur={() => onTouch("replyWindow")}
            />
            <ThresholdInput
              id={`${idPrefix}-reply-distinct`}
              label={t("loop_guard.max_distinct_label")}
              hint={t("loop_guard.max_distinct_hint", {
                value: fallbacks.replyMaxDistinct,
                min: bounds.min_reply_distinct,
                max: distinctMax,
              })}
              error={errorText("replyMaxDistinct")}
              value={draft.replyMaxDistinct}
              placeholder={fallbacks.replyMaxDistinct}
              disabled={disabled}
              onChange={(replyMaxDistinct) => onChange({ replyMaxDistinct })}
              onBlur={() => onTouch("replyMaxDistinct")}
            />
          </div>
        ) : null}
        {effectiveNote(replyEffective)}
      </SettingRow>
      <SettingRow
        label={t("loop_guard.tool_label")}
        description={t("loop_guard.tool_desc")}
        controlWidth={scope === "tenant" ? "auto" : "md"}
        htmlFor={`${idPrefix}-tool-mode`}
        control={modeControl(
          `${idPrefix}-tool-mode`,
          t("loop_guard.tool_label"),
          draft.toolMode,
          (toolMode) => onChange({ toolMode }),
          tenantOn?.tool ?? false,
        )}
      >
        {showsToolThresholds(draft) ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <ThresholdInput
              id={`${idPrefix}-tool-repeats`}
              label={t("loop_guard.repeats_label")}
              hint={t("loop_guard.repeats_hint", {
                value: fallbacks.toolRepeats,
                min: bounds.min_tool_repeats,
                max: bounds.max_tool_repeats,
              })}
              error={errorText("toolRepeats")}
              value={draft.toolRepeats}
              placeholder={fallbacks.toolRepeats}
              disabled={disabled}
              onChange={(toolRepeats) => onChange({ toolRepeats })}
              onBlur={() => onTouch("toolRepeats")}
            />
          </div>
        ) : null}
        {effectiveNote(toolEffective)}
      </SettingRow>
    </SettingGroup>
  );
}
