import { apiClient } from "@/lib/http/client";

export interface ImageGenerationTestRequest {
  model: "gpt-image-2" | string;
  prompt: string;
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
  test: (payload: ImageGenerationTestRequest): Promise<ImageGenerationTestResponse> =>
    apiClient.post<ImageGenerationTestResponse>("/image-generation/test", payload, {
      timeoutMs: 180000,
    }),
};
