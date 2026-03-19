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
import { Check, ChevronDown, Search } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface SearchableSelectOption {
  value: string;
  label: ReactNode;
  /** searchable text (defaults to value if omitted) */
  searchText?: string;
}

export interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  "aria-label"?: string;
  name?: string;
  className?: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const cn = (...classes: (string | false | undefined | null)[]) => classes.filter(Boolean).join(" ");

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "",
  searchPlaceholder = "",
  "aria-label": ariaLabel,
  name,
  className,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });

  const reposition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({ top: rect.bottom + 6, left: rect.left, width: Math.max(rect.width, 200) });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, reposition]);

  // Focus search input on open
  useEffect(() => {
    if (open) {
      setQuery("");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (triggerRef.current?.contains(t) || listRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const selectedLabel = useMemo(() => {
    const match = options.find((o) => o.value === value);
    return match ? match.label : null;
  }, [options, value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => {
      const text = (o.searchText ?? o.value).toLowerCase();
      const labelStr = typeof o.label === "string" ? o.label.toLowerCase() : "";
      return text.includes(q) || labelStr.includes(q);
    });
  }, [options, query]);

  const handleSelect = useCallback(
    (v: string) => {
      onChange(v);
      setOpen(false);
    },
    [onChange],
  );

  return (
    <>
      {name ? <input type="hidden" name={name} value={value} /> : null}

      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "inline-flex h-[34px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white pl-3.5 pr-3 text-sm font-medium text-slate-700 shadow-sm outline-none transition",
          "hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-slate-400/35",
          "dark:border-neutral-800 dark:bg-neutral-950/60 dark:text-white/80 dark:hover:bg-white/10 dark:focus-visible:ring-white/15",
          className,
        )}
      >
        <span className="truncate">{selectedLabel ?? placeholder}</span>
        <ChevronDown
          size={14}
          className={cn(
            "shrink-0 text-slate-400 transition-transform duration-200 dark:text-white/40",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>

      {open
        ? createPortal(
          <div
            ref={listRef}
            role="listbox"
            aria-label={ariaLabel}
            className={cn(
              "fixed z-[9999] flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg",
              "dark:border-neutral-700 dark:bg-neutral-900",
            )}
            style={{
              top: pos.top,
              left: pos.left,
              minWidth: pos.width,
              maxWidth: 'min(500px, 90vw)',
              maxHeight: 320,
            }}
          >
            {/* Search input */}
            <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 dark:border-neutral-800">
              <Search
                size={14}
                className="shrink-0 text-slate-400 dark:text-white/40"
                aria-hidden="true"
              />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="h-6 w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400 dark:text-white/80 dark:placeholder:text-white/30"
                autoComplete="off"
                spellCheck={false}
              />
            </div>

            {/* Options list */}
            <div className="flex-1 overflow-y-auto p-1">
              {filtered.length === 0 ? (
                <div className="px-2.5 py-3 text-center text-xs text-slate-400 dark:text-white/30">
                  No results
                </div>
              ) : (
                filtered.map((opt) => {
                  const selected = opt.value === value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => handleSelect(opt.value)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm outline-none transition-colors",
                        "hover:bg-slate-100 dark:hover:bg-white/10",
                        selected
                          ? "font-medium text-slate-900 dark:text-white"
                          : "text-slate-600 dark:text-slate-300",
                      )}
                    >
                      <span className="flex-1 whitespace-nowrap">{opt.label}</span>
                      {selected ? (
                        <Check
                          size={14}
                          className="shrink-0 text-slate-400 dark:text-white/50"
                          aria-hidden="true"
                        />
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body,
        )
        : null}
    </>
  );
}
