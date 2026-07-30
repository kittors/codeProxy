import { apiClient } from "../client/client";

const IMAGE_GENERATION_TASK_POLL_TIMEOUT_MS = 10 * 1000;

export interface ImageGenerationTestRequest {
  mode?: "generations";
  model: "gpt-image-2" | string;
  prompt: string;
  size?: string;
  quality?: string;
  n?: number;
}

export interface ImageEditTestRequest {
  mode: "edits";
  model: "gpt-image-2" | string;
  prompt: string;
  size?: string;
  quality?: string;
  n?: number;
  images: File[];
}

export interface ImageGenerationResultItem {
  b64_json?: string;
  revised_prompt?: string;
}

export interface ImageGenerationTestResponse {
  created?: number;
  data?: ImageGenerationResultItem[];
}

export type ImageGenerationTestTaskStatus = "queued" | "running" | "succeeded" | "failed";

export interface ImageGenerationTestTaskStartResponse {
  task_id: string;
  status: ImageGenerationTestTaskStatus;
  phase?: string;
  elapsed_ms?: number;
}

export interface ImageGenerationTestTaskResponse extends ImageGenerationTestTaskStartResponse {
  result?: ImageGenerationTestResponse;
  error?: {
    status?: number;
    body?: {
      error?: {
        message?: string;
        type?: string;
        upstream?: unknown;
      };
    };
  };
}

export interface ImageGenerationSizePresetsResponse {
  sizes: string[];
}

/** A credential provider that can serve at least one image model. */
export interface ImageGenerationProviderChannels {
  provider: string;
  channels: string[];
  models: string[];
}

/** A selectable image model, as reported by the server. */
export interface ImageGenerationModel {
  id: string;
  provider: string;
  display_name?: string;
  description?: string;
  /** True when the model accepts reference images through the edits endpoint. */
  supports_edit: boolean;
  price_per_call?: number;
}

export interface ImageGenerationChannelsResponse {
  /**
   * The legacy single-model field. Retained because the server still sends it and
   * older panels read it; new code should use `models`.
   */
  model: string;
  /** Every usable channel across providers, flattened. Also legacy. */
  channels: string[];
  providers?: ImageGenerationProviderChannels[];
  models?: ImageGenerationModel[];
}

export const imageGenerationApi = {
  // Channel availability comes from this dedicated endpoint rather than from the
  // auth-files list: it is guarded by image_generation.read, the same permission that
  // grants the page itself, and the server already filters out disabled channels.
  getChannels: (): Promise<ImageGenerationChannelsResponse> => {
    return apiClient.get<ImageGenerationChannelsResponse>("/image-generation/channels");
  },

  getSizePresets: (): Promise<ImageGenerationSizePresetsResponse> => {
    return apiClient.get<ImageGenerationSizePresetsResponse>("/image-generation/size-presets");
  },

  updateSizePresets: (sizes: string[]): Promise<ImageGenerationSizePresetsResponse> => {
    return apiClient.put<ImageGenerationSizePresetsResponse>("/image-generation/size-presets", {
      sizes,
    });
  },

  startTestTask: (
    payload: ImageGenerationTestRequest | ImageEditTestRequest,
  ): Promise<ImageGenerationTestTaskStartResponse> => {
    if (payload.mode === "edits") {
      const formData = new FormData();
      formData.set("model", payload.model);
      formData.set("prompt", payload.prompt);
      if (payload.size) formData.set("size", payload.size);
      if (payload.quality) formData.set("quality", payload.quality);
      if (payload.n) formData.set("n", String(payload.n));
      payload.images.forEach((image) => formData.append("image", image));
      return apiClient.postForm<ImageGenerationTestTaskStartResponse>(
        "/image-generation/test",
        formData,
      );
    }
    const { mode: _mode, ...body } = payload;
    return apiClient.post<ImageGenerationTestTaskStartResponse>("/image-generation/test", body);
  },

  getTestTask: (taskId: string): Promise<ImageGenerationTestTaskResponse> => {
    return apiClient.get<ImageGenerationTestTaskResponse>(
      `/image-generation/test/${encodeURIComponent(taskId)}`,
      {
        timeoutMs: IMAGE_GENERATION_TASK_POLL_TIMEOUT_MS,
      },
    );
  },
};
