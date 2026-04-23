import { apiClient } from "@/lib/http/client";

const IMAGE_GENERATION_TEST_TIMEOUT_MS = 6 * 60 * 1000;

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

export const imageGenerationApi = {
  test: (payload: ImageGenerationTestRequest | ImageEditTestRequest): Promise<ImageGenerationTestResponse> => {
    if (payload.mode === "edits") {
      const formData = new FormData();
      formData.set("model", payload.model);
      formData.set("prompt", payload.prompt);
      if (payload.size) formData.set("size", payload.size);
      if (payload.quality) formData.set("quality", payload.quality);
      if (payload.n) formData.set("n", String(payload.n));
      payload.images.forEach((image) => formData.append("image", image));
      return apiClient.postForm<ImageGenerationTestResponse>("/image-generation/test", formData, {
        timeoutMs: IMAGE_GENERATION_TEST_TIMEOUT_MS,
      });
    }
    const { mode: _mode, ...body } = payload;
    return apiClient.post<ImageGenerationTestResponse>("/image-generation/test", body, {
      timeoutMs: IMAGE_GENERATION_TEST_TIMEOUT_MS,
    });
  },
};
