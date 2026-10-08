import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { Select, ToggleSwitch } from "@code-proxy/ui";
import type { CodexImageGenerationBridgeEditorState } from "@code-proxy/domain";

/**
 * Per-account Codex image generation settings.
 *
 * The bridge injects a Responses-native image_generation tool for clients that
 * cannot expose a local image_gen namespace. Which image model that tool asks
 * for used to be compiled in, so an operator comparing gpt-image releases had no
 * way to move the conversation path off the default. The model list comes from
 * the server with the account, not from a constant here, because Codex adds
 * releases over time.
 */
export function CodexImageGenerationBridgePanel({
  editor,
  setEditor,
}: {
  editor: CodexImageGenerationBridgeEditorState;
  setEditor: Dispatch<SetStateAction<CodexImageGenerationBridgeEditorState>>;
}) {
  const { t } = useTranslation();
  if (!editor.supported) return null;

  const modelOptions = [
    // The default option is not one of the releases: leaving it selected keeps
    // the account following whatever the build defaults to, including after that
    // default changes.
    { value: "", label: t("auth_files.codex_image_generation_model_default") },
    ...editor.availableModels.map((model) => ({
      value: model.id,
      label: model.display_name?.trim() ? `${model.display_name} · ${model.id}` : model.id,
    })),
  ];

  return (
    <div
      className="min-w-0 space-y-4 rounded-lg bg-subtle px-4 py-4 lg:col-span-2"
      data-testid="codex-image-generation-bridge-panel"
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">
            {t("auth_files.codex_image_generation_bridge_title")}
          </p>
          <p className="mt-1 text-xs text-ink-3">
            {t("auth_files.codex_image_generation_bridge_desc")}
          </p>
        </div>
        <span className="rounded-full bg-ink/[0.05] px-2.5 py-1 text-xs font-semibold text-ink-2 dark:bg-white/[0.07]">
          {editor.enabled ? t("auth_files.enabled") : t("auth_files.disabled")}
        </span>
      </div>

      {/* 面板本身就是一层淡底：开关和模型选择直接放在里面，不再各自套一张描边白卡。 */}
      <div data-testid="codex-image-generation-bridge-toggle">
        <ToggleSwitch
          checked={editor.enabled}
          onCheckedChange={(checked) =>
            setEditor((prev) => ({ ...prev, enabled: checked, error: null }))
          }
          disabled={editor.saving}
          label={t("auth_files.codex_image_generation_bridge_toggle")}
          description={t("auth_files.codex_image_generation_bridge_toggle_hint")}
        />
      </div>

      {editor.availableModels.length > 0 ? (
        <div className="space-y-2" data-testid="codex-image-generation-model-select">
          <label
            htmlFor="codex-image-generation-model"
            className="block text-sm font-medium text-ink"
          >
            {t("auth_files.codex_image_generation_model_label")}
          </label>
          <Select
            id="codex-image-generation-model"
            value={editor.model}
            onChange={(value) => setEditor((prev) => ({ ...prev, model: value, error: null }))}
            options={modelOptions}
            disabled={editor.saving || !editor.enabled}
            aria-label={t("auth_files.codex_image_generation_model_label")}
          />
          <p className="text-xs text-ink-3">
            {t("auth_files.codex_image_generation_model_hint")}
          </p>
        </div>
      ) : null}

      {editor.error ? (
        <p className="text-sm text-rose-600 dark:text-rose-300">{editor.error}</p>
      ) : null}
    </div>
  );
}
