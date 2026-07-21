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
import { Check, ChevronDown, Plus, Search } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import {
  cn,
  getSelectDropdownMotion,
  getSelectTriggerBase,
  searchableSelectPanel,
  selectChevron,
  selectDropdownTransition,
  selectEmptyState,
  selectOptionBase,
  selectOptionIdle,
  selectOptionSelected,
  selectSearchInput,
  selectSearchRow,
  selectTriggerOpen,
} from "../utils/selectStyles";
import type { ControlSize } from "../utils/controlStyles";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface SearchableSelectOption {
  value: string;
  label: ReactNode;
  triggerLabel?: ReactNode;
  /** searchable text (defaults to value if omitted) */
  searchText?: string;
  /** Optional leading icon shown before the label in the list and trigger. */
  icon?: ReactNode;
  /**
   * Optional trailing content (e.g. count pill) rendered immediately after the
   * label text. The selection checkmark always stays at the far right.
   */
  trailing?: ReactNode;
  action?: {
    label: string;
    icon: ReactNode;
    onClick: () => void;
    className?: string;
  };
}

export interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  allowCreate?: boolean;
  normalizeCreateValue?: (value: string) => string;
  createLabel?: (value: string) => ReactNode;
  onCreate?: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  "aria-label"?: string;
  name?: string;
  className?: string;
  disabled?: boolean;
  size?: ControlSize;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

function OptionContent({
  icon,
  label,
  trailing,
  selected,
}: {
  icon?: ReactNode;
  label: ReactNode;
  trailing?: ReactNode;
  selected: boolean;
}) {
  const title = typeof label === "string" ? label : undefined;
  return (
    <>
      {icon ? <span className="inline-flex shrink-0 items-center">{icon}</span> : null}
      <span className="min-w-0 flex-1 truncate text-left" title={title}>
        {label}
      </span>
      {trailing ? <span className="inline-flex shrink-0 items-center">{trailing}</span> : null}
      {selected ? (
        <Check
          size={14}
          className="ml-1 shrink-0 text-[#96969B] dark:text-[#9F9FA8]"
          aria-hidden="true"
        />
      ) : null}
    </>
  );
}

export function SearchableSelect({
  value,
  onChange,
  options,
  allowCreate = false,
  normalizeCreateValue = (next) => next.trim(),
  createLabel,
  onCreate,
  placeholder = "",
  searchPlaceholder = "",
  "aria-label": ariaLabel,
  name,
  className,
  disabled = false,
  size = "default",
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [pos, setPos] = useState({
    top: 0,
    left: 0,
    width: 0,
    placement: "bottom" as "bottom" | "top",
    maxHeight: 320,
  });

  const reposition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const gap = 6;
    const maxPanelHeight = 320;
    const minPanelHeight = 160;
    const estimatedHeight = Math.min(options.length * 36 + 48, maxPanelHeight);
    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    const openAbove = spaceBelow < estimatedHeight && spaceAbove > spaceBelow;
    const availableSpace = Math.max(openAbove ? spaceAbove : spaceBelow, 0);
    const maxHeight = Math.min(
      maxPanelHeight,
      Math.max(Math.min(minPanelHeight, maxPanelHeight), availableSpace),
    );
    const panelHeight = Math.min(estimatedHeight, maxHeight);
    // Keep dropdown wider than the compact header trigger so long labels + check fit.
    const width = Math.max(rect.width, 280);
    const left = Math.min(rect.left, Math.max(gap, window.innerWidth - width - gap));
    setPos({
      top: openAbove ? Math.max(gap, rect.top - gap - panelHeight) : rect.bottom + gap,
      left,
      width,
      placement: openAbove ? "top" : "bottom",
      maxHeight,
    });
  }, [options.length]);

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

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  // Focus search input on open
  useEffect(() => {
    if (open) {
      setQuery("");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (triggerRef.current?.contains(t) || listRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const selectedOption = useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value],
  );

  const selectedLabel = useMemo(() => {
    if (!selectedOption) return null;
    if (selectedOption.triggerLabel != null) return selectedOption.triggerLabel;
    return (
      <span className="inline-flex min-w-0 items-center gap-2">
        {selectedOption.icon ? (
          <span className="inline-flex shrink-0 items-center">{selectedOption.icon}</span>
        ) : null}
        <span className="min-w-0 truncate">{selectedOption.label}</span>
        {selectedOption.trailing ? (
          <span className="inline-flex shrink-0 items-center">{selectedOption.trailing}</span>
        ) : null}
      </span>
    );
  }, [selectedOption]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => {
      const text = (o.searchText ?? o.value).toLowerCase();
      const labelStr = typeof o.label === "string" ? o.label.toLowerCase() : "";
      return text.includes(q) || labelStr.includes(q);
    });
  }, [options, query]);

  const createValue = query.trim();
  const canCreate = useMemo(() => {
    if (!allowCreate || !createValue) return false;
    const key = normalizeCreateValue(createValue).toLowerCase();
    if (!key) return false;
    return !options.some((option) => {
      const labelText = typeof option.label === "string" ? option.label : "";
      return (
        option.value.toLowerCase() === key ||
        (option.searchText ?? "").toLowerCase() === key ||
        labelText.toLowerCase() === key
      );
    });
  }, [allowCreate, createValue, normalizeCreateValue, options]);

  const handleSelect = useCallback(
    (v: string) => {
      onChange(v);
      setOpen(false);
    },
    [onChange],
  );

  const handleCreate = useCallback(() => {
    const next = normalizeCreateValue(createValue);
    if (!next) return;
    if (onCreate) onCreate(next);
    else onChange(next);
    setOpen(false);
  }, [createValue, normalizeCreateValue, onChange, onCreate]);

  return (
    <>
      {name ? <input type="hidden" name={name} value={value} /> : null}

      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        title={
          typeof selectedOption?.label === "string"
            ? selectedOption.label
            : typeof selectedOption?.triggerLabel === "string"
              ? selectedOption.triggerLabel
              : undefined
        }
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          getSelectTriggerBase(size),
          open && selectTriggerOpen,
          "disabled:cursor-not-allowed disabled:opacity-60",
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

      {createPortal(
        <AnimatePresence>
          {open && !disabled ? (
            <motion.div
              ref={listRef}
              role="listbox"
              data-side={pos.placement}
              aria-label={ariaLabel}
              className={searchableSelectPanel}
              {...getSelectDropdownMotion(pos.placement)}
              transition={selectDropdownTransition}
              style={{
                top: pos.top,
                left: pos.left,
                minWidth: pos.width,
                maxWidth: "min(500px, 90vw)",
                maxHeight: pos.maxHeight,
              }}
            >
              {/* Search input */}
              <div className={selectSearchRow}>
                <Search
                  size={14}
                  className="shrink-0 text-[#96969B] dark:text-[#9F9FA8]"
                  aria-hidden="true"
                />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={searchPlaceholder}
                  className={selectSearchInput}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>

              {/* Options list */}
              <div className="flex-1 overflow-y-auto p-1">
                {filtered.length === 0 && !canCreate ? (
                  <div className={selectEmptyState}>No results</div>
                ) : (
                  <>
                    {filtered.map((opt) => {
                      const selected = opt.value === value;
                      const optionClassName = cn(
                        selectOptionBase,
                        selected ? selectOptionSelected : selectOptionIdle,
                      );
                      if (opt.action) {
                        return (
                          <div
                            key={opt.value}
                            role="option"
                            aria-selected={selected}
                            className={cn(optionClassName, "pr-1")}
                          >
                            <button
                              type="button"
                              onClick={() => handleSelect(opt.value)}
                              className="flex min-w-0 flex-1 items-center gap-2 text-left outline-none"
                            >
                              <OptionContent
                                icon={opt.icon}
                                label={opt.label}
                                trailing={opt.trailing}
                                selected={selected}
                              />
                            </button>
                            <button
                              type="button"
                              aria-label={opt.action.label}
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                opt.action?.onClick();
                              }}
                              className={cn(
                                "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[#96969B] transition-colors hover:bg-red-50 hover:text-red-500 dark:text-[#9F9FA8] dark:hover:bg-red-500/15 dark:hover:text-red-300",
                                opt.action.className,
                              )}
                            >
                              {opt.action.icon}
                            </button>
                          </div>
                        );
                      }
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          onClick={() => handleSelect(opt.value)}
                          className={optionClassName}
                        >
                          <OptionContent
                            icon={opt.icon}
                            label={opt.label}
                            trailing={opt.trailing}
                            selected={selected}
                          />
                        </button>
                      );
                    })}
                    {canCreate ? (
                      <button
                        type="button"
                        role="option"
                        aria-selected={false}
                        onClick={handleCreate}
                        className={cn(
                          selectOptionBase,
                          "font-medium text-[#18181B] dark:text-white",
                        )}
                      >
                        <Plus
                          size={14}
                          className="shrink-0 text-[#71717A] dark:text-[#A1A1AA]"
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1">
                          {createLabel ? createLabel(createValue) : createValue}
                        </span>
                      </button>
                    ) : null}
                  </>
                )}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
