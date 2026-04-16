import { Search } from "lucide-react";

export function LookupEmptyState({
  t,
}: {
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  return (
    <section className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60 sm:p-16">
      <div className="mx-auto flex max-w-sm flex-col items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 dark:bg-white/10">
          <Search size={28} className="text-slate-600 dark:text-white/70" />
        </div>
        <h3 className="text-base font-semibold text-slate-900 dark:text-white">
          {t("apikey_lookup.empty_title")}
        </h3>
        <p className="text-sm text-slate-600 dark:text-white/65">{t("apikey_lookup.empty_desc")}</p>
      </div>
    </section>
  );
}
