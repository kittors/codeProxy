import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { Icon } from "satin-ui/react";
import { TextInput } from "../primitives/Input";
import { cn, floatingPanelSurface } from "../utils/selectStyles";

export interface DateTimePickerLabels {
  picker: string;
  open: string;
  previousMonth: string;
  nextMonth: string;
  today: string;
  clear: string;
  hour: string;
  minute: string;
}

interface DateTimePickerProps {
  value: string;
  onChange: (value: string) => void;
  "aria-label": string;
  /**
   * 由 FormField 注入：`<label htmlFor>` 指到输入框；出错时描边变红、读屏读到错误，
   * 提交校验也能把焦点送过来（`focusFirstInvalid` 找的就是 aria-invalid）。
   */
  id?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-describedby"?: string;
  labels: DateTimePickerLabels;
  locale?: string;
  placeholder?: string;
}

const VIEWPORT_MARGIN = 12;
const POPOVER_GAP = 8;
const POPOVER_WIDTH = 320;
const FIVE_WEEK_POPOVER_HEIGHT = 392;
const SIX_WEEK_POPOVER_HEIGHT = 428;

const pad2 = (value: number): string => String(value).padStart(2, "0");

const toLocalDateTimeValue = (date: Date): string =>
  [
    date.getFullYear(),
    "-",
    pad2(date.getMonth() + 1),
    "-",
    pad2(date.getDate()),
    "T",
    pad2(date.getHours()),
    ":",
    pad2(date.getMinutes()),
  ].join("");

const toDisplayValue = (value: string): string => value.replace("T", " ");

const normalizeManualValue = (value: string): string => {
  const raw = value.trimStart();
  return raw.replace(/^(\d{4}-\d{2}-\d{2})\s+/, "$1T");
};

const parseLocalDateTime = (value: string): Date | null => {
  const normalized = normalizeManualValue(value.trim());
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2})(?::(\d{2}))?)?$/);
  if (!match) return null;

  const [, yearValue, monthValue, dayValue, hourValue = "0", minuteValue = "0"] = match;
  const year = Number(yearValue);
  const month = Number(monthValue) - 1;
  const day = Number(dayValue);
  const hour = Number(hourValue);
  const minute = Number(minuteValue);
  const date = new Date(year, month, day, hour, minute);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  ) {
    return null;
  }
  return date;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const getDaysInMonth = (year: number, month: number): number =>
  new Date(year, month + 1, 0).getDate();

const getCalendarCellCount = (year: number, month: number): number => {
  const startOffset = new Date(year, month, 1).getDay();
  const currentMonthDays = getDaysInMonth(year, month);
  return Math.max(35, Math.ceil((startOffset + currentMonthDays) / 7) * 7);
};

export function DateTimePicker({
  value,
  onChange,
  "aria-label": ariaLabel,
  id,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
  labels,
  locale,
  placeholder = "YYYY-MM-DD HH:mm",
}: DateTimePickerProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<"bottom" | "top">("bottom");
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({
    position: "fixed",
    top: 0,
    left: 0,
    width: POPOVER_WIDTH,
    zIndex: 99999,
  });

  const parsedValue = useMemo(() => parseLocalDateTime(value), [value]);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const date = parsedValue ?? new Date();
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });

  useEffect(() => {
    if (!open) return;
    const date = parsedValue ?? new Date();
    setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1));
  }, [open, parsedValue]);

  const calendarCellCount = useMemo(
    () => getCalendarCellCount(visibleMonth.getFullYear(), visibleMonth.getMonth()),
    [visibleMonth],
  );
  const estimatedPopoverHeight =
    calendarCellCount > 35 ? SIX_WEEK_POPOVER_HEIGHT : FIVE_WEEK_POPOVER_HEIGHT;

  const updatePosition = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;

    const rect = root.getBoundingClientRect();
    const viewportWidth = window.innerWidth || 1024;
    const viewportHeight = window.innerHeight || 768;
    const width = Math.max(0, Math.min(POPOVER_WIDTH, viewportWidth - VIEWPORT_MARGIN * 2));
    const minLeft = VIEWPORT_MARGIN;
    const maxLeft = Math.max(VIEWPORT_MARGIN, viewportWidth - width - VIEWPORT_MARGIN);
    const left = clamp(rect.left, minLeft, maxLeft);
    const spaceBelow = viewportHeight - rect.bottom - POPOVER_GAP - VIEWPORT_MARGIN;
    const spaceAbove = rect.top - POPOVER_GAP - VIEWPORT_MARGIN;
    const openAbove = spaceBelow < estimatedPopoverHeight && spaceAbove > spaceBelow;
    const minTop = VIEWPORT_MARGIN;
    const maxTop = Math.max(
      VIEWPORT_MARGIN,
      viewportHeight - VIEWPORT_MARGIN - estimatedPopoverHeight,
    );
    const top = openAbove
      ? clamp(rect.top - POPOVER_GAP - estimatedPopoverHeight, minTop, maxTop)
      : clamp(rect.bottom + POPOVER_GAP, minTop, maxTop);

    setPlacement(openAbove ? "top" : "bottom");
    setPanelStyle({
      position: "fixed",
      top,
      left,
      width,
      zIndex: 99999,
    });
  }, [estimatedPopoverHeight]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // 吃掉这次 Esc：外层弹窗看到 defaultPrevented 就不会跟着关闭（只收起面板）。
      event.preventDefault();
      setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const monthLabel = useMemo(
    () =>
      visibleMonth.toLocaleDateString(locale, {
        month: "long",
        year: "numeric",
      }),
    [locale, visibleMonth],
  );

  const weekdayLabels = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) =>
        new Intl.DateTimeFormat(locale, { weekday: "short" }).format(new Date(2027, 0, 3 + index)),
      ),
    [locale],
  );

  const calendarCells = useMemo(() => {
    const year = visibleMonth.getFullYear();
    const month = visibleMonth.getMonth();
    const currentMonthDays = getDaysInMonth(year, month);
    const previousMonthDays = getDaysInMonth(year, month - 1);
    const startOffset = new Date(year, month, 1).getDay();

    return Array.from({ length: calendarCellCount }, (_, index) => {
      const dayOffset = index - startOffset + 1;
      if (dayOffset < 1) {
        const day = previousMonthDays + dayOffset;
        return { date: new Date(year, month - 1, day), inMonth: false };
      }
      if (dayOffset > currentMonthDays) {
        const day = dayOffset - currentMonthDays;
        return { date: new Date(year, month + 1, day), inMonth: false };
      }
      return { date: new Date(year, month, dayOffset), inMonth: true };
    });
  }, [calendarCellCount, visibleMonth]);

  const selectedDateKey = parsedValue
    ? `${parsedValue.getFullYear()}-${parsedValue.getMonth()}-${parsedValue.getDate()}`
    : "";
  const todayDateKey = useMemo(() => {
    const today = new Date();
    return `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
  }, []);

  const commitDate = useCallback(
    (date: Date) => {
      const base = parsedValue ?? new Date();
      const next = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        base.getHours(),
        base.getMinutes(),
      );
      onChange(toLocalDateTimeValue(next));
    },
    [onChange, parsedValue],
  );

  const updateTime = useCallback(
    (part: "hour" | "minute", raw: string) => {
      const numeric = Number(raw);
      if (!Number.isFinite(numeric)) return;
      const base = parsedValue ?? new Date();
      const next = new Date(base);
      if (part === "hour") next.setHours(clamp(Math.trunc(numeric), 0, 23));
      else next.setMinutes(clamp(Math.trunc(numeric), 0, 59));
      onChange(toLocalDateTimeValue(next));
    },
    [onChange, parsedValue],
  );

  const moveMonth = useCallback((offset: number) => {
    setVisibleMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
  }, []);

  const setToday = useCallback(() => {
    const now = new Date();
    onChange(toLocalDateTimeValue(now));
    setVisibleMonth(new Date(now.getFullYear(), now.getMonth(), 1));
  }, [onChange]);

  return (
    <div ref={rootRef} className="relative">
      <TextInput
        type="text"
        inputMode="numeric"
        value={toDisplayValue(value)}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onChange={(event) => onChange(normalizeManualValue(event.currentTarget.value))}
        id={id}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        placeholder={placeholder}
        className="font-medium tabular-nums"
        endAdornment={
          <button
            type="button"
            aria-label={labels.open}
            onClick={() => setOpen((prev) => !prev)}
            className="sn-eye"
          >
            <Icon name="calendar" size={15} />
          </button>
        }
      />

      {open
        ? createPortal(
            <div
              ref={panelRef}
              role="dialog"
              aria-label={labels.picker}
              data-placement={placement}
              data-side={placement}
              data-state="open"
              className={cn("fixed z-[9999] overflow-hidden p-3", floatingPanelSurface)}
              style={panelStyle}
            >
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  aria-label={labels.previousMonth}
                  onClick={() => moveMonth(-1)}
                  className="sn-btn sn-ghost sn-sm sn-ibtn"
                >
                  <Icon name="chevron-left" size={16} />
                </button>
                <div className="min-w-0 truncate text-sm font-semibold">{monthLabel}</div>
                <button
                  type="button"
                  aria-label={labels.nextMonth}
                  onClick={() => moveMonth(1)}
                  className="sn-btn sn-ghost sn-sm sn-ibtn"
                >
                  <Icon name="chevron-right" size={16} />
                </button>
              </div>

              <div className="mt-3 grid grid-cols-7 gap-1 text-center text-2xs font-medium uppercase text-[var(--sn-label3)]">
                {weekdayLabels.map((day) => (
                  <span key={day}>{day}</span>
                ))}
              </div>
              <div className="mt-1 grid grid-cols-7 gap-1">
                {calendarCells.map(({ date, inMonth }) => {
                  const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
                  const selected = key === selectedDateKey;
                  const today = key === todayDateKey;
                  const dayLabel = inMonth
                    ? String(date.getDate())
                    : date.toLocaleDateString(locale, {
                        day: "numeric",
                        month: "short",
                      });
                  return (
                    <button
                      key={key}
                      type="button"
                      aria-label={dayLabel}
                      onClick={() => commitDate(date)}
                      className={cn(
                        "mx-auto h-8 w-8 rounded-[var(--sn-btn-r)] text-xs font-medium tabular-nums transition-[background-color,color,transform] duration-120 active:scale-95",
                        selected
                          ? "bg-[var(--sn-accent)] text-[var(--sn-on-primary)]"
                          : "text-[var(--sn-label)] hover:bg-[var(--sn-b-ghost-hover)]",
                        !inMonth && !selected ? "opacity-35" : null,
                        today && !selected
                          ? "shadow-[inset_0_0_0_1px_var(--sn-line-control-hover)]"
                          : null,
                      )}
                    >
                      {date.getDate()}
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[var(--sn-line)] pt-3">
                <label className="space-y-1">
                  <span className="text-2xs font-medium uppercase text-[var(--sn-label3)]">
                    {labels.hour}
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={parsedValue ? pad2(parsedValue.getHours()) : ""}
                    onChange={(event) => updateTime("hour", event.currentTarget.value)}
                    aria-label={labels.hour}
                    className="sn-input sn-sm w-full font-medium tabular-nums"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-2xs font-medium uppercase text-[var(--sn-label3)]">
                    {labels.minute}
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={parsedValue ? pad2(parsedValue.getMinutes()) : ""}
                    onChange={(event) => updateTime("minute", event.currentTarget.value)}
                    aria-label={labels.minute}
                    className="sn-input sn-sm w-full font-medium tabular-nums"
                  />
                </label>
              </div>

              <div className="mt-3 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onChange("")}
                  className="sn-btn sn-ghost sn-sm"
                >
                  {labels.clear}
                </button>
                <button
                  type="button"
                  onClick={setToday}
                  className="sn-btn sn-secondary sn-sm"
                >
                  {labels.today}
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
