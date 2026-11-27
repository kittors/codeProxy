import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Icon } from "satin-ui/react";
import {
  cn,
  getSelectTriggerBase,
  selectChevron,
  selectOptionBase,
  selectOptionCheck,
  selectOptionIdle,
  selectOptionSelected,
  selectPanel,
  selectTriggerChip,
  selectTriggerState,
} from "../utils/selectStyles";
import type { ControlSize } from "../utils/controlStyles";
import { useScrollFade } from "../hooks/useScrollFade";
import { resolvePortalContainer } from "../overlays/portalContainer";
import { useSatinFloatingLayer } from "../overlays/useSatinFloatingLayer";

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
  placeholder?: ReactNode;
  /** Optional control id (used by FormField label association) */
  id?: string;
  /** Optional aria-label */
  "aria-label"?: string;
  /** Optional invalid state for form fields */
  "aria-invalid"?: boolean | "true" | "false";
  /** Optional describedby ids for form description/error */
  "aria-describedby"?: string;
  /** Optional HTML name attribute */
  name?: string;
  /** Extra className on the trigger button */
  className?: string;
  /** Stretch the default trigger to its container width. Ignored by the compact chip variant. */
  fullWidth?: boolean;
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
  id,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
  name,
  className,
  fullWidth = true,
  disabled = false,
  variant = "default",
  size = "default",
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const listFade = useScrollFade<HTMLDivElement>({ enabled: open && !disabled, size: 24 });
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const isOpen = open && !disabled;

  const floating = useSatinFloatingLayer({
    open: isOpen,
    anchorRef: triggerRef,
    panelRef: listRef,
    placement: "bottom",
    align: "start",
    gap: 6,
    margin: 8,
    onClose: (_reason, refocus) => {
      setOpen(false);
      if (refocus) triggerRef.current?.focus({ preventScroll: true });
    },
  });

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  /* Keyboard navigation */
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Home" || e.key === "End") {
        const panel = listRef.current;
        if (!panel) return;
        const items = Array.from(panel.querySelectorAll<HTMLElement>('[role="option"]'));
        if (items.length === 0) return;
        e.preventDefault();
        if (e.key === "Home") {
          items[0]?.focus();
          return;
        }
        if (e.key === "End") {
          items[items.length - 1]?.focus();
          return;
        }
        const cur = items.indexOf(document.activeElement as HTMLElement);
        const nextIdx =
          cur < 0
            ? Math.max(0, options.findIndex((opt) => opt.value === value))
            : e.key === "ArrowDown"
              ? (cur + 1 + items.length) % items.length
              : (cur - 1 + items.length) % items.length;
        items[nextIdx]?.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, options, value]);

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
      {name ? <input type="hidden" name={name} value={value} /> : null}

      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        disabled={disabled}
        data-state={selectTriggerState(isOpen)}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={(event) => {
          if ((event.key === "ArrowDown" || event.key === "ArrowUp") && !isOpen) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={cn(
          variant === "chip" ? selectTriggerChip : getSelectTriggerBase(size),
          variant !== "chip" && fullWidth ? "w-full" : null,
          className,
        )}
      >
        <span className="min-w-0 flex-1 truncate text-left">{selectedLabel ?? placeholder}</span>
        <Icon
          name="chevron-down"
          size={14}
          className={cn(selectChevron, isOpen && "rotate-180")}
        />
      </button>

      {floating.mounted && !disabled
        ? createPortal(
            <div
              ref={listRef}
              role="listbox"
              aria-hidden={floating.isOpen ? undefined : true}
              data-side={floating.side}
              data-state={floating.isOpen ? "open" : "closed"}
              aria-label={ariaLabel}
              className={cn(
                selectPanel,
                floating.isOpen ? "sn-open" : null,
                floating.up ? "sn-up" : null,
                floating.end ? "sn-end" : null,
              )}
              style={{
                top: floating.top,
                left: floating.left,
                minWidth: Math.max(floating.anchorWidth, 120),
                maxWidth: "min(500px, 90vw)",
                transformOrigin: floating.origin,
              }}
            >
              {/* 面板本身保留圆角与投影，滚动交给里面这一层：选项多到要滚时上下渐隐，不会被面板边缘一刀切断。 */}
              <div
                ref={listFade.ref}
                style={{ maxHeight: Math.min(280, floating.availableHeight) }}
                className="overflow-y-auto overscroll-contain p-1.5"
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
                        <Icon name="check" size={15} className={selectOptionCheck} />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>,
            resolvePortalContainer(triggerRef.current),
          )
        : null}
    </>
  );
}
