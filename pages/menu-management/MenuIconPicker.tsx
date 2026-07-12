import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Grid3X3, Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { TextInput } from "@code-proxy/ui";
import { listMenuIcons, resolveMenuIcon } from "@app/navigation/menuIconMap";

export function MenuIconPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 320 });

  const icons = useMemo(() => listMenuIcons(query), [query]);
  const SelectedIcon = resolveMenuIcon(value);

  useEffect(() => {
    if (!open) return;
    const update = () => {
      const el = triggerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const width = Math.min(360, Math.max(280, rect.width));
      const left = Math.min(rect.left, window.innerWidth - width - 12);
      const estimated = 360;
      const spaceBelow = window.innerHeight - rect.bottom - 8;
      const top = spaceBelow >= estimated ? rect.bottom + 6 : Math.max(12, rect.top - estimated - 6);
      setPos({ top, left: Math.max(12, left), width });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <div ref={triggerRef} className="flex min-w-0 items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <TextInput
            value={value}
            disabled={disabled}
            placeholder={t("identity_admin.please_select")}
            onChange={(event) => onChange(event.target.value)}
            onFocus={() => {
              if (!disabled) setOpen(true);
            }}
            startAdornment={
              value ? <SelectedIcon size={16} className="text-slate-500" aria-hidden="true" /> : null
            }
            endAdornment={
              value && !disabled ? (
                <button
                  type="button"
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10"
                  aria-label={t("common.clear", { defaultValue: "Clear" })}
                  onClick={() => onChange("")}
                >
                  <X size={14} />
                </button>
              ) : null
            }
          />
        </div>
        <button
          type="button"
          disabled={disabled}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-800 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-950 dark:hover:border-neutral-600 dark:hover:text-white"
          aria-label={t("identity_admin.menu_icon_picker", { defaultValue: "选择图标" })}
          onClick={() => {
            if (!disabled) setOpen((current) => !current);
          }}
        >
          <Grid3X3 size={16} />
        </button>
      </div>

      {open
        ? createPortal(
            <div
              ref={panelRef}
              className="fixed z-[9999] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_16px_40px_rgba(15,23,42,0.14)] dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-[0_16px_40px_rgba(0,0,0,0.38)]"
              style={{ top: pos.top, left: pos.left, width: pos.width }}
            >
              <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2 dark:border-neutral-800">
                <Search size={14} className="shrink-0 text-slate-400" aria-hidden="true" />
                <input
                  autoFocus
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t("identity_admin.menu_icon_search", {
                    defaultValue: "搜索图标…",
                  })}
                  className="h-7 w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400 dark:text-white dark:placeholder:text-slate-500"
                />
              </div>
              <div className="grid max-h-64 grid-cols-6 gap-1 overflow-y-auto p-2">
                {icons.length === 0 ? (
                  <div className="col-span-6 px-2 py-6 text-center text-xs text-slate-400">
                    {t("common.no_results", { defaultValue: "无匹配结果" })}
                  </div>
                ) : (
                  icons.map((item) => {
                    const Icon = item.icon;
                    const active = value === item.name;
                    return (
                      <button
                        key={item.name}
                        type="button"
                        title={item.name}
                        className={
                          active
                            ? "inline-flex h-10 items-center justify-center rounded-lg bg-blue-600 text-white"
                            : "inline-flex h-10 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
                        }
                        onClick={() => {
                          onChange(item.name);
                          setOpen(false);
                          setQuery("");
                        }}
                      >
                        <Icon size={18} />
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
