import { type TFunction } from "i18next";
import { apiClient } from "@code-proxy/api-client";
import {
  updateApi,
  type UpdateCheckResponse,
  type UpdateProgressResponse,
} from "@code-proxy/api-client/endpoints/update";

export const DEFAULT_HEARTBEAT_INTERVAL_MS = 1000;
export const DEFAULT_HEARTBEAT_TIMEOUT_MS = 180000;

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const normalizedProgressStatus = (progress?: UpdateProgressResponse | null) =>
  progress?.status?.trim().toLowerCase() ?? "";

const normalizedApplyStatus = (status?: string | null) => status?.trim().toLowerCase() ?? "";

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

type ReleaseNotesLocale = "zh-CN" | "en" | "ru";

const RELEASE_NOTES_LOCALE_FALLBACKS: Record<ReleaseNotesLocale, ReleaseNotesLocale[]> = {
  "zh-CN": ["zh-CN", "en", "ru"],
  en: ["en", "zh-CN", "ru"],
  ru: ["ru", "en", "zh-CN"],
};

const resolveReleaseNotesLocale = (language?: string): ReleaseNotesLocale => {
  const normalized = language?.trim().toLowerCase() ?? "";
  if (normalized.startsWith("zh")) return "zh-CN";
  if (normalized.startsWith("ru")) return "ru";
  return "en";
};

const normalizeReleaseNotesMarker = (line: string) =>
  line
    .trim()
    .replace(/^#{1,6}\s+/, "")
    .replace(/^\*\*(.+)\*\*$/, "$1")
    .replace(/^__(.+)__$/, "$1")
    .replace(/[:：]$/, "")
    .trim()
    .toLowerCase();

const releaseNotesMarkerLocale = (line: string): ReleaseNotesLocale | null => {
  const marker = normalizeReleaseNotesMarker(line);
  if (["中文", "简体中文", "chinese", "zh", "zh-cn"].includes(marker)) return "zh-CN";
  if (["english", "英文", "en", "en-us"].includes(marker)) return "en";
  if (["русский", "russian", "ru", "ru-ru"].includes(marker)) return "ru";
  return null;
};

const trimBlankReleaseNoteLines = (lines: string[]) => {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === "") start += 1;
  while (end > start && lines[end - 1].trim() === "") end -= 1;
  return lines.slice(start, end);
};

const localizeBilingualReleaseNoteLine = (line: string, locale: ReleaseNotesLocale) => {
  const parts = line.split(/\s+[\/／]\s+/);
  if (parts.length < 2) return line;
  if (locale === "zh-CN") return parts[0];

  const left = parts[0];
  const right = parts.slice(1).join(" / ").trimStart();
  const prefixMatch = left.match(
    /^(\s*(?:#{1,6}\s*)?(?:[-*+]\s*)?(?:v?\d[\w.+-]*(?:\s*[-:]\s*)?)?)(.*)$/i,
  );
  return `${prefixMatch?.[1] ?? ""}${right}`;
};

export const selectLocalizedReleaseNotes = (text: string, language?: string) => {
  const trimmed = text.trim();
  if (!trimmed) return "";

  const lines = trimmed.split(/\r?\n/);
  const preamble: string[] = [];
  const sections: Array<{ locale: ReleaseNotesLocale; lines: string[] }> = [];
  let currentSection: { locale: ReleaseNotesLocale; lines: string[] } | null = null;

  lines.forEach((line) => {
    const locale = releaseNotesMarkerLocale(line);
    if (locale) {
      currentSection = { locale, lines: [] };
      sections.push(currentSection);
      return;
    }
    if (currentSection) {
      currentSection.lines.push(line);
      return;
    }
    preamble.push(line);
  });

  if (sections.length === 0) return trimmed;

  const requestedLocale = resolveReleaseNotesLocale(language);
  const selectedSection =
    RELEASE_NOTES_LOCALE_FALLBACKS[requestedLocale]
      .map((locale) => sections.find((section) => section.locale === locale))
      .find((section): section is { locale: ReleaseNotesLocale; lines: string[] } =>
        Boolean(section),
      ) ?? sections[0];
  const localizedPreamble = trimBlankReleaseNoteLines(preamble)
    .map((line) => localizeBilingualReleaseNoteLine(line, selectedSection.locale))
    .join("\n")
    .trim();
  const localizedBody = trimBlankReleaseNoteLines(selectedSection.lines).join("\n").trim();

  return [localizedPreamble, localizedBody].filter(Boolean).join("\n\n").trim();
};

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

const mergeProgressTargetMetadata = (
  progress: UpdateProgressResponse | null | undefined,
  target?: UpdateCheckResponse | null,
) => ({
  target_image: progress?.target_image ?? target?.docker_image,
  target_tag: progress?.target_tag ?? target?.docker_tag,
  target_version: progress?.target_version ?? target?.latest_version,
  target_commit: progress?.target_commit ?? target?.latest_commit,
  target_ui_version: progress?.target_ui_version ?? target?.latest_ui_version,
  target_ui_commit: progress?.target_ui_commit ?? target?.latest_ui_commit,
  target_channel: progress?.target_channel ?? target?.target_channel,
});

const createVerifyingProgress = (
  progress: UpdateProgressResponse | null | undefined,
  target?: UpdateCheckResponse | null,
): UpdateProgressResponse => ({
  ...(progress ?? createPendingUpdateProgress(target)),
  ...mergeProgressTargetMetadata(progress, target),
  status: "running",
  stage: "verifying",
  message: "waiting for service health",
  logs: progress?.logs ?? [],
});

const createCompletedProgress = (
  progress: UpdateProgressResponse | null | undefined,
  target?: UpdateCheckResponse | null,
): UpdateProgressResponse => {
  const finishedAt = progress?.finished_at ?? new Date().toISOString();
  return {
    ...(progress ?? createPendingUpdateProgress(target)),
    ...mergeProgressTargetMetadata(progress, target),
    status: "completed",
    stage: "completed",
    message: "update completed",
    updated_at: progress?.updated_at ?? finishedAt,
    finished_at: finishedAt,
    logs: progress?.logs ?? [],
  };
};

const targetNeedsBackendChange = (target?: UpdateCheckResponse | null) =>
  Boolean(target?.latest_commit?.trim()) &&
  !sameCommit(target?.current_commit, target?.latest_commit);

const targetNeedsUiChange = (target?: UpdateCheckResponse | null) =>
  Boolean(target?.latest_ui_commit?.trim()) &&
  !sameCommit(target?.current_ui_commit, target?.latest_ui_commit);

export const matchesAppliedTarget = (
  info: UpdateCheckResponse,
  target?: UpdateCheckResponse | null,
) => {
  if (!target) return !info.update_available;
  const backendNeedsChange = targetNeedsBackendChange(target);
  const uiNeedsChange = targetNeedsUiChange(target);
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
  const reportVerifyingProgress = (progress?: UpdateProgressResponse | null) => {
    const verifyingProgress = createVerifyingProgress(progress ?? lastProgress, target);
    lastProgress = verifyingProgress;
    onProgress?.(verifyingProgress);
    return verifyingProgress;
  };
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
  const initialProgress = await pollProgress();
  const initialStatus = normalizedProgressStatus(initialProgress);
  if (initialStatus === "failed") {
    return {
      ok: false as const,
      latest: lastCheck,
      progress: initialProgress,
      failed: true as const,
    };
  }
  if (initialStatus === "completed") {
    reportVerifyingProgress(initialProgress);
  }
  await sleep(Math.min(heartbeatIntervalMs, 3000));
  while (true) {
    const progress = await pollProgress();
    const status = normalizedProgressStatus(progress);
    if (status === "failed") {
      return { ok: false as const, latest: lastCheck, progress, failed: true as const };
    }
    if (status === "completed") {
      reportVerifyingProgress(progress);
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
  t,
}: {
  candidate?: UpdateCheckResponse | null;
  heartbeatIntervalMs: number;
  heartbeatTimeoutMs: number;
  notify: (input: { type?: "success" | "error" | "info" | "warning"; message: string }) => void;
  onCheck?: (info: UpdateCheckResponse) => void;
  onProgress?: (progress: UpdateProgressResponse) => void;
  t: TFunction;
}) => {
  const response = await updateApi.apply();
  if (normalizedApplyStatus(response.status) === "noop") {
    const message = response.message?.trim() || t("auto_update.no_update");
    const nextCandidate = candidate ? { ...candidate, message, update_available: false } : null;
    if (nextCandidate) onCheck?.(nextCandidate);
    onProgress?.({ status: "idle", stage: "idle", message, logs: [] });
    notify({
      type: isAlreadyUpToDateMessage(message) ? "success" : "warning",
      message: isAlreadyUpToDateMessage(message)
        ? t("auto_update.no_update")
        : formatUpdateStatusMessage(message),
    });
    return false;
  }
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
  onProgress?.(createCompletedProgress(result.progress, target));
  notify({ type: "success", message: t("auto_update.success") });
  return true;
};
