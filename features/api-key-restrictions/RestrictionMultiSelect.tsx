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
import {
  floatingPanelSurface,
  getSelectTriggerBase,
  selectTriggerState,
  type MultiSelectOption,
  ScrollFade,
} from "@code-proxy/ui";

interface RestrictionMultiSelectProps {
  options: MultiSelectOption[];
  value: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  unrestrictedLabel: string;
  selectedCountLabel: (count: number) => string;
  searchPlaceholder: string;
  selectFilteredLabel: string;
  clearRestrictionLabel: string;
  noResultsLabel: string;
  disabled?: boolean;
  className?: string;
  /** 由 FormField 注入：标签点得到触发器，读屏能把标签和说明读出来。 */
  id?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-describedby"?: string;
}

function normalizeSelection(options: MultiSelectOption[], selected: string[]): string[] {
  if (selected.length === 0) return [];

  const allowed = new Set(options.map((option) => option.value));
  const next = selected.filter(
    (item, index) => allowed.has(item) && selected.indexOf(item) === index,
  );
  if (next.length === 0 || (options.length > 1 && next.length === options.length)) {
    return [];
  }
  return next;
}

export function RestrictionMultiSelect({
  options,
  value,
  onChange,
  placeholder = "",
  unrestrictedLabel,
  selectedCountLabel,
  searchPlaceholder,
  selectFilteredLabel,
  clearRestrictionLabel,
  noResultsLabel,
  disabled = false,
  className = "",
  id,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: RestrictionMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const [dropdownPlacement, setDropdownPlacement] = useState<"bottom" | "top">("bottom");

  const selectedValues = useMemo(() => normalizeSelection(options, value), [options, value]);
  const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues]);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const dropdownMaxH = 320;
    const gap = 4;
    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    const openAbove = spaceBelow < dropdownMaxH && spaceAbove > spaceBelow;

    if (openAbove) {
      setDropdownPlacement("top");
      setDropdownStyle({
        position: "fixed",
        bottom: window.innerHeight - rect.top + gap,
        left: rect.left,
        width: rect.width,
        maxHeight: Math.min(dropdownMaxH, spaceAbove),
        zIndex: 99999,
      });
      return;
    }

    setDropdownPlacement("bottom");
    setDropdownStyle({
      position: "fixed",
      top: rect.bottom + gap,
      left: rect.left,
      width: rect.width,
      maxHeight: Math.min(dropdownMaxH, spaceBelow),
      zIndex: 99999,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setOpen(false);
      setSearch("");
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    searchRef.current?.focus();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onUpdate = () => updatePosition();
    window.addEventListener("scroll", onUpdate);
    window.addEventListener("resize", onUpdate);
    return () => {
      window.removeEventListener("scroll", onUpdate);
      window.removeEventListener("resize", onUpdate);
    };
  }, [open, updatePosition]);

  const filteredOptions = useMemo(() => {
    if (!search) return options;
    const keyword = search.toLowerCase();
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(keyword) ||
        option.value.toLowerCase().includes(keyword),
    );
  }, [options, search]);

  const labelMap = useMemo(() => {
    const map = new Map<string, { label: string; icon?: ReactNode }>();
    options.forEach((option) => map.set(option.value, { label: option.label, icon: option.icon }));
    return map;
  }, [options]);

  const commitSelection = useCallback(
    (next: string[]) => {
      onChange(normalizeSelection(options, next));
    },
    [onChange, options],
  );

  const toggle = useCallback(
    (optionValue: string) => {
      if (selectedSet.has(optionValue)) {
        commitSelection(selectedValues.filter((valueItem) => valueItem !== optionValue));
        return;
      }
      commitSelection([...selectedValues, optionValue]);
    },
    [commitSelection, selectedSet, selectedValues],
  );

  const selectFiltered = useCallback(() => {
    const visibleValues = filteredOptions.map((option) => option.value);
    if (visibleValues.length === 0) return;
    commitSelection([...selectedValues, ...visibleValues]);
  }, [commitSelection, filteredOptions, selectedValues]);

  const clearRestriction = useCallback(() => {
    onChange([]);
  }, [onChange]);

  const triggerSummary = useMemo(() => {
    if (selectedValues.length === 0) {
      return (
        // 「不限制」：简约风格是中性淡底；多彩风格是绿色胶囊，勾跟随胶囊的字色。
        <span className="inline-flex items-center gap-1 rounded-full bg-ink/[0.05] px-2 py-0.5 text-xs font-medium text-ink-2 dark:bg-white/[0.07] colorful:bg-emerald-50 colorful:text-emerald-700 colorful:dark:bg-emerald-500/15 colorful:dark:text-emerald-300">
          <Check size={12} className="text-ink-3 colorful:text-current" />
          {unrestrictedLabel}
        </span>
      );
    }

    return (
      <div className="flex min-w-0 items-center gap-2">
        <span className="inline-flex rounded-full bg-ink/[0.05] px-2 py-0.5 text-xs font-medium text-ink dark:bg-white/[0.07]">
          {selectedCountLabel(selectedValues.length)}
        </span>
        <span className="min-w-0 truncate text-xs font-normal text-ink-3">
          {selectedValues
            .slice(0, 2)
            .map((item) => labelMap.get(item)?.label || item)
            .join(", ")}
          {selectedValues.length > 2 ? ` +${selectedValues.length - 2}` : ""}
        </span>
      </div>
    );
  }, [labelMap, selectedCountLabel, selectedValues, unrestrictedLabel]);

  const dropdown = open
    ? createPortal(
        <div
          ref={dropdownRef}
          style={dropdownStyle}
          data-state="open"
          data-side={dropdownPlacement}
          className={`flex flex-col overflow-hidden ${floatingPanelSurface}`}
        >
          <div className="px-2 pt-2">
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={searchPlaceholder}
              className="w-full rounded-lg bg-subtle px-2.5 py-2 text-sm text-ink outline-none placeholder:text-ink-3"
            />
          </div>
          <div className="flex items-center justify-between gap-2 px-3 pt-2 pb-1">
            <span
              className={`text-xs font-medium text-ink-3 ${
                selectedValues.length === 0 ? "colorful:text-emerald-600 colorful:dark:text-emerald-300" : ""
              }`}
            >
              {selectedValues.length === 0
                ? unrestrictedLabel
                : selectedCountLabel(selectedValues.length)}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectFiltered}
                disabled={filteredOptions.length === 0}
                className="rounded-md px-2 py-1 text-xs font-medium text-ink transition hover:bg-hover disabled:cursor-not-allowed disabled:text-ink-4"
              >
                {selectFilteredLabel}
              </button>
              <button
                type="button"
                onClick={clearRestriction}
                className="rounded-md px-2 py-1 text-xs font-medium text-ink-2 transition hover:bg-hover hover:text-ink"
              >
                {clearRestrictionLabel}
              </button>
            </div>
          </div>
          <ScrollFade className="min-h-0 flex-1 overflow-y-auto p-1">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-ink-3">
                {noResultsLabel}
              </div>
            ) : (
              filteredOptions.map((option) => {
                const checked = selectedSet.has(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => toggle(option.value)}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-hover ${
                      checked ? "text-ink" : "text-ink-2"
                    }`}
                  >
                    {/* 勾选框的 1px 描边是控件轮廓，与共享 Checkbox（Checkbox.css）一致，不是盒子描边。 */}
                    <div
                      className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition ${
                        checked
                          ? "border-accent bg-accent"
                          : "border-ink-3"
                      }`}
                    >
                      {checked && <Check size={12} className="text-accent-fg" />}
                    </div>
                    {option.icon && <span className="flex-shrink-0">{option.icon}</span>}
                    <span className="truncate font-mono text-xs">{option.label}</span>
                  </button>
                );
              })
            )}
          </ScrollFade>
        </div>,
        document.body,
      )
    : null;

  return (
    <div className={`relative ${className}`}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        // 与 Select 一样是「只能选、不能打字」的 combobox：名称来自字段标签，当前选择作为它的值
        // 被读出来；若还是普通 button，接上标签后读屏就只剩标签、听不到选了什么。
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        disabled={disabled}
        data-state={selectTriggerState(open)}
        onClick={() => {
          if (!open) updatePosition();
          setOpen(!open);
        }}
        className={`${getSelectTriggerBase()} w-full text-left`}
      >
        <div className="min-w-0 flex-1">
          {options.length === 0 ? (
            <span className="font-normal text-ink-3">{placeholder}</span>
          ) : (
            triggerSummary
          )}
        </div>
        <ChevronDown
          size={16}
          className={`flex-shrink-0 text-ink-3 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {dropdown}
    </div>
  );
}
