import { apiClient } from "../client/client";

const VIDEO_GENERATION_TASK_POLL_TIMEOUT_MS = 10 * 1000;

/** A selectable video model, as reported by the server. */
export interface VideoGenerationModel {
  id: string;
  provider: string;
  display_name?: string;
  description?: string;
  /** True when the model can animate a source image, not just a prompt. */
  supports_image_to_video: boolean;
  max_duration_seconds?: number;
  price_per_call?: number;
  /** Credentials of the current tenant that can serve this model. */
  channels?: string[];
  /**
   * False when the tenant has no credential for the model's provider. The page
   * disables generation in that case: submitting would fail deep in the router
   * with "auth_not_found: no auth available", which says nothing actionable.
   */
  available?: boolean;
}

export interface VideoGenerationModelsResponse {
  models: VideoGenerationModel[];
  /** Every usable channel across providers, flattened. */
  channels?: string[];
}

export interface VideoGenerationTestRequest {
  model: string;
  prompt: string;
  /** Source image for image-to-video: an https URL or a data URI. */
  image?: string;
  duration?: number;
  aspect_ratio?: string;
  resolution?: string;
}

/**
 * The finished upstream payload. The console renders `video.url`; the rest is kept
 * so the raw response stays inspectable.
 */
export interface VideoGenerationTestResponse {
  status?: string;
  model?: string;
  video?: {
    url?: string;
    duration?: number;
  };
  request_id?: string;
}

export type VideoGenerationTestTaskStatus = "queued" | "running" | "succeeded" | "failed";

export interface VideoGenerationTestTaskStartResponse {
  task_id: string;
  status: VideoGenerationTestTaskStatus;
  phase?: string;
  elapsed_ms?: number;
}

export interface VideoGenerationTestTaskResponse extends VideoGenerationTestTaskStartResponse {
  result?: VideoGenerationTestResponse;
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

export const videoGenerationApi = {
  getModels: (): Promise<VideoGenerationModelsResponse> => {
    return apiClient.get<VideoGenerationModelsResponse>("/video-generation/models");
  },

  startTestTask: (
    payload: VideoGenerationTestRequest,
  ): Promise<VideoGenerationTestTaskStartResponse> => {
    return apiClient.post<VideoGenerationTestTaskStartResponse>("/video-generation/test", payload);
  },

  // A clip takes minutes upstream, so the console task absorbs that wait and this
  // poll only asks the server for the task's current phase.
  getTestTask: (taskId: string): Promise<VideoGenerationTestTaskResponse> => {
    return apiClient.get<VideoGenerationTestTaskResponse>(
      `/video-generation/test/${encodeURIComponent(taskId)}`,
      { timeoutMs: VIDEO_GENERATION_TASK_POLL_TIMEOUT_MS },
    );
  },
};
