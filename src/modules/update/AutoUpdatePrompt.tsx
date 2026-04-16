import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";
import { apiClient } from "@/lib/http/client";
import { updateApi, type UpdateCheckResponse } from "@/lib/http/apis/update";
import { useAuth } from "@/modules/auth/AuthProvider";
import { Button } from "@/modules/ui/Button";
import { Modal } from "@/modules/ui/Modal";
import { useToast } from "@/modules/ui/ToastProvider";

const DISMISSED_VERSION_KEY = "clirelay.auto-update.dismissed-version";
const DEFAULT_INITIAL_DELAY_MS = 2500;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 2000;
const DEFAULT_HEARTBEAT_TIMEOUT_MS = 180000;

const updateIdentity = (info: UpdateCheckResponse | null) =>
  info?.latest_commit ||
  info?.latest_version ||
  `${info?.docker_image ?? ""}:${info?.docker_tag ?? ""}`;

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

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
  const [candidate, setCandidate] = useState<UpdateCheckResponse | null>(null);
  const [updating, setUpdating] = useState(false);
  const checkingRef = useRef(false);

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
          if (identity && localStorage.getItem(DISMISSED_VERSION_KEY) === identity) return;
          setCandidate(info);
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

  const waitForHeartbeat = useCallback(async () => {
    const deadline = Date.now() + heartbeatTimeoutMs;
    await sleep(Math.min(heartbeatIntervalMs, 3000));
    while (Date.now() < deadline) {
      try {
        await apiClient.get("/system-stats", {
          timeoutMs: Math.min(5000, heartbeatIntervalMs + 3000),
        });
        return true;
      } catch {
        await sleep(heartbeatIntervalMs);
      }
    }
    return false;
  }, [heartbeatIntervalMs, heartbeatTimeoutMs]);

  const dismiss = useCallback(() => {
    const identity = updateIdentity(candidate);
    if (identity) {
      localStorage.setItem(DISMISSED_VERSION_KEY, identity);
    }
    setCandidate(null);
  }, [candidate]);

  const applyUpdate = useCallback(async () => {
    setUpdating(true);
    try {
      await updateApi.apply();
      const ok = await waitForHeartbeat();
      if (!ok) {
        notify({ type: "warning", message: t("auto_update.timeout") });
        return;
      }
      notify({ type: "success", message: t("auto_update.success") });
      window.location.reload();
    } catch (err: unknown) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("auto_update.failed"),
      });
      setUpdating(false);
    }
  }, [notify, t, waitForHeartbeat]);

  const releaseNotes = candidate?.release_notes?.trim() || t("auto_update.no_release_notes");

  return (
    <Modal
      open={Boolean(candidate)}
      title={t("auto_update.title")}
      description={t("auto_update.description")}
      maxWidth="max-w-2xl"
      onClose={() => {
        if (!updating) dismiss();
      }}
      footer={
        <>
          <Button variant="secondary" onClick={dismiss} disabled={updating}>
            {t("auto_update.later")}
          </Button>
          <Button variant="primary" onClick={() => void applyUpdate()} disabled={updating}>
            {updating ? <RefreshCw size={14} className="animate-spin" /> : null}
            {updating ? t("auto_update.updating") : t("auto_update.update_now")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm dark:border-neutral-800 dark:bg-neutral-900/50">
          <div className="flex justify-between gap-3">
            <span className="text-slate-500 dark:text-white/55">{t("auto_update.current")}</span>
            <span className="font-mono text-slate-900 dark:text-white">
              {candidate?.current_version || candidate?.current_commit || "--"}
            </span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-slate-500 dark:text-white/55">{t("auto_update.target")}</span>
            <span className="font-mono text-slate-900 dark:text-white">
              {candidate?.latest_version || candidate?.latest_commit || "--"}
            </span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-slate-500 dark:text-white/55">{t("auto_update.image")}</span>
            <span className="truncate font-mono text-slate-900 dark:text-white">
              {candidate?.docker_image}:{candidate?.docker_tag}
            </span>
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">
            {t("auto_update.release_notes")}
          </h3>
          <pre className="max-h-72 whitespace-pre-wrap rounded-xl border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-700 dark:border-neutral-800 dark:bg-neutral-950 dark:text-slate-200">
            {releaseNotes}
          </pre>
        </div>

        {!candidate?.updater_available ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
            {t("auto_update.updater_unavailable")}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
