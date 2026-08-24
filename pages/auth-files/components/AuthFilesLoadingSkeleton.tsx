import { EntityCardSkeleton, ScrollArea, Skeleton, entityCardGridClass } from "@code-proxy/ui";
import { QuotaBarSkeletonList } from "@features/quota-preview/QuotaBar";
import type { AuthFilesCardColumns, FilesViewMode } from "@code-proxy/domain";

const TABLE_SKELETON_ROWS = 7;

/**
 * First paint of the accounts list, before any account is known.
 *
 * The placeholder follows the view the reader chose. Card view used to fall
 * back to a stack of full-width table rows, which is not the shape of anything
 * the card grid renders — the page redrew from scratch when the data landed
 * rather than filling in what was already outlined.
 *
 * Only for a cold list: once accounts are on screen, a background refresh
 * updates them in place instead of replacing the page with grey.
 */
export function AuthFilesLoadingSkeleton({
  viewMode,
  cardColumns,
  dense,
  cards,
}: {
  viewMode: FilesViewMode;
  cardColumns: AuthFilesCardColumns;
  dense: boolean;
  /** How many placeholder cards to draw; normally one screenful. */
  cards: number;
}) {
  if (viewMode === "table") {
    return (
      <ScrollArea
        className="h-full"
        contentClassName="space-y-2 px-4 py-4 pr-8 sm:py-5 sm:pl-5 sm:pr-8"
        scrollbarTrackInset={0}
      >
        {Array.from({ length: TABLE_SKELETON_ROWS }, (_, index) => (
          <Skeleton key={index} className="h-[84px] w-full" rounded="lg" />
        ))}
      </ScrollArea>
    );
  }

  const safeCards = Math.max(1, Math.min(24, Math.round(cards)));
  return (
    <ScrollArea
      className="items-stretch md:h-full"
      contentClassName={[
        entityCardGridClass({ columns: cardColumns, dense }),
        "px-4 py-4 sm:px-5 sm:py-5 md:pr-8",
      ].join(" ")}
      scrollbarTrackInset={0}
    >
      {Array.from({ length: safeCards }, (_, index) => (
        <EntityCardSkeleton
          key={index}
          dense={dense}
          testId="auth-files-card-skeleton"
          headerRows={2}
        >
          <QuotaBarSkeletonList rows={dense ? 3 : 4} compact={dense} />
        </EntityCardSkeleton>
      ))}
    </ScrollArea>
  );
}
