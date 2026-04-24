import { apiClient, type RequestOptions } from "@/lib/http/client";

export interface UpdateCheckResponse {
  enabled: boolean;
  current_version?: string;
  current_commit?: string;
  current_ui_version?: string;
  current_ui_commit?: string;
  build_date?: string;
  target_channel?: "main" | "dev" | string;
  latest_version?: string;
  latest_commit?: string;
  latest_commit_url?: string;
  latest_ui_version?: string;
  latest_ui_commit?: string;
  latest_ui_commit_url?: string;
  docker_image?: string;
  docker_tag?: string;
  release_notes?: string;
  release_url?: string;
  update_available?: boolean;
  updater_available?: boolean;
  message?: string;
}

export interface UpdateProgressLogEntry {
  timestamp?: string;
  stream?: string;
  message: string;
}

export interface UpdateProgressResponse {
  status: "idle" | "running" | "completed" | "failed" | string;
  stage?: string;
  message?: string;
  service?: string;
  target_image?: string;
  target_tag?: string;
  target_version?: string;
  target_commit?: string;
  target_ui_version?: string;
  target_ui_commit?: string;
  target_channel?: string;
  started_at?: string;
  updated_at?: string;
  finished_at?: string;
  logs?: UpdateProgressLogEntry[];
}

export interface UpdateApplyResponse {
  status: "accepted" | "noop" | string;
  message?: string;
  target?: UpdateCheckResponse;
}

export const updateApi = {
  check: (options?: RequestOptions) =>
    apiClient.get<UpdateCheckResponse>("/update/check", {
      timeoutMs: 20000,
      ...options,
    }),
  current: (options?: RequestOptions) =>
    apiClient.get<UpdateCheckResponse>("/update/current", {
      timeoutMs: 5000,
      ...options,
    }),
  progress: (options?: RequestOptions) =>
    apiClient.get<UpdateProgressResponse>("/update/progress", {
      timeoutMs: 5000,
      ...options,
    }),
  apply: () =>
    apiClient.post<UpdateApplyResponse>("/update/apply", undefined, {
      timeoutMs: 20000,
    }),
};
