import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  updateApi,
  type UpdateCheckResponse,
  type UpdateProgressResponse,
} from "@/lib/http/apis/update";
import { useAuth } from "@/modules/auth/AuthProvider";
import { buttonClassName } from "@/modules/ui/Button";
import { useToast } from "@/modules/ui/ToastProvider";
import { UpdateDetailsModal } from "@/modules/update/UpdateDetailsModal";
import {
  DEFAULT_HEARTBEAT_INTERVAL_MS,
  DEFAULT_HEARTBEAT_TIMEOUT_MS,
  applyUpdateFlow,
  createPendingUpdateProgress,
  updateDisplayVersion,
  updateIdentity,
} from "@/modules/update/updateShared";

const DEFAULT_INITIAL_DELAY_MS = 2500;

function canPromptForUpdate(info: UpdateCheckResponse): boolean {
  return info.enabled && !!info.update_available && info.updater_available !== false;
}

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
  const [updateTarget, setUpdateTarget] = useState<UpdateCheckResponse | null>(null);
  const [progress, setProgress] = useState<UpdateProgressResponse | null>(null);
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
          if (cancelled || !canPromptForUpdate(info)) return;
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
            classNames: {
              actionWrapper:
                "clirelay-update-toast-action-wrapper flex justify-end overflow-visible",
              actionButton: buttonClassName({
                size: "xs",
                variant: "default",
                className:
                  "clirelay-update-toast-action !inline-flex !w-auto !min-w-0 !self-end !rounded-full !px-2.5 !text-xs",
              }),
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
    setUpdateTarget(candidate);
    setProgress(createPendingUpdateProgress(candidate));
    setUpdating(true);
    try {
      await applyUpdateFlow({
        candidate,
        heartbeatIntervalMs,
        heartbeatTimeoutMs,
        notify,
        onCheck: setCandidate,
        onProgress: setProgress,
        onSuccess: () => window.location.reload(),
        t,
      });
      setUpdating(false);
    } catch (err: unknown) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("auto_update.failed"),
      });
      setProgress(null);
      setUpdating(false);
    }
  }, [candidate, heartbeatIntervalMs, heartbeatTimeoutMs, notify, t]);

  return (
    <>
      <UpdateDetailsModal
        open={detailsOpen}
        candidate={candidate}
        updateTarget={updateTarget}
        progress={progress}
        updating={updating}
        onApply={() => void applyUpdate()}
        onClose={() => {
          setProgress(null);
          setUpdateTarget(null);
          setDetailsOpen(false);
        }}
      />
    </>
  );
}
