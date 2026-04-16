import { Search } from "lucide-react";

export function LookupSearchSection({
  t,
  apiKeyInput,
  setApiKeyInput,
  handleSubmit,
  loading,
}: {
  t: (key: string, options?: Record<string, unknown>) => string;
  apiKeyInput: string;
  setApiKeyInput: (value: string) => void;
  handleSubmit: (event?: React.FormEvent) => void;
  loading: boolean;
}) {
  return (
    <section className="rounded-2xl border border-black/[0.06] bg-white p-5 shadow-[0_1px_2px_rgb(15_23_42_/_0.035)] dark:border-white/[0.06] dark:bg-neutral-950/70 dark:shadow-[0_1px_2px_rgb(0_0_0_/_0.22)]">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-white/80">
            {t("apikey_lookup.api_key_label")}
          </label>
          <div className="relative">
            <Search
              size={16}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-white/40"
            />
            <input
              type="password"
              id="apikey-input"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder={t("apikey_lookup.placeholder")}
              autoComplete="off"
              spellCheck={false}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 dark:border-neutral-800 dark:bg-neutral-950/60 dark:text-white dark:placeholder:text-white/30"
            />
          </div>
        </div>
        <button
          type="submit"
          id="apikey-lookup-submit"
          disabled={!apiKeyInput.trim() || loading}
          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-neutral-950 dark:hover:bg-slate-200"
        >
          {loading ? (
            <span
              className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white motion-reduce:animate-none motion-safe:animate-spin dark:border-neutral-950/30 dark:border-t-neutral-950"
              aria-hidden="true"
            />
          ) : null}
          {t("apikey_lookup.query")}
        </button>
      </form>
    </section>
  );
}
