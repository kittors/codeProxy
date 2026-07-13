import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Modal, Select, Textarea } from "@code-proxy/ui";
import {
  DEFAULT_MODEL_TEST_PROMPT,
  formatModelSourceLabel,
} from "../modelsUtils";
import type { ModelAvailabilitySource, ModelItem } from "../types";

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
  resultText: string | null;
  errorText: string | null;
  onClose: () => void;
  onRun: (input: { channel: string; prompt: string }) => void;
}

export function ModelTestModal({
  model,
  running,
  resultText,
  errorText,
  onClose,
  onRun,
}: ModelTestModalProps) {
  const { t } = useTranslation();
  // Keep last model/result during Modal exit animation so the panel does not collapse.
  const [displayModel, setDisplayModel] = useState<ModelItem | null>(model);
  const [displayResult, setDisplayResult] = useState<string | null>(resultText);
  const [displayError, setDisplayError] = useState<string | null>(errorText);

  useEffect(() => {
    if (!model) return;
    setDisplayModel(model);
    setDisplayResult(resultText);
    setDisplayError(errorText);
  }, [model, resultText, errorText]);

  const channelOptions = useMemo(
    () => buildChannelOptions(displayModel),
    [displayModel],
  );
  const [channel, setChannel] = useState("");
  const [prompt, setPrompt] = useState(DEFAULT_MODEL_TEST_PROMPT);

  useEffect(() => {
    if (!model) return;
    const options = buildChannelOptions(model);
    setChannel(options[0]?.value ?? "");
    setPrompt(DEFAULT_MODEL_TEST_PROMPT);
  }, [model]);

  const open = model !== null;
  const canRun = Boolean(model && channel && prompt.trim() && !running);
  const noChannels = Boolean(displayModel) && channelOptions.length === 0;
  const showSuccess = Boolean(displayResult) && !displayError;
  const showError = Boolean(displayError);

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
      maxWidth="max-w-xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={running}>
            {t("models_page.cancel")}
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              if (!model || !channel) return;
              onRun({ channel, prompt: prompt.trim() });
            }}
            disabled={!canRun || noChannels}
          >
            {running ? t("models_page.test_running") : t("models_page.test_run")}
          </Button>
        </>
      }
    >
      {displayModel ? (
        <div className="space-y-4">
          <div>
            <label
              htmlFor="model-test-channel"
              className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80"
            >
              {t("models_page.test_channel")}
            </label>
            {noChannels ? (
              <p className="rounded-lg border border-dashed border-slate-200 px-3 py-2 text-sm text-slate-500 dark:border-neutral-800 dark:text-white/45">
                {t("models_page.test_no_channels")}
              </p>
            ) : (
              <Select
                id="model-test-channel"
                value={channel}
                onChange={setChannel}
                aria-label={t("models_page.test_channel")}
                options={channelOptions.map((option) => ({
                  value: option.value,
                  label: option.label,
                }))}
                placeholder={t("models_page.test_channel_placeholder")}
              />
            )}
          </div>

          <div>
            <label
              htmlFor="model-test-prompt"
              className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80"
            >
              {t("models_page.test_prompt")}
            </label>
            <Textarea
              id="model-test-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              aria-label={t("models_page.test_prompt")}
              placeholder={DEFAULT_MODEL_TEST_PROMPT}
            />
          </div>

          {/* Always reserve the response slot while open so success/error swaps don't collapse height. */}
          <div
            className={[
              "grid transition-[grid-template-rows,opacity] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
              showError || showSuccess
                ? "grid-rows-[1fr] opacity-100"
                : "grid-rows-[0fr] opacity-0",
            ].join(" ")}
            aria-live="polite"
          >
            <div className="min-h-0 overflow-hidden">
              {showError ? (
                <div data-testid="model-test-error">
                  <div className="mb-1 text-sm font-medium text-rose-700 dark:text-rose-300">
                    {t("models_page.test_response")}
                  </div>
                  <div
                    role="alert"
                    className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"
                  >
                    {displayError}
                  </div>
                </div>
              ) : null}

              {showSuccess ? (
                <div data-testid="model-test-success">
                  <div className="mb-1 text-sm font-medium text-emerald-700 dark:text-emerald-300">
                    {t("models_page.test_response")}
                  </div>
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100">
                    {displayResult}
                  </pre>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
