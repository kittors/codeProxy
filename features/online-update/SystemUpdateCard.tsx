import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";
import { Button, Card } from "@code-proxy/ui";
import { useOnlineUpdateContext } from "./OnlineUpdateProvider";

/**
 * The system page's entry point into online update.
 *
 * It holds no state of its own — it triggers a check on the shared provider and
 * lets the single modal render the result. Previously this card duplicated the
 * whole check/apply/subscribe flow and rendered a second modal.
 */
export function SystemUpdateCard({ className }: { className?: string }) {
  const { t } = useTranslation();
  const context = useOnlineUpdateContext();

  const state = context?.state;
  const summary = !state?.candidate
    ? t("auto_update.system_idle")
    : state.candidate.enabled === false
      ? t("auto_update.disabled")
      : state.updating
        ? t("auto_update.updating")
        : state.candidate.update_available
          ? t("auto_update.toast_message", {
              version: state.candidate.latest_version ?? state.candidate.docker_tag ?? "",
            })
          : t("auto_update.no_update");

  return (
    <Card
      className={className}
      title={t("auto_update.system_title")}
      description={t("auto_update.system_description")}
      actions={
        <Button
          variant="secondary"
          size="sm"
          onClick={() => context?.checkNow()}
          disabled={!context || state?.checking || state?.updating}
        >
          <RefreshCw size={13} className={state?.checking ? "animate-spin" : ""} />
          {t("auto_update.check_button")}
        </Button>
      }
    >
      <p className="text-sm text-slate-600 dark:text-white/60">{summary}</p>
    </Card>
  );
}
