import { createContext, type PropsWithChildren, use, useCallback, useMemo } from "react";
import { GoeyToaster, goeyToast } from "goey-toast";
import "goey-toast/styles.css";
import { useTheme } from "@/modules/ui/ThemeProvider";

type ToastType = "success" | "error" | "info" | "warning";
type ToastClassNames = Partial<
  Record<
    | "wrapper"
    | "content"
    | "header"
    | "title"
    | "icon"
    | "description"
    | "actionWrapper"
    | "actionButton",
    string
  >
>;

interface ToastContextState {
  notify: (input: {
    type?: ToastType;
    title?: string;
    message: string;
    duration?: number;
    action?: { label: string; onClick: () => void; successLabel?: string };
    classNames?: ToastClassNames;
  }) => void;
}

const ToastContext = createContext<ToastContextState | null>(null);

export function ToastProvider({ children }: PropsWithChildren) {
  const {
    state: { mode },
  } = useTheme();

  const notify = useCallback(
    (input: {
      type?: ToastType;
      title?: string;
      message: string;
      duration?: number;
      action?: { label: string; onClick: () => void; successLabel?: string };
      classNames?: ToastClassNames;
    }) => {
      const type = input.type ?? "info";

      const _defaultTitles: Record<ToastType, string> = {
        success: "Success",
        error: "Error",
        warning: "Warning",
        info: "Info",
      };
      // Use message as the pill title; only set description when a separate title is provided
      const title = input.title ?? input.message;
      const options: Record<string, unknown> = {
        duration: input.duration ?? 1500,
      };
      if (input.title) {
        options.description = input.message;
      }
      if (input.action) {
        options.action = input.action;
      }
      if (input.classNames) {
        options.classNames = input.classNames;
      }

      switch (type) {
        case "success":
          goeyToast.success(title, options);
          break;
        case "error":
          goeyToast.error(title, options);
          break;
        case "warning":
          goeyToast.warning(title, options);
          break;
        case "info":
        default:
          goeyToast.info(title, options);
          break;
      }
    },
    [],
  );

  const value = useMemo<ToastContextState>(() => ({ notify }), [notify]);

  return (
    <ToastContext value={value}>
      <GoeyToaster position="top-right" theme={mode} preset="smooth" showProgress />
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
