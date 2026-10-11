import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { FormField, Select } from "@code-proxy/ui";
import { modelLabel, providerLabel, type ImageModelCatalog } from "./imageModels";

// 服务商 + 模型拼成一个选项值：同一个模型 ID 理论上可以挂在两个服务商下，只用 ID 会撞。
const OPTION_SEPARATOR = "\u0000";

const optionValue = (provider: string, model: string) => `${provider}${OPTION_SEPARATOR}${model}`;

/**
 * The model selector for image generation.
 *
 * One control instead of a provider select followed by a model select: picking a
 * model already decides the credential pool, so each option names its provider in a
 * muted suffix. Both lists come from the server's catalog; the component holds no
 * knowledge of which providers or models exist, so one added server-side becomes
 * selectable here without a panel release.
 */
export function ImageModelPicker({
  catalog,
  provider,
  model,
  disabled = false,
  onChange,
}: {
  catalog: ImageModelCatalog;
  provider: string;
  model: string;
  disabled?: boolean;
  onChange: (provider: string, model: string) => void;
}) {
  const { t } = useTranslation();

  const options = useMemo(
    () =>
      catalog.providers.flatMap((entry) =>
        entry.models.map((item) => {
          const label = (
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="truncate">{modelLabel(item)}</span>
              {entry.provider ? (
                <>
                  {/* 读屏读到「模型名 服务商」，而不是两段文字粘在一起。 */}
                  <span className="sr-only"> </span>
                  <span className="shrink-0 text-xs font-normal text-ink-3">
                    {providerLabel(entry.provider)}
                  </span>
                </>
              ) : null}
            </span>
          );
          return { value: optionValue(entry.provider, item.id), label, triggerLabel: label };
        }),
      ),
    [catalog.providers],
  );

  return (
    <FormField label={t("image_generation.model")} htmlFor="image-model" reserveMeta={false}>
      <Select
        id="image-model"
        value={optionValue(provider, model)}
        options={options}
        disabled={disabled || options.length === 0}
        placeholder={t("image_generation.model_placeholder")}
        onChange={(value) => {
          const [nextProvider = "", nextModel = ""] = value.split(OPTION_SEPARATOR);
          onChange(nextProvider, nextModel);
        }}
      />
    </FormField>
  );
}
