import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button, Callout, surface } from "@code-proxy/ui";

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
      <div className="break-all text-xs font-semibold text-ink">
        {accountKey || t("identity_fingerprint.default_account")}
      </div>
      {authSubjectId ? (
        <div className="mt-1 break-all text-xs text-ink-3">
          {authSubjectId}
        </div>
      ) : null}
      {productLine ? (
        <div className="mt-1 break-all text-xs text-ink-3">
          {productLine}
        </div>
      ) : null}
    </div>
  );
}

export function KeyValueList({ title, entries }: { title: string; entries: Array<[string, string]> }) {
  if (entries.length === 0) return null;
  return (
    <details className="mt-3 rounded-lg bg-subtle px-3 py-2 text-xs">
      <summary className="cursor-pointer font-semibold text-ink-2">
        {title}
      </summary>
      <div className="mt-2 space-y-2">
        {entries.map(([key, value]) => (
          <div key={key}>
            <div className="font-semibold text-ink-3">{key}</div>
            <div className="break-all text-ink">{value || "-"}</div>
          </div>
        ))}
      </div>
    </details>
  );
}

export function SourceBadge({ source }: { source: string }) {
  const { t } = useTranslation();
  if (source === "custom" || source === "preset") {
    return <SourcePill>{t("identity_fingerprint.source_custom")}</SourcePill>;
  }
  if (source === "learned") {
    return <SourcePill>{t("identity_fingerprint.source_learned")}</SourcePill>;
  }
  return <SourcePill>{t("identity_fingerprint.source_default")}</SourcePill>;
}

/**
 * 来源 / 状态小标签：中性淡底。来源只是分类（自定义、学习、默认），文字已经写明，
 * 不再按类别染红 / 绿 / 灰三色。
 */
export function SourcePill({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-ink/[0.05] px-2 py-0.5 text-xs font-semibold text-ink-2 dark:bg-white/[0.07]">
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

/** 需要留意的说明：共享提示条（淡底 + 琥珀图标，正文中性色），不再整段染成琥珀字。 */
export function ProviderNotice({ children }: { children: ReactNode }) {
  return (
    <Callout tone="warning" className="mt-4">
      {children}
    </Callout>
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
    // 页面上的一张卡片：外观来自 surface()（伪元素细边 + 投影），不再手写描边。
    <section className={`${surface()} p-4`}>
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        {description ? (
          <p className="mt-1 text-xs leading-5 text-ink-3">{description}</p>
        ) : null}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-xs font-semibold text-ink-2">{label}</span>
      {children}
      {hint ? (
        <span className="block text-xs text-ink-3">{hint}</span>
      ) : null}
    </label>
  );
}

export function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-subtle px-3 py-2">
      <div className="text-xs text-ink-3">{label}</div>
      <div className="mt-1 break-all text-sm font-medium text-ink">
        {value || "-"}
      </div>
    </div>
  );
}
