import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, RefreshCw } from "lucide-react";
import type {
  UpdateCheckResponse,
  UpdateProgressResponse,
} from "@code-proxy/api-client/endpoints/update";
import { Button, Modal } from "@code-proxy/ui";
import type { UpdateLinkState } from "../progress/progressStream";
import { UpdateProgressPanel } from "./UpdateProgressPanel";
import { selectLocalizedReleaseNotes } from "../model/releaseNotes";
import {
  candidateFromProgress,
  formatUpdateStatusMessage,
  isAlreadyUpToDateMessage,
  shortCommit,
  uiVersionLabel,
  versionLabel,
} from "../model/updateModel";

const LazyRichMarkdown = lazy(() =>
  import("@features/log-content-viewer/log-content/rendering-markdown").then((module) => ({
    default: module.RichMarkdown,
  })),
);

const RELEASE_NOTES_PROSE = `prose prose-sm dark:prose-invert max-w-none break-words leading-relaxed
  prose-headings:mt-3 prose-headings:mb-2 prose-headings:font-semibold
  prose-h1:text-base prose-h2:text-sm prose-h3:text-sm
  prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5
  prose-code:rounded-md prose-code:bg-slate-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-sm prose-code:font-mono prose-code:text-slate-700 prose-code:before:content-none prose-code:after:content-none
  dark:prose-code:bg-neutral-800 dark:prose-code:text-slate-300
  prose-pre:rounded-lg prose-pre:bg-slate-900 prose-pre:text-xs dark:prose-pre:bg-neutral-900
  prose-a:break-all prose-a:text-indigo-600 dark:prose-a:text-indigo-300`;

/**
 * One row of the version summary.
 *
 * The previous modal rendered six separate cards — current and target for the
 * service, the panel, plus the image — which pushed the release notes and any
 * progress below the fold. A version change is a from/to pair, so it is shown as one.
 */
function VersionRow({
  label,
  from,
  to,
  commit,
  commitUrl,
  unchanged,
}: {
  label: string;
  from: string;
  to: string;
  commit?: string;
  commitUrl?: string;
  unchanged: boolean;
}) {
  const { t } = useTranslation();
  const short = shortCommit(commit);

  return (
    <div className="flex min-w-0 items-baseline justify-between gap-3 py-2">
      <dt className="shrink-0 text-xs text-slate-500 dark:text-white/45">{label}</dt>
      <dd className="flex min-w-0 items-baseline gap-1.5 font-mono text-xs">
        <span className="truncate text-slate-500 dark:text-white/45">{from}</span>
        {unchanged ? null : (
          <>
            <ArrowRight size={11} className="shrink-0 text-slate-400 dark:text-white/30" />
            <span className="truncate font-medium text-slate-900 dark:text-white">{to}</span>
          </>
        )}
        {!unchanged && short ? (
          commitUrl ? (
            <a
              href={commitUrl}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 text-indigo-600 hover:underline dark:text-indigo-300"
            >
              {short}
            </a>
          ) : (
            <span className="shrink-0 text-slate-400 dark:text-white/35">{short}</span>
          )
        ) : null}
        {unchanged ? (
          <span className="shrink-0 text-slate-400 dark:text-white/35">
            {t("auto_update.unchanged")}
          </span>
        ) : null}
      </dd>
    </div>
  );
}

function ReleaseNotes({ candidate }: { candidate: UpdateCheckResponse }) {
  const { i18n, t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const raw = candidate.release_notes?.trim() ?? "";
  const notes = useMemo(() => selectLocalizedReleaseNotes(raw, i18n.language), [i18n.language, raw]);
  const label = candidate.release_name?.trim() || candidate.release_tag?.trim() || "";

  const publishedAt = useMemo(() => {
    const value = candidate.release_published_at?.trim();
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" }).format(date);
  }, [candidate.release_published_at, i18n.language]);

  useEffect(() => setExpanded(false), [raw]);

  if (!notes) return null;

  return (
    <section className="min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold text-slate-900 dark:text-white">
          {t("auto_update.release_notes")}
          {label || publishedAt ? (
            <span
              data-testid="update-release-meta"
              className="ml-2 font-normal text-slate-400 dark:text-white/40"
            >
              {[label, publishedAt].filter(Boolean).join(" · ")}
            </span>
          ) : null}
        </h3>
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

      <div
        data-testid="update-release-notes"
        className={`mt-2 overflow-y-auto break-words rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 dark:border-neutral-800 dark:bg-neutral-900/50 dark:text-slate-200 ${
          expanded ? "max-h-72" : "max-h-32"
        }`}
      >
        <Suspense
          fallback={<pre className="whitespace-pre-wrap break-words text-xs">{notes}</pre>}
        >
          <LazyRichMarkdown proseClasses={RELEASE_NOTES_PROSE} text={notes} />
        </Suspense>
      </div>

      <Button variant="ghost" size="xs" onClick={() => setExpanded((previous) => !previous)}>
        {expanded ? t("auto_update.release_notes_show_less") : t("auto_update.release_notes_show_more")}
      </Button>
    </section>
  );
}

function updaterUnavailableKey(candidate?: UpdateCheckResponse | null) {
  switch (candidate?.updater_health_status) {
    case "token_missing":
      return "auto_update.updater_token_missing";
    case "auth_failed":
      return "auto_update.updater_auth_failed";
    case "upgrade_required":
      return "auto_update.updater_upgrade_required";
    default:
      return "auto_update.updater_unavailable";
  }
}

export function UpdateModal({
  open,
  candidate,
  progress = null,
  link = "reconnecting",
  stale = false,
  checking = false,
  updating = false,
  completed = false,
  failed = false,
  error = null,
  onApply,
  onClose,
}: {
  open: boolean;
  candidate: UpdateCheckResponse | null;
  progress?: UpdateProgressResponse | null;
  link?: UpdateLinkState;
  stale?: boolean;
  checking?: boolean;
  updating?: boolean;
  completed?: boolean;
  failed?: boolean;
  error?: string | null;
  onApply: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  const showProgress = Boolean(progress) || updating;
  const display = progress ? candidateFromProgress(progress, candidate) : candidate;

  const upToDate = Boolean(
    display &&
      !display.update_available &&
      (!display.message || isAlreadyUpToDateMessage(display.message)),
  );
  const canUpdate = Boolean(
    display?.enabled && display.update_available && display.updater_available,
  );

  const title = completed
    ? t("auto_update.completed_title")
    : failed
      ? t("auto_update.failed")
      : showProgress
        ? t("auto_update.updating_title")
        : upToDate
          ? t("auto_update.up_to_date_title")
          : t("auto_update.title");

  const description = completed
    ? t("auto_update.completed_description")
    : failed
      ? t("auto_update.failed_description")
      : showProgress
        ? t("auto_update.updating_description")
        : upToDate
          ? t("auto_update.up_to_date_description")
          : t("auto_update.description");

  const message =
    upToDate && isAlreadyUpToDateMessage(display?.message)
      ? ""
      : formatUpdateStatusMessage(display?.message);

  const serviceUnchanged = !display?.latest_version || display.latest_version === display.current_version;
  const uiUnchanged = !display?.latest_ui_version || display.latest_ui_version === display.current_ui_version;

  return (
    <Modal
      open={open}
      title={title}
      description={description}
      maxWidth="max-w-lg"
      bodyTestId="update-details-modal-body"
      // Closing mid-update would hide a running operation the user cannot cancel.
      onClose={() => {
        if (!updating) onClose();
      }}
      footer={
        completed ? (
          <Button variant="primary" onClick={() => window.location.reload()}>
            {t("auto_update.refresh_page")}
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={updating}>
              {t("common.close")}
            </Button>
            {failed || !showProgress ? (
              <Button
                variant="primary"
                onClick={onApply}
                disabled={checking || updating || !canUpdate}
              >
                {updating ? <RefreshCw size={14} className="animate-spin" /> : null}
                {updating ? t("auto_update.updating") : t("auto_update.update_now")}
              </Button>
            ) : null}
          </>
        )
      }
    >
      <div className="min-w-0 space-y-4">
        {checking ? (
          <p className="flex items-center gap-2 text-sm text-slate-600 dark:text-white/60">
            <RefreshCw size={14} className="animate-spin" />
            {t("common.loading")}
          </p>
        ) : null}

        {error ? (
          <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-500/10 dark:text-rose-200">
            {error}
          </p>
        ) : null}

        {display ? (
          <>
            <dl className="min-w-0 divide-y divide-slate-100 rounded-xl border border-slate-200 px-3 dark:divide-neutral-800 dark:border-neutral-800">
              <VersionRow
                label={t("auto_update.current_service")}
                from={versionLabel(
                  display.current_version,
                  display.current_commit,
                  display.target_channel,
                )}
                to={versionLabel(
                  display.latest_version,
                  display.latest_commit,
                  display.target_channel,
                )}
                commit={display.latest_commit}
                commitUrl={display.latest_commit_url}
                unchanged={serviceUnchanged}
              />
              <VersionRow
                label={t("auto_update.current_ui")}
                from={uiVersionLabel(
                  display.current_ui_version,
                  display.current_ui_commit,
                  display.target_channel,
                )}
                to={uiVersionLabel(
                  display.latest_ui_version,
                  display.latest_ui_commit,
                  display.target_channel,
                )}
                commit={display.latest_ui_commit}
                commitUrl={display.latest_ui_commit_url}
                unchanged={uiUnchanged}
              />
              <div className="flex min-w-0 items-baseline justify-between gap-3 py-2">
                <dt className="shrink-0 text-xs text-slate-500 dark:text-white/45">
                  {t("auto_update.image")}
                </dt>
                <dd
                  data-testid="update-image-value"
                  className="truncate font-mono text-xs text-slate-600 dark:text-white/60"
                >
                  {[display.docker_image, display.docker_tag].filter(Boolean).join(":") || "--"}
                </dd>
              </div>
            </dl>

            {showProgress ? (
              <UpdateProgressPanel
                progress={progress}
                link={link}
                stale={stale}
                failed={failed}
                completed={completed}
              />
            ) : null}

            {!showProgress && message ? (
              <p className="whitespace-pre-line break-words rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
                {message}
              </p>
            ) : null}

            {!showProgress && !display.updater_available ? (
              <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
                {t(updaterUnavailableKey(display))}
              </p>
            ) : null}

            {!showProgress && (!display.enabled || upToDate) ? (
              <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200">
                {!display.enabled ? t("auto_update.disabled") : t("auto_update.no_update")}
              </p>
            ) : null}

            {!completed ? <ReleaseNotes candidate={display} /> : null}
          </>
        ) : null}
      </div>
    </Modal>
  );
}
