import { useState } from "react";
import { Hash } from "@code-proxy/ui/icons";
import { Icon as SatinIcon } from "satin-ui/react";
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
        className="sn-btn !h-5 !w-5 !p-0 shrink-0 !rounded-md !bg-ink/[0.05] !text-2xs font-semibold !text-ink-3 !shadow-none hover:!bg-ink/[0.08] hover:!text-ink-2 dark:!bg-white/[0.07] dark:hover:!bg-white/[0.1]"
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
        <span
          className={copied ? "sn-swap sn-on" : "sn-swap"}
          aria-hidden="true"
        >
          <span className="sn-a">
            <Hash size={11} />
          </span>
          <span className="sn-b text-emerald-500">
            <SatinIcon name="check" size={11} />
          </span>
        </span>
      </button>
    </HoverTooltip>
  );
}
