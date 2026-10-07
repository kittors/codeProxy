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
  selectTriggerState,
} from "../utils/selectStyles";
import type { ControlSize } from "../utils/controlStyles";
import { useScrollFade } from "../hooks/useScrollFade";

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
  size?: ControlSize;
  "aria-label"?: string;
  /**
   * 由 FormField 注入：`<label htmlFor>` 指到触发器；出错时描边变红、读屏读到错误，
   * 提交校验也能把焦点送过来（`focusFirstInvalid` 找的就是 aria-invalid）。
   */
  id?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-describedby"?: string;
}

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder: _placeholder = "",
  emptyLabel,
  selectAllLabel,
  searchable = true,
  disabled = false,
  className = "",
  size = "default",
  "aria-label": ariaLabel,
  id,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: MultiSelectProps) {
  const { t } = useTranslation();
  const resolvedEmptyLabel = emptyLabel ?? t("ui.select_all_label");
  const [open, setOpen] = useState(false);
  const listFade = useScrollFade<HTMLDivElement>({ enabled: open, size: 24 });
  const [search, setSearch] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const [dropdownPlacement, setDropdownPlacement] = useState<"bottom" | "top">("bottom");

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
      setDropdownPlacement("top");
      setDropdownStyle({
        position: "fixed",
        bottom: window.innerHeight - rect.top + gap,
        left: rect.left,
        width: rect.width,
        maxHeight: Math.min(dropdownMaxH, spaceAbove),
        zIndex: 99999,
      });
    } else {
      setDropdownPlacement("bottom");
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

  // Esc 收起下拉，并吃掉这次按键：外层弹窗看到 defaultPrevented 就不会跟着关闭。
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      setSearch("");
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
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

  const dropdown = createPortal(
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
          {searchable && (
            <div className="flex-shrink-0 border-b border-line px-3.5 py-2.5">
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder=""
                aria-label={t("ui.search_placeholder")}
                className={selectSearchInput}
              />
            </div>
          )}
          <div
            ref={listFade.ref}
            onScroll={listFade.onScroll}
            style={listFade.style}
            className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5", listFade.className)}
          >
            {/* Select All option */}
            <button
              type="button"
              onClick={selectAll}
              className={cn(
                selectOptionBase,
                value.length === 0 ? selectOptionSelected : selectOptionIdle,
              )}
            >
              <div className={selectCheckboxBox(value.length === 0)}>
                {value.length === 0 && <Check size={12} />}
              </div>
              <span className="font-medium">{selectAllLabel || t("common.all_models")}</span>
            </button>

            <div className="mx-2.5 my-1 h-px bg-line" />

            {filteredOptions.length === 0 ? (
              <div className={selectEmptyState}>{t("ui.no_match")}</div>
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
                    <div className={selectCheckboxBox(checked)}>
                      {checked && <Check size={12} />}
                    </div>
                    {opt.icon && <span className="flex-shrink-0">{opt.icon}</span>}
                    <span className="truncate font-mono text-xs">{opt.label}</span>
                  </button>
                );
              })
            )}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );

  return (
    <div className={`relative ${className}`}>
      {/* Trigger */}
      <button
        ref={triggerRef}
        id={id}
        type="button"
        // 与 Select 一样是「只能选、不能打字」的 combobox：名称来自字段标签，当前选择作为它的值
        // 被读出来；若还是普通 button，接上标签后读屏就只剩标签、听不到选了什么。
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        disabled={disabled}
        data-state={selectTriggerState(open)}
        onClick={() => {
          // Pre-compute position before opening so the portal renders at the correct spot
          if (!open) updatePosition();
          setOpen(!open);
        }}
        className={cn(
          getSelectTriggerBase(size, "multiline"),
          "h-auto min-h-9 w-full justify-between py-1 text-left",
        )}
      >
        <div className="flex min-w-0 flex-1 flex-wrap gap-1">
          {value.length === 0 ? (
            <span className="inline-flex items-center gap-1 text-ink">
              {resolvedEmptyLabel}
            </span>
          ) : (
            value.slice(0, 5).map((v) => {
              const opt = options.find((o) => o.value === v);
              return (
                <span
                  key={v}
                  className="inline-flex max-w-[180px] items-center gap-1 rounded-full bg-selected px-2 py-0.5 text-xs text-ink"
                >
                  {opt?.icon && <span className="flex-shrink-0">{opt.icon}</span>}
                  <span className="truncate">{labelMap.get(v) || v}</span>
                  {/* 触发器本身是按钮，里面不能再套按钮（无效 HTML，读屏也会读乱）。这个小叉只给
                      鼠标用户快捷移除；键盘与读屏用户展开列表取消勾选即可。 */}
                  {!disabled && (
                    <span
                      aria-hidden="true"
                      onClick={(e) => removeTag(v, e)}
                      className="-mr-0.5 ml-0.5 flex-shrink-0 cursor-pointer rounded-full p-0.5 text-ink-3 hover:bg-hover hover:text-ink"
                    >
                      <X size={10} />
                    </span>
                  )}
                </span>
              );
            })
          )}
          {value.length > 5 && <span className="text-xs text-ink-3">+{value.length - 5}</span>}
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
