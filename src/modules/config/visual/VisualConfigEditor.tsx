import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronDown, Copy, Plus, Trash2 } from "lucide-react";
import type {
  PayloadFilterRule,
  PayloadModelEntry,
  PayloadParamEntry,
  PayloadParamValueType,
  PayloadProtocol,
  PayloadRule,
  RoutingStrategy,
  VisualConfigValues,
} from "@/modules/config/visual/types";
import { makeClientId } from "@/modules/config/visual/types";
import {
  VISUAL_CONFIG_PAYLOAD_VALUE_TYPE_OPTIONS,
  VISUAL_CONFIG_PROTOCOL_OPTIONS,
} from "@/modules/config/visual/useVisualConfig";
import { Button } from "@/modules/ui/Button";
import { Card } from "@/modules/ui/Card";
import { ConfirmModal } from "@/modules/ui/ConfirmModal";
import { TextInput } from "@/modules/ui/Input";
import { Modal } from "@/modules/ui/Modal";
import { ToggleSwitch } from "@/modules/ui/ToggleSwitch";
import { useToast } from "@/modules/ui/ToastProvider";

const isValidApiKeyCharset = (key: string): boolean => /^[\x21-\x7E]+$/.test(key);

const maskApiKey = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return "--";
  if (trimmed.length <= 10) return `${trimmed.slice(0, 2)}***${trimmed.slice(-2)}`;
  return `${trimmed.slice(0, 6)}***${trimmed.slice(-4)}`;
};

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

function ApiKeysEditor({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  onChange: (nextValue: string) => void;
}) {
  const { notify } = useToast();
  const { t } = useTranslation();
  const apiKeys = useMemo(
    () =>
      value
        .split("\n")
        .map((key) => key.trim())
        .filter(Boolean),
    [value],
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [formError, setFormError] = useState("");
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);

  const openAddModal = () => {
    setEditingIndex(null);
    setInputValue("");
    setFormError("");
    setModalOpen(true);
  };

  const openEditModal = (index: number) => {
    setEditingIndex(index);
    setInputValue(apiKeys[index] ?? "");
    setFormError("");
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setInputValue("");
    setEditingIndex(null);
    setFormError("");
  };

  const updateApiKeys = (nextKeys: string[]) => {
    onChange(nextKeys.join("\n"));
  };

  const handleDelete = (index: number) => {
    updateApiKeys(apiKeys.filter((_, i) => i !== index));
    setDeleteIndex(null);
  };

  const handleSave = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) {
      setFormError(t("visual_config.api_key_empty_err"));
      return;
    }
    if (!isValidApiKeyCharset(trimmed)) {
      setFormError(t("visual_config.api_key_charset_err"));
      return;
    }

    const nextKeys =
      editingIndex === null
        ? [...apiKeys, trimmed]
        : apiKeys.map((key, idx) => (idx === editingIndex ? trimmed : key));
    updateApiKeys(nextKeys);
    closeModal();
  };

  const handleCopy = async (apiKey: string) => {
    try {
      if (!navigator.clipboard?.writeText) {
        notify({ type: "error", message: t("visual_config.clipboard_unsupported") });
        return;
      }
      await navigator.clipboard.writeText(apiKey);
      notify({ type: "success", message: t("visual_config.copied") });
    } catch {
      notify({ type: "error", message: t("visual_config.copy_failed") });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-slate-900 dark:text-white">{t("visual_config.api_keys")}</div>
        <Button size="sm" onClick={openAddModal} disabled={disabled}>
          <Plus size={14} />
          {t("visual_config.btn_add")}
        </Button>
      </div>

      {apiKeys.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-4 text-center text-sm text-slate-600 dark:border-neutral-800 dark:bg-neutral-950/40 dark:text-white/65">
          {t("visual_config.no_api_keys")}
        </div>
      ) : (
        <div className="space-y-2">
          {apiKeys.map((key, index) => (
            <div
              key={`${key}-${index}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white/60 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-950/40"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:bg-white/10 dark:text-white/80">
                    #{index + 1}
                  </span>
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">
                    {t("visual_config.api_key")}
                  </span>
                </div>
                <div className="mt-1 truncate font-mono text-xs text-slate-600 dark:text-white/65">
                  {maskApiKey(key)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void handleCopy(key)}
                  disabled={disabled}
                >
                  <Copy size={14} />
                  {t("visual_config.btn_copy")}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => openEditModal(index)}
                  disabled={disabled}
                >
                  {t("visual_config.btn_edit")}
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setDeleteIndex(index)}
                  disabled={disabled}
                >
                  <Trash2 size={14} />
                  {t("visual_config.btn_delete")}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-slate-600 dark:text-white/65">
        {t("visual_config.api_keys_hint")}
      </p>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editingIndex !== null ? t("visual_config.edit_api_key_title") : t("visual_config.add_api_key_title")}
        footer={
          <>
            <Button variant="secondary" onClick={closeModal} disabled={disabled}>
              {t("visual_config.btn_cancel")}
            </Button>
            <Button onClick={handleSave} disabled={disabled}>
              <Check size={14} />
              {editingIndex !== null ? t("visual_config.btn_update") : t("visual_config.btn_add")}
            </Button>
          </>
        }
      >
        <Field label={t("visual_config.api_key")} hint={t("visual_config.ascii_hint")}>
          <TextInput
            value={inputValue}
            onChange={(e) => setInputValue(e.currentTarget.value)}
            placeholder="sk-..."
            disabled={disabled}
          />
          {formError ? (
            <p className="mt-2 text-sm text-rose-600 dark:text-rose-300">{formError}</p>
          ) : null}
        </Field>
      </Modal>

      <ConfirmModal
        open={deleteIndex !== null}
        title={t("visual_config.delete_api_key")}
        description={t("common.confirm_delete_api_key", "Are you sure you want to delete this API Key? This operation is irreversible.")}
        confirmText={t("visual_config.btn_delete")}
        variant="danger"
        onClose={() => setDeleteIndex(null)}
        onConfirm={() => {
          if (deleteIndex === null) return;
          handleDelete(deleteIndex);
        }}
      />
    </div>
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

function PayloadRulesEditor({
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
        models.map((m, i) => (i === modelIndex ? { ...m, ...patch } : m)),
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
        params.map((p, i) => (i === paramIndex ? { ...p, ...patch } : p)),
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

function PayloadFilterRulesEditor({
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
      models: rule.models.map((m, i) => (i === modelIndex ? { ...m, ...patch } : m)),
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
      params: (rule.params || []).map((p, i) => (i === paramIndex ? nextValue : p)),
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

  const routingOptions = useMemo(
    () =>
      [
        { value: "round-robin", label: "round-robin" },
        { value: "fill-first", label: "fill-first" },
      ] satisfies ReadonlyArray<{ value: RoutingStrategy; label: string }>,
    [],
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
          </div>
        </Card>

        <Card title={t("visual_config.proxy_retry")} description={t("visual_config.proxy_retry_card_desc")}>
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

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={t("visual_config.log_limits")} description={t("visual_config.log_limits_desc")}>
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
        <Card title={t("visual_config.routing")} description={t("visual_config.routing_desc")}>
          <div className="space-y-4">
            <Field label="routing.strategy" hint={t("visual_config.routing_select")}>
              <SelectInput
                value={values.routingStrategy}
                onChange={(value) => update({ routingStrategy: value as RoutingStrategy })}
                options={routingOptions}
                disabled={disabled}
                ariaLabel="routing.strategy"
              />
            </Field>
          </div>
        </Card>

        <Card
          title={t("visual_config.streaming")}
          description={t("visual_config.streaming_desc")}
        >
          <div className="space-y-4">
            <div className="grid gap-3 lg:grid-cols-2">
              <Field label="streaming.keepalive-seconds" hint={t("visual_config.non_negative_int_sec")}>
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
            <Field label="nonstream-keepalive-interval" hint={t("visual_config.non_negative_int_sec")}>
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
