import { type TFunction } from "i18next";
import {
  updateApi,
  type UpdateCheckResponse,
  type UpdateProgressResponse,
} from "@code-proxy/api-client/endpoints/update";

export const DEFAULT_HEARTBEAT_INTERVAL_MS = 1000;
export const DEFAULT_HEARTBEAT_TIMEOUT_MS = 180000;

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
  const parts = line.split(/\s+[/／]\s+/);
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
  update_available: normalizedProgressStatus(progress) === "running",
  updater_available: true,
});

type ProgressListener = (progress: UpdateProgressResponse) => void;

const progressListeners = new Set<ProgressListener>();
let progressStreamController: AbortController | null = null;
let progressStreamTask: Promise<void> | null = null;
let latestProgress: UpdateProgressResponse | null = null;
let updateProgressModalOwner: symbol | null = null;

export const claimUpdateProgressModal = (owner: symbol) => {
  if (updateProgressModalOwner && updateProgressModalOwner !== owner) return false;
  updateProgressModalOwner = owner;
  return true;
};

export const releaseUpdateProgressModal = (owner: symbol) => {
  if (updateProgressModalOwner === owner) updateProgressModalOwner = null;
};

const delay = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const finish = () => {
      globalThis.clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timer = globalThis.setTimeout(finish, ms);
    signal.addEventListener("abort", finish, { once: true });
  });

const publishProgress = (progress: UpdateProgressResponse) => {
  latestProgress = progress;
  progressListeners.forEach((listener) => listener(progress));
};

const ensureProgressStream = () => {
  if (progressStreamTask || progressListeners.size === 0) return;
  const controller = new AbortController();
  progressStreamController = controller;
  progressStreamTask = (async () => {
    while (!controller.signal.aborted && progressListeners.size > 0) {
      try {
        await updateApi.events(publishProgress, { signal: controller.signal });
      } catch {
        // The API container restarts during an update. Reconnect and let the updater
        // replay its latest persisted snapshot instead of manufacturing UI progress.
      }
      if (!controller.signal.aborted && progressListeners.size > 0) {
        await delay(DEFAULT_HEARTBEAT_INTERVAL_MS, controller.signal);
      }
    }
  })().finally(() => {
    if (progressStreamController === controller) progressStreamController = null;
    progressStreamTask = null;
    if (progressListeners.size > 0) ensureProgressStream();
  });
};

export const subscribeUpdateProgress = (listener: ProgressListener) => {
  progressListeners.add(listener);
  const snapshot = latestProgress;
  if (snapshot) queueMicrotask(() => listener(snapshot));
  ensureProgressStream();
  return () => {
    progressListeners.delete(listener);
    if (progressListeners.size === 0) {
      progressStreamController?.abort();
      progressStreamController = null;
      latestProgress = null;
    }
  };
};

const waitForUpdateRun = ({
  runID,
  timeoutMs,
  onProgress,
}: {
  runID: number;
  timeoutMs: number;
  onProgress?: (progress: UpdateProgressResponse) => void;
}) =>
  new Promise<{
    ok: boolean;
    failed: boolean;
    progress: UpdateProgressResponse | null;
  }>((resolve) => {
    let last: UpdateProgressResponse | null = null;
    let settled = false;
    let unsubscribe = () => {};
    const timer = globalThis.setTimeout(() => finish({ ok: false, failed: false }), timeoutMs);
    function finish(result: { ok: boolean; failed: boolean }) {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timer);
      unsubscribe();
      resolve({ ...result, progress: last });
    }
    unsubscribe = subscribeUpdateProgress((progress) => {
      if (progress.run_id !== runID) return;
      last = progress;
      onProgress?.(progress);
      const status = normalizedProgressStatus(progress);
      if (status === "completed") finish({ ok: true, failed: false });
      else if (status === "failed") finish({ ok: false, failed: true });
    });
    if (settled) unsubscribe();
  });

export const applyUpdateFlow = async ({
  candidate,
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
    notify({
      type: isAlreadyUpToDateMessage(message) ? "success" : "warning",
      message: isAlreadyUpToDateMessage(message)
        ? t("auto_update.no_update")
        : formatUpdateStatusMessage(message),
    });
    return false;
  }

  const runID = response.run_id;
  if (typeof runID !== "number" || !Number.isFinite(runID) || runID <= 0) {
    throw new Error("Updater did not return a valid run ID.");
  }
  const target = response.target ?? candidate;
  if (target) onCheck?.(target);
  const result = await waitForUpdateRun({
    runID,
    timeoutMs: heartbeatTimeoutMs,
    onProgress,
  });
  if (!result.ok) {
    const progressMessage = result.progress?.message?.trim();
    notify({
      type: result.failed ? "error" : "warning",
      message: progressMessage || t("auto_update.timeout"),
    });
    return false;
  }
  notify({ type: "success", message: t("auto_update.success") });
  return true;
};
