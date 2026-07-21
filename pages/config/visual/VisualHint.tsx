import { Info } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { Card as BaseCard, HoverTooltip, ToggleSwitch as BaseToggleSwitch } from "@code-proxy/ui";

export function HintLabel({ label, hint }: { label: ReactNode; hint?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span>{label}</span>
      {hint ? (
        <HoverTooltip content={hint} placement="top">
          <span
            role="button"
            tabIndex={0}
            aria-label={typeof hint === "string" ? hint : undefined}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            className="inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-400 transition hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/35 dark:text-white/40 dark:hover:text-white/75 dark:focus-visible:ring-white/15"
          >
            <Info size={14} aria-hidden="true" />
          </span>
        </HoverTooltip>
      ) : null}
    </span>
  );
}

export function HintCard({ title, description, ...props }: ComponentProps<typeof BaseCard>) {
  return (
    <BaseCard {...props} title={title ? <HintLabel label={title} hint={description} /> : title} />
  );
}

export function HintToggle({
  label,
  description,
  ...props
}: ComponentProps<typeof BaseToggleSwitch>) {
  if (!label && !description) return <BaseToggleSwitch {...props} />;

  return (
    <BaseToggleSwitch
      {...props}
      label={<HintLabel label={label} hint={description} />}
      ariaLabel={typeof label === "string" ? label : props.ariaLabel}
    />
  );
}
