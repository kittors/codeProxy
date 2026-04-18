import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { updateApi, type UpdateCheckResponse } from "@/lib/http/apis/update";
import { useAuth } from "@/modules/auth/AuthProvider";
import { useToast } from "@/modules/ui/ToastProvider";
import { UpdateDetailsModal } from "@/modules/update/UpdateDetailsModal";
import {
  DEFAULT_HEARTBEAT_INTERVAL_MS,
  DEFAULT_HEARTBEAT_TIMEOUT_MS,
  applyUpdateFlow,
  updateDisplayVersion,
  updateIdentity,
} from "@/modules/update/updateShared";

const DEFAULT_INITIAL_DELAY_MS = 2500;

export function AutoUpdatePrompt({
  initialDelayMs = DEFAULT_INITIAL_DELAY_MS,
  heartbeatIntervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS,
  heartbeatTimeoutMs = DEFAULT_HEARTBEAT_TIMEOUT_MS,
}: {
  initialDelayMs?: number;
  heartbeatIntervalMs?: number;
  heartbeatTimeoutMs?: number;
}) {
  const { t } = useTranslation();
  const { notify } = useToast();
  const auth = useAuth();
  const checkingRef = useRef(false);
  const notifiedRef = useRef(new Set<string>());
  const [candidate, setCandidate] = useState<UpdateCheckResponse | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [updating, setUpdating] = useState(false);

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
          const identity = updateIdentity(info);
          if (identity && notifiedRef.current.has(identity)) return;
          if (identity) notifiedRef.current.add(identity);
          notify({
            type: "info",
            title: t("auto_update.toast_title"),
            message: t("auto_update.toast_message", {
              version: updateDisplayVersion(info),
            }),
            duration: 10000,
            action: {
              label: t("common.confirm"),
              onClick: () => {
                setCandidate(info);
                setDetailsOpen(true);
              },
            },
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

  const applyUpdate = useCallback(async () => {
    setUpdating(true);
    try {
      const completed = await applyUpdateFlow({
        candidate,
        heartbeatIntervalMs,
        heartbeatTimeoutMs,
        notify,
        onCheck: setCandidate,
        onSuccess: () => window.location.reload(),
        t,
      });
      if (!completed) {
        setUpdating(false);
      }
    } catch (err: unknown) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("auto_update.failed"),
      });
      setUpdating(false);
    }
  }, [candidate, heartbeatIntervalMs, heartbeatTimeoutMs, notify, t]);

  return (
    <>
      <UpdateDetailsModal
        open={detailsOpen}
        candidate={candidate}
        updating={updating}
        onApply={() => void applyUpdate()}
        onClose={() => setDetailsOpen(false)}
      />
    </>
  );
}
