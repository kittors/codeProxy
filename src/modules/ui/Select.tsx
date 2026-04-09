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
  /** Visual style variant */
  variant?: "default" | "chip";
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Merge multiple class-name strings. */
const cn = (...classes: (string | false | undefined | null)[]) => classes.filter(Boolean).join(" ");

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function Select({
  value,
  onChange,
  options,
  placeholder = "",
  "aria-label": ariaLabel,
  name,
  className,
  variant = "default",
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
    const gap = 6;
    // Estimate dropdown height: each option ~36px + padding 8px, capped at maxHeight 280
    const estimatedHeight = Math.min(options.length * 36 + 8, 280);
    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const fitsBelow = spaceBelow >= estimatedHeight;
    setPos({
      top: fitsBelow ? rect.bottom + gap : rect.top - gap - estimatedHeight,
      left: rect.left,
      width: rect.width,
    });
  }, [options.length]);

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
      if (triggerRef.current?.contains(target) || listRef.current?.contains(target)) return;
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
          variant === "chip"
            ? [
                "inline-flex h-7 items-center justify-center gap-1.5 rounded-xl border px-2 text-[11px] font-semibold outline-none transition",
                "border-slate-200/60 bg-white/70 text-slate-600 hover:bg-white/90 hover:text-slate-800",
                "focus-visible:ring-2 focus-visible:ring-slate-400/35",
                "dark:border-white/10 dark:bg-neutral-950/25 dark:text-white/70 dark:hover:bg-neutral-950/40 dark:hover:text-white/85 dark:focus-visible:ring-white/15",
              ].join(" ")
            : [
                "inline-flex h-[34px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white pl-3.5 pr-3 text-sm font-medium text-slate-700 shadow-sm outline-none transition",
                "hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-slate-400/35",
                "dark:border-neutral-800 dark:bg-neutral-950/60 dark:text-white/80 dark:hover:bg-white/10 dark:focus-visible:ring-white/15",
              ].join(" "),
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
                "fixed z-[9999] overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-lg",
                "dark:border-neutral-700 dark:bg-neutral-900",
              )}
              style={{
                top: pos.top,
                left: pos.left,
                minWidth: pos.width,
                maxWidth: "min(500px, 90vw)",
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
                      "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm outline-none transition-colors",
                      "hover:bg-slate-100 dark:hover:bg-white/10",
                      selected
                        ? "font-medium text-slate-900 dark:text-white"
                        : "text-slate-600 dark:text-slate-300",
                    )}
                  >
                    <span className="flex-1 whitespace-nowrap">{opt.label}</span>
                    {selected ? (
                      <Check
                        size={14}
                        className="shrink-0 text-slate-400 dark:text-white/50"
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
