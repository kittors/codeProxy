import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { FormField, Select } from "@code-proxy/ui";
import {
  modelLabel,
  providerLabel,
  type ImageModelCatalog,
} from "./imageModels";

/**
 * Provider and model selectors for image generation.
 *
 * Both lists come from the server's catalog. The component deliberately holds no
 * knowledge of which providers or models exist — adding one server-side makes it
 * selectable here without a panel release.
 */
export function ImageModelPicker({
  catalog,
  provider,
  model,
  disabled = false,
  onProviderChange,
  onModelChange,
}: {
  catalog: ImageModelCatalog;
  provider: string;
  model: string;
  disabled?: boolean;
  onProviderChange: (provider: string) => void;
  onModelChange: (model: string) => void;
}) {
  const { t } = useTranslation();

  const providerOptions = useMemo(
    () =>
      catalog.providers.map((entry) => ({
        value: entry.provider,
        label: providerLabel(entry.provider),
      })),
    [catalog.providers],
  );

  const modelOptions = useMemo(() => {
    const entry = catalog.providers.find((item) => item.provider === provider);
    return (entry?.models ?? catalog.models).map((item) => ({
      value: item.id,
      label: modelLabel(item),
    }));
  }, [catalog, provider]);

  // A deployment with a single provider gets no provider selector: a control with
  // one option is noise, and the legacy server shape reports no provider at all.
  const showProviderSelect = providerOptions.length > 1;

  return (
    <div
      data-testid="image-model-picker"
      className={showProviderSelect ? "grid gap-3 sm:grid-cols-2" : "grid gap-3"}
    >
      {showProviderSelect ? (
        <FormField label={t("image_generation.provider")} htmlFor="image-provider">
          <Select
            id="image-provider"
            value={provider}
            options={providerOptions}
            disabled={disabled}
            onChange={onProviderChange}
          />
        </FormField>
      ) : null}

      <FormField label={t("image_generation.model")} htmlFor="image-model">
        <Select
          id="image-model"
          value={model}
          options={modelOptions}
          disabled={disabled || modelOptions.length === 0}
          placeholder={t("image_generation.model_placeholder")}
          onChange={onModelChange}
        />
      </FormField>
    </div>
  );
}
