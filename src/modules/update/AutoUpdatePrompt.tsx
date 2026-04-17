import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { updateApi } from "@/lib/http/apis/update";
import { useAuth } from "@/modules/auth/AuthProvider";
import { useToast } from "@/modules/ui/ToastProvider";

const DEFAULT_INITIAL_DELAY_MS = 2500;

const sameCommit = (left?: string, right?: string) => {
  const normalizedLeft = left?.trim().toLowerCase() ?? "";
  const normalizedRight = right?.trim().toLowerCase() ?? "";
  if (!normalizedLeft || !normalizedRight) return false;
  return (
    normalizedLeft.startsWith(normalizedRight) ||
    normalizedRight.startsWith(normalizedLeft)
  );
};

const updateToastVersion = (
  info: Awaited<ReturnType<typeof updateApi.check>>,
) => {
  const backendChanged =
    Boolean(info.latest_commit?.trim()) &&
    !sameCommit(info.current_commit, info.latest_commit);
  if (!backendChanged && info.latest_ui_version?.trim()) {
    return info.latest_ui_version;
  }
  return (
    info.latest_version ||
    info.latest_commit ||
    info.latest_ui_commit ||
    info.docker_tag ||
    ""
  );
};

const updateToastIdentity = (
  info: Awaited<ReturnType<typeof updateApi.check>>,
) =>
  updateToastVersion(info) ||
  info.latest_commit ||
  info.latest_ui_commit ||
  `${info.docker_image ?? ""}:${info.docker_tag ?? ""}`;

export function AutoUpdatePrompt({
  initialDelayMs = DEFAULT_INITIAL_DELAY_MS,
}: {
  initialDelayMs?: number;
}) {
  const { t } = useTranslation();
  const { notify } = useToast();
  const auth = useAuth();
  const checkingRef = useRef(false);
  const notifiedRef = useRef(new Set<string>());

  useEffect(() => {
    let cancelled = false;
    if (auth.state.isRestoring || !auth.state.isAuthenticated) {
      return () => {
        cancelled = true;
      };
    }

    const timer = window.setTimeout(() => {
      if (checkingRef.current) return;
      checkingRef.current = true;
      void updateApi
        .check()
        .then((info) => {
          if (cancelled || !info.enabled || !info.update_available) return;
          const identity = updateToastIdentity(info);
          if (identity && notifiedRef.current.has(identity)) return;
          if (identity) notifiedRef.current.add(identity);
          notify({
            type: "info",
            title: t("auto_update.toast_title"),
            message: t("auto_update.toast_message", {
              version: updateToastVersion(info),
            }),
            duration: 6000,
          });
        })
        .catch(() => {
          // 自动检查失败不打扰用户；系统页仍可手动检查版本。
        })
        .finally(() => {
          checkingRef.current = false;
        });
    }, initialDelayMs);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    auth.state.isAuthenticated,
    auth.state.isRestoring,
    initialDelayMs,
    notify,
    t,
  ]);

  return null;
}
