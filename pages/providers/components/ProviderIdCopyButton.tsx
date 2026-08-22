import { useState } from "react";
import { Check, Hash } from "lucide-react";
import { useTranslation } from "react-i18next";
import { HoverTooltip, copyTextToClipboard } from "@code-proxy/ui";

/**
 * Channel id as a copy affordance beside the title.
 *
 * The id used to own a full row of every card just to print a UUID nobody reads
 * at a glance — the single biggest reason a provider card looked busier than an
 * AI account card, which has no such row. It is still one click away when an
 * operator needs it for a channel binding.
 */
export function ProviderIdCopyButton({ id }: { id: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  return (
    <HoverTooltip content={`ID: ${id}`} placement="top">
      <button
        type="button"
        className="inline-flex h-5 shrink-0 items-center gap-0.5 rounded-md bg-slate-100 px-1 text-2xs font-semibold text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-700 dark:bg-white/10 dark:text-white/55 dark:hover:bg-white/15 dark:hover:text-white/80"
        aria-label={t("providers.copy_channel_id")}
        onClick={(event) => {
          event.stopPropagation();
          void copyTextToClipboard(id).then((ok) => {
            if (!ok) return;
            setCopied(true);
            // Revert on the next hover instead of a timer: a timer that fires
            // after the card unmounts sets state on a dead component.
          });
        }}
        onMouseLeave={() => setCopied(false)}
      >
        {copied ? <Check size={11} /> : <Hash size={11} />}
      </button>
    </HoverTooltip>
  );
}
