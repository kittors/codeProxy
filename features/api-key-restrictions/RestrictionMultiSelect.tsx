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
import { floatingPanelSurface, type MultiSelectOption } from "@code-proxy/ui";

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
}

function normalizeSelection(options: MultiSelectOption[], selected: string[]): string[] {
  if (selected.length === 0) return [];

  const allowed = new Set(options.map((option) => option.value));
  const next = selected.filter(
    (item, index) => allowed.has(item) && selected.indexOf(item) === index,
  );
  if (next.length === 0 || next.length === options.length) {
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
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
          <Check size={12} />
          {unrestrictedLabel}
        </span>
      );
    }

    return (
      <div className="flex min-w-0 items-center gap-2">
        <span className="inline-flex rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
          {selectedCountLabel(selectedValues.length)}
        </span>
        <span className="min-w-0 truncate text-xs text-slate-500 dark:text-white/50">
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
          <div className="border-b border-slate-100 px-3 py-2 dark:border-neutral-800">
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={searchPlaceholder}
              className="w-full rounded-lg bg-slate-50 px-2.5 py-2 text-sm text-slate-900 outline-none ring-0 placeholder:text-slate-400 focus:bg-white dark:bg-neutral-800 dark:text-white dark:placeholder:text-white/30 dark:focus:bg-neutral-900"
            />
          </div>
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 dark:border-neutral-800">
            <span
              className={`text-xs font-medium ${
                selectedValues.length === 0
                  ? "text-emerald-600 dark:text-emerald-300"
                  : "text-slate-500 dark:text-white/50"
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
                className="rounded-md px-2 py-1 text-xs font-medium text-indigo-600 transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:text-slate-300 dark:text-indigo-300 dark:hover:bg-indigo-500/10 dark:disabled:text-white/20"
              >
                {selectFilteredLabel}
              </button>
              <button
                type="button"
                onClick={clearRestriction}
                className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-100 dark:text-white/60 dark:hover:bg-white/5"
              >
                {clearRestrictionLabel}
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-1">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-slate-400 dark:text-white/30">
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
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                      checked
                        ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-300"
                        : "text-slate-700 hover:bg-slate-50 dark:text-white/70 dark:hover:bg-white/5"
                    }`}
                  >
                    <div
                      className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition ${
                        checked
                          ? "border-indigo-500 bg-indigo-500 dark:border-indigo-400 dark:bg-indigo-400"
                          : "border-slate-300 dark:border-neutral-600"
                      }`}
                    >
                      {checked && <Check size={12} className="text-white dark:text-black" />}
                    </div>
                    {option.icon && <span className="flex-shrink-0">{option.icon}</span>}
                    <span className="truncate font-mono text-xs">{option.label}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <div className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!open) updatePosition();
          setOpen(!open);
        }}
        className={`flex min-h-[42px] w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-all ${
          disabled
            ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white/40"
            : open
              ? "border-indigo-400 bg-white ring-2 ring-indigo-400/20 dark:border-indigo-500 dark:bg-neutral-900"
              : "border-slate-200 bg-white hover:border-slate-300 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-neutral-600"
        }`}
      >
        <div className="min-w-0 flex-1">
          {options.length === 0 ? (
            <span className="text-slate-400 dark:text-white/30">{placeholder}</span>
          ) : (
            triggerSummary
          )}
        </div>
        <ChevronDown
          size={16}
          className={`flex-shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {dropdown}
    </div>
  );
}
