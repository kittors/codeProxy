import type { AuditLogCallChainStep, AuditLogIdentity } from "@code-proxy/api-client";

/**
 * The backend records three outcomes, and rendering two of them identically hid
 * the distinction that matters most on this page: "the server refused this" and
 * "the server tried and errored" are different events with different follow-ups.
 */
export const RESULT_BADGE: Record<string, { labelKey: string; className: string }> = {
  success: {
    labelKey: "identity_admin.result_success",
    className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  denied: {
    labelKey: "identity_admin.result_denied",
    className: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  failed: {
    labelKey: "identity_admin.result_failed",
    className: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  },
};

export function resultBadge(result: string) {
  return RESULT_BADGE[result] ?? RESULT_BADGE.failed;
}

export function formatActor(item: AuditLogIdentity): string {
  const user =
    item.actor_display_name?.trim() ||
    item.actor_username?.trim() ||
    item.actor_user_id ||
    item.actor_kind;
  const tenant = item.tenant_name?.trim() || item.tenant_slug?.trim() || item.tenant_id || "—";
  return `${tenant} / ${user}`;
}

export function formatWhatHappened(item: AuditLogIdentity): string {
  const resource = item.resource_id
    ? `${item.resource_type} · ${item.resource_id}`
    : item.resource_type;
  return resource || item.action || "—";
}

export function asCallChain(value: unknown): AuditLogCallChainStep[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (step): step is AuditLogCallChainStep => Boolean(step) && typeof step === "object",
  );
}
