import { useOptionalAuth } from "./AuthProvider";

/**
 * Permission flags for @features/content-moderation components.
 * Features cannot import AuthProvider, so pages inject these via props.
 * Defaults stay permissive when no auth context is mounted (tests).
 */
export function useModerationPermissions(): { canRead: boolean; canWrite: boolean } {
  const auth = useOptionalAuth();
  return {
    canRead: auth?.can("content_moderation.read") ?? true,
    canWrite: auth?.can("content_moderation.write") ?? true,
  };
}
