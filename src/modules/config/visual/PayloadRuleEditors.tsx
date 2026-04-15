import { useTranslation } from "react-i18next";
import { Plus, Trash2 } from "lucide-react";
import type {
  PayloadFilterRule,
  PayloadModelEntry,
  PayloadParamEntry,
  PayloadParamValueType,
  PayloadProtocol,
  PayloadRule,
} from "@/modules/config/visual/types";
import { makeClientId } from "@/modules/config/visual/types";
import {
  VISUAL_CONFIG_PAYLOAD_VALUE_TYPE_OPTIONS,
  VISUAL_CONFIG_PROTOCOL_OPTIONS,
} from "@/modules/config/visual/useVisualConfig";
import { Button } from "@/modules/ui/Button";
import { Card } from "@/modules/ui/Card";
import { TextInput } from "@/modules/ui/Input";
import { Select } from "@/modules/ui/Select";

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
    <textarea
      value={value}
      onChange={(e) => onChange(e.currentTarget.value)}
      disabled={disabled}
      placeholder={placeholder}
      aria-label={ariaLabel}
      rows={rows}
      spellCheck={false}
      className={[
        "w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-mono text-xs text-slate-900 outline-none transition",
        "focus-visible:ring-2 focus-visible:ring-slate-400/35 dark:border-neutral-800 dark:bg-neutral-900 dark:text-slate-100 dark:focus-visible:ring-white/15",
        disabled ? "opacity-60" : null,
      ]
        .filter(Boolean)
        .join(" ")}
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
  rules,
  disabled,
  onChange,
}: {
  title: string;
  description?: string;
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
    <Card
      title={title}
      description={description}
      actions={
        <Button size="sm" onClick={addRule} disabled={disabled}>
          <Plus size={14} />
          {t("visual_config.add_rule")}
        </Button>
      }
    >
      {rules.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-4 text-center text-sm text-slate-600 dark:border-neutral-800 dark:bg-neutral-950/40 dark:text-white/65">
          {t("visual_config.no_rules")}
        </div>
      ) : (
        <div className="space-y-4">
          {rules.map((rule, ruleIndex) => (
            <div
              key={rule.id}
              className="space-y-3 rounded-2xl border border-slate-200 bg-white/60 p-4 dark:border-neutral-800 dark:bg-neutral-950/40"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-900 dark:text-white">
                  {t("visual_config.rule_n", { n: ruleIndex + 1 })}
                </div>
                <Button
                  variant="ghost"
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
                  <div className="text-xs font-semibold text-slate-600 dark:text-white/65">
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
                        variant="danger"
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
                  <div className="text-xs font-semibold text-slate-600 dark:text-white/65">
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
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-3 text-center text-xs text-slate-600 dark:border-neutral-800 dark:bg-neutral-950/40 dark:text-white/65">
                    {t("visual_config.no_params")}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(rule.params || []).map((param, paramIndex) => (
                      <div
                        key={param.id}
                        className="space-y-2 rounded-2xl border border-slate-200 bg-white/60 p-3 dark:border-neutral-800 dark:bg-neutral-950/40"
                      >
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
                            variant="danger"
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
    </Card>
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
      params: (rule.params || []).map((param, index) =>
        index === paramIndex ? nextValue : param,
      ),
    });
  };

  return (
    <Card
      title={t("visual_config.payload_filter")}
      description={t("visual_config.payload_filter_desc")}
      actions={
        <Button size="sm" onClick={addRule} disabled={disabled}>
          <Plus size={14} />
          {t("visual_config.add_rule")}
        </Button>
      }
    >
      {rules.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-4 text-center text-sm text-slate-600 dark:border-neutral-800 dark:bg-neutral-950/40 dark:text-white/65">
          {t("visual_config.no_rules")}
        </div>
      ) : (
        <div className="space-y-4">
          {rules.map((rule, ruleIndex) => (
            <div
              key={rule.id}
              className="space-y-3 rounded-2xl border border-slate-200 bg-white/60 p-4 dark:border-neutral-800 dark:bg-neutral-950/40"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-900 dark:text-white">
                  {t("visual_config.rule_n", { n: ruleIndex + 1 })}
                </div>
                <Button
                  variant="ghost"
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
                  <div className="text-xs font-semibold text-slate-600 dark:text-white/65">
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
                        variant="danger"
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
                  <div className="text-xs font-semibold text-slate-600 dark:text-white/65">
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
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-3 text-center text-xs text-slate-600 dark:border-neutral-800 dark:bg-neutral-950/40 dark:text-white/65">
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
                          variant="danger"
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
    </Card>
  );
}
