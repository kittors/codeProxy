import { VendorIcon } from "@code-proxy/assets";

export function normalizeChannelAuthType(authType?: string | null): "oauth" | "api" | "" {
  const raw = String(authType ?? "")
    .trim()
    .toLowerCase();
  if (raw === "oauth") return "oauth";
  if (raw === "api" || raw === "api_key" || raw === "apikey") return "api";
  return "";
}

/**
 * 渠道认证方式的小标签。OAuth / API 只是类型说明、不是状态，两者都用中性灰，
 * 靠文字区分；API 的底色深一档，扫一眼也能分开。都不描边。
 */
export function channelAuthTypeBadgeClass(authType: "oauth" | "api" | ""): string {
  if (authType === "api") {
    return "bg-selected text-ink-2";
  }
  if (authType === "oauth") {
    return "bg-hover text-ink-2";
  }
  return "bg-hover text-ink-3";
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
