import { Search } from "lucide-react";
import { EmptyState } from "@code-proxy/ui";

export function LookupEmptyState({
  t,
}: {
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-6 dark:border-neutral-800 dark:bg-neutral-950/40 sm:px-6 sm:py-10">
      <EmptyState
        title={t("apikey_lookup.empty_title")}
        description={t("apikey_lookup.empty_desc")}
        icon={<Search size={20} strokeWidth={1.5} aria-hidden />}
      />
    </section>
  );
}
