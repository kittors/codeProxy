import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, ChevronRight, ShieldCheck } from "lucide-react";
import { surface } from "@code-proxy/ui";

/**
 * 「脱敏是怎么工作的」：收起时是一行，展开后用同一行字走一遍三步——你写的、上游收到的、
 * 回复里换回来的，值在三处分别是原值、占位符、原值。最后一句交代脱敏发生在哪：在 CliRelay
 * 服务器上，挡得住上游厂商和中转渠道，挡不住 CliRelay 自己。
 */
export function MaskingExplainer() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const value = "Qx7mP2vL9kR4";
  const placeholder = "{{SECRET_n5t7zt53}}";

  const steps = [
    {
      key: "sent",
      label: t("privacy_masking.explain.sent"),
      text: (
        <>
          DB_PASSWORD=<mark className="rounded bg-amber-500/15 px-0.5 text-amber-800 dark:text-amber-200">{value}</mark>
        </>
      ),
    },
    {
      key: "upstream",
      label: t("privacy_masking.explain.upstream"),
      text: (
        <>
          DB_PASSWORD=
          <mark className="rounded bg-violet-500/12 px-0.5 text-violet-700 dark:text-violet-200">{placeholder}</mark>
        </>
      ),
    },
    {
      key: "back",
      label: t("privacy_masking.explain.back"),
      text: (
        <>
          psql -W <mark className="rounded bg-amber-500/15 px-0.5 text-amber-800 dark:text-amber-200">{value}</mark>
        </>
      ),
    },
  ];

  return (
    <section className={`${surface({ radius: "3xl" })} overflow-hidden`}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-ink/[0.02] dark:hover:bg-white/[0.03]"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-violet-500/10 text-violet-600 dark:bg-violet-400/15 dark:text-violet-300">
          <ShieldCheck size={18} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-ink">{t("privacy_masking.explain.title")}</span>
          <span className="block truncate text-xs text-ink-3">{t("privacy_masking.explain.subtitle")}</span>
        </span>
        <ChevronRight
          size={16}
          aria-hidden="true"
          className={`shrink-0 text-ink-3 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
        />
      </button>
      <div id={bodyId} hidden={!open} className="px-5 pb-5">
        <ol className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] md:items-stretch">
          {steps.map((step, index) => (
            <li key={step.key} className="contents">
              {index > 0 ? (
                <span aria-hidden="true" className="hidden place-items-center text-ink-3 md:grid">
                  <ArrowRight size={14} />
                </span>
              ) : null}
              <div className="rounded-2xl bg-subtle px-3.5 py-3">
                <p className="text-2xs font-medium text-ink-3">
                  {index + 1}. {step.label}
                </p>
                <p className="mt-1.5 font-mono text-xs break-all text-ink-2">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs leading-relaxed text-ink-3">{t("privacy_masking.explain.where")}</p>
      </div>
    </section>
  );
}
