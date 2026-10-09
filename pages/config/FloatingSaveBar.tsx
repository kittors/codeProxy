import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Check, RefreshCw, Save } from "lucide-react";
import { Button } from "@code-proxy/ui";

type SaveBarStatus = "saved" | "dirty" | "saving" | "loading" | "error" | "offline";

interface FloatingSaveBarProps {
  status: SaveBarStatus;
  /** 可视化编辑里改了几项；有数字时状态写成「3 项未保存」，比笼统的「未保存」更有底。 */
  changeCount?: number;
  onSave: () => void;
  onReload: () => void;
  saveDisabled?: boolean;
  reloadDisabled?: boolean;
}

// 状态胶囊只用淡底 + 同色字，不描边（语义色：成功绿、待保存琥珀、保存中天蓝、失败红）。
const STATUS_TONE: Record<SaveBarStatus, { icon?: ReactNode; tone: string; dot?: boolean }> = {
  saved: {
    icon: <Check size={12} strokeWidth={3} />,
    tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  dirty: {
    dot: true,
    tone: "bg-amber-500/10 text-amber-800 dark:text-amber-200",
  },
  saving: {
    tone: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  },
  loading: {
    tone: "bg-ink/[0.05] text-ink-2 dark:bg-white/[0.07]",
  },
  error: {
    tone: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  },
  offline: {
    tone: "bg-ink/[0.05] text-ink-3 dark:bg-white/[0.07]",
  },
};

const STATUS_LABEL_KEYS: Record<SaveBarStatus, string> = {
  saved: "floating_save_bar.saved",
  dirty: "floating_save_bar.unsaved",
  saving: "floating_save_bar.saving",
  loading: "floating_save_bar.loading",
  error: "floating_save_bar.load_failed",
  offline: "floating_save_bar.offline",
};

export function FloatingSaveBar({
  status,
  changeCount,
  onSave,
  onReload,
  saveDisabled,
  reloadDisabled,
}: FloatingSaveBarProps) {
  const { t } = useTranslation();
  const toneConfig = STATUS_TONE[status];

  const shouldShow = status === "dirty" || status === "saving";
  const [visible, setVisible] = useState(false);
  const [rendered, setRendered] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const prevStatusRef = useRef<SaveBarStatus>(status);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const prevStatus = prevStatusRef.current;
    prevStatusRef.current = status;

    if (prevStatus === "saving" && status === "saved") {
      setJustSaved(true);
      setVisible(true);
      setRendered(true);
      clearTimeout(exitTimerRef.current);
      exitTimerRef.current = setTimeout(() => {
        setJustSaved(false);
        setVisible(false);
      }, 1600);
      return;
    }

    if (shouldShow) {
      clearTimeout(exitTimerRef.current);
      setJustSaved(false);
      setRendered(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
    } else if (!justSaved) {
      setVisible(false);
      clearTimeout(exitTimerRef.current);
      exitTimerRef.current = setTimeout(() => setRendered(false), 400);
    }

    return () => clearTimeout(exitTimerRef.current);
  }, [shouldShow, status, justSaved]);

  if (!rendered) return null;

  const displayTone = justSaved ? STATUS_TONE.saved : toneConfig;
  const displayLabel =
    !justSaved && status === "dirty" && changeCount && changeCount > 0
      ? t("config_ui.unsaved_count", { count: changeCount })
      : t(justSaved ? STATUS_LABEL_KEYS.saved : STATUS_LABEL_KEYS[status]);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4"
      aria-live="polite"
    >
      <div
        className={[
          // 实色浮层，和下拉、提示条同一种表面：半透明毛玻璃压在配置表单上会透出底下的字。
          "pointer-events-auto flex items-center gap-3 rounded-2xl bg-elevated px-4 py-2.5 shadow-pop",
          "transition-all duration-[360ms]",
          visible ? "translate-y-0 opacity-100 scale-100" : "translate-y-8 opacity-0 scale-[0.96]",
        ].join(" ")}
        style={{
          // 与全局 --ease-spring / ease-in 同一组曲线（packages/ui/src/utils/motion.ts）。
          transitionTimingFunction: visible
            ? "cubic-bezier(0.3, 1.25, 0.5, 1)"
            : "cubic-bezier(0.4, 0, 1, 1)",
        }}
      >
        <div
          className={[
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold",
            "transition-all duration-300",
            displayTone.tone,
          ].join(" ")}
        >
          {displayTone.icon}
          <span className="tabular-nums">{displayLabel}</span>
          {displayTone.dot && (
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500/60 dark:bg-amber-400/40" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-500 dark:bg-amber-400" />
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={onReload}
            disabled={reloadDisabled}
            className="h-8 gap-1.5 px-2.5 text-xs"
          >
            <RefreshCw size={13} className={status === "loading" ? "animate-spin" : ""} />
            {t("floating_save_bar.reload")}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={onSave}
            disabled={saveDisabled}
            className="h-8 gap-1.5 px-3 text-xs"
          >
            {justSaved ? <Check size={13} /> : <Save size={13} />}
            {justSaved ? t("floating_save_bar.saved") : t("floating_save_bar.save")}
          </Button>
        </div>
      </div>
    </div>
  );
}
