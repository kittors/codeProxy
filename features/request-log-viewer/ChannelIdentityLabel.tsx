import { VendorIcon } from "@code-proxy/assets";

export function normalizeChannelAuthType(authType?: string | null): "oauth" | "api" | "" {
  const raw = String(authType ?? "")
    .trim()
    .toLowerCase();
  if (raw === "oauth") return "oauth";
  if (raw === "api" || raw === "api_key" || raw === "apikey") return "api";
  return "";
}

export function channelAuthTypeBadgeClass(authType: "oauth" | "api" | ""): string {
  if (authType === "api") {
    return "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-200";
  }
  if (authType === "oauth") {
    return "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200";
  }
  return "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-white/65";
}

export interface ChannelIdentityLabelProps {
  name: string;
  provider?: string | null;
  authType?: string | null;
  apiLabel: string;
  oauthLabel: string;
  iconSize?: number;
  className?: string;
  nameClassName?: string;
}

/**
 * Shared channel identity chip: vendor icon + truncated name + auth-type badge.
 * Used by request-log filter options and the table channel column so both stay
 * visually aligned across narrow/wide column widths.
 */
export function ChannelIdentityLabel({
  name,
  provider,
  authType,
  apiLabel,
  oauthLabel,
  iconSize = 14,
  className,
  nameClassName,
}: ChannelIdentityLabelProps) {
  const trimmedName = String(name || "").trim();
  const displayName = trimmedName || "--";
  const vendor = String(provider ?? "").trim();
  const normalizedAuth = normalizeChannelAuthType(authType);
  const badgeLabel =
    normalizedAuth === "api" ? apiLabel : normalizedAuth === "oauth" ? oauthLabel : "";
  const resolvedNameClassName =
    nameClassName ??
    [
      "text-xs font-medium",
      trimmedName ? "text-slate-700 dark:text-slate-200" : "text-slate-400 dark:text-white/30",
    ].join(" ");

  return (
    <span
      className={["inline-flex min-w-0 max-w-full items-center gap-1.5", className]
        .filter(Boolean)
        .join(" ")}
    >
      {vendor ? (
        <span className="inline-flex shrink-0 items-center" aria-hidden="true">
          <VendorIcon modelId={vendor} size={iconSize} />
        </span>
      ) : null}
      <span
        className={["min-w-0 truncate", resolvedNameClassName].join(" ")}
        title={trimmedName ? displayName : undefined}
      >
        {displayName}
      </span>
      {badgeLabel ? (
        <span
          className={[
            "inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-2xs font-semibold leading-none",
            channelAuthTypeBadgeClass(normalizedAuth),
          ].join(" ")}
        >
          {badgeLabel}
        </span>
      ) : null}
    </span>
  );
}
