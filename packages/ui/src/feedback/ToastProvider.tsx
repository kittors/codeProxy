import { createContext, type PropsWithChildren, use, useCallback, useMemo } from "react";
import { ConfirmHost } from "../overlays/confirmDialog";
import { Toaster } from "./Toaster";
import { toast, type ToastAction } from "./toastStore";

type ToastType = "success" | "error" | "info" | "warning";

/** 超过这个长度（或含换行）的消息改放在描述里，标题换成类型名，避免单行胶囊被撑爆。 */
const MAX_TOAST_TITLE_CHARACTERS = 48;

const shouldUseDescriptionBody = (message: string) =>
  message.includes("\n") || message.length > MAX_TOAST_TITLE_CHARACTERS;

interface ToastContextState {
  notify: (input: {
    type?: ToastType;
    title?: string;
    message: string;
    duration?: number;
    action?: ToastAction;
  }) => void;
}

const ToastContext = createContext<ToastContextState | null>(null);

export function ToastProvider({ children }: PropsWithChildren) {
  const notify = useCallback(
    (input: {
      type?: ToastType;
      title?: string;
      message: string;
      duration?: number;
      action?: ToastAction;
    }) => {
      const type = input.type ?? "info";

      const defaultTitles: Record<ToastType, string> = {
        success: "Success",
        error: "Error",
        warning: "Warning",
        info: "Info",
      };
      const title =
        input.title ??
        (shouldUseDescriptionBody(input.message) ? defaultTitles[type] : input.message);

      toast[type](title, {
        duration: input.duration ?? 1500,
        description: input.title || title !== input.message ? input.message : undefined,
        action: input.action,
      });
    },
    [],
  );

  const value = useMemo<ToastContextState>(() => ({ notify }), [notify]);

  return (
    <ToastContext value={value}>
      <Toaster />
      {/* confirmDialog() 的渲染宿主：和提示条一样全局只挂一个。 */}
      <ConfirmHost />
      {children}
    </ToastContext>
  );
}

export const useToast = (): ToastContextState => {
  const context = use(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
};
