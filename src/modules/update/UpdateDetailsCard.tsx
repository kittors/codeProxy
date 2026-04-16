import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";
import { apiClient } from "@/lib/http/client";
import { updateApi, type UpdateCheckResponse } from "@/lib/http/apis/update";
import { Button } from "@/modules/ui/Button";
import { Card } from "@/modules/ui/Card";
import { useToast } from "@/modules/ui/ToastProvider";

const DEFAULT_HEARTBEAT_INTERVAL_MS = 2000;
const DEFAULT_HEARTBEAT_TIMEOUT_MS = 180000;

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

export function UpdateDetailsCard({
  heartbeatIntervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS,
  heartbeatTimeoutMs = DEFAULT_HEARTBEAT_TIMEOUT_MS,
}: {
  heartbeatIntervalMs?: number;
  heartbeatTimeoutMs?: number;
}) {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [candidate, setCandidate] = useState<UpdateCheckResponse | null>(null);
  const [checked, setChecked] = useState(false);
  const [checking, setChecking] = useState(false);
  const [updating, setUpdating] = useState(false);

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

  const checkUpdate = useCallback(async () => {
    setChecking(true);
    setChecked(true);
    try {
      const info = await updateApi.check();
      setCandidate(info);
      if (!info.enabled) {
        notify({ type: "info", message: t("auto_update.disabled") });
      } else if (!info.update_available) {
        notify({ type: "success", message: t("auto_update.no_update") });
      }
    } catch (err: unknown) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("auto_update.check_failed"),
      });
    } finally {
      setChecking(false);
    }
  }, [notify, t]);

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
  const canUpdate = Boolean(candidate?.enabled && candidate.update_available);

  return (
    <Card
      title={t("auto_update.system_title")}
      description={t("auto_update.system_description")}
      actions={
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void checkUpdate()}
          disabled={checking}
        >
          <RefreshCw size={13} className={checking ? "animate-spin" : ""} />
          {t("auto_update.check_button")}
        </Button>
      }
    >
      <div className="space-y-4">
        {!checked ? (
          <p className="text-sm text-slate-600 dark:text-white/60">
            {t("auto_update.system_idle")}
          </p>
        ) : null}

        {candidate ? (
          <>
            <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm dark:border-neutral-800 dark:bg-neutral-900/50">
              <div className="flex justify-between gap-3">
                <span className="text-slate-500 dark:text-white/55">
                  {t("auto_update.current")}
                </span>
                <span className="font-mono text-slate-900 dark:text-white">
                  {candidate.current_version || candidate.current_commit || "--"}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500 dark:text-white/55">{t("auto_update.target")}</span>
                <span className="font-mono text-slate-900 dark:text-white">
                  {candidate.latest_version || candidate.latest_commit || "--"}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500 dark:text-white/55">{t("auto_update.image")}</span>
                <span className="truncate font-mono text-slate-900 dark:text-white">
                  {candidate.docker_image}:{candidate.docker_tag}
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

            {!candidate.updater_available ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
                {t("auto_update.updater_unavailable")}
              </p>
            ) : null}

            {!canUpdate ? (
              <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">
                {candidate.enabled ? t("auto_update.no_update") : t("auto_update.disabled")}
              </p>
            ) : null}

            <div className="flex justify-end">
              <Button
                variant="primary"
                onClick={() => void applyUpdate()}
                disabled={updating || !canUpdate || !candidate.updater_available}
              >
                {updating ? <RefreshCw size={14} className="animate-spin" /> : null}
                {updating ? t("auto_update.updating") : t("auto_update.update_now")}
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </Card>
  );
}
