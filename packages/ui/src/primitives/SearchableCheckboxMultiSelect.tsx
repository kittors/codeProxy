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
import { Check, ChevronDown, Search, X } from "lucide-react";
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
  selectTriggerDisabled,
} from "../utils/selectStyles";
import type { ControlSize } from "../utils/controlStyles";

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
  size?: ControlSize;
  clearLabel?: string;
  onClear?: () => void;
  showClearButton?: boolean;
  maxSummaryItems?: number;
  mobileBreakpoint?: number;
  emptyValueMeansAllSelected?: boolean;
  showFilteredToggleWithoutQuery?: boolean;
  applyMode?: "immediate" | "manual";
  applyLabel?: string;
  cancelLabel?: string;
  selectAllLabel?: string;
  deselectAllLabel?: string;
  emptySelectionLabel?: string;
  emptyValueRepresentsAllSelected?: boolean;
}

function optionText(option: SearchableCheckboxMultiSelectOption): string {
  if (typeof option.label === "string") return option.label;
  return option.searchText ?? option.value;
}

function selectionsEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
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
  size = "default",
  clearLabel,
  onClear,
  showClearButton = false,
  maxSummaryItems = 2,
  mobileBreakpoint = 640,
  emptyValueMeansAllSelected = false,
  showFilteredToggleWithoutQuery = true,
  applyMode = "immediate",
  applyLabel = "",
  cancelLabel = "",
  selectAllLabel = "",
  deselectAllLabel = "",
  emptySelectionLabel,
  emptyValueRepresentsAllSelected,
}: SearchableCheckboxMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties>({});
  const [dropdownPlacement, setDropdownPlacement] = useState<"bottom" | "top">("bottom");

  const manualApply = applyMode === "manual";
  const committedEmptyMeansAllSelected =
    emptyValueMeansAllSelected &&
    (emptyValueRepresentsAllSelected ?? (value.length === 0 && options.length > 0));

  const sanitizedExplicitValue = useMemo(() => {
    const allowed = new Set(options.map((option) => option.value));
    return value.filter(
      (item, index) => allowed.has(item) && value.indexOf(item) === index,
    );
  }, [options, value]);

  const [draftExplicitValue, setDraftExplicitValue] = useState<string[]>(sanitizedExplicitValue);
  const [draftEmptyMeansAllSelected, setDraftEmptyMeansAllSelected] = useState(
    committedEmptyMeansAllSelected,
  );

  useEffect(() => {
    if (manualApply && open) return;
    setDraftExplicitValue(sanitizedExplicitValue);
    setDraftEmptyMeansAllSelected(committedEmptyMeansAllSelected);
  }, [committedEmptyMeansAllSelected, manualApply, open, sanitizedExplicitValue]);

  const activeExplicitValue = manualApply ? draftExplicitValue : sanitizedExplicitValue;
  const activeEmptyMeansAllSelected = manualApply
    ? draftEmptyMeansAllSelected
    : committedEmptyMeansAllSelected;

  const implicitAllSelected =
    emptyValueMeansAllSelected &&
    activeEmptyMeansAllSelected &&
    activeExplicitValue.length === 0;

  const effectiveValue = useMemo(
    () => (implicitAllSelected ? options.map((option) => option.value) : activeExplicitValue),
    [activeExplicitValue, implicitAllSelected, options],
  );

  const allOptionsSelectedExplicitly =
    !implicitAllSelected && options.length > 0 && activeExplicitValue.length === options.length;

  const showAllSelectionSummary = implicitAllSelected || allOptionsSelectedExplicitly;

  const selectedSet = useMemo(() => new Set(effectiveValue), [effectiveValue]);

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

  const hasQuery = query.trim().length > 0;
  const showFilteredToggle =
    hasQuery || (showFilteredToggleWithoutQuery && !showAllSelectionSummary);

  const closeDropdown = useCallback(
    (discardDraft: boolean) => {
      if (discardDraft && manualApply) {
        setDraftExplicitValue(sanitizedExplicitValue);
        setDraftEmptyMeansAllSelected(committedEmptyMeansAllSelected);
      }
      setOpen(false);
      setQuery("");
    },
    [committedEmptyMeansAllSelected, manualApply, sanitizedExplicitValue],
  );

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const gap = 6;
    const maxHeight = 360;

    const isNarrow = window.innerWidth < mobileBreakpoint;
    if (isNarrow) {
      const maxHeightMobile = Math.min(420, window.innerHeight * 0.7);
      const spaceBelow = window.innerHeight - rect.bottom - gap;
      const spaceAbove = rect.top - gap;
      const openAbove = spaceBelow < maxHeightMobile && spaceAbove > spaceBelow;

      if (openAbove) {
        setDropdownPlacement("top");
        setDropdownStyle({
          position: "fixed",
          left: 12,
          right: 12,
          width: "auto",
          maxHeight: Math.min(maxHeightMobile, spaceAbove),
          bottom: window.innerHeight - rect.top + gap,
          zIndex: 99999,
        });
        return;
      }
      setDropdownPlacement("bottom");
      setDropdownStyle({
        position: "fixed",
        left: 12,
        right: 12,
        width: "auto",
        maxHeight: Math.min(maxHeightMobile, spaceBelow),
        top: Math.min(rect.bottom + gap, window.innerHeight - maxHeightMobile - 12),
        zIndex: 99999,
      });
      return;
    }

    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    const openAbove = spaceBelow < maxHeight && spaceAbove > spaceBelow;

    if (openAbove) {
      setDropdownPlacement("top");
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

    setDropdownPlacement("bottom");
    setDropdownStyle({
      position: "fixed",
      top: rect.bottom + gap,
      left: rect.left,
      width: Math.max(rect.width, 260),
      maxHeight: Math.min(maxHeight, spaceBelow),
      zIndex: 99999,
    });
  }, [mobileBreakpoint]);

  useEffect(() => {
    if (!open) return;
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (triggerRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      closeDropdown(manualApply);
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [closeDropdown, manualApply, open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeDropdown(manualApply);
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [closeDropdown, manualApply, open]);

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

  const normalizeSelection = useCallback(
    (next: string[]) => {
      const allowed = new Set(options.map((option) => option.value));
      return next.filter(
        (item, index) => allowed.has(item) && next.indexOf(item) === index,
      );
    },
    [options],
  );

  const updateSelection = useCallback(
    (next: string[], nextEmptyMeansAllSelected = false) => {
      const unique = normalizeSelection(next);
      if (manualApply) {
        setDraftExplicitValue(unique);
        setDraftEmptyMeansAllSelected(unique.length === 0 && nextEmptyMeansAllSelected);
        return;
      }
      onChange(unique);
    },
    [manualApply, normalizeSelection, onChange],
  );

  const toggleOption = useCallback(
    (optionValue: string) => {
      if (selectedSet.has(optionValue)) {
        updateSelection(effectiveValue.filter((item) => item !== optionValue));
        return;
      }
      updateSelection([...effectiveValue, optionValue]);
    },
    [effectiveValue, selectedSet, updateSelection],
  );

  const toggleFiltered = useCallback(() => {
    if (visibleValues.length === 0) return;
    if (allVisibleSelected) {
      const visibleSet = new Set(visibleValues);
      updateSelection(effectiveValue.filter((item) => !visibleSet.has(item)));
      return;
    }
    updateSelection([...effectiveValue, ...visibleValues]);
  }, [allVisibleSelected, effectiveValue, updateSelection, visibleValues]);

  const selectAllOptions = useCallback(() => {
    if (options.length === 0 || allOptionsSelectedExplicitly || implicitAllSelected) return;
    updateSelection(options.map((option) => option.value));
  }, [allOptionsSelectedExplicitly, implicitAllSelected, options, updateSelection]);

  const deselectAllOptions = useCallback(() => {
    updateSelection([]);
  }, [updateSelection]);

  const applyDraftSelection = useCallback(() => {
    if (!manualApply) return;
    onChange(normalizeSelection(draftExplicitValue));
    closeDropdown(false);
  }, [closeDropdown, draftExplicitValue, manualApply, normalizeSelection, onChange]);

  const hasPendingChanges =
    manualApply &&
    (!selectionsEqual(draftExplicitValue, sanitizedExplicitValue) ||
      draftEmptyMeansAllSelected !== committedEmptyMeansAllSelected);

  const selectedSummary = useMemo(() => {
    if (showAllSelectionSummary) return placeholder;
    if (activeExplicitValue.length === 0) {
      return emptySelectionLabel ?? selectedCountLabel(0);
    }
    const labels = activeExplicitValue
      .slice(0, maxSummaryItems)
      .map((item) =>
        optionText(options.find((option) => option.value === item) ?? { value: item, label: item }),
      )
      .join(", ");
    return activeExplicitValue.length > maxSummaryItems
      ? `${labels} +${activeExplicitValue.length - maxSummaryItems}`
      : labels;
  }, [
    activeExplicitValue,
    maxSummaryItems,
    emptySelectionLabel,
    options,
    placeholder,
    showAllSelectionSummary,
  ]);

  const showSelectionBadge = activeExplicitValue.length > 0 && !showAllSelectionSummary;

  const handleClear = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      onClear?.();
      updateSelection([]);
      setQuery("");
    },
    [onClear, updateSelection],
  );

  return (
    <>
      <div className={cn("group/multi-select relative", className)}>
        <button
          ref={triggerRef}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label={ariaLabel}
          disabled={disabled}
          onClick={() => {
              if (!open) {
                if (manualApply) setDraftExplicitValue(sanitizedExplicitValue);
                if (manualApply) setDraftEmptyMeansAllSelected(committedEmptyMeansAllSelected);
                updatePosition();
              }
              setOpen((current) => !current);
            }}
          className={cn(
            getSelectTriggerBase(size),
            "w-full justify-between text-left",
            disabled && selectTriggerDisabled,
          )}
        >
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-left",
              (activeExplicitValue.length === 0 || showAllSelectionSummary) &&
                "text-slate-400 dark:text-white/35",
            )}
          >
            {selectedSummary}
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {showSelectionBadge ? (
              <span className="rounded-md bg-sky-50 px-1.5 py-0.5 text-[11px] font-semibold text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
                {selectedCountLabel(activeExplicitValue.length)}
              </span>
            ) : null}
            <ChevronDown
              size={14}
              className={cn(
                selectChevron,
                showSelectionBadge &&
                  showClearButton &&
                  "group-hover/multi-select:opacity-0 group-focus-within/multi-select:opacity-0",
                open && "rotate-180",
              )}
              aria-hidden="true"
            />
          </span>
        </button>
        {value.length > 0 && showClearButton && !disabled ? (
          <button
            type="button"
            aria-label={clearLabel}
            onClick={handleClear}
            className={cn(
              "absolute right-3 top-1/2 z-10 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded",
              "text-slate-400 opacity-0 pointer-events-none transition-colors",
              "group-hover/multi-select:pointer-events-auto group-hover/multi-select:opacity-100",
              "group-focus-within/multi-select:pointer-events-auto group-focus-within/multi-select:opacity-100",
              "hover:bg-slate-100 hover:text-slate-600",
              "dark:hover:bg-white/10 dark:hover:text-slate-300",
            )}
          >
            <X size={12} />
          </button>
        ) : null}
      </div>

      {createPortal(
        <AnimatePresence>
          {open ? (
            <motion.div
              ref={dropdownRef}
              style={dropdownStyle}
              className={cn(searchableSelectPanel, "flex flex-col")}
              {...getSelectDropdownMotion(dropdownPlacement)}
              transition={selectDropdownTransition}
            >
              <div className={cn(selectSearchRow, "shrink-0")}>
                <Search
                  size={14}
                  className="shrink-0 text-[#96969B] dark:text-[#9F9FA8]"
                  aria-hidden="true"
                />
                <input
                  ref={searchRef}
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.currentTarget.value)}
                  placeholder={searchPlaceholder}
                  className={selectSearchInput}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              {selectAllLabel || showFilteredToggle ? (
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 dark:border-neutral-800">
                  <span
                    className={cn(
                      "text-xs font-medium",
                      showAllSelectionSummary
                        ? "text-emerald-600 dark:text-emerald-300"
                        : "text-slate-500 dark:text-white/50",
                    )}
                  >
                    {showAllSelectionSummary ? placeholder : selectedCountLabel(effectiveValue.length)}
                  </span>
                  <div className="flex items-center gap-2">
                    {selectAllLabel ? (
                      <button
                        type="button"
                        onClick={showAllSelectionSummary ? deselectAllOptions : selectAllOptions}
                        disabled={
                          options.length === 0 ||
                          (!deselectAllLabel && (allOptionsSelectedExplicitly || implicitAllSelected))
                        }
                        className="rounded-md px-2 py-1 text-xs font-medium text-indigo-600 transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:text-slate-300 dark:text-indigo-300 dark:hover:bg-indigo-500/10 dark:disabled:text-white/20"
                      >
                        {showAllSelectionSummary && deselectAllLabel
                          ? deselectAllLabel
                          : selectAllLabel}
                      </button>
                    ) : null}
                    {showFilteredToggle ? (
                      <button
                        type="button"
                        onClick={toggleFiltered}
                        disabled={visibleValues.length === 0}
                        className="rounded-md px-2 py-1 text-xs font-medium text-indigo-600 transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:text-slate-300 dark:text-indigo-300 dark:hover:bg-indigo-500/10 dark:disabled:text-white/20"
                      >
                        {allVisibleSelected ? deselectFilteredLabel : selectFilteredLabel}
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
              <div
                role="listbox"
                aria-label={ariaLabel}
                className="min-h-0 flex-1 overflow-y-auto p-1"
              >
                {filteredOptions.length === 0 ? (
                  <div className={selectEmptyState}>{noResultsLabel}</div>
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
                          selectOptionBase,
                          checked ? selectOptionSelected : selectOptionIdle,
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                            checked
                              ? "border-[#18181B] bg-[#18181B] text-white dark:border-white dark:bg-white dark:text-[#18181B]"
                              : "border-[#96969B] bg-white dark:border-[#9F9FA8] dark:bg-[#27272A]",
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
              {manualApply ? (
                <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-3 py-2 dark:border-neutral-800">
                  <button
                    type="button"
                    onClick={() => closeDropdown(true)}
                    className="rounded-md px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100 dark:text-white/60 dark:hover:bg-white/5"
                  >
                    {cancelLabel}
                  </button>
                  <button
                    type="button"
                    onClick={applyDraftSelection}
                    disabled={!hasPendingChanges}
                    className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 dark:bg-white dark:text-neutral-950 dark:hover:bg-slate-200 dark:disabled:bg-neutral-800 dark:disabled:text-white/30"
                  >
                    {applyLabel}
                  </button>
                </div>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
