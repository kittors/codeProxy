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
} from "./selectStyles";
import type { ControlSize } from "@/modules/ui/controlStyles";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface SearchableSelectOption {
  value: string;
  label: ReactNode;
  triggerLabel?: ReactNode;
  /** searchable text (defaults to value if omitted) */
  searchText?: string;
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
  size?: ControlSize;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

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
  size = "default",
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });

  const reposition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({ top: rect.bottom + 6, left: rect.left, width: Math.max(rect.width, 200) });
  }, []);

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

  const selectedLabel = useMemo(() => {
    const match = options.find((o) => o.value === value);
    return match ? (match.triggerLabel ?? match.label) : null;
  }, [options, value]);

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
        onClick={() => setOpen((prev) => !prev)}
        className={cn(getSelectTriggerBase(size), open && selectTriggerOpen, className)}
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
          {open ? (
            <motion.div
              ref={listRef}
              role="listbox"
              aria-label={ariaLabel}
              className={searchableSelectPanel}
              {...getSelectDropdownMotion()}
              transition={selectDropdownTransition}
              style={{
                top: pos.top,
                left: pos.left,
                minWidth: pos.width,
                maxWidth: "min(500px, 90vw)",
                maxHeight: 320,
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
