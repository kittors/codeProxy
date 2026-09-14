/**
 * Per-account Codex image generation settings.
 *
 * Kept out of authFiles.ts because that file is already past the size gate and
 * may only shrink; this is also a self-contained concern with no dependency on
 * the rest of the auth-file domain.
 */

/** A Codex image model the injected image_generation tool can be pinned to. */
export type CodexImageGenerationModelOption = {
  id: string;
  display_name?: string;
  description?: string;
  supports_edit?: boolean;
};

export type CodexImageGenerationBridgeEditorState = {
  fileName: string;
  supported: boolean;
  enabled: boolean;
  /** Pinned image model for the injected tool; "" follows the build default. */
  model: string;
  /**
   * Selectable models as reported by the server with the account. Codex adds
   * gpt-image releases over time, so a list maintained in the panel would go
   * stale the first time one shipped.
   */
  availableModels: CodexImageGenerationModelOption[];
  saving: boolean;
  error: string | null;
};
