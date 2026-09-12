import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Timer } from "lucide-react";
import { Button, Modal } from "@code-proxy/ui";
import type { ModelTestMode, ModelTestOptions, ModelTestResult } from "@code-proxy/api-client";
import { formatLatency } from "@features/provider-latency";
import {
  DEFAULT_MODEL_TEST_PROMPT,
  formatModelSourceLabel,
} from "../modelsUtils";
import type { ModelAvailabilitySource, ModelItem } from "../types";
import { ModelTestForm, type ModelTestFormState } from "./model-test/ModelTestForm";
import { ModelTestInspector } from "./model-test/ModelTestInspector";
import { ModelTestOutput, ProvenanceWarning } from "./model-test/ModelTestOutput";
import { MODE_LABEL_KEY, resolveModes } from "./model-test/modelTestModes";
import type { ModelTestRunInput } from "../hooks/useModelTestRunner";

export type ModelTestChannelOption = {
  value: string;
  label: string;
  /** Channel name used for API key allowed-channels restriction. */
  channel: string;
};

function equalsIgnoreCase(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Incomplete auth sources often surface as bare provider names (e.g. "xai")
 * when Label/email metadata is missing. Those are not usable test channels.
 *
 * Real channels look like:
 * - "user@example.com"
 * - "xai · user@example.com"
 * - "Primary OpenAI" (distinct from provider "openai")
 */
export function isBareProviderOnlySource(source: ModelAvailabilitySource): boolean {
  const provider = String(source.provider ?? "").trim();
  const channel = String(source.channel ?? "").trim();
  const label = String(source.label ?? "").trim();

  // Email identity is always a real account channel.
  if (channel.includes("@") || label.includes("@")) return false;

  const channelIsBare =
    !channel || (Boolean(provider) && equalsIgnoreCase(channel, provider));

  const normalizedLabel = label.replace(/\s*·\s*/g, " · ");
  const labelIsBare =
    !label ||
    (Boolean(provider) &&
      (equalsIgnoreCase(label, provider) ||
        equalsIgnoreCase(normalizedLabel, `${provider} · ${provider}`)));

  // Both channel and label collapse to the provider (or are empty) → incomplete source.
  return channelIsBare && labelIsBare;
}

function sourceToOption(source: ModelAvailabilitySource): ModelTestChannelOption | null {
  const channel =
    String(source.channel ?? "").trim() ||
    String(source.label ?? "").trim() ||
    String(source.clientId ?? "").trim();
  if (!channel) return null;
  return {
    value: channel,
    label: formatModelSourceLabel(source),
    channel,
  };
}

export function buildChannelOptions(model: ModelItem | null): ModelTestChannelOption[] {
  if (!model?.sources?.length) return [];

  const rich: ModelTestChannelOption[] = [];
  const bare: ModelTestChannelOption[] = [];
  const seen = new Set<string>();

  const pushUnique = (
    list: ModelTestChannelOption[],
    option: ModelTestChannelOption,
  ) => {
    const key = option.channel.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    list.push(option);
  };

  for (const source of model.sources) {
    const option = sourceToOption(source);
    if (!option) continue;
    if (isBareProviderOnlySource(source)) {
      pushUnique(bare, option);
    } else {
      pushUnique(rich, option);
    }
  }

  // Prefer account-level sources; only fall back to bare provider rows when nothing else exists.
  return rich.length > 0 ? rich : bare;
}

export interface ModelTestModalProps {
  model: ModelItem | null;
  running: boolean;
  result: ModelTestResult | null;
  errorText: string | null;
  /** Upstream round-trip duration of the last run, or null before one completes. */
  durationMs?: number | null;
  /** Upstream phase of an in-flight media task, e.g. "generating". */
  phase?: string | null;
  options: ModelTestOptions | null;
  onClose: () => void;
  onRun: (input: ModelTestRunInput) => void;
}

const emptyForm: ModelTestFormState = {
  mode: "text",
  prompt: DEFAULT_MODEL_TEST_PROMPT,
  channel: "",
  images: [],
  size: "",
  quality: "",
  n: 1,
  duration: 0,
};

export function ModelTestModal({
  model,
  running,
  result,
  errorText,
  durationMs = null,
  phase = null,
  options,
  onClose,
  onRun,
}: ModelTestModalProps) {
  const { t } = useTranslation();
  // Keep last model/result during Modal exit animation so the panel does not collapse.
  const [displayModel, setDisplayModel] = useState<ModelItem | null>(model);
  const [displayResult, setDisplayResult] = useState<ModelTestResult | null>(result);
  const [displayError, setDisplayError] = useState<string | null>(errorText);
  const [displayDurationMs, setDisplayDurationMs] = useState<number | null>(durationMs);

  useEffect(() => {
    if (!model) return;
    setDisplayModel(model);
    setDisplayResult(result);
    setDisplayError(errorText);
    setDisplayDurationMs(durationMs);
  }, [model, result, errorText, durationMs]);

  const channelOptions = useMemo(
    () => buildChannelOptions(displayModel),
    [displayModel],
  );
  const modes = useMemo(() => resolveModes(displayModel, options), [displayModel, options]);
  const [form, setForm] = useState<ModelTestFormState>(emptyForm);

  // Reset the form when the modal opens on a different model.
  useEffect(() => {
    if (!model) return;
    setForm({
      ...emptyForm,
      channel: buildChannelOptions(model)[0]?.value ?? "",
    });
  }, [model]);

  // Adopt the server's answer once it arrives: it decides the default mode, the
  // per-mode prompt, and which option values this deployment accepts.
  useEffect(() => {
    if (!options?.modes?.length) return;
    const first = options.modes[0];
    setForm((current) => ({
      ...current,
      mode: first.mode,
      prompt: first.default_prompt || current.prompt,
      size: options.sizes?.[0] ?? current.size,
      quality: options.qualities?.[1] ?? options.qualities?.[0] ?? current.quality,
      duration: options.max_duration_seconds
        ? Math.min(6, options.max_duration_seconds)
        : current.duration,
    }));
  }, [options]);

  const changeMode = (mode: ModelTestMode) => {
    const info = modes.find((item) => item.mode === mode);
    setForm((current) => ({
      ...current,
      mode,
      // Swapping modes swaps the prompt too: an image prompt is useless for a
      // clip, and leaving the previous one is how an operator ends up testing
      // the wrong thing without noticing.
      prompt: info?.default_prompt || current.prompt,
      images: [],
    }));
  };

  const activeMode = modes.find((item) => item.mode === form.mode);
  const open = model !== null;
  const noChannels = Boolean(displayModel) && channelOptions.length === 0;
  const missingImage = Boolean(activeMode?.requires_image) && form.images.length === 0;
  const canRun =
    Boolean(model && form.channel && form.prompt.trim() && !running && !missingImage);
  const showError = Boolean(displayError);
  // `content` alone is enough to render: a response the server could not shape
  // into a modality result still has its raw body worth showing.
  const showResult = Boolean(
    displayResult && !displayError && (displayResult.result || displayResult.content),
  );

  const durationBadge =
    typeof displayDurationMs === "number" && Number.isFinite(displayDurationMs) ? (
      <span
        data-testid="model-test-duration"
        className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-900/8 bg-slate-50 px-2 py-0.5 text-2xs font-semibold tabular-nums text-slate-600 dark:border-white/10 dark:bg-white/[0.06] dark:text-white/70"
      >
        <Timer size={11} className="shrink-0" aria-hidden />
        {t("models_page.test_duration", { duration: formatLatency(displayDurationMs) })}
      </span>
    ) : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("models_page.test_model_title")}
      description={
        displayModel
          ? t("models_page.test_model_desc", { model: displayModel.id })
          : undefined
      }
      maxWidth="max-w-2xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={running}>
            {t("models_page.cancel")}
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              if (!model || !form.channel) return;
              onRun({
                channel: form.channel,
                prompt: form.prompt.trim(),
                mode: form.mode,
                images: form.images,
                size: form.size,
                quality: form.quality,
                n: form.n,
                duration: form.duration,
              });
            }}
            disabled={!canRun || noChannels}
          >
            {running
              ? phase
                ? t("models_page.test_running_phase", { phase })
                : t("models_page.test_running")
              : t("models_page.test_run_mode", { mode: t(MODE_LABEL_KEY[form.mode]) })}
          </Button>
        </>
      }
    >
      {displayModel ? (
        <div className="space-y-4">
          <ModelTestForm
            state={form}
            modes={modes}
            options={options}
            channelOptions={channelOptions.map((option) => ({
              value: option.value,
              label: option.label,
            }))}
            disabled={running}
            noChannels={noChannels}
            onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
            onModeChange={changeMode}
          />

          {missingImage ? (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              {t("models_page.test_reference_image_required")}
            </p>
          ) : null}

          {/* Always reserve the response slot while open so success/error swaps don't collapse height. */}
          <div
            className={[
              "grid transition-[grid-template-rows,opacity] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
              showError || showResult
                ? "grid-rows-[1fr] opacity-100"
                : "grid-rows-[0fr] opacity-0",
            ].join(" ")}
            aria-live="polite"
          >
            <div className="min-h-0 overflow-hidden">
              {showError ? (
                <div data-testid="model-test-error" className="space-y-2">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-sm font-medium text-rose-700 dark:text-rose-300">
                      {t("models_page.test_response")}
                    </span>
                    {durationBadge}
                  </div>
                  <div
                    role="alert"
                    className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"
                  >
                    {displayError}
                  </div>
                  {/* A failed probe still shows what was sent, which is usually
                      the fastest route to the cause. */}
                  {displayResult ? <ModelTestInspector result={displayResult} /> : null}
                </div>
              ) : null}

              {showResult && displayResult ? (
                <div data-testid="model-test-success" className="space-y-2">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                      {t("models_page.test_response")}
                    </span>
                    {durationBadge}
                  </div>
                  <ProvenanceWarning result={displayResult} />
                  <ModelTestOutput result={displayResult} />
                  <ModelTestInspector result={displayResult} />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
