import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Icon } from "satin-ui/react";
import {
  cn,
  getSelectTriggerBase,
  searchableSelectPanel,
  selectChevron,
  selectEmptyState,
  selectOptionBase,
  selectOptionIdle,
  selectOptionSelected,
  selectSearchInput,
  selectSearchRow,
  selectTriggerGhost,
  selectTriggerState,
} from "../utils/selectStyles";
import type { ControlSize } from "../utils/controlStyles";
import { useTranslation } from "react-i18next";
import { useScrollFade } from "../hooks/useScrollFade";
import { resolvePortalContainer } from "../overlays/portalContainer";
import { useSatinFloatingLayer } from "../overlays/useSatinFloatingLayer";

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
  /**
   * 由 FormField 注入：`<label htmlFor>` 指到触发器；出错时描边变红、读屏读到错误，
   * 提交校验也能把焦点送过来（`focusFirstInvalid` 找的就是 aria-invalid）。
   */
  id?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-describedby"?: string;
  name?: string;
  className?: string;
  disabled?: boolean;
  size?: ControlSize;
  dropdownMinWidth?: number;
  /**
   * `ghost`：无边框、无底色的胶囊，只在悬停 / 展开时铺浅灰叠层，放在顶栏这类不想显得
   * 「这里有个表单控件」的位置（如切换租户）。默认是带细描边的标准触发器。
   */
  variant?: "default" | "ghost";
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
      <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center">
        {selected ? <Icon name="check" size={15} className="text-[var(--sn-label)]" /> : null}
      </span>
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
  id,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
  name,
  className,
  disabled = false,
  size = "default",
  dropdownMinWidth = 0,
  variant = "default",
}: SearchableSelectProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const isOpen = open && !disabled;
  const listFade = useScrollFade<HTMLDivElement>({ enabled: isOpen, size: 24 });
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const floating = useSatinFloatingLayer({
    open: isOpen,
    anchorRef: triggerRef,
    panelRef: listRef,
    placement: "bottom",
    align: "start",
    gap: 6,
    margin: 8,
    onClose: (_reason, refocus) => {
      setOpen(false);
      if (refocus) triggerRef.current?.focus({ preventScroll: true });
    },
  });

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  // Focus search input on open
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

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
        id={id}
        type="button"
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        title={
          typeof selectedOption?.label === "string"
            ? selectedOption.label
            : typeof selectedOption?.triggerLabel === "string"
              ? selectedOption.triggerLabel
              : undefined
        }
        disabled={disabled}
        data-state={selectTriggerState(isOpen)}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          variant === "ghost" ? selectTriggerGhost : getSelectTriggerBase(size),
          className,
        )}
      >
        <span className="min-w-0 flex-1 truncate text-left">{selectedLabel ?? placeholder}</span>
        <Icon
          name="chevron-down"
          size={14}
          className={cn(selectChevron, isOpen && "rotate-180")}
        />
      </button>

      {floating.mounted && !disabled
        ? createPortal(
            <div
              ref={listRef}
              role="listbox"
              aria-hidden={floating.isOpen ? undefined : true}
              data-side={floating.side}
              data-state={floating.isOpen ? "open" : "closed"}
              aria-label={ariaLabel}
              className={cn(
                searchableSelectPanel,
                floating.isOpen ? "sn-open" : null,
                floating.up ? "sn-up" : null,
                floating.end ? "sn-end" : null,
              )}
              style={{
                top: floating.top,
                left: floating.left,
                minWidth: Math.max(floating.anchorWidth, 280, dropdownMinWidth),
                maxWidth: "min(500px, 90vw)",
                maxHeight: Math.min(320, Math.max(160, floating.availableHeight)),
                transformOrigin: floating.origin,
              }}
            >
              {/* Search input */}
              <div className={selectSearchRow}>
                <Icon name="search" size={14} className="shrink-0 text-[var(--sn-label3)]" />
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

              {/* Options list：选项多到要滚时上下渐隐。 */}
              <div
                ref={listFade.ref}
                className="flex-1 overflow-y-auto overscroll-contain p-1.5"
              >
                {filtered.length === 0 && !canCreate ? (
                  <div className={selectEmptyState}>{t("ui.no_match")}</div>
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
                                "sn-btn sn-ghost-danger sn-xs sn-ibtn shrink-0",
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
                        className={cn(selectOptionBase, "font-medium text-[var(--sn-label)]")}
                      >
                        <Icon name="plus" size={14} className="shrink-0 text-[var(--sn-label2)]" />
                        <span className="min-w-0 flex-1">
                          {createLabel ? createLabel(createValue) : createValue}
                        </span>
                      </button>
                    ) : null}
                  </>
                )}
              </div>
            </div>,
            resolvePortalContainer(triggerRef.current),
          )
        : null}
    </>
  );
}
