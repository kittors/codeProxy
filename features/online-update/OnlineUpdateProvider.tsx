import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type PropsWithChildren,
} from "react";
import { useTranslation } from "react-i18next";
import { buttonClassName, useToast } from "@code-proxy/ui";
import { UpdateModal } from "./ui/UpdateModal";
import { useOnlineUpdate, type OnlineUpdateState } from "./useOnlineUpdate";
import {
  formatUpdateStatusMessage,
  isAlreadyUpToDateMessage,
  updateDisplayVersion,
  updateIdentity,
} from "./model/updateModel";

const INITIAL_CHECK_DELAY_MS = 2500;

interface OnlineUpdateContextValue {
  state: OnlineUpdateState;
  /** Runs a check and opens the modal with the result. Used by the system page. */
  checkNow: () => void;
  openModal: () => void;
}

const OnlineUpdateContext = createContext<OnlineUpdateContextValue | null>(null);

/**
 * Owns online update for the whole app: one background check, one progress
 * subscription, one modal.
 *
 * Two components used to hold this state independently and each render their own
 * modal, arbitrated by a module-global mutex deciding which was allowed to show.
 * A single provider removes both the duplication and the mutex.
 *
 * `enabled` is a prop rather than something read from an auth provider because this
 * lives in features/, which the project's import boundaries restrict to depending on
 * packages/ only. That restriction is deliberate: it is what keeps online update
 * from re-acquiring a dependency on the app shell and breaking on the next refactor.
 */
export function OnlineUpdateProvider({
  enabled,
  initialDelayMs = INITIAL_CHECK_DELAY_MS,
  children,
}: PropsWithChildren<{ enabled: boolean; initialDelayMs?: number }>) {
  const { t } = useTranslation();
  const { notify } = useToast();
  const { state, check, apply, openModal, closeModal } = useOnlineUpdate({ enabled });
  const notifiedRef = useRef(new Set<string>());

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;

    const timer = globalThis.setTimeout(() => {
      void check({ silent: true })
        .then((info) => {
          if (cancelled || !info) return;
          if (!info.enabled || !info.update_available || info.updater_available === false) return;

          // One prompt per available version, so navigating around the panel does
          // not re-nag about an update already declined.
          const identity = updateIdentity(info);
          if (identity && notifiedRef.current.has(identity)) return;
          if (identity) notifiedRef.current.add(identity);

          notify({
            type: "info",
            title: t("auto_update.toast_title"),
            message: t("auto_update.toast_message", { version: updateDisplayVersion(info) }),
            duration: 10000,
            action: { label: t("common.confirm"), onClick: openModal },
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
          // A failed background check must not interrupt the user. The system page
          // offers a manual check that surfaces the error properly.
        });
    }, initialDelayMs);

    return () => {
      cancelled = true;
      globalThis.clearTimeout(timer);
    };
  }, [check, enabled, initialDelayMs, notify, openModal, t]);

  const checkNow = useMemo(
    () => () => {
      openModal();
      void check()
        .then((info) => {
          if (!info) return;
          if (!info.enabled) {
            notify({ type: "info", message: t("auto_update.disabled") });
          } else if (info.update_available) {
            // The modal already shows what is available; a toast would be noise.
          } else if (info.message && !isAlreadyUpToDateMessage(info.message)) {
            notify({ type: "warning", message: formatUpdateStatusMessage(info.message) });
          } else {
            notify({ type: "success", message: t("auto_update.no_update") });
          }
        })
        .catch((cause: unknown) => {
          notify({
            type: "error",
            message: cause instanceof Error ? cause.message : t("auto_update.check_failed"),
          });
        });
    },
    [check, notify, openModal, t],
  );

  const handleApply = () => {
    void apply()
      .then((result) => {
        if (!result.started) {
          notify({
            type: "success",
            message: result.message?.trim() || t("auto_update.no_update"),
          });
        }
      })
      .catch((cause: unknown) => {
        notify({
          type: "error",
          message: cause instanceof Error ? cause.message : t("auto_update.failed"),
        });
      });
  };

  const value = useMemo<OnlineUpdateContextValue>(
    () => ({ state, checkNow, openModal }),
    [checkNow, openModal, state],
  );

  return (
    <OnlineUpdateContext.Provider value={value}>
      {children}
      <UpdateModal
        open={state.open}
        candidate={state.candidate}
        progress={state.progress}
        link={state.link}
        stale={state.stale}
        checking={state.checking}
        updating={state.updating}
        completed={state.completed}
        failed={state.failed}
        error={state.error}
        onApply={handleApply}
        onClose={closeModal}
      />
    </OnlineUpdateContext.Provider>
  );
}

/**
 * Returns null when no provider is mounted, so a page rendered outside the shell
 * (an embed, a test) degrades instead of crashing.
 */
export const useOnlineUpdateContext = () => useContext(OnlineUpdateContext);
