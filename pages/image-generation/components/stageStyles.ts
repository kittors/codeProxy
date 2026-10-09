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
      : "h-[clamp(240px,42vh,400px)] sm:h-[clamp(260px,38vh,440px)]";

  // 只用语义令牌：失败和面板里的危险提示条同一种样子（玫红淡底 + 中性正文），
  // 画布和其它凹陷区域一样用 subtle 底。弹窗里的画布不描边：淡底本身就分出了这块区域。
  const tone = failed
    ? "bg-rose-500/[0.08] text-ink-2"
    : hasImage
      ? "bg-subtle"
      : "bg-subtle text-ink-3";

  return ["relative overflow-hidden rounded-2xl transition-all duration-200", size, tone].join(" ");
}
