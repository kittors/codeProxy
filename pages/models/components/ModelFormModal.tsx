import { useTranslation } from "react-i18next";
import {
  Button,
  Modal,
  SearchableSelect,
  Select,
  TextInput,
  ToggleSwitch,
  type SearchableSelectOption,
} from "@code-proxy/ui";
import { formatPrice, normalizeOwnerValue } from "../modelsUtils";
import type { ModelFormState, ModelItem, ModelPageTab, ModelPricingMode } from "../types";

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

  return (
    <Modal
      open={form !== null}
      onClose={onClose}
      title={form?.originalId ? t("models_page.edit_model") : t("models_page.add_model")}
      description={t("models_page.config_desc")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("models_page.cancel")}
          </Button>
          <Button variant="primary" onClick={onSave} disabled={saving}>
            {saving ? t("models_page.saving") : t("models_page.save")}
          </Button>
        </>
      }
    >
      {form ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="model-config-id"
                className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80"
              >
                {t("models_page.model_id")}
              </label>
              <div className="relative">
                <TextInput
                  id="model-config-id"
                  role={!form.originalId && activeTab === "library" ? "combobox" : undefined}
                  aria-label={t("models_page.model_id")}
                  aria-autocomplete={
                    !form.originalId && activeTab === "library" ? "list" : undefined
                  }
                  aria-controls={
                    showReusableModelCandidates ? "model-config-id-reuse-options" : undefined
                  }
                  aria-expanded={
                    !form.originalId && activeTab === "library"
                      ? showReusableModelCandidates
                      : undefined
                  }
                  value={form.id}
                  onChange={(event) => {
                    const nextId = event.target.value;
                    onUpdateForm({ id: nextId });
                    onSuggestionsOpenChange(Boolean(nextId.trim()));
                  }}
                  onFocus={() => onSuggestionsOpenChange(Boolean(form.id.trim()))}
                  onBlur={() => {
                    window.setTimeout(() => onSuggestionsOpenChange(false), 120);
                  }}
                  placeholder={
                    !form.originalId && activeTab === "library"
                      ? t("models_page.model_id_reuse_placeholder")
                      : "gpt-4.1"
                  }
                  autoComplete="off"
                />
                {showReusableModelCandidates ? (
                  <div
                    id="model-config-id-reuse-options"
                    role="listbox"
                    className="absolute left-0 right-0 top-full z-30 mt-2 max-h-64 overflow-y-auto rounded-2xl bg-white p-1 shadow-[0_8px_28px_rgb(0_0_0_/_0.16)] dark:bg-[#27272A] dark:shadow-[0_14px_36px_rgb(0_0_0_/_0.38)]"
                  >
                    {reusableModelCandidates.map((model) => (
                      <button
                        key={model.id}
                        type="button"
                        role="option"
                        aria-selected={form.id === model.id}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => onApplyReusableModel(model)}
                        className="flex w-full min-w-0 items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors hover:bg-[#F4F4F5] dark:hover:bg-white/[0.06]"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-[#18181B] dark:text-white">
                            {model.id}
                          </span>
                          <span className="block truncate text-xs text-[#71717A] dark:text-[#A1A1AA]">
                            {model.description || model.owned_by}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs font-medium text-[#71717A] dark:text-[#A1A1AA]">
                          {formatPrice(model, t("models_page.not_priced"))}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80">
                {t("models_page.owner")}
              </label>
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
            </div>
          </div>

          <div>
            <label
              htmlFor="model-config-description"
              className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80"
            >
              {t("models_page.description_label")}
            </label>
            <textarea
              id="model-config-description"
              value={form.description}
              onChange={(event) => onUpdateForm({ description: event.target.value })}
              rows={3}
              className="min-h-20 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200/70 dark:border-neutral-800 dark:bg-neutral-950 dark:text-white dark:focus:border-neutral-700 dark:focus:ring-white/10"
              placeholder={t("models_page.description_placeholder")}
            />
          </div>

          <ToggleSwitch
            checked={form.enabled}
            onCheckedChange={(enabled) => onUpdateForm({ enabled })}
            label={t("models_page.enabled")}
          />

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80">
              {t("models_page.pricing_mode")}
            </label>
            <Select
              value={form.mode}
              onChange={(mode) => onUpdateForm({ mode: mode as ModelPricingMode })}
              aria-label={t("models_page.pricing_mode")}
              options={[
                { value: "token", label: t("models_page.mode_token") },
                { value: "call", label: t("models_page.mode_call") },
              ]}
            />
          </div>

          {form.mode === "call" ? (
            <div>
              <label
                htmlFor="model-config-price-per-call"
                className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80"
              >
                {t("models_page.price_per_call")}
              </label>
              <TextInput
                id="model-config-price-per-call"
                type="number"
                value={form.pricePerCall}
                onChange={(event) => onUpdateForm({ pricePerCall: event.target.value })}
                placeholder="0.04"
                step="0.01"
                min={0}
              />
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label
                  htmlFor="model-config-input-price"
                  className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80"
                >
                  {t("models_page.input_token_price")}
                </label>
                <TextInput
                  id="model-config-input-price"
                  type="number"
                  value={form.inputPrice}
                  onChange={(event) => onUpdateForm({ inputPrice: event.target.value })}
                  placeholder={t("models_page.input_price_placeholder")}
                  step="0.01"
                  min={0}
                />
              </div>
              <div>
                <label
                  htmlFor="model-config-output-price"
                  className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80"
                >
                  {t("models_page.output_token_price")}
                </label>
                <TextInput
                  id="model-config-output-price"
                  type="number"
                  value={form.outputPrice}
                  onChange={(event) => onUpdateForm({ outputPrice: event.target.value })}
                  placeholder={t("models_page.output_price_placeholder")}
                  step="0.01"
                  min={0}
                />
              </div>
              <div>
                <label
                  htmlFor="model-config-cache-price"
                  className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80"
                >
                  {t("models_page.cache_token_price")}
                </label>
                <TextInput
                  id="model-config-cache-price"
                  type="number"
                  value={form.cachedPrice}
                  onChange={(event) => onUpdateForm({ cachedPrice: event.target.value })}
                  placeholder={t("models_page.input_price_hint")}
                  step="0.01"
                  min={0}
                />
              </div>
            </div>
          )}
        </div>
      ) : null}
    </Modal>
  );
}
