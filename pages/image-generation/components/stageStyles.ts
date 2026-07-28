/**
 * Result-stage styling for the image test modal.
 *
 * Extracted from the page component, which is at its frozen line budget and may
 * only shrink. Keeping it here also isolates the one rule that is easy to get
 * wrong: an error needs a single line, not the full canvas.
 */
export function imageStageClassName({
  errorMessage,
  hasImage,
  hasUploads,
}: {
  errorMessage: string;
  hasImage: boolean;
  hasUploads: boolean;
}): string {
  const failed = Boolean(errorMessage) && !hasImage;

  // A failure collapses the stage. Reserving the full canvas for one line of text
  // is what pushed the dialog past the viewport and forced it to scroll.
  const size = failed
    ? "h-auto"
    : hasUploads
      ? "h-[clamp(220px,34vh,320px)] sm:h-[clamp(240px,36vh,360px)]"
      : "h-[clamp(240px,42vh,400px)] sm:h-[clamp(280px,44vh,440px)]";

  const tone = failed
    ? "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-100"
    : hasImage
      ? "border-slate-200 bg-slate-100 dark:border-neutral-800 dark:bg-black"
      : "border-slate-200 bg-slate-50 text-slate-500 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white/55";

  return ["relative overflow-hidden rounded-2xl border transition-all duration-200", size, tone].join(" ");
}
