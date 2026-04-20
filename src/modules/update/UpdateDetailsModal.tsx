import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";
import type { UpdateCheckResponse } from "@/lib/http/apis/update";
import { Button } from "@/modules/ui/Button";
import { Modal } from "@/modules/ui/Modal";
import {
  formatUpdateStatusMessage,
  shortCommit,
  uiVersionLabel,
  versionLabel,
} from "@/modules/update/updateShared";

const LazyRichMarkdown = lazy(() =>
  import("@/modules/monitor/log-content/rendering-markdown").then((mod) => ({
    default: mod.RichMarkdown,
  })),
);

const RELEASE_NOTES_PROSE_CLASSES = `prose prose-sm dark:prose-invert max-w-none break-words leading-relaxed
  prose-headings:mt-3 prose-headings:mb-2 prose-headings:font-semibold
  prose-h1:text-base prose-h2:text-sm prose-h3:text-sm
  prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5
  prose-code:rounded-md prose-code:bg-slate-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[13px] prose-code:font-mono prose-code:text-slate-700 prose-code:before:content-none prose-code:after:content-none
  dark:prose-code:bg-neutral-800 dark:prose-code:text-slate-300
  prose-pre:rounded-lg prose-pre:bg-slate-900 prose-pre:text-xs dark:prose-pre:bg-neutral-900
  prose-a:break-all prose-a:text-indigo-600 dark:prose-a:text-indigo-300
  prose-table:border-collapse prose-table:text-sm prose-table:w-full
  prose-th:border prose-th:border-slate-300 prose-th:bg-slate-100 prose-th:px-3 prose-th:py-2 prose-th:text-left
  dark:prose-th:border-neutral-700 dark:prose-th:bg-neutral-800
  prose-td:border prose-td:border-slate-300 prose-td:px-3 prose-td:py-2 dark:prose-td:border-neutral-700`;

function ReleaseNotesMarkdown({ text }: { text: string }) {
  return (
    <div
      data-testid="update-release-notes"
      className="max-h-60 overflow-y-auto break-words rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700 dark:border-neutral-800 dark:bg-neutral-950 dark:text-slate-200"
    >
      <Suspense
        fallback={
          <pre className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700 dark:text-slate-200">
            {text}
          </pre>
        }
      >
        <LazyRichMarkdown proseClasses={RELEASE_NOTES_PROSE_CLASSES} text={text} />
      </Suspense>
    </div>
  );
}

const MAX_RELEASE_NOTE_ITEMS = 5;
const LIST_ITEM_PATTERN = /^\s*(?:[-*+]|\d+\.)\s+/;

function buildReleaseNotesPreview(text: string) {
  const lines = text.split("\n");
  let itemCount = 0;
  let cutoffIndex = lines.length;
  for (let index = 0; index < lines.length; index += 1) {
    if (!LIST_ITEM_PATTERN.test(lines[index])) continue;
    itemCount += 1;
    if (itemCount > MAX_RELEASE_NOTE_ITEMS) {
      cutoffIndex = index;
      break;
    }
  }
  if (cutoffIndex === lines.length) {
    return { text, truncated: false };
  }
  return { text: lines.slice(0, cutoffIndex).join("\n").trimEnd(), truncated: true };
}

export function UpdateDetailsModal({
  open,
  candidate,
  checking = false,
  updating = false,
  error = null,
  onApply,
  onClose,
}: {
  open: boolean;
  candidate: UpdateCheckResponse | null;
  checking?: boolean;
  updating?: boolean;
  error?: string | null;
  onApply: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [releaseNotesExpanded, setReleaseNotesExpanded] = useState(false);

  const canUpdate = Boolean(
    candidate?.enabled && candidate.update_available && candidate.updater_available,
  );
  const modalTitle =
    candidate && !candidate.update_available
      ? t("auto_update.up_to_date_title")
      : t("auto_update.title");
  const modalDescription =
    candidate && !candidate.update_available
      ? t("auto_update.up_to_date_description")
      : t("auto_update.description");
  const releaseNotes = candidate?.release_notes?.trim() || t("auto_update.no_release_notes");
  const showReleaseNotes = Boolean(candidate?.update_available);
  const releaseNotesPreview = useMemo(() => buildReleaseNotesPreview(releaseNotes), [releaseNotes]);
  const visibleReleaseNotes =
    releaseNotesExpanded || !releaseNotesPreview.truncated ? releaseNotes : releaseNotesPreview.text;
  const currentVersion = candidate
    ? versionLabel(candidate.current_version, candidate.current_commit, candidate.target_channel)
    : "--";
  const targetVersion = candidate
    ? versionLabel(candidate.latest_version, candidate.latest_commit, candidate.target_channel)
    : "--";
  const currentUIVersion = candidate
    ? uiVersionLabel(
        candidate.current_ui_version,
        candidate.current_ui_commit,
        candidate.target_channel,
      )
    : "--";
  const targetUIVersion = candidate
    ? uiVersionLabel(
        candidate.latest_ui_version,
        candidate.latest_ui_commit,
        candidate.target_channel,
      )
    : "--";
  const dockerImage = candidate
    ? [candidate.docker_image, candidate.docker_tag].filter(Boolean).join(":")
    : "--";
  const formattedCandidateMessage = formatUpdateStatusMessage(candidate?.message);

  useEffect(() => {
    setReleaseNotesExpanded(false);
  }, [candidate?.latest_commit, candidate?.latest_ui_commit, open]);

  return (
    <Modal
      open={open}
      title={modalTitle}
      description={modalDescription}
      maxWidth="max-w-[min(92vw,900px)]"
      bodyHeightClassName="h-[min(68vh,560px)]"
      bodyTestId="update-details-modal-body"
      onClose={() => {
        if (!updating) onClose();
      }}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={updating}>
            {t("common.close")}
          </Button>
          <Button variant="primary" onClick={onApply} disabled={checking || updating || !canUpdate}>
            {updating ? <RefreshCw size={14} className="animate-spin" /> : null}
            {updating ? t("auto_update.updating") : t("auto_update.update_now")}
          </Button>
        </>
      }
    >
      <div className="min-w-0 space-y-4">
        {checking ? (
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 dark:border-neutral-800 dark:bg-neutral-900/50 dark:text-slate-200">
            <RefreshCw size={14} className="animate-spin" />
            {t("common.loading")}
          </div>
        ) : null}

        {error ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200">
            {error}
          </p>
        ) : null}

        {candidate ? (
          <>
            {formattedCandidateMessage ? (
              <p className="whitespace-pre-line break-words rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
                {formattedCandidateMessage}
              </p>
            ) : null}

            <dl className="grid min-w-0 gap-3 lg:grid-cols-2">
              <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-neutral-800 dark:bg-neutral-900/50">
                <dt className="text-xs font-medium text-slate-500 dark:text-white/55">
                  {t("auto_update.current_service")}
                </dt>
                <dd className="mt-1 break-words font-mono text-sm text-slate-900 dark:text-white">
                  {currentVersion}
                </dd>
                {candidate.current_commit ? (
                  <p className="mt-1 truncate text-xs text-slate-500 dark:text-white/50">
                    {t("auto_update.commit")}: {shortCommit(candidate.current_commit)}
                  </p>
                ) : null}
              </div>
              <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-neutral-800 dark:bg-neutral-900/50">
                <dt className="text-xs font-medium text-slate-500 dark:text-white/55">
                  {t("auto_update.target_service")}
                </dt>
                <dd className="mt-1 break-words font-mono text-sm text-slate-900 dark:text-white">
                  {targetVersion}
                </dd>
                {candidate.latest_commit ? (
                  candidate.latest_commit_url ? (
                    <a
                      href={candidate.latest_commit_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 block truncate text-xs text-indigo-600 hover:underline dark:text-indigo-300"
                    >
                      {t("auto_update.commit")}: {shortCommit(candidate.latest_commit)}
                    </a>
                  ) : (
                    <p className="mt-1 truncate text-xs text-slate-500 dark:text-white/50">
                      {t("auto_update.commit")}: {shortCommit(candidate.latest_commit)}
                    </p>
                  )
                ) : null}
              </div>
              <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-neutral-800 dark:bg-neutral-900/50">
                <dt className="text-xs font-medium text-slate-500 dark:text-white/55">
                  {t("auto_update.current_ui")}
                </dt>
                <dd className="mt-1 break-words font-mono text-sm text-slate-900 dark:text-white">
                  {currentUIVersion}
                </dd>
                {candidate.current_ui_commit ? (
                  <p className="mt-1 truncate text-xs text-slate-500 dark:text-white/50">
                    {t("auto_update.commit")}: {shortCommit(candidate.current_ui_commit)}
                  </p>
                ) : null}
              </div>
              <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-neutral-800 dark:bg-neutral-900/50">
                <dt className="text-xs font-medium text-slate-500 dark:text-white/55">
                  {t("auto_update.target_ui")}
                </dt>
                <dd className="mt-1 break-words font-mono text-sm text-slate-900 dark:text-white">
                  {targetUIVersion}
                </dd>
                {candidate.latest_ui_commit ? (
                  candidate.latest_ui_commit_url ? (
                    <a
                      href={candidate.latest_ui_commit_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 block truncate text-xs text-indigo-600 hover:underline dark:text-indigo-300"
                    >
                      {t("auto_update.commit")}: {shortCommit(candidate.latest_ui_commit)}
                    </a>
                  ) : (
                    <p className="mt-1 truncate text-xs text-slate-500 dark:text-white/50">
                      {t("auto_update.commit")}: {shortCommit(candidate.latest_ui_commit)}
                    </p>
                  )
                ) : null}
              </div>
              <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-neutral-800 dark:bg-neutral-900/50 lg:col-span-2">
                <dt className="text-xs font-medium text-slate-500 dark:text-white/55">
                  {t("auto_update.image")}
                </dt>
                <dd
                  data-testid="update-image-value"
                  className="mt-1 break-words font-mono text-sm text-slate-900 dark:text-white"
                >
                  {dockerImage}
                </dd>
              </div>
            </dl>

            {showReleaseNotes ? (
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    {t("auto_update.release_notes")}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2">
                    {releaseNotesPreview.truncated ? (
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => setReleaseNotesExpanded((prev) => !prev)}
                      >
                        {releaseNotesExpanded
                          ? t("auto_update.release_notes_show_less")
                          : t("auto_update.release_notes_show_more")}
                      </Button>
                    ) : null}
                    {candidate.release_url ? (
                      <a
                        href={candidate.release_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-300"
                      >
                        {t("auto_update.release_notes_open")}
                      </a>
                    ) : null}
                  </div>
                </div>
                {!releaseNotesExpanded && releaseNotesPreview.truncated ? (
                  <p className="mb-2 text-xs text-slate-500 dark:text-white/55">
                    {t("auto_update.release_notes_preview_notice", {
                      count: MAX_RELEASE_NOTE_ITEMS,
                    })}
                  </p>
                ) : null}
                <ReleaseNotesMarkdown text={visibleReleaseNotes} />
              </div>
            ) : null}

            {!candidate.updater_available ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
                {t("auto_update.updater_unavailable")}
              </p>
            ) : null}

            {!candidate.enabled || (!candidate.update_available && !candidate.message) ? (
              <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">
                {!candidate.enabled ? t("auto_update.disabled") : t("auto_update.no_update")}
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </Modal>
  );
}
