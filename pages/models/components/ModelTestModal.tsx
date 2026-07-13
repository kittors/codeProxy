import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Modal, Select, Textarea } from "@code-proxy/ui";
import {
  DEFAULT_MODEL_TEST_PROMPT,
  formatModelSourceLabel,
} from "../modelsUtils";
import type { ModelItem } from "../types";

export type ModelTestChannelOption = {
  value: string;
  label: string;
  /** Channel name used for API key allowed-channels restriction. */
  channel: string;
};

function buildChannelOptions(model: ModelItem | null): ModelTestChannelOption[] {
  if (!model?.sources?.length) return [];
  const seen = new Set<string>();
  const options: ModelTestChannelOption[] = [];
  for (const source of model.sources) {
    const channel =
      String(source.channel ?? "").trim() ||
      String(source.label ?? "").trim() ||
      String(source.clientId ?? "").trim();
    if (!channel) continue;
    const key = channel.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    options.push({
      value: channel,
      label: formatModelSourceLabel(source),
      channel,
    });
  }
  return options;
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
  const channelOptions = useMemo(() => buildChannelOptions(model), [model]);
  const [channel, setChannel] = useState("");
  const [prompt, setPrompt] = useState(DEFAULT_MODEL_TEST_PROMPT);

  useEffect(() => {
    if (!model) return;
    const options = buildChannelOptions(model);
    setChannel(options[0]?.value ?? "");
    setPrompt(DEFAULT_MODEL_TEST_PROMPT);
  }, [model]);

  const canRun = Boolean(model && channel && prompt.trim() && !running);
  const noChannels = Boolean(model) && channelOptions.length === 0;

  return (
    <Modal
      open={model !== null}
      onClose={onClose}
      title={t("models_page.test_model_title")}
      description={
        model
          ? t("models_page.test_model_desc", { model: model.id })
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
      {model ? (
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

          {errorText ? (
            <div
              role="alert"
              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"
            >
              {errorText}
            </div>
          ) : null}

          {resultText ? (
            <div>
              <div className="mb-1 text-sm font-medium text-slate-700 dark:text-white/80">
                {t("models_page.test_response")}
              </div>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white/80">
                {resultText}
              </pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}
