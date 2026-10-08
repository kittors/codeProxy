import { useTranslation } from "react-i18next";
import { Plus, Trash2 } from "lucide-react";
import type {
  PayloadFilterRule,
  PayloadModelEntry,
  PayloadParamEntry,
  PayloadParamValueType,
  PayloadProtocol,
  PayloadRule,
} from "@features/visual-config-editor";
import {
  makeClientId,
  VISUAL_CONFIG_PAYLOAD_VALUE_TYPE_OPTIONS,
  VISUAL_CONFIG_PROTOCOL_OPTIONS,
} from "@features/visual-config-editor";
import type { ReactNode } from "react";
import { Button, Select, surface, Textarea, TextInput } from "@code-proxy/ui";

/**
 * 一类规则（默认 / 覆盖 / 过滤）：标题与说明常驻，右上角「添加规则」。
 * 放在配置页「请求体改写」分区里，三类规则上下排列，不再各套一张带 ⓘ 提示的卡片。
 *
 * 层级只有一层卡片：这一类规则是卡片（和设置组同一种外观），卡片里每条规则是一块无边淡底，
 * 规则里的模型、参数直接排在淡底上——以前是「描边卡 → 描边淡底块 → 描边白卡」三层框。
 */
function RuleBlock({
  title,
  description,
  meta,
  action,
  children,
}: {
  title: string;
  description?: string;
  /** 对应的 YAML 键，和设置行一样以等宽小字附在说明后面。 */
  meta?: string;
  action: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={surface({ radius: "2xl" })}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4 pb-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          {description || meta ? (
            <p className="mt-0.5 text-xs leading-5 text-ink-3">
              {description}
              {meta ? (
                <code className="ml-1.5 rounded-md bg-subtle px-1.5 py-px font-mono text-2xs">
                  {meta}
                </code>
              ) : null}
            </p>
          ) : null}
        </div>
        <div className="shrink-0">{action}</div>
      </div>
      <div className="px-5 pb-5">{children}</div>
    </div>
  );
}

function SelectInput({
  value,
  onChange,
  options,
  disabled,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <Select
      value={value}
      onChange={onChange}
      options={options.map((opt) => ({ value: opt.value, label: opt.label }))}
      aria-label={ariaLabel}
      className={disabled ? "pointer-events-none opacity-60" : undefined}
    />
  );
}

function TextArea({
  value,
  onChange,
  disabled,
  placeholder,
  ariaLabel,
  rows = 4,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel: string;
  rows?: number;
}) {
  return (
    <Textarea
      value={value}
      onChange={(e) => onChange(e.currentTarget.value)}
      disabled={disabled}
      placeholder={placeholder}
      aria-label={ariaLabel}
      rows={rows}
      spellCheck={false}
      className="min-h-0 font-mono text-xs"
    />
  );
}

function updateRuleModels(
  rules: PayloadRule[],
  ruleIndex: number,
  updater: (models: PayloadModelEntry[]) => PayloadModelEntry[],
): PayloadRule[] {
  return rules.map((rule, idx) =>
    idx === ruleIndex ? { ...rule, models: updater(rule.models) } : rule,
  );
}

function updateRuleParams(
  rules: PayloadRule[],
  ruleIndex: number,
  updater: (params: PayloadParamEntry[]) => PayloadParamEntry[],
): PayloadRule[] {
  return rules.map((rule, idx) =>
    idx === ruleIndex ? { ...rule, params: updater(rule.params) } : rule,
  );
}

export function PayloadRulesEditor({
  title,
  description,
  meta,
  rules,
  disabled,
  onChange,
}: {
  title: string;
  description?: string;
  meta?: string;
  rules: PayloadRule[];
  disabled?: boolean;
  onChange: (rules: PayloadRule[]) => void;
}) {
  const { t } = useTranslation();

  const addRule = () => {
    const next: PayloadRule = {
      id: makeClientId(),
      models: [{ id: makeClientId(), name: "", protocol: undefined }],
      params: [],
    };
    onChange([...(rules || []), next]);
  };

  const removeRule = (index: number) => {
    onChange((rules || []).filter((_, i) => i !== index));
  };

  const addModel = (ruleIndex: number) => {
    onChange(
      updateRuleModels(rules, ruleIndex, (models) => [
        ...models,
        { id: makeClientId(), name: "", protocol: undefined },
      ]),
    );
  };

  const removeModel = (ruleIndex: number, modelIndex: number) => {
    onChange(
      updateRuleModels(rules, ruleIndex, (models) => models.filter((_, i) => i !== modelIndex)),
    );
  };

  const updateModel = (
    ruleIndex: number,
    modelIndex: number,
    patch: Partial<PayloadModelEntry>,
  ) => {
    onChange(
      updateRuleModels(rules, ruleIndex, (models) =>
        models.map((model, index) => (index === modelIndex ? { ...model, ...patch } : model)),
      ),
    );
  };

  const addParam = (ruleIndex: number) => {
    const next: PayloadParamEntry = {
      id: makeClientId(),
      path: "",
      valueType: "string",
      value: "",
    };
    onChange(updateRuleParams(rules, ruleIndex, (params) => [...params, next]));
  };

  const removeParam = (ruleIndex: number, paramIndex: number) => {
    onChange(
      updateRuleParams(rules, ruleIndex, (params) => params.filter((_, i) => i !== paramIndex)),
    );
  };

  const updateParam = (
    ruleIndex: number,
    paramIndex: number,
    patch: Partial<PayloadParamEntry>,
  ) => {
    onChange(
      updateRuleParams(rules, ruleIndex, (params) =>
        params.map((param, index) => (index === paramIndex ? { ...param, ...patch } : param)),
      ),
    );
  };

  const getValuePlaceholder = (valueType: PayloadParamValueType) => {
    if (valueType === "number") return "e.g. 1";
    if (valueType === "boolean") return "true / false";
    if (valueType === "json") return 'e.g. {"a":1}';
    return "e.g. hello";
  };

  return (
    <RuleBlock
      title={title}
      description={description}
      meta={meta}
      action={
        <Button size="sm" onClick={addRule} disabled={disabled}>
          <Plus size={14} />
          {t("visual_config.add_rule")}
        </Button>
      }
    >
      {rules.length === 0 ? (
        <div className="rounded-xl bg-subtle px-4 py-6 text-center text-sm text-ink-3">
          {t("visual_config.no_rules")}
        </div>
      ) : (
        <div className="space-y-4">
          {rules.map((rule, ruleIndex) => (
            <div
              key={rule.id}
              className="space-y-4 rounded-xl bg-subtle p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-ink">
                  {t("visual_config.rule_n", { n: ruleIndex + 1 })}
                </div>
                <Button
                  variant="ghost-danger"
                  size="sm"
                  onClick={() => removeRule(ruleIndex)}
                  disabled={disabled}
                >
                  <Trash2 size={14} />
                  {t("visual_config.delete_rule")}
                </Button>
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-medium text-ink-2">
                    {t("visual_config.match_models")}
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => addModel(ruleIndex)}
                    disabled={disabled}
                  >
                    <Plus size={14} />
                    {t("visual_config.add_model_btn")}
                  </Button>
                </div>

                <div className="space-y-2">
                  {(rule.models || []).map((model, modelIndex) => (
                    <div key={model.id} className="grid gap-2 lg:grid-cols-[1fr_180px_auto]">
                      <TextInput
                        value={model.name}
                        onChange={(e) =>
                          updateModel(ruleIndex, modelIndex, { name: e.currentTarget.value })
                        }
                        placeholder={t("visual_config.model_name")}
                        disabled={disabled}
                      />
                      <SelectInput
                        value={(model.protocol ?? "") as string}
                        onChange={(value) =>
                          updateModel(ruleIndex, modelIndex, {
                            protocol: (value || undefined) as PayloadProtocol | undefined,
                          })
                        }
                        options={VISUAL_CONFIG_PROTOCOL_OPTIONS}
                        disabled={disabled}
                        ariaLabel="Protocol"
                      />
                      <Button
                        variant="ghost-danger"
                        size="sm"
                        onClick={() => removeModel(ruleIndex, modelIndex)}
                        disabled={disabled || (rule.models || []).length <= 1}
                      >
                        <Trash2 size={14} />
                        {t("visual_config.btn_delete")}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-medium text-ink-2">
                    {t("visual_config.override_params")}
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => addParam(ruleIndex)}
                    disabled={disabled}
                  >
                    <Plus size={14} />
                    {t("visual_config.add_param_btn")}
                  </Button>
                </div>

                {(rule.params || []).length === 0 ? (
                  <div className="py-2 text-center text-xs text-ink-3">
                    {t("visual_config.no_params")}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {(rule.params || []).map((param, paramIndex) => (
                      <div key={param.id} className="space-y-2">
                        <div className="grid gap-2 lg:grid-cols-[1fr_180px_auto]">
                          <TextInput
                            value={param.path}
                            onChange={(e) =>
                              updateParam(ruleIndex, paramIndex, { path: e.currentTarget.value })
                            }
                            placeholder={t("visual_config.param_path")}
                            disabled={disabled}
                          />
                          <SelectInput
                            value={param.valueType}
                            onChange={(value) =>
                              updateParam(ruleIndex, paramIndex, {
                                valueType: value as PayloadParamValueType,
                              })
                            }
                            options={VISUAL_CONFIG_PAYLOAD_VALUE_TYPE_OPTIONS}
                            disabled={disabled}
                            ariaLabel="Value type"
                          />
                          <Button
                            variant="ghost-danger"
                            size="sm"
                            onClick={() => removeParam(ruleIndex, paramIndex)}
                            disabled={disabled}
                          >
                            <Trash2 size={14} />
                            {t("visual_config.btn_delete")}
                          </Button>
                        </div>

                        {param.valueType === "json" ? (
                          <TextArea
                            value={param.value}
                            onChange={(value) => updateParam(ruleIndex, paramIndex, { value })}
                            placeholder={getValuePlaceholder(param.valueType)}
                            disabled={disabled}
                            ariaLabel="JSON value"
                            rows={6}
                          />
                        ) : (
                          <TextInput
                            value={param.value}
                            onChange={(e) =>
                              updateParam(ruleIndex, paramIndex, { value: e.currentTarget.value })
                            }
                            placeholder={getValuePlaceholder(param.valueType)}
                            disabled={disabled}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </RuleBlock>
  );
}

export function PayloadFilterRulesEditor({
  rules,
  disabled,
  onChange,
}: {
  rules: PayloadFilterRule[];
  disabled?: boolean;
  onChange: (rules: PayloadFilterRule[]) => void;
}) {
  const { t } = useTranslation();

  const addRule = () => {
    const next: PayloadFilterRule = {
      id: makeClientId(),
      models: [{ id: makeClientId(), name: "", protocol: undefined }],
      params: [],
    };
    onChange([...(rules || []), next]);
  };

  const removeRule = (index: number) => {
    onChange((rules || []).filter((_, i) => i !== index));
  };

  const updateRule = (index: number, patch: Partial<PayloadFilterRule>) => {
    onChange((rules || []).map((rule, i) => (i === index ? { ...rule, ...patch } : rule)));
  };

  const addModel = (ruleIndex: number) => {
    const rule = rules[ruleIndex];
    updateRule(ruleIndex, {
      models: [...rule.models, { id: makeClientId(), name: "", protocol: undefined }],
    });
  };

  const removeModel = (ruleIndex: number, modelIndex: number) => {
    const rule = rules[ruleIndex];
    updateRule(ruleIndex, { models: rule.models.filter((_, i) => i !== modelIndex) });
  };

  const updateModel = (
    ruleIndex: number,
    modelIndex: number,
    patch: Partial<PayloadModelEntry>,
  ) => {
    const rule = rules[ruleIndex];
    updateRule(ruleIndex, {
      models: rule.models.map((model, index) =>
        index === modelIndex ? { ...model, ...patch } : model,
      ),
    });
  };

  const addParam = (ruleIndex: number) => {
    const rule = rules[ruleIndex];
    updateRule(ruleIndex, { params: [...(rule.params || []), ""] });
  };

  const removeParam = (ruleIndex: number, paramIndex: number) => {
    const rule = rules[ruleIndex];
    updateRule(ruleIndex, { params: (rule.params || []).filter((_, i) => i !== paramIndex) });
  };

  const updateParam = (ruleIndex: number, paramIndex: number, nextValue: string) => {
    const rule = rules[ruleIndex];
    updateRule(ruleIndex, {
      params: (rule.params || []).map((param, index) => (index === paramIndex ? nextValue : param)),
    });
  };

  return (
    <RuleBlock
      title={t("config_ui.payload.filter.title")}
      description={t("config_ui.payload.filter.desc")}
      meta="payload.filter"
      action={
        <Button size="sm" onClick={addRule} disabled={disabled}>
          <Plus size={14} />
          {t("visual_config.add_rule")}
        </Button>
      }
    >
      {rules.length === 0 ? (
        <div className="rounded-xl bg-subtle px-4 py-6 text-center text-sm text-ink-3">
          {t("visual_config.no_rules")}
        </div>
      ) : (
        <div className="space-y-4">
          {rules.map((rule, ruleIndex) => (
            <div
              key={rule.id}
              className="space-y-4 rounded-xl bg-subtle p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-ink">
                  {t("visual_config.rule_n", { n: ruleIndex + 1 })}
                </div>
                <Button
                  variant="ghost-danger"
                  size="sm"
                  onClick={() => removeRule(ruleIndex)}
                  disabled={disabled}
                >
                  <Trash2 size={14} />
                  {t("visual_config.delete_rule")}
                </Button>
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-medium text-ink-2">
                    {t("visual_config.match_models")}
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => addModel(ruleIndex)}
                    disabled={disabled}
                  >
                    <Plus size={14} />
                    {t("visual_config.add_model_btn")}
                  </Button>
                </div>

                <div className="space-y-2">
                  {(rule.models || []).map((model, modelIndex) => (
                    <div key={model.id} className="grid gap-2 lg:grid-cols-[1fr_180px_auto]">
                      <TextInput
                        value={model.name}
                        onChange={(e) =>
                          updateModel(ruleIndex, modelIndex, { name: e.currentTarget.value })
                        }
                        placeholder={t("visual_config.model_name")}
                        disabled={disabled}
                      />
                      <SelectInput
                        value={(model.protocol ?? "") as string}
                        onChange={(value) =>
                          updateModel(ruleIndex, modelIndex, {
                            protocol: (value || undefined) as PayloadProtocol | undefined,
                          })
                        }
                        options={VISUAL_CONFIG_PROTOCOL_OPTIONS}
                        disabled={disabled}
                        ariaLabel="Protocol"
                      />
                      <Button
                        variant="ghost-danger"
                        size="sm"
                        onClick={() => removeModel(ruleIndex, modelIndex)}
                        disabled={disabled || (rule.models || []).length <= 1}
                      >
                        <Trash2 size={14} />
                        {t("visual_config.btn_delete")}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-medium text-ink-2">
                    {t("visual_config.remove_param_paths")}
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => addParam(ruleIndex)}
                    disabled={disabled}
                  >
                    <Plus size={14} />
                    {t("visual_config.add_path_btn")}
                  </Button>
                </div>

                {(rule.params || []).length === 0 ? (
                  <div className="py-2 text-center text-xs text-ink-3">
                    {t("visual_config.no_paths")}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(rule.params || []).map((param, paramIndex) => (
                      <div
                        key={`${rule.id}-p-${paramIndex}`}
                        className="grid gap-2 lg:grid-cols-[1fr_auto]"
                      >
                        <TextInput
                          value={param}
                          onChange={(e) =>
                            updateParam(ruleIndex, paramIndex, e.currentTarget.value)
                          }
                          placeholder="e.g. messages.0.content"
                          disabled={disabled}
                        />
                        <Button
                          variant="ghost-danger"
                          size="sm"
                          onClick={() => removeParam(ruleIndex, paramIndex)}
                          disabled={disabled}
                        >
                          <Trash2 size={14} />
                          {t("visual_config.btn_delete")}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </RuleBlock>
  );
}
