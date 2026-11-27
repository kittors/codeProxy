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
  const listFade = useScrollFade<HTMLDivElement>({ enabled: open, size: 24 });
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  /* --- position state for the portal popover ---  */
  const [pos, setPos] = useState({
    top: 0,
    left: 0,
    width: 0,
    placement: "bottom" as "bottom" | "top",
    ready: false,
  });

  const reposition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const gap = 6;
    const pad = 8;
    const vw = window.innerWidth || 1024;
    const vh = window.innerHeight || 768;
    const panelEl = listRef.current;
    const panelHeight = panelEl?.offsetHeight || Math.min(options.length * 36 + 12, 280);
    const panelWidth = Math.max(rect.width, panelEl?.offsetWidth || 0);
    const spaceBelow = vh - rect.bottom - gap - pad;
    const spaceAbove = rect.top - gap - pad;
    const fitsBelow = spaceBelow >= panelHeight || spaceBelow >= spaceAbove;
    const rawTop = fitsBelow ? rect.bottom + gap : rect.top - gap - panelHeight;
    const top = Math.min(Math.max(pad, rawTop), Math.max(pad, vh - panelHeight - pad));
    const left = Math.min(Math.max(pad, rect.left), Math.max(pad, vw - panelWidth - pad));
    setPos({
      top: Math.round(top),
      left: Math.round(left),
      width: rect.width,
      placement: fitsBelow ? "bottom" : "top",
      ready: true,
    });
  }, [options.length]);

  /* Recompute position on open and on scroll/resize */
  useLayoutEffect(() => {
    if (!open) {
      setPos((prev) => (prev.ready ? { ...prev, ready: false } : prev));
      return;
    }
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

  /* Keyboard navigation & Escape close */
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // 吃掉这次 Esc：外层弹窗看到 defaultPrevented 就不会跟着关闭（只收起下拉）。
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
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
  }, [open, options, value]);

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
        id={id}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        disabled={disabled}
        data-state={selectTriggerState(open)}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={(event) => {
          if ((event.key === "ArrowDown" || event.key === "ArrowUp") && !open) {
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
          className={cn(selectChevron, open && "rotate-180")}
        />
      </button>

      {/* Dropdown (portal) */}
      {open && !disabled
        ? createPortal(
            <div
              ref={listRef}
              role="listbox"
              data-side={pos.placement}
              data-state="open"
              aria-label={ariaLabel}
              className={cn(selectPanel, "!p-0")}
              style={{
                top: pos.top,
                left: pos.left,
                minWidth: pos.width,
                maxWidth: "min(500px, 90vw)",
                visibility: pos.ready ? undefined : "hidden",
              }}
            >
              {/* 面板本身保留圆角与投影，滚动交给里面这一层：选项多到要滚时上下渐隐，不会被面板边缘一刀切断。 */}
              <div
                ref={listFade.ref}
                style={{ maxHeight: 280 }}
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
