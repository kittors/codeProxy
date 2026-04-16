import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import { Check, ChevronDown, X } from "lucide-react";
import {
  cn,
  searchableSelectPanel,
  selectChevron,
  selectEmptyState,
  selectOptionBase,
  selectOptionIdle,
  selectOptionSelected,
  selectSearchInput,
  selectTriggerBase,
  selectTriggerDisabled,
  selectTriggerOpen,
} from "./selectStyles";

export interface MultiSelectOption {
  value: string;
  label: string;
  icon?: ReactNode;
}

interface MultiSelectProps {
  options: MultiSelectOption[];
  value: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  emptyLabel?: string;
  selectAllLabel?: string;
  searchable?: boolean;
  disabled?: boolean;
  className?: string;
}

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder: _placeholder = "",
  emptyLabel = "All",
  selectAllLabel,
  searchable = true,
  disabled = false,
  className = "",
}: MultiSelectProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

  // Compute dropdown position from trigger bounding rect, with viewport flip
  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const dropdownMaxH = 280; // approximate max dropdown height
    const gap = 4;
    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;

    // Flip upward if not enough space below but enough above
    const openAbove = spaceBelow < dropdownMaxH && spaceAbove > spaceBelow;

    if (openAbove) {
      setDropdownStyle({
        position: "fixed",
        bottom: window.innerHeight - rect.top + gap,
        left: rect.left,
        width: rect.width,
        maxHeight: Math.min(dropdownMaxH, spaceAbove),
        zIndex: 99999,
      });
    } else {
      setDropdownStyle({
        position: "fixed",
        top: rect.bottom + gap,
        left: rect.left,
        width: rect.width,
        maxHeight: Math.min(dropdownMaxH, spaceBelow),
        zIndex: 99999,
      });
    }
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setOpen(false);
      setSearch("");
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Focus search on open + update position (useLayoutEffect to avoid flicker)
  useLayoutEffect(() => {
    if (open) {
      updatePosition();
      if (searchRef.current) {
        searchRef.current.focus();
      }
    }
  }, [open, updatePosition]);

  // Update position on window scroll/resize while open
  // Only listen at window level to avoid feedback loops with modal scroll containers
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
    const q = search.toLowerCase();
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
    );
  }, [options, search]);

  const selectedSet = useMemo(() => new Set(value), [value]);

  const toggle = useCallback(
    (optValue: string) => {
      if (selectedSet.has(optValue)) {
        onChange(value.filter((v) => v !== optValue));
      } else {
        onChange([...value, optValue]);
      }
    },
    [selectedSet, value, onChange],
  );

  const removeTag = useCallback(
    (optValue: string, e: React.MouseEvent) => {
      e.stopPropagation();
      onChange(value.filter((v) => v !== optValue));
    },
    [value, onChange],
  );

  const selectAll = useCallback(() => {
    onChange([]);
  }, [onChange]);

  const labelMap = useMemo(() => {
    const map = new Map<string, string>();
    options.forEach((o) => map.set(o.value, o.label));
    return map;
  }, [options]);

  const dropdown = open
    ? createPortal(
        <div
          ref={dropdownRef}
          style={dropdownStyle}
          className={cn(searchableSelectPanel, "flex flex-col")}
        >
          {searchable && (
            <div className="flex-shrink-0 border-b border-black/[0.06] px-3 py-2 dark:border-white/10">
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder=""
                className={selectSearchInput}
              />
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto p-1">
            {/* Select All option */}
            <button
              type="button"
              onClick={selectAll}
              className={cn(
                selectOptionBase,
                value.length === 0 ? selectOptionSelected : selectOptionIdle,
              )}
            >
              <div
                className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition ${
                  value.length === 0
                    ? "border-[#18181B] bg-[#18181B] dark:border-white dark:bg-white"
                    : "border-[#96969B] dark:border-[#9F9FA8]"
                }`}
              >
                {value.length === 0 && (
                  <Check size={12} className="text-white dark:text-[#18181B]" />
                )}
              </div>
              <span className="font-medium">{selectAllLabel || t("common.all_models")}</span>
            </button>

            <div className="mx-3 my-1 h-px bg-black/[0.06] dark:bg-white/10" />

            {filteredOptions.length === 0 ? (
              <div className={selectEmptyState}>No results</div>
            ) : (
              filteredOptions.map((opt) => {
                const checked = selectedSet.has(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggle(opt.value)}
                    className={cn(
                      selectOptionBase,
                      checked ? selectOptionSelected : selectOptionIdle,
                    )}
                  >
                    <div
                      className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition ${
                        checked
                          ? "border-[#18181B] bg-[#18181B] dark:border-white dark:bg-white"
                          : "border-[#96969B] dark:border-[#9F9FA8]"
                      }`}
                    >
                      {checked && <Check size={12} className="text-white dark:text-[#18181B]" />}
                    </div>
                    {opt.icon && <span className="flex-shrink-0">{opt.icon}</span>}
                    <span className="truncate font-mono text-xs">{opt.label}</span>
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
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          // Pre-compute position before opening so the portal renders at the correct spot
          if (!open) updatePosition();
          setOpen(!open);
        }}
        className={cn(
          selectTriggerBase,
          "h-auto min-h-9 w-full justify-between py-1 text-left",
          open && selectTriggerOpen,
          disabled && selectTriggerDisabled,
        )}
      >
        <div className="flex min-w-0 flex-1 flex-wrap gap-1">
          {value.length === 0 ? (
            <span className="inline-flex items-center gap-1 text-[#18181B] dark:text-white">
              {emptyLabel}
            </span>
          ) : (
            value.slice(0, 5).map((v) => {
              const opt = options.find((o) => o.value === v);
              return (
                <span
                  key={v}
                  className="inline-flex max-w-[180px] items-center gap-1 rounded-full bg-white px-1.5 py-0.5 text-xs text-[#18181B] dark:bg-[#46464C] dark:text-white"
                >
                  {opt?.icon && <span className="flex-shrink-0">{opt.icon}</span>}
                  <span className="truncate">{labelMap.get(v) || v}</span>
                  {!disabled && (
                    <button
                      type="button"
                      onClick={(e) => removeTag(v, e)}
                      className="ml-0.5 flex-shrink-0 rounded-full p-0.5 hover:bg-[#EBEBEC] dark:hover:bg-[#27272A]"
                    >
                      <X size={10} />
                    </button>
                  )}
                </span>
              );
            })
          )}
          {value.length > 5 && <span className="text-xs text-slate-400">+{value.length - 5}</span>}
        </div>
        <ChevronDown
          size={16}
          className={cn(selectChevron, "flex-shrink-0", open && "rotate-180")}
        />
      </button>

      {dropdown}
    </div>
  );
}
