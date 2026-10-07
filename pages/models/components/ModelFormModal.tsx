import { Boxes, CircleDollarSign, Info } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  floatingPanelSurface,
  FormField,
  FormSection,
  Modal,
  rules,
  SearchableSelect,
  SegmentedControl,
  SettingGroup,
  SettingRow,
  Textarea,
  TextInput,
  ToggleSwitch,
  useFormValidation,
  type SearchableSelectOption,
} from "@code-proxy/ui";
import { formatPrice, normalizeOwnerValue } from "../modelsUtils";
import type { ModelFormState, ModelItem, ModelPageTab, ModelPricingMode } from "../types";

const FORM_ID = "model-config-form";

/** 价格：非负数，最多 6 位小数（与列表里的价格格式一致）。 */
const PRICE = rules.pattern(/^\d+(\.\d{1,6})?$/, "price");

interface ModelFormModalProps {
  form: ModelFormState | null;
  activeTab: ModelPageTab;
  saving: boolean;
  ownerOptions: SearchableSelectOption[];
  reusableModelCandidates: ModelItem[];
  showReusableModelCandidates: boolean;
  onClose: () => void;
  onSave: () => void;
  onUpdateForm: (patch: Partial<ModelFormState>) => void;
  onApplyReusableModel: (model: ModelItem) => void;
  onSuggestionsOpenChange: (open: boolean) => void;
}

/**
 * 新增 / 编辑模型：先说「这是什么模型」（ID、归属、描述、是否启用），再说「怎么计费」。
 * 计费方式只有两种，用分段控件直接摊开，切换后只显示对应的价格输入；价格就地校验。
 */
export function ModelFormModal({
  form,
  activeTab,
  saving,
  ownerOptions,
  reusableModelCandidates,
  showReusableModelCandidates,
  onClose,
  onSave,
  onUpdateForm,
  onApplyReusableModel,
  onSuggestionsOpenChange,
}: ModelFormModalProps) {
  const { t } = useTranslation();
  const formRef = useRef<HTMLFormElement | null>(null);
  const values = form ?? {
    id: "",
    pricePerCall: "",
    inputPrice: "",
    outputPrice: "",
    cachedPrice: "",
  };
  const perCall = form?.mode === "call";
  const validation = useFormValidation(values as ModelFormState, {
    id: [rules.required(), rules.maxLength(200)],
    pricePerCall: perCall ? [PRICE] : [],
    inputPrice: perCall ? [] : [PRICE],
    outputPrice: perCall ? [] : [PRICE],
    cachedPrice: perCall ? [] : [PRICE],
  });
  const { reset } = validation;
  const open = form !== null;
  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  const submit = () => {
    if (!validation.validate()) {
      validation.focusFirstInvalid(formRef.current);
      return;
    }
    onSave();
  };

  const reusable = Boolean(form && !form.originalId && activeTab === "library");
  const priceField = (
    key: "pricePerCall" | "inputPrice" | "outputPrice" | "cachedPrice",
    id: string,
    labelKey: string,
    placeholder: string,
  ) => (
    <FormField label={t(labelKey)} htmlFor={id} error={validation.error(key)}>
      <TextInput
        inputMode="decimal"
        value={form?.[key] ?? ""}
        onChange={(event) => onUpdateForm({ [key]: event.target.value } as Partial<ModelFormState>)}
        {...validation.bind(key)}
        placeholder={placeholder}
        startAdornment={<span className="text-xs text-ink-3">$</span>}
        className="tabular-nums"
      />
    </FormField>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={form?.originalId ? t("models_page.edit_model") : t("models_page.add_model")}
      description={t("models_page.config_desc")}
      icon={<Boxes />}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("models_page.cancel")}
          </Button>
          <Button type="submit" form={FORM_ID} variant="primary" loading={saving}>
            {t("models_page.save")}
          </Button>
        </>
      }
    >
      {form ? (
        <form
          ref={formRef}
          id={FORM_ID}
          noValidate
          className="space-y-6"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <FormSection
            title={t("models_page.section_basics")}
            description={t("models_page.section_basics_desc")}
            icon={<Info />}
          >
            <div className="grid gap-x-4 sm:grid-cols-2">
              <FormField
                label={t("models_page.model_id")}
                htmlFor="model-config-id"
                required
                error={validation.error("id")}
                description={reusable ? t("models_page.model_id_reuse_hint") : undefined}
              >
                {/* 外层 div 自带 id：FormField 只给没有 id 的子元素补 id，输入框保留自己的 id 给 label 用；
                    说明与错误的 id 由 htmlFor 推出，手动挂到输入框上。 */}
                <div className="relative" id="model-config-id-field">
                  <TextInput
                    id="model-config-id"
                    aria-describedby={
                      validation.error("id")
                        ? "model-config-id-error"
                        : reusable
                          ? "model-config-id-description"
                          : undefined
                    }
                    role={reusable ? "combobox" : undefined}
                    aria-label={t("models_page.model_id")}
                    aria-autocomplete={reusable ? "list" : undefined}
                    aria-controls={
                      showReusableModelCandidates ? "model-config-id-reuse-options" : undefined
                    }
                    aria-expanded={reusable ? showReusableModelCandidates : undefined}
                    aria-invalid={validation.error("id") ? true : undefined}
                    value={form.id}
                    onChange={(event) => {
                      const nextId = event.target.value;
                      onUpdateForm({ id: nextId });
                      onSuggestionsOpenChange(Boolean(nextId.trim()));
                    }}
                    onFocus={() => onSuggestionsOpenChange(Boolean(form.id.trim()))}
                    onBlur={() => {
                      validation.touch("id");
                      window.setTimeout(() => onSuggestionsOpenChange(false), 120);
                    }}
                    placeholder={
                      reusable ? t("models_page.model_id_reuse_placeholder") : "gpt-4.1"
                    }
                    autoComplete="off"
                    spellCheck={false}
                    className="font-mono"
                  />
                  {showReusableModelCandidates ? (
                    <div
                      id="model-config-id-reuse-options"
                      role="listbox"
                      data-state="open"
                      data-side="bottom"
                      className={`absolute left-0 right-0 top-full z-30 mt-2 max-h-64 overflow-y-auto p-1 ${floatingPanelSurface}`}
                    >
                      {reusableModelCandidates.map((model) => (
                        <button
                          key={model.id}
                          type="button"
                          role="option"
                          aria-selected={form.id === model.id}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => onApplyReusableModel(model)}
                          className="flex w-full min-w-0 items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-hover"
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-ink">{model.id}</span>
                            <span className="block truncate text-xs text-ink-3">
                              {model.description || model.owned_by}
                            </span>
                          </span>
                          <span className="shrink-0 text-xs font-medium text-ink-3">
                            {formatPrice(model, t("models_page.not_priced"))}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </FormField>
              <FormField label={t("models_page.owner")} description={t("models_page.owner_hint")}>
                <SearchableSelect
                  value={form.ownedBy}
                  onChange={(ownedBy) => onUpdateForm({ ownedBy })}
                  onCreate={(ownedBy) => onUpdateForm({ ownedBy: normalizeOwnerValue(ownedBy) })}
                  options={ownerOptions}
                  placeholder={t("models_page.owner_placeholder")}
                  searchPlaceholder={t("models_page.owner_search_placeholder")}
                  aria-label={t("models_page.owner")}
                  allowCreate
                  normalizeCreateValue={normalizeOwnerValue}
                  createLabel={(ownedBy) =>
                    t("models_page.owner_create_option", { owner: normalizeOwnerValue(ownedBy) })
                  }
                />
              </FormField>
            </div>

            <FormField
              label={t("models_page.description_label")}
              htmlFor="model-config-description"
              optional
              reserveMeta={false}
            >
              <Textarea
                value={form.description}
                onChange={(event) => onUpdateForm({ description: event.target.value })}
                rows={3}
                className="min-h-20"
                placeholder={t("models_page.description_placeholder")}
              />
            </FormField>

            <SettingGroup>
              <SettingRow
                label={t("models_page.enabled")}
                description={t("models_page.enabled_hint")}
                controlWidth="auto"
                control={
                  <ToggleSwitch
                    checked={form.enabled}
                    onCheckedChange={(enabled) => onUpdateForm({ enabled })}
                    ariaLabel={t("models_page.enabled")}
                  />
                }
              />
            </SettingGroup>
          </FormSection>

          <FormSection
            title={t("models_page.section_pricing")}
            description={t("models_page.section_pricing_desc")}
            icon={<CircleDollarSign />}
            actions={
              <SegmentedControl
                size="sm"
                ariaLabel={t("models_page.pricing_mode")}
                value={form.mode}
                onChange={(mode) => onUpdateForm({ mode: mode as ModelPricingMode })}
                options={[
                  { value: "token", label: t("models_page.mode_token") },
                  { value: "call", label: t("models_page.mode_call") },
                ]}
              />
            }
          >
            {form.mode === "call" ? (
              <div className="max-w-xs">
                {priceField("pricePerCall", "model-config-price-per-call", "models_page.price_per_call", "0.04")}
              </div>
            ) : (
              <div className="grid gap-x-4 sm:grid-cols-3">
                {priceField(
                  "inputPrice",
                  "model-config-input-price",
                  "models_page.input_token_price",
                  t("models_page.input_price_placeholder"),
                )}
                {priceField(
                  "outputPrice",
                  "model-config-output-price",
                  "models_page.output_token_price",
                  t("models_page.output_price_placeholder"),
                )}
                {priceField(
                  "cachedPrice",
                  "model-config-cache-price",
                  "models_page.cache_token_price",
                  t("models_page.input_price_hint"),
                )}
              </div>
            )}
          </FormSection>
        </form>
      ) : null}
    </Modal>
  );
}
