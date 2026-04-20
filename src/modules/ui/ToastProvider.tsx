import { createContext, type PropsWithChildren, use, useCallback, useMemo } from "react";
import { GoeyToaster, goeyToast } from "goey-toast";
import "goey-toast/styles.css";
import "@/modules/ui/ToastProvider.css";
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

const TOAST_WRAPPER_CLASSNAME = "!max-w-[min(calc(100vw-2rem),42rem)] min-w-0";
const TOAST_CONTENT_CLASSNAME =
  "!max-w-[min(calc(100vw-2rem),42rem)] min-w-0 overflow-hidden";
const TOAST_HEADER_CLASSNAME = "flex min-w-0 max-w-full items-start";
const MULTILINE_TEXT_CLASSNAME =
  "!max-w-full min-w-0 !whitespace-pre-line break-words [overflow-wrap:anywhere] !leading-5";

const mergeClassName = (baseClassName: string, className?: string) =>
  [baseClassName, className].filter(Boolean).join(" ");

const mergeToastClassNames = (classNames?: ToastClassNames): ToastClassNames => ({
  ...classNames,
  wrapper: mergeClassName(TOAST_WRAPPER_CLASSNAME, classNames?.wrapper),
  content: mergeClassName(TOAST_CONTENT_CLASSNAME, classNames?.content),
  header: mergeClassName(TOAST_HEADER_CLASSNAME, classNames?.header),
  title: mergeClassName(MULTILINE_TEXT_CLASSNAME, classNames?.title),
  description: mergeClassName(MULTILINE_TEXT_CLASSNAME, classNames?.description),
});

const shouldUseDescriptionBody = (message: string) => message.includes("\n") || message.length > 80;

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

      const defaultTitles: Record<ToastType, string> = {
        success: "Success",
        error: "Error",
        warning: "Warning",
        info: "Info",
      };
      const title = input.title ?? (shouldUseDescriptionBody(input.message) ? defaultTitles[type] : input.message);
      const options: Record<string, unknown> = {
        duration: input.duration ?? 1500,
      };
      if (input.title || title !== input.message) {
        options.description = input.message;
      }
      if (input.action) {
        options.action = input.action;
      }
      options.classNames = mergeToastClassNames(input.classNames);

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
