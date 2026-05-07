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
import { AnimatePresence, motion } from "framer-motion";
import {
  cn,
  getSelectDropdownMotion,
  getSelectTriggerBase,
  selectChevron,
  selectDropdownTransition,
  selectOptionBase,
  selectOptionIdle,
  selectOptionSelected,
  selectPanel,
  selectTriggerChip,
  selectTriggerDisabled,
  selectTriggerOpen,
} from "./selectStyles";
import type { ControlSize } from "@/modules/ui/controlStyles";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface SelectOption {
  value: string;
  label: ReactNode;
  triggerLabel?: ReactNode;
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
  /** Disable interactions */
  disabled?: boolean;
  /** Visual style variant */
  variant?: "default" | "chip";
  /** Shared control size */
  size?: ControlSize;
}

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
  disabled = false,
  variant = "default",
  size = "default",
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  /* --- position state for the portal popover ---  */
  const [pos, setPos] = useState({
    top: 0,
    left: 0,
    width: 0,
    placement: "bottom" as "bottom" | "top",
  });

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
      placement: fitsBelow ? "bottom" : "top",
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
    return match ? (match.triggerLabel ?? match.label) : null;
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
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          variant === "chip" ? selectTriggerChip : getSelectTriggerBase(size),
          open && selectTriggerOpen,
          disabled && selectTriggerDisabled,
          className,
        )}
      >
        <span className="min-w-0 flex-1 truncate text-left">{selectedLabel ?? placeholder}</span>
        <ChevronDown
          size={14}
          className={cn(selectChevron, open && "rotate-180")}
          aria-hidden="true"
        />
      </button>

      {/* Dropdown (portal) */}
      {createPortal(
        <AnimatePresence>
          {open && !disabled ? (
            <motion.div
              ref={listRef}
              role="listbox"
              aria-label={ariaLabel}
              className={selectPanel}
              {...getSelectDropdownMotion(pos.placement)}
              transition={selectDropdownTransition}
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
                      selectOptionBase,
                      selected ? selectOptionSelected : selectOptionIdle,
                    )}
                  >
                    <span className="min-w-0 flex-1">{opt.label}</span>
                    {selected ? (
                      <Check
                        size={14}
                        className="shrink-0 text-[#96969B] dark:text-[#9F9FA8]"
                        aria-hidden="true"
                      />
                    ) : null}
                  </button>
                );
              })}
            </motion.div>
          ) : null}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
