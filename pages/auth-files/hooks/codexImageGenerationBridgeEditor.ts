import type { AuthFileItem } from "@code-proxy/api-client";
import type { CodexImageGenerationBridgeEditorState } from "@code-proxy/domain";

/**
 * State plumbing for the per-account Codex image generation panel.
 *
 * Split out of useAuthFilesDetailEditors, which is already past the file size
 * gate and may only shrink. These are pure functions over one account's bridge
 * settings, so they carry none of that hook's context.
 */

export const createCodexImageGenerationBridgeEditorState =
  (): CodexImageGenerationBridgeEditorState => ({
    fileName: "",
    supported: false,
    enabled: false,
    model: "",
    availableModels: [],
    saving: false,
    error: null,
  });

export const buildCodexImageGenerationBridgeEditorState = (
  file: AuthFileItem,
): CodexImageGenerationBridgeEditorState => {
  const bridge = file.codex_image_generation_bridge;
  if (!bridge) {
    return { ...createCodexImageGenerationBridgeEditorState(), fileName: file.name };
  }
  return {
    fileName: file.name,
    supported: true,
    enabled: Boolean(bridge.enabled),
    // An empty model means the account follows the build default rather than
    // pinning a release, so it stays empty instead of being filled in here.
    model: bridge.model ?? "",
    availableModels: bridge.available_models ?? [],
    saving: false,
    error: null,
  };
};

export const mergeSavedCodexImageGenerationBridgeFields = (
  file: AuthFileItem,
  editor: CodexImageGenerationBridgeEditorState,
): AuthFileItem => {
  if (file.name !== editor.fileName || !file.codex_image_generation_bridge) return file;
  return {
    ...file,
    codex_image_generation_bridge: {
      ...file.codex_image_generation_bridge,
      enabled: editor.enabled,
      model: editor.model,
    },
  };
};
