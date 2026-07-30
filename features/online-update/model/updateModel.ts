import type {
  UpdateCheckResponse,
  UpdateProgressResponse,
} from "@code-proxy/api-client/endpoints/update";

/** Pure helpers describing an update. No transport, no React. */

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

export const normalizedProgressStatus = (progress?: UpdateProgressResponse | null) =>
  progress?.status?.trim().toLowerCase() ?? "";

export const isRunningProgress = (progress?: UpdateProgressResponse | null) =>
  normalizedProgressStatus(progress) === "running";

export const isTerminalProgress = (progress?: UpdateProgressResponse | null) => {
  const status = normalizedProgressStatus(progress);
  return status === "completed" || status === "failed";
};

/**
 * Reads the percentage the updater reported.
 *
 * Returns null only when the field is genuinely absent. It used to be dropped from
 * the payload whenever it was zero, and the modal read that absence as "no progress
 * reporting" and drew a full bar — at the exact moment an update began. The updater
 * now always emits the number; this stays strict so a regression shows up as a
 * missing bar rather than a full one.
 */
export const progressPercent = (progress?: UpdateProgressResponse | null) => {
  const percent = progress?.progress_percent;
  if (typeof percent !== "number" || !Number.isFinite(percent)) return null;
  return Math.min(100, Math.max(0, percent));
};

export const formatBytes = (bytes?: number) => {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes <= 0) return "";
  const units = ["B", "kB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  // One decimal above bytes, matching how docker itself prints layer sizes, so the
  // panel and `docker pull` output read the same.
  return `${unit === 0 ? Math.round(value) : value.toFixed(1)}${units[unit]}`;
};

export const updateDisplayVersion = (info: UpdateCheckResponse) => {
  const backendChanged =
    Boolean(info.latest_commit?.trim()) && !sameCommit(info.current_commit, info.latest_commit);
  if (!backendChanged && info.latest_ui_version?.trim()) {
    return info.latest_ui_version;
  }
  return info.latest_version || info.latest_commit || info.latest_ui_commit || info.docker_tag || "";
};

export const updateIdentity = (info: UpdateCheckResponse) =>
  updateDisplayVersion(info) ||
  info.latest_commit ||
  info.latest_ui_commit ||
  `${info.docker_image ?? ""}:${info.docker_tag ?? ""}`;

/**
 * Projects a progress payload into the shape the modal renders.
 *
 * During an update the run itself is the authority on what is being installed — the
 * check response may be stale or, after the container restarts, unavailable.
 */
export const candidateFromProgress = (
  progress: UpdateProgressResponse,
  fallback?: UpdateCheckResponse | null,
): UpdateCheckResponse => ({
  enabled: fallback?.enabled ?? true,
  current_version: progress.current_version ?? fallback?.current_version,
  current_commit: progress.current_commit ?? fallback?.current_commit,
  current_ui_version: progress.current_ui_version ?? fallback?.current_ui_version,
  current_ui_commit: progress.current_ui_commit ?? fallback?.current_ui_commit,
  target_channel: progress.target_channel ?? fallback?.target_channel,
  latest_version: progress.target_version ?? fallback?.latest_version,
  latest_commit: progress.target_commit ?? fallback?.latest_commit,
  latest_commit_url: progress.target_commit_url ?? fallback?.latest_commit_url,
  latest_ui_version: progress.target_ui_version ?? fallback?.latest_ui_version,
  latest_ui_commit: progress.target_ui_commit ?? fallback?.latest_ui_commit,
  latest_ui_commit_url: progress.target_ui_commit_url ?? fallback?.latest_ui_commit_url,
  docker_image: progress.target_image ?? fallback?.docker_image,
  docker_tag: progress.target_tag ?? fallback?.docker_tag,
  release_name: progress.release_name ?? fallback?.release_name,
  release_tag: progress.release_tag ?? fallback?.release_tag,
  release_notes: progress.release_notes ?? fallback?.release_notes,
  release_url: progress.release_url ?? fallback?.release_url,
  release_published_at: progress.release_published_at ?? fallback?.release_published_at,
  update_available: isRunningProgress(progress),
  updater_available: true,
});
