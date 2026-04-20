import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";
import { updateApi, type UpdateCheckResponse } from "@/lib/http/apis/update";
import { Button } from "@/modules/ui/Button";
import { Card } from "@/modules/ui/Card";
import { useToast } from "@/modules/ui/ToastProvider";
import { UpdateDetailsModal } from "@/modules/update/UpdateDetailsModal";
import {
  DEFAULT_HEARTBEAT_INTERVAL_MS,
  DEFAULT_HEARTBEAT_TIMEOUT_MS,
  applyUpdateFlow,
  formatUpdateStatusMessage,
} from "@/modules/update/updateShared";

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
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkUpdate = useCallback(async () => {
    setModalOpen(true);
    setChecking(true);
    setChecked(true);
    setError(null);
    try {
      const info = await updateApi.check();
      setCandidate(info);
      if (!info.enabled) {
        notify({ type: "info", message: t("auto_update.disabled") });
      } else if (info.message && !info.update_available) {
        notify({ type: "warning", message: formatUpdateStatusMessage(info.message) });
      } else if (!info.update_available) {
        notify({ type: "success", message: t("auto_update.no_update") });
      }
    } catch (err: unknown) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("auto_update.check_failed"),
      });
      setCandidate(null);
      setError(err instanceof Error ? err.message : t("auto_update.check_failed"));
    } finally {
      setChecking(false);
    }
  }, [notify, t]);

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
        <p className="text-sm text-slate-600 dark:text-white/60">
          {checked && candidate?.enabled === false
            ? t("auto_update.disabled")
            : checked && candidate && !candidate.update_available
              ? t("auto_update.no_update")
              : t("auto_update.system_idle")}
        </p>
      </Card>

      <UpdateDetailsModal
        open={modalOpen}
        candidate={candidate}
        checking={checking}
        updating={updating}
        error={error}
        onApply={() => void applyUpdate()}
        onClose={() => setModalOpen(false)}
      />
    </>
  );
}
