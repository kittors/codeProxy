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
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { TextInput } from "@/modules/ui/Input";
import {
  cn,
  getSelectDropdownMotion,
  selectDropdownTransition,
  selectPanel,
} from "@/modules/ui/selectStyles";

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
      if (event.key === "Escape") setOpen(false);
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
        aria-label={ariaLabel}
        placeholder={placeholder}
        className="font-medium tabular-nums text-[#18181B] dark:text-white"
        endAdornment={
          <button
            type="button"
            aria-label={labels.open}
            onClick={() => setOpen((prev) => !prev)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#71717A] transition-colors hover:bg-[#EBEBEC] hover:text-[#18181B] dark:text-[#A1A1AA] dark:hover:bg-[#46464C] dark:hover:text-white"
          >
            <CalendarDays size={15} aria-hidden="true" />
          </button>
        }
      />

      {createPortal(
        <AnimatePresence>
          {open ? (
            <motion.div
              ref={panelRef}
              role="dialog"
              aria-label={labels.picker}
              data-placement={placement}
              className={cn(selectPanel, "p-3 text-[#18181B] dark:text-white")}
              style={panelStyle}
              {...getSelectDropdownMotion(placement)}
              transition={selectDropdownTransition}
            >
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  aria-label={labels.previousMonth}
                  onClick={() => moveMonth(-1)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[#71717A] transition-colors hover:bg-[#EBEBEC] hover:text-[#18181B] dark:text-[#A1A1AA] dark:hover:bg-[#46464C] dark:hover:text-white"
                >
                  <ChevronLeft size={16} aria-hidden="true" />
                </button>
                <div className="min-w-0 truncate text-sm font-semibold">{monthLabel}</div>
                <button
                  type="button"
                  aria-label={labels.nextMonth}
                  onClick={() => moveMonth(1)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[#71717A] transition-colors hover:bg-[#EBEBEC] hover:text-[#18181B] dark:text-[#A1A1AA] dark:hover:bg-[#46464C] dark:hover:text-white"
                >
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              </div>

              <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase text-[#96969B] dark:text-[#9F9FA8]">
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
                        "h-8 rounded-xl text-xs font-semibold tabular-nums transition-colors",
                        selected
                          ? "bg-[#18181B] text-white dark:bg-white dark:text-[#18181B]"
                          : "text-[#18181B] hover:bg-[#EBEBEC] dark:text-white dark:hover:bg-[#46464C]",
                        !inMonth && !selected ? "opacity-35" : null,
                        today && !selected ? "ring-1 ring-[#18181B]/20 dark:ring-white/25" : null,
                      )}
                    >
                      {date.getDate()}
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-black/[0.06] pt-3 dark:border-white/10">
                <label className="space-y-1">
                  <span className="text-[10px] font-semibold uppercase text-[#96969B] dark:text-[#9F9FA8]">
                    {labels.hour}
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={parsedValue ? pad2(parsedValue.getHours()) : ""}
                    onChange={(event) => updateTime("hour", event.currentTarget.value)}
                    aria-label={labels.hour}
                    className="h-9 w-full rounded-2xl border border-black/[0.04] bg-white px-3 text-sm font-semibold tabular-nums text-[#18181B] shadow-[2px_2px_6px_rgb(0_0_0_/_0.055)] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-black/10 dark:border-transparent dark:bg-[#303036] dark:text-white dark:shadow-none dark:focus-visible:ring-white/15"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-semibold uppercase text-[#96969B] dark:text-[#9F9FA8]">
                    {labels.minute}
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={parsedValue ? pad2(parsedValue.getMinutes()) : ""}
                    onChange={(event) => updateTime("minute", event.currentTarget.value)}
                    aria-label={labels.minute}
                    className="h-9 w-full rounded-2xl border border-black/[0.04] bg-white px-3 text-sm font-semibold tabular-nums text-[#18181B] shadow-[2px_2px_6px_rgb(0_0_0_/_0.055)] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-black/10 dark:border-transparent dark:bg-[#303036] dark:text-white dark:shadow-none dark:focus-visible:ring-white/15"
                  />
                </label>
              </div>

              <div className="mt-3 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onChange("")}
                  className="rounded-full px-3 py-1.5 text-xs font-semibold text-[#71717A] transition-colors hover:bg-[#EBEBEC] hover:text-[#18181B] dark:text-[#A1A1AA] dark:hover:bg-[#46464C] dark:hover:text-white"
                >
                  {labels.clear}
                </button>
                <button
                  type="button"
                  onClick={setToday}
                  className="rounded-full bg-[#EBEBEC] px-3 py-1.5 text-xs font-semibold text-[#18181B] transition-colors hover:bg-[#E4E4E7] dark:bg-[#46464C] dark:text-white dark:hover:bg-[#52525B]"
                >
                  {labels.today}
                </button>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}
