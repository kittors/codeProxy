import type { PropsWithChildren, ReactNode } from "react";
import { useAuth } from "@app/providers/AuthProvider";

export function PermissionGate({
  permission,
  fallback = null,
  children,
}: PropsWithChildren<{ permission: string; fallback?: ReactNode }>) {
  return useAuth().can(permission) ? children : fallback;
}
