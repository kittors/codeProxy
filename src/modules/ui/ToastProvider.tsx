import { createContext, type PropsWithChildren, use, useCallback, useMemo } from "react";
import { GoeyToaster, goeyToast } from "goey-toast";
import "goey-toast/styles.css";
import { useTheme } from "@/modules/ui/ThemeProvider";

type ToastType = "success" | "error" | "info" | "warning";

interface ToastContextState {
  notify: (input: { type?: ToastType; message: string; duration?: number }) => void;
}

const ToastContext = createContext<ToastContextState | null>(null);

export function ToastProvider({ children }: PropsWithChildren) {
  const {
    state: { mode },
  } = useTheme();

  const notify = useCallback(
    (input: { type?: ToastType; message: string; duration?: number }) => {
      const type = input.type ?? "info";
      const options = input.duration
        ? { timing: { displayDuration: input.duration } }
        : {};

      switch (type) {
        case "success":
          goeyToast.success(input.message, options);
          break;
        case "error":
          goeyToast.error(input.message, options);
          break;
        case "warning":
          goeyToast.warning(input.message, options);
          break;
        case "info":
        default:
          goeyToast.info(input.message, options);
          break;
      }
    },
    [],
  );

  const value = useMemo<ToastContextState>(() => ({ notify }), [notify]);

  return (
    <ToastContext value={value}>
      <GoeyToaster
        position="top-left"
        theme={mode}
        preset="smooth"
        showProgress
      />
      {children}
    </ToastContext>
  );
}

export const useToast = (): ToastContextState => {
  const context = use(ToastContext);
  if (!context) {
    throw new Error("useToast 必须在 ToastProvider 内使用");
  }
  return context;
};
