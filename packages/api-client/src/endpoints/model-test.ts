import { apiClient } from "../client/client";

/**
 * Model catalog probe.
 *
 * The probe runs server-side with management authority. It used to run from the
 * browser: list the tenant's API keys, pick one, and call /v1/chat/completions
 * with it. That asked whether that particular business identity may use the
 * model — an operator checking a healthy account got "no auth available"
 * because the key it happened to pick was bound to an end user restricted to
 * one channel group, which no account-side configuration could fix.
 *
 * It also sent that same chat completion for every model in the catalog. Asking
 * an image model to hold a conversation proves nothing about whether it can
 * produce an image, so the probe is now shaped per modality and the server
 * decides which shapes a model supports.
 */

export type ModelTestMode = "text" | "vision" | "image" | "image_edit" | "video" | "video_from_image";

export interface ModelTestModeInfo {
  mode: ModelTestMode;
  /** Prompt to prefill. Written per modality so a wrong result is obvious. */
  default_prompt: string;
  /** True for the modes whose whole point is a reference image. */
  requires_image: boolean;
}

/**
 * The form description for one model. Served by the API rather than inferred in
 * the browser: the browser only has the model id and its modality tags, which
 * say nothing about whether this deployment can run an edit or an
 * image-to-video call for that model.
 */
export interface ModelTestOptions {
  model: string;
  modes: ModelTestModeInfo[];
  sizes?: string[];
  qualities?: string[];
  max_images?: number;
  max_duration_seconds?: number;
}

/** What a generated asset claims about its own provenance. */
export interface ModelTestC2PA {
  present: boolean;
  generator?: string;
  generator_version?: string;
  issuer?: string;
  digital_source_type?: string;
  actions?: string[];
  fields?: { key: string; value: string }[];
}

export interface ModelTestImage {
  b64_json?: string;
  url?: string;
  revised_prompt?: string;
  format?: string;
  width?: number;
  height?: number;
  bytes?: number;
  c2pa?: ModelTestC2PA;
}

export interface ModelTestVideo {
  url?: string;
  duration?: number;
  request_id?: string;
  status?: string;
}

export interface ModelTestPayload {
  kind: "text" | "image" | "video";
  text?: string;
  images?: ModelTestImage[];
  video?: ModelTestVideo;
}

/**
 * The evidence panel. `requested_model` vs `reported_model` vs
 * `provenance_model` is the point: the Codex image endpoint ignores the model
 * field, so a 2.5 request answered by 2.0 looks identical to a correct one
 * unless the manifest is shown.
 */
export interface ModelTestMetadata {
  mode: string;
  requested_model: string;
  reported_model?: string;
  channel?: string;
  upstream_endpoint?: string;
  provenance_model?: string;
  provenance_version?: string;
  provenance_matches?: boolean;
  usage?: Record<string, unknown>;
  response_fields?: string[];
  finish_reason?: string;
}

export type ModelTestTaskStatus = "queued" | "running" | "succeeded" | "failed";

export interface ModelTestResult {
  ok: boolean;
  mode?: ModelTestMode;
  /** Plain assistant text; empty for media modes. */
  content?: string;
  error?: string;
  duration_ms?: number;
  /** Present when the probe runs as a task, which media modes always do. */
  task_id?: string;
  status?: ModelTestTaskStatus;
  phase?: string;
  result?: ModelTestPayload;
  metadata?: ModelTestMetadata;
  /** The redacted body that went upstream. */
  request?: Record<string, unknown>;
}

export interface ModelTestRequest {
  model: string;
  prompt: string;
  channel?: string;
  mode?: ModelTestMode;
  /** Reference frames as data URIs or https URLs. */
  images?: string[];
  size?: string;
  quality?: string;
  n?: number;
  duration?: number;
  aspect_ratio?: string;
  resolution?: string;
}

// A clip takes minutes upstream, so the poll only asks for the task's current
// phase and must not inherit the client's default long timeout.
const MODEL_TEST_TASK_POLL_TIMEOUT_MS = 10 * 1000;

function normalizeResult(payload: ModelTestResult | null | undefined): ModelTestResult {
  return {
    ...payload,
    ok: Boolean(payload?.ok),
    content: typeof payload?.content === "string" ? payload.content : undefined,
    error: typeof payload?.error === "string" ? payload.error : undefined,
    duration_ms: typeof payload?.duration_ms === "number" ? payload.duration_ms : undefined,
    task_id: typeof payload?.task_id === "string" ? payload.task_id : undefined,
  };
}

export const modelTestApi = {
  /** Describe the probe form for one model. */
  getOptions: (model: string): Promise<ModelTestOptions> => {
    return apiClient.get<ModelTestOptions>(
      `/models/test/options?model=${encodeURIComponent(model)}`,
    );
  },

  /**
   * Start a probe. Text modes answer inline; image and video modes come back
   * with a `task_id` to poll, because holding the request open for a clip would
   * report an intermediate proxy's idle timeout as a model failure.
   */
  run: async (input: ModelTestRequest): Promise<ModelTestResult> => {
    return normalizeResult(await apiClient.post<ModelTestResult>("/models/test", input));
  },

  getTask: async (taskId: string): Promise<ModelTestResult> => {
    return normalizeResult(
      await apiClient.get<ModelTestResult>(`/models/test/${encodeURIComponent(taskId)}`, {
        timeoutMs: MODEL_TEST_TASK_POLL_TIMEOUT_MS,
      }),
    );
  },
};
