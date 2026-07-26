import type { PropsWithChildren, ReactNode } from "react";
import { useAuth } from "@app/providers/AuthProvider";

export function PermissionGate({
  permission,
  anyOf = [],
  fallback = null,
  children,
}: PropsWithChildren<{ permission: string; anyOf?: string[]; fallback?: ReactNode }>) {
  const { can } = useAuth();
  return can(permission) || anyOf.some((p) => can(p)) ? children : fallback;
}
