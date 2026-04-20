import { type TFunction } from "i18next";
import { apiClient } from "@/lib/http/client";
import {
  updateApi,
  type UpdateCheckResponse,
  type UpdateProgressResponse,
} from "@/lib/http/apis/update";

export const DEFAULT_HEARTBEAT_INTERVAL_MS = 2000;
export const DEFAULT_HEARTBEAT_TIMEOUT_MS = 180000;

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

export const shortCommit = (commit?: string) => {
  const trimmed = commit?.trim() ?? "";
  return trimmed.length > 7 ? trimmed.slice(0, 7) : trimmed;
};

export const sameCommit = (left?: string, right?: string) => {
  const normalizedLeft = left?.trim().toLowerCase() ?? "";
  const normalizedRight = right?.trim().toLowerCase() ?? "";
  if (!normalizedLeft || !normalizedRight) return false;
  return normalizedLeft.startsWith(normalizedRight) || normalizedRight.startsWith(normalizedLeft);
};

export const versionLabel = (version?: string, commit?: string, channel?: string) => {
  const trimmedVersion = version?.trim();
  if (trimmedVersion) return trimmedVersion;
  const short = shortCommit(commit);
  if (short && channel) return `${channel}-${short}`;
  return short || "--";
};

export const uiVersionLabel = (version?: string, commit?: string, channel?: string) => {
  const trimmedVersion = version?.trim();
  if (trimmedVersion) return trimmedVersion;
  const short = shortCommit(commit);
  const normalizedChannel = channel?.trim() || "main";
  if (short) return `panel-${normalizedChannel}-${short}`;
  return "--";
};

export const formatUpdateStatusMessage = (message?: string | null) => {
  const trimmed = message?.trim() ?? "";
  if (!trimmed) return "";
  return trimmed.replace(
    /;\s+(?=(?:service update check degraded|management UI update check degraded):)/gi,
    ";\n",
  );
};

export const isAlreadyUpToDateMessage = (message?: string | null) =>
  (message?.trim().toLowerCase() ?? "") === "already up to date";

export const updateDisplayVersion = (info: UpdateCheckResponse) => {
  const backendChanged =
    Boolean(info.latest_commit?.trim()) && !sameCommit(info.current_commit, info.latest_commit);
  if (!backendChanged && info.latest_ui_version?.trim()) {
    return info.latest_ui_version;
  }
  return (
    info.latest_version || info.latest_commit || info.latest_ui_commit || info.docker_tag || ""
  );
};

export const updateIdentity = (info: UpdateCheckResponse) =>
  updateDisplayVersion(info) ||
  info.latest_commit ||
  info.latest_ui_commit ||
  `${info.docker_image ?? ""}:${info.docker_tag ?? ""}`;

export const createPendingUpdateProgress = (
  target?: UpdateCheckResponse | null,
): UpdateProgressResponse => ({
  status: "running",
  stage: "preparing",
  message: "preparing update",
  service: "clirelay",
  target_image: target?.docker_image,
  target_tag: target?.docker_tag,
  target_version: target?.latest_version,
  target_commit: target?.latest_commit,
  target_ui_version: target?.latest_ui_version,
  target_ui_commit: target?.latest_ui_commit,
  target_channel: target?.target_channel,
  logs: [],
});

export const matchesAppliedTarget = (
  info: UpdateCheckResponse,
  target?: UpdateCheckResponse | null,
) => {
  if (!target) return !info.update_available;
  const backendNeedsChange =
    Boolean(target.latest_commit?.trim()) &&
    !sameCommit(target.current_commit, target.latest_commit);
  const uiNeedsChange =
    Boolean(target.latest_ui_commit?.trim()) &&
    !sameCommit(target.current_ui_commit, target.latest_ui_commit);
  const currentVersion = info.current_version?.trim() ?? "";
  const targetVersion = target.latest_version?.trim() ?? "";
  const currentUIVersion = info.current_ui_version?.trim() ?? "";
  const targetUIVersion = target.latest_ui_version?.trim() ?? "";
  const backendApplied =
    !backendNeedsChange ||
    sameCommit(info.current_commit, target.latest_commit) ||
    Boolean(currentVersion && targetVersion && currentVersion === targetVersion);
  const uiApplied =
    !uiNeedsChange ||
    sameCommit(info.current_ui_commit, target.latest_ui_commit) ||
    Boolean(currentUIVersion && targetUIVersion && currentUIVersion === targetUIVersion);
  return backendApplied && uiApplied;
};

const waitForAppliedTarget = async ({
  target,
  heartbeatIntervalMs,
  heartbeatTimeoutMs,
  onCheck,
  onProgress,
}: {
  target?: UpdateCheckResponse | null;
  heartbeatIntervalMs: number;
  heartbeatTimeoutMs: number;
  onCheck?: (info: UpdateCheckResponse) => void;
  onProgress?: (progress: UpdateProgressResponse) => void;
}) => {
  const deadline = Date.now() + heartbeatTimeoutMs;
  let lastCheck: UpdateCheckResponse | null = null;
  let lastProgress: UpdateProgressResponse | null = null;
  const pollProgress = async () => {
    try {
      const progress = await updateApi.progress({
        timeoutMs: Math.min(8000, heartbeatIntervalMs + 5000),
      });
      lastProgress = progress;
      onProgress?.(progress);
      return progress;
    } catch {
      return lastProgress;
    }
  };
  await pollProgress();
  await sleep(Math.min(heartbeatIntervalMs, 3000));
  while (true) {
    const progress = await pollProgress();
    if (progress?.status === "failed") {
      return { ok: false as const, latest: lastCheck, progress, failed: true as const };
    }
    try {
      await apiClient.get("/system-stats", {
        timeoutMs: Math.min(5000, heartbeatIntervalMs + 3000),
      });
      const current = await updateApi.current({
        timeoutMs: Math.min(8000, heartbeatIntervalMs + 5000),
      });
      const info = { ...target, ...current };
      lastCheck = info;
      onCheck?.(info);
      if (matchesAppliedTarget(info, target)) {
        return { ok: true as const, latest: info, progress: lastProgress };
      }
    } catch {
      // Keep polling until timeout so restarts and short network blips do not look like failures.
    }
    if (Date.now() >= deadline) {
      return { ok: false as const, latest: lastCheck, progress: lastProgress };
    }
    await sleep(heartbeatIntervalMs);
  }
};

export const applyUpdateFlow = async ({
  candidate,
  heartbeatIntervalMs,
  heartbeatTimeoutMs,
  notify,
  onCheck,
  onProgress,
  onSuccess,
  t,
}: {
  candidate?: UpdateCheckResponse | null;
  heartbeatIntervalMs: number;
  heartbeatTimeoutMs: number;
  notify: (input: { type?: "success" | "error" | "info" | "warning"; message: string }) => void;
  onCheck?: (info: UpdateCheckResponse) => void;
  onProgress?: (progress: UpdateProgressResponse) => void;
  onSuccess?: () => void;
  t: TFunction;
}) => {
  const response = await updateApi.apply();
  const target = response.target ?? candidate;
  const result = await waitForAppliedTarget({
    target,
    heartbeatIntervalMs,
    heartbeatTimeoutMs,
    onCheck,
    onProgress,
  });
  if (!result.ok) {
    const progressMessage = result.progress?.message?.trim();
    notify({
      type: result.failed ? "error" : "warning",
      message: progressMessage
        ? progressMessage
        : result.latest || target
          ? t("auto_update.version_mismatch", {
              version: versionLabel(
                target?.latest_version,
                target?.latest_commit,
                target?.target_channel,
              ),
            })
          : t("auto_update.timeout"),
    });
    return false;
  }
  notify({ type: "success", message: t("auto_update.success") });
  onSuccess?.();
  return true;
};
