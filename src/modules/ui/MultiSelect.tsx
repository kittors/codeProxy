import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, X } from "lucide-react";

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
    searchable?: boolean;
    disabled?: boolean;
    className?: string;
}

export function MultiSelect({
    options,
    value,
    onChange,
    placeholder = "",
    emptyLabel = "All",
    searchable = true,
    disabled = false,
    className = "",
}: MultiSelectProps) {
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

    const dropdown = open ? createPortal(
        <div
            ref={dropdownRef}
            style={dropdownStyle}
            className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-black/10 dark:border-neutral-700 dark:bg-neutral-900 dark:shadow-black/30"
        >
            {searchable && (
                <div className="flex-shrink-0 border-b border-slate-100 px-3 py-2 dark:border-neutral-800">
                    <input
                        ref={searchRef}
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder=""
                        className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-white dark:placeholder:text-white/30"
                    />
                </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto p-1">
                {/* Select All option */}
                <button
                    type="button"
                    onClick={selectAll}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${value.length === 0
                        ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
                        : "text-slate-700 hover:bg-slate-50 dark:text-white/70 dark:hover:bg-white/5"
                        }`}
                >
                    <div
                        className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${value.length === 0
                            ? "border-green-500 bg-green-500 dark:border-green-400 dark:bg-green-400"
                            : "border-slate-300 dark:border-neutral-600"
                            }`}
                    >
                        {value.length === 0 && <Check size={12} className="text-white dark:text-black" />}
                    </div>
                    <span className="font-medium">All Models</span>
                </button>

                <div className="mx-3 my-1 h-px bg-slate-100 dark:bg-neutral-800" />

                {filteredOptions.length === 0 ? (
                    <div className="px-3 py-4 text-center text-xs text-slate-400 dark:text-white/30">
                        No results
                    </div>
                ) : (
                    filteredOptions.map((opt) => {
                        const checked = selectedSet.has(opt.value);
                        return (
                            <button
                                key={opt.value}
                                type="button"
                                onClick={() => toggle(opt.value)}
                                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${checked
                                    ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-300"
                                    : "text-slate-700 hover:bg-slate-50 dark:text-white/70 dark:hover:bg-white/5"
                                    }`}
                            >
                                <div
                                    className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition ${checked
                                        ? "border-indigo-500 bg-indigo-500 dark:border-indigo-400 dark:bg-indigo-400"
                                        : "border-slate-300 dark:border-neutral-600"
                                        }`}
                                >
                                    {checked && <Check size={12} className="text-white dark:text-black" />}
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
    ) : null;

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
                className={`flex min-h-[38px] w-full items-center justify-between gap-2 rounded-xl border px-3 py-1.5 text-left text-sm transition-all ${disabled
                    ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white/40"
                    : open
                        ? "border-indigo-400 bg-white ring-2 ring-indigo-400/20 dark:border-indigo-500 dark:bg-neutral-900"
                        : "border-slate-200 bg-white hover:border-slate-300 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-neutral-600"
                    }`}
            >
                <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                    {value.length === 0 ? (
                        <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400">
                            ✓ {emptyLabel}
                        </span>
                    ) : (
                        value.slice(0, 5).map((v) => {
                            const opt = options.find((o) => o.value === v);
                            return (
                                <span
                                    key={v}
                                    className="inline-flex max-w-[180px] items-center gap-1 rounded-md bg-indigo-50 px-1.5 py-0.5 text-xs text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
                                >
                                    {opt?.icon && <span className="flex-shrink-0">{opt.icon}</span>}
                                    <span className="truncate">{labelMap.get(v) || v}</span>
                                    {!disabled && (
                                        <button
                                            type="button"
                                            onClick={(e) => removeTag(v, e)}
                                            className="ml-0.5 flex-shrink-0 rounded-full p-0.5 hover:bg-indigo-200 dark:hover:bg-indigo-800"
                                        >
                                            <X size={10} />
                                        </button>
                                    )}
                                </span>
                            );
                        })
                    )}
                    {value.length > 5 && (
                        <span className="text-xs text-slate-400">+{value.length - 5}</span>
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
