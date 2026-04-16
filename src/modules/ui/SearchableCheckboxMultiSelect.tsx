import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";
import { motion } from "framer-motion";
import { selectDropdownMotion, selectDropdownTransition } from "./selectStyles";

export interface SearchableCheckboxMultiSelectOption {
  value: string;
  label: ReactNode;
  searchText?: string;
}

export interface SearchableCheckboxMultiSelectProps {
  value: string[];
  onChange: (value: string[]) => void;
  options: SearchableCheckboxMultiSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  selectFilteredLabel: string;
  deselectFilteredLabel: string;
  selectedCountLabel: (count: number) => string;
  noResultsLabel: string;
  disabled?: boolean;
  "aria-label"?: string;
  className?: string;
}

const cn = (...classes: (string | false | undefined | null)[]) => classes.filter(Boolean).join(" ");

function optionText(option: SearchableCheckboxMultiSelectOption): string {
  if (typeof option.label === "string") return option.label;
  return option.searchText ?? option.value;
}

export function SearchableCheckboxMultiSelect({
  value,
  onChange,
  options,
  placeholder = "",
  searchPlaceholder = "",
  selectFilteredLabel,
  deselectFilteredLabel,
  selectedCountLabel,
  noResultsLabel,
  disabled = false,
  "aria-label": ariaLabel,
  className,
}: SearchableCheckboxMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties>({});

  const selectedSet = useMemo(() => new Set(value), [value]);

  const filteredOptions = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return options;
    return options.filter((option) => {
      const searchText = (option.searchText ?? option.value).toLowerCase();
      const labelText = optionText(option).toLowerCase();
      return searchText.includes(keyword) || labelText.includes(keyword);
    });
  }, [options, query]);

  const visibleValues = useMemo(
    () => filteredOptions.map((option) => option.value),
    [filteredOptions],
  );

  const allVisibleSelected =
    visibleValues.length > 0 && visibleValues.every((optionValue) => selectedSet.has(optionValue));

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const gap = 6;
    const maxHeight = 360;
    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    const openAbove = spaceBelow < maxHeight && spaceAbove > spaceBelow;

    if (openAbove) {
      setDropdownStyle({
        position: "fixed",
        bottom: window.innerHeight - rect.top + gap,
        left: rect.left,
        width: Math.max(rect.width, 260),
        maxHeight: Math.min(maxHeight, spaceAbove),
        zIndex: 99999,
      });
      return;
    }

    setDropdownStyle({
      position: "fixed",
      top: rect.bottom + gap,
      left: rect.left,
      width: Math.max(rect.width, 260),
      maxHeight: Math.min(maxHeight, spaceBelow),
      zIndex: 99999,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (triggerRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setOpen(false);
      setQuery("");
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    requestAnimationFrame(() => searchRef.current?.focus());
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open, updatePosition]);

  const commitSelection = useCallback(
    (next: string[]) => {
      const allowed = new Set(options.map((option) => option.value));
      const unique = next.filter(
        (item, index) => allowed.has(item) && next.indexOf(item) === index,
      );
      onChange(unique);
    },
    [onChange, options],
  );

  const toggleOption = useCallback(
    (optionValue: string) => {
      if (selectedSet.has(optionValue)) {
        commitSelection(value.filter((item) => item !== optionValue));
        return;
      }
      commitSelection([...value, optionValue]);
    },
    [commitSelection, selectedSet, value],
  );

  const toggleFiltered = useCallback(() => {
    if (visibleValues.length === 0) return;
    if (allVisibleSelected) {
      const visibleSet = new Set(visibleValues);
      commitSelection(value.filter((item) => !visibleSet.has(item)));
      return;
    }
    commitSelection([...value, ...visibleValues]);
  }, [allVisibleSelected, commitSelection, value, visibleValues]);

  const selectedSummary = useMemo(() => {
    if (value.length === 0) return placeholder;
    const labels = value
      .slice(0, 2)
      .map((item) =>
        optionText(options.find((option) => option.value === item) ?? { value: item, label: item }),
      )
      .join(", ");
    return value.length > 2 ? `${labels} +${value.length - 2}` : labels;
  }, [options, placeholder, value]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => {
          if (!open) updatePosition();
          setOpen((current) => !current);
        }}
        className={cn(
          "inline-flex h-9 w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white pl-3.5 pr-3 text-left text-sm font-medium text-slate-700 shadow-sm outline-none transition",
          "hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-slate-400/35 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400",
          "dark:border-neutral-800 dark:bg-neutral-950/60 dark:text-white/80 dark:hover:bg-white/10 dark:disabled:bg-neutral-800 dark:disabled:text-white/35",
          className,
        )}
      >
        <span className={cn("truncate", value.length === 0 && "text-slate-400 dark:text-white/35")}>
          {selectedSummary}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {value.length > 0 ? (
            <span className="rounded-md bg-sky-50 px-1.5 py-0.5 text-[11px] font-semibold text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
              {selectedCountLabel(value.length)}
            </span>
          ) : null}
          <ChevronDown
            size={14}
            className={cn(
              "text-slate-400 transition-transform duration-200 dark:text-white/40",
              open && "rotate-180",
            )}
            aria-hidden="true"
          />
        </span>
      </button>

      {open
        ? createPortal(
            <motion.div
              ref={dropdownRef}
              style={dropdownStyle}
              className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-black/10 dark:border-neutral-700 dark:bg-neutral-900 dark:shadow-black/30"
              {...selectDropdownMotion}
              transition={selectDropdownTransition}
            >
              <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 px-3 py-2 dark:border-neutral-800">
                <Search
                  size={14}
                  className="shrink-0 text-slate-400 dark:text-white/40"
                  aria-hidden="true"
                />
                <input
                  ref={searchRef}
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.currentTarget.value)}
                  placeholder={searchPlaceholder}
                  className="h-7 w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400 dark:text-white/80 dark:placeholder:text-white/30"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <button
                type="button"
                onClick={toggleFiltered}
                disabled={visibleValues.length === 0}
                className={cn(
                  "flex shrink-0 items-center gap-2 border-b border-slate-100 px-3 py-2 text-left text-sm font-medium transition-colors dark:border-neutral-800",
                  visibleValues.length === 0
                    ? "cursor-not-allowed text-slate-300 dark:text-white/20"
                    : "text-slate-700 hover:bg-slate-50 dark:text-white/75 dark:hover:bg-white/5",
                )}
              >
                <span
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                    allVisibleSelected
                      ? "border-sky-500 bg-sky-500 text-white dark:border-sky-400 dark:bg-sky-400 dark:text-neutral-950"
                      : "border-slate-300 bg-white dark:border-neutral-600 dark:bg-neutral-900",
                  )}
                  aria-hidden="true"
                >
                  {allVisibleSelected ? <Check size={12} /> : null}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {allVisibleSelected ? deselectFilteredLabel : selectFilteredLabel}
                </span>
                <span className="shrink-0 text-xs text-slate-400 dark:text-white/35">
                  {selectedCountLabel(value.length)}
                </span>
              </button>
              <div
                role="listbox"
                aria-label={ariaLabel}
                className="min-h-0 flex-1 overflow-y-auto p-1"
              >
                {filteredOptions.length === 0 ? (
                  <div className="px-3 py-5 text-center text-xs text-slate-400 dark:text-white/30">
                    {noResultsLabel}
                  </div>
                ) : (
                  filteredOptions.map((option) => {
                    const checked = selectedSet.has(option.value);
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="option"
                        aria-selected={checked}
                        onClick={() => toggleOption(option.value)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm outline-none transition-colors",
                          checked
                            ? "bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:text-sky-300"
                            : "text-slate-700 hover:bg-slate-50 dark:text-white/70 dark:hover:bg-white/5",
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                            checked
                              ? "border-sky-500 bg-sky-500 text-white dark:border-sky-400 dark:bg-sky-400 dark:text-neutral-950"
                              : "border-slate-300 bg-white dark:border-neutral-600 dark:bg-neutral-900",
                          )}
                          aria-hidden="true"
                        >
                          {checked ? <Check size={12} /> : null}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{option.label}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </motion.div>,
            document.body,
          )
        : null}
    </>
  );
}
