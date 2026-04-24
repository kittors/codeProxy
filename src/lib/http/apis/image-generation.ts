import { apiClient } from "@/lib/http/client";

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

export type ImageGenerationTestTaskStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed";

export interface ImageGenerationTestTaskStartResponse {
  task_id: string;
  status: ImageGenerationTestTaskStatus;
  phase?: string;
  elapsed_ms?: number;
}

export interface ImageGenerationTestTaskResponse
  extends ImageGenerationTestTaskStartResponse {
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

export const imageGenerationApi = {
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
    return apiClient.post<ImageGenerationTestTaskStartResponse>(
      "/image-generation/test",
      body,
    );
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
