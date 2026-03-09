import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface SelectOption {
    value: string;
    label: ReactNode;
}

export interface SelectProps {
    /** Current value */
    value: string;
    /** Called when the user picks an option */
    onChange: (value: string) => void;
    /** List of options */
    options: SelectOption[];
    /** Optional placeholder shown when value is empty */
    placeholder?: string;
    /** Optional aria-label */
    "aria-label"?: string;
    /** Optional HTML name attribute */
    name?: string;
    /** Extra className on the trigger button */
    className?: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Merge multiple class-name strings. */
const cn = (...classes: (string | false | undefined | null)[]) =>
    classes.filter(Boolean).join(" ");

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function Select({
    value,
    onChange,
    options,
    placeholder = "请选择",
    "aria-label": ariaLabel,
    name,
    className,
}: SelectProps) {
    const [open, setOpen] = useState(false);
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const listRef = useRef<HTMLDivElement | null>(null);

    /* --- position state for the portal popover ---  */
    const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });

    const reposition = useCallback(() => {
        const el = triggerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        setPos({
            top: rect.bottom + 6,
            left: rect.left,
            width: rect.width,
        });
    }, []);

    /* Recompute position on open and on scroll/resize */
    useLayoutEffect(() => {
        if (!open) return;
        reposition();
        window.addEventListener("scroll", reposition, true);
        window.addEventListener("resize", reposition);
        return () => {
            window.removeEventListener("scroll", reposition, true);
            window.removeEventListener("resize", reposition);
        };
    }, [open, reposition]);

    /* Close on outside click */
    useEffect(() => {
        if (!open) return;
        const handleClick = (e: MouseEvent) => {
            const target = e.target as Node | null;
            if (
                triggerRef.current?.contains(target) ||
                listRef.current?.contains(target)
            )
                return;
            setOpen(false);
        };
        document.addEventListener("pointerdown", handleClick);
        return () => document.removeEventListener("pointerdown", handleClick);
    }, [open]);

    /* Close on Escape */
    useEffect(() => {
        if (!open) return;
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };
        document.addEventListener("keydown", handleKey);
        return () => document.removeEventListener("keydown", handleKey);
    }, [open]);

    const selectedLabel = useMemo(() => {
        const match = options.find((o) => o.value === value);
        return match ? match.label : null;
    }, [options, value]);

    const handleSelect = useCallback(
        (v: string) => {
            onChange(v);
            setOpen(false);
        },
        [onChange],
    );

    return (
        <>
            {/* Hidden native input for forms */}
            {name ? <input type="hidden" name={name} value={value} /> : null}

            {/* Trigger */}
            <button
                ref={triggerRef}
                type="button"
                role="combobox"
                aria-expanded={open}
                aria-haspopup="listbox"
                aria-label={ariaLabel}
                onClick={() => setOpen((prev) => !prev)}
                className={cn(
                    "inline-flex h-[34px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white pl-3.5 pr-3 text-sm font-medium text-slate-700 shadow-sm outline-none transition",
                    "hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-slate-400/35",
                    "dark:border-neutral-800 dark:bg-neutral-950/60 dark:text-white/80 dark:hover:bg-white/10 dark:focus-visible:ring-white/15",
                    className,
                )}
            >
                <span className="truncate">{selectedLabel ?? placeholder}</span>
                <ChevronDown
                    size={14}
                    className={cn(
                        "shrink-0 text-slate-400 transition-transform duration-200 dark:text-white/40",
                        open && "rotate-180",
                    )}
                    aria-hidden="true"
                />
            </button>

            {/* Dropdown (portal) */}
            {open
                ? createPortal(
                    <div
                        ref={listRef}
                        role="listbox"
                        aria-label={ariaLabel}
                        className={cn(
                            "fixed z-[9999] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg",
                            "dark:border-neutral-700 dark:bg-neutral-900",
                        )}
                        style={{
                            top: pos.top,
                            left: pos.left,
                            minWidth: pos.width,
                            maxHeight: 280,
                            overflowY: "auto",
                        }}
                    >
                        {options.map((opt) => {
                            const selected = opt.value === value;
                            return (
                                <button
                                    key={opt.value}
                                    type="button"
                                    role="option"
                                    aria-selected={selected}
                                    onClick={() => handleSelect(opt.value)}
                                    className={cn(
                                        "flex w-full items-center gap-2 px-3 py-2 text-left text-sm outline-none transition-colors",
                                        "hover:bg-slate-100 dark:hover:bg-white/10",
                                        selected
                                            ? "font-medium text-slate-900 dark:text-white"
                                            : "text-slate-700 dark:text-slate-300",
                                    )}
                                >
                                    <span className="flex-1 truncate">{opt.label}</span>
                                    {selected ? (
                                        <Check
                                            size={14}
                                            className="shrink-0 text-slate-900 dark:text-white"
                                            aria-hidden="true"
                                        />
                                    ) : null}
                                </button>
                            );
                        })}
                    </div>,
                    document.body,
                )
                : null}
        </>
    );
}
