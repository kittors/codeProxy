import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import { Icon } from "satin-ui/react";
import {
  cn,
  getSelectTriggerBase,
  searchableSelectPanel,
  selectCheckboxBox,
  selectChevron,
  selectEmptyState,
  selectOptionBase,
  selectOptionIdle,
  selectOptionSelected,
  selectSearchInput,
  selectTriggerState,
} from "../utils/selectStyles";
import type { ControlSize } from "../utils/controlStyles";
import { useScrollFade } from "../hooks/useScrollFade";
import { resolvePortalContainer } from "../overlays/portalContainer";
import { useSatinFloatingLayer } from "../overlays/useSatinFloatingLayer";

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
  const isOpen = open && !disabled;
  const listFade = useScrollFade<HTMLDivElement>({ enabled: isOpen, size: 24 });
  const [search, setSearch] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const floating = useSatinFloatingLayer({
    open: isOpen,
    anchorRef: triggerRef,
    panelRef: dropdownRef,
    placement: "bottom",
    align: "start",
    gap: 6,
    margin: 8,
    onClose: (_reason, refocus) => {
      setOpen(false);
      setSearch("");
      if (refocus) triggerRef.current?.focus({ preventScroll: true });
    },
  });

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [isOpen]);

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

  const dropdown = floating.mounted && !disabled
    ? createPortal(
        <div
          ref={dropdownRef}
          aria-hidden={floating.isOpen ? undefined : true}
          data-side={floating.side}
          data-state={floating.isOpen ? "open" : "closed"}
          style={{
            top: floating.top,
            left: floating.left,
            width: Math.max(floating.anchorWidth, 220),
            maxHeight: Math.min(280, floating.availableHeight),
            transformOrigin: floating.origin,
          }}
          className={cn(
            searchableSelectPanel,
            floating.isOpen ? "sn-open" : null,
            floating.up ? "sn-up" : null,
            floating.end ? "sn-end" : null,
          )}
        >
          {searchable && (
            <div className="flex-shrink-0 border-b border-[var(--sn-line)] px-3.5 py-2.5">
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
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5"
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
                {value.length === 0 && <Icon name="check" size={12} />}
              </div>
              <span className="font-medium">{selectAllLabel || t("common.all_models")}</span>
            </button>

            <div className="mx-2.5 my-1 h-px bg-[var(--sn-line)]" />

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
                      {checked && <Icon name="check" size={12} />}
                    </div>
                    {opt.icon && <span className="flex-shrink-0">{opt.icon}</span>}
                    <span className="truncate font-mono text-xs">{opt.label}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>,
        resolvePortalContainer(triggerRef.current),
      )
    : null;

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
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        disabled={disabled}
        data-state={selectTriggerState(isOpen)}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          getSelectTriggerBase(size, "multiline"),
          "h-auto min-h-9 w-full justify-between py-1 text-left",
        )}
      >
        <div className="flex min-w-0 flex-1 flex-wrap gap-1">
          {value.length === 0 ? (
            <span className="inline-flex items-center gap-1 text-[var(--sn-label)]">
              {resolvedEmptyLabel}
            </span>
          ) : (
            value.slice(0, 5).map((v) => {
              const opt = options.find((o) => o.value === v);
              return (
                <span
                  key={v}
                  className="inline-flex max-w-[180px] items-center gap-1 rounded-md border border-[var(--sn-line)] bg-[var(--sn-fill-subtle)] px-2 py-0.5 text-xs text-[var(--sn-label)]"
                >
                  {opt?.icon && <span className="flex-shrink-0">{opt.icon}</span>}
                  <span className="truncate">{labelMap.get(v) || v}</span>
                  {/* 触发器本身是按钮，里面不能再套按钮（无效 HTML，读屏也会读乱）。这个小叉只给
                      鼠标用户快捷移除；键盘与读屏用户展开列表取消勾选即可。 */}
                  {!disabled && (
                    <span
                      aria-hidden="true"
                      onClick={(e) => removeTag(v, e)}
                      className="-mr-0.5 ml-0.5 flex-shrink-0 cursor-pointer rounded p-0.5 text-[var(--sn-label3)] hover:bg-[var(--sn-fill-hover)] hover:text-[var(--sn-label)]"
                    >
                      <Icon name="x" size={10} />
                    </span>
                  )}
                </span>
              );
            })
          )}
          {value.length > 5 && <span className="text-xs text-[var(--sn-label3)]">+{value.length - 5}</span>}
        </div>
        <Icon
          name="chevron-down"
          size={16}
          className={cn(selectChevron, "flex-shrink-0", isOpen && "rotate-180")}
        />
      </button>

      {dropdown}
    </div>
  );
}
