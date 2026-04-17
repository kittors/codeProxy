import { apiClient, type RequestOptions } from "@/lib/http/client";

export interface UpdateCheckResponse {
  enabled: boolean;
  current_version?: string;
  current_commit?: string;
  build_date?: string;
  target_channel?: "main" | "dev" | string;
  latest_version?: string;
  latest_commit?: string;
  latest_commit_url?: string;
  docker_image?: string;
  docker_tag?: string;
  release_notes?: string;
  release_url?: string;
  update_available?: boolean;
  updater_available?: boolean;
  message?: string;
}

export interface UpdateApplyResponse {
  status: "accepted" | "noop" | string;
  message?: string;
  target?: UpdateCheckResponse;
}

export const updateApi = {
  check: (options?: RequestOptions) =>
    apiClient.get<UpdateCheckResponse>("/update/check", { timeoutMs: 20000, ...options }),
  apply: () =>
    apiClient.post<UpdateApplyResponse>("/update/apply", undefined, { timeoutMs: 20000 }),
};
