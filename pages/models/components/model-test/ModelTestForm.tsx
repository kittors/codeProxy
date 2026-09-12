import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { ImagePlus, X } from "lucide-react";
import { Select, TextInput, Textarea } from "@code-proxy/ui";
import type { ModelTestMode, ModelTestModeInfo, ModelTestOptions } from "@code-proxy/api-client";
import {
  MODE_HINT_KEY,
  MODE_LABEL_KEY,
  fileToDataURL,
  isImageMode,
  isVideoMode,
} from "./modelTestModes";

export interface ModelTestFormState {
  mode: ModelTestMode;
  prompt: string;
  channel: string;
  images: string[];
  size: string;
  quality: string;
  n: number;
  duration: number;
}

export interface ModelTestFormProps {
  state: ModelTestFormState;
  modes: ModelTestModeInfo[];
  options: ModelTestOptions | null;
  channelOptions: { value: string; label: string }[];
  disabled: boolean;
  noChannels: boolean;
  onChange: (patch: Partial<ModelTestFormState>) => void;
  onModeChange: (mode: ModelTestMode) => void;
}

/**
 * The probe form, shaped by the selected mode.
 *
 * One form for every modality was the original defect: an image model got a
 * chat box and a weather prompt. Each mode now shows the controls its upstream
 * endpoint actually accepts, and nothing else.
 */
export function ModelTestForm({
  state,
  modes,
  options,
  channelOptions,
  disabled,
  noChannels,
  onChange,
  onModeChange,
}: ModelTestFormProps) {
  const { t } = useTranslation();
  const fileInput = useRef<HTMLInputElement | null>(null);

  const activeMode = modes.find((mode) => mode.mode === state.mode);
  const requiresImage = Boolean(activeMode?.requires_image);
  const maxImages = options?.max_images ?? (state.mode === "video_from_image" ? 1 : 4);

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const room = Math.max(0, maxImages - state.images.length);
    const picked = Array.from(files).slice(0, room);
    const encoded = await Promise.all(picked.map(fileToDataURL));
    onChange({ images: [...state.images, ...encoded.filter(Boolean)] });
  };

  return (
    <div className="space-y-4">
      {modes.length > 1 ? (
        <div>
          <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-white/80">
            {t("models_page.test_mode")}
          </span>
          <div
            role="tablist"
            aria-label={t("models_page.test_mode")}
            className="flex flex-wrap gap-1.5"
            data-testid="model-test-modes"
          >
            {modes.map((mode) => {
              const active = mode.mode === state.mode;
              return (
                <button
                  key={mode.mode}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  disabled={disabled}
                  onClick={() => onModeChange(mode.mode)}
                  className={[
                    "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50",
                    active
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/[0.08] dark:text-white/70 dark:hover:bg-white/[0.14]",
                  ].join(" ")}
                >
                  {t(MODE_LABEL_KEY[mode.mode])}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-white/45">
            {t(MODE_HINT_KEY[state.mode])}
          </p>
        </div>
      ) : null}

      <div>
        <label
          htmlFor="model-test-channel"
          className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80"
        >
          {t("models_page.test_channel")}
        </label>
        {noChannels ? (
          <p className="rounded-lg border border-dashed border-slate-900/8 px-3 py-2 text-sm text-slate-500 dark:border-white/8 dark:text-white/45">
            {t("models_page.test_no_channels")}
          </p>
        ) : (
          <Select
            id="model-test-channel"
            value={state.channel}
            onChange={(value) => onChange({ channel: value })}
            aria-label={t("models_page.test_channel")}
            options={channelOptions}
            placeholder={t("models_page.test_channel_placeholder")}
          />
        )}
      </div>

      {requiresImage ? (
        <div>
          <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80">
            {t("models_page.test_reference_images")}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {state.images.map((image, index) => (
              <div
                key={`${index}-${image.slice(0, 32)}`}
                className="group relative h-16 w-16 overflow-hidden rounded-lg border border-slate-900/10 dark:border-white/10"
              >
                <img src={image} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  aria-label={t("models_page.test_remove_image")}
                  onClick={() => onChange({ images: state.images.filter((_, i) => i !== index) })}
                  className="absolute right-0.5 top-0.5 rounded-full bg-slate-900/70 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <X size={11} aria-hidden />
                </button>
              </div>
            ))}
            {state.images.length < maxImages ? (
              <button
                type="button"
                disabled={disabled}
                onClick={() => fileInput.current?.click()}
                className="flex h-16 w-16 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-900/15 text-slate-500 transition-colors hover:border-indigo-400 hover:text-indigo-600 disabled:opacity-50 dark:border-white/15 dark:text-white/45"
              >
                <ImagePlus size={16} aria-hidden />
                <span className="text-2xs">{t("models_page.test_add_image")}</span>
              </button>
            ) : null}
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple={maxImages > 1}
            className="hidden"
            onChange={(event) => {
              void addFiles(event.target.files);
              event.target.value = "";
            }}
          />
          <p className="mt-1 text-xs text-slate-500 dark:text-white/45">
            {t("models_page.test_reference_images_hint", { count: maxImages })}
          </p>
        </div>
      ) : null}

      <div>
        <label
          htmlFor="model-test-prompt"
          className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80"
        >
          {t("models_page.test_prompt")}
        </label>
        <Textarea
          id="model-test-prompt"
          value={state.prompt}
          onChange={(e) => onChange({ prompt: e.target.value })}
          rows={3}
          aria-label={t("models_page.test_prompt")}
        />
      </div>

      {isImageMode(state.mode) ? (
        <div className="grid grid-cols-3 gap-2">
          <LabeledSelect
            id="model-test-size"
            label={t("models_page.test_size")}
            value={state.size}
            options={(options?.sizes ?? []).map((size) => ({ value: size, label: size }))}
            onChange={(value) => onChange({ size: value })}
          />
          <LabeledSelect
            id="model-test-quality"
            label={t("models_page.test_quality")}
            value={state.quality}
            options={(options?.qualities ?? []).map((quality) => ({
              value: quality,
              label: t(`models_page.test_quality_${quality}`, { defaultValue: quality }),
            }))}
            onChange={(value) => onChange({ quality: value })}
          />
          <div>
            <label
              htmlFor="model-test-count"
              className="mb-1 block text-xs font-medium text-slate-600 dark:text-white/70"
            >
              {t("models_page.test_count")}
            </label>
            <TextInput
              id="model-test-count"
              type="number"
              min={1}
              max={4}
              value={String(state.n)}
              onChange={(e) => onChange({ n: clamp(Number(e.target.value), 1, 4) })}
            />
          </div>
        </div>
      ) : null}

      {isVideoMode(state.mode) ? (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label
              htmlFor="model-test-duration"
              className="mb-1 block text-xs font-medium text-slate-600 dark:text-white/70"
            >
              {t("models_page.test_duration_seconds")}
            </label>
            <TextInput
              id="model-test-duration"
              type="number"
              min={1}
              max={options?.max_duration_seconds ?? 15}
              value={String(state.duration)}
              onChange={(e) =>
                onChange({
                  duration: clamp(Number(e.target.value), 1, options?.max_duration_seconds ?? 15),
                })
              }
            />
          </div>
          {options?.max_duration_seconds ? (
            <p className="self-end pb-2 text-xs text-slate-500 dark:text-white/45">
              {t("models_page.test_duration_max", { seconds: options.max_duration_seconds })}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function LabeledSelect({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-slate-600 dark:text-white/70">
        {label}
      </label>
      <Select id={id} value={value} onChange={onChange} options={options} aria-label={label} />
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}
