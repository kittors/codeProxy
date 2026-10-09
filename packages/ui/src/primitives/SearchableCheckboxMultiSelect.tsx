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
  selectCheckboxBox,
  selectChevron,
  selectDropdownTransition,
  selectEmptyState,
  selectOptionBase,
  selectOptionIdle,
  selectOptionSelected,
  selectSearchInput,
  selectSearchRow,
  selectTextAction,
  selectTriggerState,
} from "../utils/selectStyles";
import type { ControlSize } from "../utils/controlStyles";
import { ScrollArea } from "./ScrollArea";

export interface SearchableCheckboxMultiSelectOption {
  value: string;
  label: ReactNode;
  searchText?: string;
  /** Full text shown by the native tooltip when the rendered label is truncated. */
  title?: string;
  /** Optional fixed trailing content, such as a request count. */
  trailing?: ReactNode;
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
  /**
   * 由 FormField 注入：`<label htmlFor>` 指到触发器；出错时描边变红、读屏读到错误，
   * 提交校验也能把焦点送过来（`focusFirstInvalid` 找的就是 aria-invalid）。
   */
  id?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-describedby"?: string;
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
  /** Render the implicit all state as an unrestricted filter with no checked rows. */
  neutralAllSelection?: boolean;
  allSelectionLabel?: string;
  selectionHint?: string;
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
  id,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
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
  neutralAllSelection = false,
  allSelectionLabel = "",
  selectionHint = "",
}: SearchableCheckboxMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties>({});
  const [dropdownPlacement, setDropdownPlacement] = useState<"bottom" | "top">("bottom");
  const [listMaxHeight, setListMaxHeight] = useState(224);

  const manualApply = applyMode === "manual";
  const committedEmptyMeansAllSelected =
    emptyValueMeansAllSelected &&
    (emptyValueRepresentsAllSelected ?? (value.length === 0 && options.length > 0));

  const sanitizedExplicitValue = useMemo(() => {
    const allowed = new Set(options.map((option) => option.value));
    return value.filter((item, index) => allowed.has(item) && value.indexOf(item) === index);
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
    emptyValueMeansAllSelected && activeEmptyMeansAllSelected && activeExplicitValue.length === 0;

  const effectiveValue = useMemo(
    () =>
      implicitAllSelected
        ? neutralAllSelection
          ? []
          : options.map((option) => option.value)
        : activeExplicitValue,
    [activeExplicitValue, implicitAllSelected, neutralAllSelection, options],
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
    const listChromeHeight = (manualApply ? 132 : 84) + (selectionHint ? 14 : 0);
    const setPanelMaxHeight = (height: number) => {
      setListMaxHeight(Math.max(96, height - listChromeHeight));
      return height;
    };

    const isNarrow = window.innerWidth < mobileBreakpoint;
    if (isNarrow) {
      const maxHeightMobile = Math.min(420, window.innerHeight * 0.7);
      const spaceBelow = window.innerHeight - rect.bottom - gap;
      const spaceAbove = rect.top - gap;
      const openAbove = spaceBelow < maxHeightMobile && spaceAbove > spaceBelow;

      if (openAbove) {
        const panelMaxHeight = setPanelMaxHeight(Math.min(maxHeightMobile, spaceAbove));
        setDropdownPlacement("top");
        setDropdownStyle({
          position: "fixed",
          left: 12,
          right: 12,
          width: "auto",
          maxHeight: panelMaxHeight,
          bottom: window.innerHeight - rect.top + gap,
          zIndex: 99999,
        });
        return;
      }
      const panelMaxHeight = setPanelMaxHeight(Math.min(maxHeightMobile, spaceBelow));
      setDropdownPlacement("bottom");
      setDropdownStyle({
        position: "fixed",
        left: 12,
        right: 12,
        width: "auto",
        maxHeight: panelMaxHeight,
        top: Math.min(rect.bottom + gap, window.innerHeight - maxHeightMobile - 12),
        zIndex: 99999,
      });
      return;
    }

    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    const openAbove = spaceBelow < maxHeight && spaceAbove > spaceBelow;

    if (openAbove) {
      const panelMaxHeight = setPanelMaxHeight(Math.min(maxHeight, spaceAbove));
      setDropdownPlacement("top");
      setDropdownStyle({
        position: "fixed",
        bottom: window.innerHeight - rect.top + gap,
        left: rect.left,
        width: Math.max(rect.width, options.some((option) => option.trailing) ? 300 : 260),
        maxHeight: panelMaxHeight,
        zIndex: 99999,
      });
      return;
    }

    const panelMaxHeight = setPanelMaxHeight(Math.min(maxHeight, spaceBelow));
    setDropdownPlacement("bottom");
    setDropdownStyle({
      position: "fixed",
      top: rect.bottom + gap,
      left: rect.left,
      width: Math.max(rect.width, options.some((option) => option.trailing) ? 300 : 260),
      maxHeight: panelMaxHeight,
      zIndex: 99999,
    });
  }, [manualApply, mobileBreakpoint, options, selectionHint]);

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
        // 吃掉这次 Esc：外层弹窗看到 defaultPrevented 就不会跟着关闭（只收起下拉）。
        event.preventDefault();
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
      return next.filter((item, index) => allowed.has(item) && next.indexOf(item) === index);
    },
    [options],
  );

  const updateSelection = useCallback(
    (next: string[], nextEmptyMeansAllSelected = false) => {
      const unique = normalizeSelection(next);
      const representsAll =
        emptyValueMeansAllSelected &&
        (nextEmptyMeansAllSelected ||
          (neutralAllSelection &&
            (unique.length === 0 || (options.length > 0 && unique.length === options.length))));
      if (manualApply) {
        setDraftExplicitValue(representsAll ? [] : unique);
        setDraftEmptyMeansAllSelected(representsAll);
        return;
      }
      onChange(representsAll ? options.map((option) => option.value) : unique);
    },
    [
      emptyValueMeansAllSelected,
      manualApply,
      neutralAllSelection,
      normalizeSelection,
      onChange,
      options,
    ],
  );

  const toggleOption = useCallback(
    (optionValue: string) => {
      if (selectedSet.has(optionValue)) {
        updateSelection(effectiveValue.filter((item) => item !== optionValue));
        return;
      }
      // In neutral-all mode the unrestricted state has no checked rows, so the
      // first click directly selects that item instead of excluding it from all.
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
    onChange(
      draftEmptyMeansAllSelected
        ? options.map((option) => option.value)
        : normalizeSelection(draftExplicitValue),
    );
    closeDropdown(false);
  }, [
    closeDropdown,
    draftEmptyMeansAllSelected,
    draftExplicitValue,
    manualApply,
    normalizeSelection,
    onChange,
    options,
  ]);

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
      if (onClear) {
        if (manualApply) {
          setDraftExplicitValue([]);
          setDraftEmptyMeansAllSelected(emptyValueMeansAllSelected);
        }
        onClear();
        closeDropdown(false);
        return;
      }
      updateSelection([]);
      setQuery("");
    },
    [closeDropdown, emptyValueMeansAllSelected, manualApply, onClear, updateSelection],
  );

  return (
    <>
      <div className={cn("group/multi-select relative", className)}>
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
          onClick={() => {
            if (!open) {
              if (manualApply) setDraftExplicitValue(sanitizedExplicitValue);
              if (manualApply) setDraftEmptyMeansAllSelected(committedEmptyMeansAllSelected);
              updatePosition();
            }
            setOpen((current) => !current);
          }}
          className={cn(getSelectTriggerBase(size), "w-full justify-between text-left")}
        >
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-left",
              (activeExplicitValue.length === 0 || showAllSelectionSummary) &&
                "text-ink-3",
            )}
          >
            {selectedSummary}
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {showSelectionBadge ? (
              <span className="rounded-full bg-selected px-2 py-0.5 text-xs font-medium text-ink">
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
              "absolute right-3 top-1/2 z-10 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full",
              "text-ink-3 opacity-0 pointer-events-none transition-colors",
              "group-hover/multi-select:pointer-events-auto group-hover/multi-select:opacity-100",
              "group-focus-within/multi-select:pointer-events-auto group-focus-within/multi-select:opacity-100",
              "hover:bg-hover hover:text-ink-2",
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
              data-side={dropdownPlacement}
              style={dropdownStyle}
              className={cn(searchableSelectPanel, "flex flex-col")}
              {...getSelectDropdownMotion(dropdownPlacement)}
              transition={selectDropdownTransition}
            >
              <div className={cn(selectSearchRow, "shrink-0")}>
                <Search size={14} className="shrink-0 text-ink-3" aria-hidden="true" />
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
              {selectAllLabel || neutralAllSelection || showFilteredToggle || selectionHint ? (
                <div className="flex items-center justify-between gap-2 border-b border-line py-2 pl-3.5 pr-2">
                  <span className="min-w-0">
                    <span
                      className={cn(
                        "block text-xs font-medium",
                        // 「全部」是当前生效的选择：简约风格用强调色，多彩风格沿用绿色。
                        showAllSelectionSummary
                          ? "text-accent-ink colorful:text-emerald-600 colorful:dark:text-emerald-300"
                          : "text-ink-2",
                      )}
                    >
                      {showAllSelectionSummary
                        ? placeholder
                        : selectedCountLabel(effectiveValue.length)}
                    </span>
                    {selectionHint ? (
                      <span className="mt-0.5 block truncate text-2xs text-ink-3">
                        {selectionHint}
                      </span>
                    ) : null}
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    {neutralAllSelection ? (
                      <button
                        type="button"
                        onClick={() => updateSelection([], true)}
                        disabled={options.length === 0 || showAllSelectionSummary}
                        className={cn(selectTextAction, "disabled:cursor-default")}
                      >
                        {allSelectionLabel || placeholder}
                      </button>
                    ) : selectAllLabel ? (
                      <button
                        type="button"
                        onClick={showAllSelectionSummary ? deselectAllOptions : selectAllOptions}
                        disabled={
                          options.length === 0 ||
                          (!deselectAllLabel &&
                            (allOptionsSelectedExplicitly || implicitAllSelected))
                        }
                        className={selectTextAction}
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
                        className={selectTextAction}
                      >
                        {allVisibleSelected ? deselectFilteredLabel : selectFilteredLabel}
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
              <ScrollArea
                role="listbox"
                aria-label={ariaLabel}
                className="min-h-0 flex-1 [&_[data-scroll-area-scrollbar='y']]:right-1"
                viewportClassName="!h-auto"
                viewportStyle={{ maxHeight: listMaxHeight }}
                contentClassName="p-1.5"
                scrollbarVisibility="always"
                scrollbarTrackInset={4}
                edgeFade={24}
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
                        <span className={selectCheckboxBox(checked)} aria-hidden="true">
                          {checked ? <Check size={12} /> : null}
                        </span>
                        <span
                          className="min-w-0 flex-1 truncate text-left"
                          title={
                            option.title ??
                            (typeof option.label === "string" ? option.label : undefined)
                          }
                        >
                          {option.label}
                        </span>
                        {option.trailing ? (
                          <>
                            <span className="sr-only">, </span>
                            <span className="inline-flex shrink-0 items-center">
                              {option.trailing}
                            </span>
                          </>
                        ) : null}
                      </button>
                    );
                  })
                )}
              </ScrollArea>
              {manualApply ? (
                <div className="flex items-center justify-end gap-2 border-t border-line px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => closeDropdown(true)}
                    className={cn(selectTextAction, "px-3 py-1.5")}
                  >
                    {cancelLabel}
                  </button>
                  <button
                    type="button"
                    onClick={applyDraftSelection}
                    disabled={!hasPendingChanges}
                    className="rounded-full bg-accent px-3.5 py-1.5 text-xs font-medium text-accent-fg transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-selected disabled:text-ink-3"
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
