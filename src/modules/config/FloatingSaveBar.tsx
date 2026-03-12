import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, RefreshCw, Save } from "lucide-react";
import { Button } from "@/modules/ui/Button";

type SaveBarStatus = "saved" | "dirty" | "saving" | "loading" | "error" | "offline";

interface FloatingSaveBarProps {
    status: SaveBarStatus;
    onSave: () => void;
    onReload: () => void;
    saveDisabled?: boolean;
    reloadDisabled?: boolean;
}

const STATUS_CONFIG: Record<
    SaveBarStatus,
    { label: string; icon?: ReactNode; tone: string; dot?: boolean }
> = {
    saved: {
        label: "Saved",
        icon: <Check size={12} strokeWidth={3} />,
        tone: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-500/15 dark:text-emerald-300",
    },
    dirty: {
        label: "Unsaved",
        dot: true,
        tone: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/20 dark:bg-amber-500/15 dark:text-amber-200",
    },
    saving: {
        label: "Saving…",
        tone: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-400/20 dark:bg-sky-500/15 dark:text-sky-200",
    },
    loading: {
        label: "Loading…",
        tone: "border-slate-200 bg-slate-50 text-slate-600 dark:border-neutral-700 dark:bg-neutral-800/60 dark:text-slate-300",
    },
    error: {
        label: "Load failed",
        tone: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/20 dark:bg-rose-500/15 dark:text-rose-300",
    },
    offline: {
        label: "Offline",
        tone: "border-slate-200 bg-slate-100 text-slate-500 dark:border-neutral-700 dark:bg-neutral-800/60 dark:text-slate-400",
    },
};

export function FloatingSaveBar({
    status,
    onSave,
    onReload,
    saveDisabled,
    reloadDisabled,
}: FloatingSaveBarProps) {
    const config = STATUS_CONFIG[status];

    // Track visibility with delayed exit for smooth transition
    const shouldShow = status === "dirty" || status === "saving";
    const [visible, setVisible] = useState(false);
    const [rendered, setRendered] = useState(false);
    const [justSaved, setJustSaved] = useState(false);
    const prevStatusRef = useRef<SaveBarStatus>(status);
    const exitTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

    useEffect(() => {
        const prevStatus = prevStatusRef.current;
        prevStatusRef.current = status;

        // Detect save completion: saving → saved
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
            // Micro-delay to trigger CSS transition after mount
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

    const displayConfig = justSaved ? STATUS_CONFIG.saved : config;

    return (
        <div
            className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4"
            aria-live="polite"
        >
            <div
                className={[
                    "pointer-events-auto flex items-center gap-3 rounded-2xl border px-4 py-2.5 shadow-lg shadow-black/5",
                    "bg-white/85 backdrop-blur-xl backdrop-saturate-150",
                    "dark:bg-neutral-950/80 dark:backdrop-blur-xl dark:backdrop-saturate-150",
                    "border-slate-200/80 dark:border-neutral-700/60",
                    // Transition
                    "transition-all duration-[400ms]",
                    visible
                        ? "translate-y-0 opacity-100 scale-100"
                        : "translate-y-8 opacity-0 scale-[0.96]",
                ].join(" ")}
                style={{
                    transitionTimingFunction: visible
                        ? "cubic-bezier(0.34, 1.56, 0.64, 1)"
                        : "cubic-bezier(0.4, 0, 1, 1)",
                }}
            >
                {/* Status badge */}
                <div
                    className={[
                        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                        "transition-all duration-300",
                        displayConfig.tone,
                    ].join(" ")}
                >
                    {displayConfig.icon}
                    <span className="tabular-nums">{displayConfig.label}</span>
                    {displayConfig.dot && (
                        <span className="relative flex h-1.5 w-1.5">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500/60 dark:bg-amber-400/40" />
                            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-500 dark:bg-amber-400" />
                        </span>
                    )}
                </div>

                {/* Divider */}
                <div className="h-5 w-px bg-slate-200/80 dark:bg-neutral-700/60" />

                {/* Actions */}
                <div className="flex items-center gap-1.5">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onReload}
                        disabled={reloadDisabled}
                        className="h-8 gap-1.5 px-2.5 text-xs"
                    >
                        <RefreshCw size={13} className={status === "loading" ? "animate-spin" : ""} />
                        Reload
                    </Button>
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={onSave}
                        disabled={saveDisabled}
                        className="h-8 gap-1.5 px-3 text-xs"
                    >
                        {justSaved ? <Check size={13} /> : <Save size={13} />}
                        {justSaved ? "Saved" : "Save"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
