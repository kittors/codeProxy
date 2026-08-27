import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@code-proxy/ui";

// Presentational pieces of the identity fingerprint page.
//
// They live here so the page itself stays about state and provider wiring; the
// page is already over the file-size baseline and every provider added to the
// fingerprint system grows it further.

export function RecordHeader({
  accountKey,
  authSubjectId,
  product,
  variant,
  version,
}: {
  accountKey?: string;
  authSubjectId?: string;
  product?: string;
  variant?: string;
  version?: string;
}) {
  const { t } = useTranslation();
  const productLine = [product, variant, version].filter(Boolean).join(" / ");
  return (
    <div className="min-w-0">
      <div className="break-all text-xs font-semibold text-slate-900 dark:text-white">
        {accountKey || t("identity_fingerprint.default_account")}
      </div>
      {authSubjectId ? (
        <div className="mt-1 break-all text-xs text-slate-500 dark:text-white/50">
          {authSubjectId}
        </div>
      ) : null}
      {productLine ? (
        <div className="mt-1 break-all text-xs text-slate-500 dark:text-white/50">
          {productLine}
        </div>
      ) : null}
    </div>
  );
}

export function KeyValueList({ title, entries }: { title: string; entries: Array<[string, string]> }) {
  if (entries.length === 0) return null;
  return (
    <details className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs dark:bg-neutral-900">
      <summary className="cursor-pointer font-semibold text-slate-600 dark:text-white/60">
        {title}
      </summary>
      <div className="mt-2 space-y-2">
        {entries.map(([key, value]) => (
          <div key={key}>
            <div className="font-semibold text-slate-500 dark:text-white/45">{key}</div>
            <div className="break-all text-slate-900 dark:text-white">{value || "-"}</div>
          </div>
        ))}
      </div>
    </details>
  );
}

export function SourceBadge({ source }: { source: string }) {
  const { t } = useTranslation();
  if (source === "custom" || source === "preset") {
    return <SourcePill tone="custom">{t("identity_fingerprint.source_custom")}</SourcePill>;
  }
  if (source === "learned") {
    return <SourcePill tone="learned">{t("identity_fingerprint.source_learned")}</SourcePill>;
  }
  if (source === "default" || source === "builtin_default") {
    return <SourcePill tone="default">{t("identity_fingerprint.source_default")}</SourcePill>;
  }
  return <SourcePill tone="default">{t("identity_fingerprint.source_default")}</SourcePill>;
}

export function SourcePill({
  tone,
  children,
}: {
  tone: "custom" | "learned" | "default";
  children: ReactNode;
}) {
  const className =
    tone === "custom"
      ? "bg-rose-50 text-rose-700 dark:bg-rose-400/10 dark:text-rose-200"
      : tone === "learned"
        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200"
        : "bg-slate-100 text-slate-600 dark:bg-neutral-800 dark:text-white/60";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${className}`}>
      {children}
    </span>
  );
}

export function ProviderActions({
  restoreLabel,
  saveLabel,
  onRestore,
  onSave,
  disabled,
}: {
  restoreLabel: string;
  saveLabel: string;
  onRestore: () => void;
  onSave: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-2 pt-2">
      <Button variant="secondary" onClick={onRestore} disabled={disabled}>
        {restoreLabel}
      </Button>
      <Button onClick={onSave} disabled={disabled}>
        {saveLabel}
      </Button>
    </div>
  );
}

export function ProviderNotice({ children }: { children: ReactNode }) {
  return (
    <div className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
      {children}
    </div>
  );
}

export function SimplePanel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-900/8 bg-white p-4 dark:border-white/8 dark:bg-neutral-950/60">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
        {description ? (
          <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-white/60">{description}</p>
        ) : null}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-xs font-semibold text-slate-700 dark:text-white/75">{label}</span>
      {children}
      {hint ? (
        <span className="block text-xs text-slate-500 dark:text-white/45">{hint}</span>
      ) : null}
    </label>
  );
}

export function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-neutral-900/70">
      <div className="text-xs text-slate-500 dark:text-white/45">{label}</div>
      <div className="mt-1 break-all text-sm font-medium text-slate-900 dark:text-white">
        {value || "-"}
      </div>
    </div>
  );
}
