import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { updateApi } from "@/lib/http/apis/update";
import { useAuth } from "@/modules/auth/AuthProvider";
import { useToast } from "@/modules/ui/ToastProvider";

const DEFAULT_INITIAL_DELAY_MS = 2500;

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
          const identity =
            info.latest_commit ||
            info.latest_version ||
            `${info.docker_image ?? ""}:${info.docker_tag ?? ""}`;
          if (identity && notifiedRef.current.has(identity)) return;
          if (identity) notifiedRef.current.add(identity);
          notify({
            type: "info",
            title: t("auto_update.toast_title"),
            message: t("auto_update.toast_message", {
              version: info.latest_version || info.latest_commit || info.docker_tag || "",
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
  }, [auth.state.isAuthenticated, auth.state.isRestoring, initialDelayMs, notify, t]);

  return null;
}
