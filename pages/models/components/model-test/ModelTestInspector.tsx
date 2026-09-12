import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";
import { surface } from "@code-proxy/ui";
import type { ModelTestC2PA, ModelTestResult } from "@code-proxy/api-client";

/**
 * What was sent and what the answer says about itself.
 *
 * A model probe that only reports pass/fail is not actionable for media models:
 * the Codex image endpoint ignores the model field of the request, so the same
 * green result appears whether 2.5 or 2.0 served it. These two panels are the
 * evidence — the exact upstream request, and the provenance the artifact
 * carries — and both are collapsed by default so the common case stays compact.
 */
export function ModelTestInspector({ result }: { result: ModelTestResult }) {
  const { t } = useTranslation();
  const hasRequest = Boolean(result.request && Object.keys(result.request).length > 0);
  const hasMetadata = Boolean(result.metadata);
  if (!hasRequest && !hasMetadata) return null;

  return (
    <div className="space-y-1.5">
      {hasRequest ? (
        <Disclosure title={t("models_page.test_request_panel")} testId="model-test-request">
          <p className="mb-1.5 text-2xs text-slate-500 dark:text-white/45">
            {t("models_page.test_request_panel_hint")}
          </p>
          <JSONBlock value={result.request} />
        </Disclosure>
      ) : null}

      {hasMetadata ? (
        <Disclosure title={t("models_page.test_metadata_panel")} testId="model-test-metadata">
          <MetadataRows result={result} />
        </Disclosure>
      ) : null}
    </div>
  );
}

function MetadataRows({ result }: { result: ModelTestResult }) {
  const { t } = useTranslation();
  const meta = result.metadata;
  if (!meta) return null;

  const provenance = result.result?.images?.find((image) => image.c2pa?.present)?.c2pa;
  const rows: { label: string; value: ReactNode }[] = [
    { label: t("models_page.test_meta_requested_model"), value: meta.requested_model },
    { label: t("models_page.test_meta_reported_model"), value: meta.reported_model },
    { label: t("models_page.test_meta_upstream"), value: meta.upstream_endpoint },
    { label: t("models_page.test_meta_channel"), value: meta.channel },
    { label: t("models_page.test_meta_finish_reason"), value: meta.finish_reason },
  ];
  if (provenance) {
    rows.push(
      {
        label: t("models_page.test_meta_provenance_generator"),
        value: [provenance.generator, provenance.generator_version].filter(Boolean).join(" "),
      },
      { label: t("models_page.test_meta_provenance_issuer"), value: provenance.issuer },
      {
        label: t("models_page.test_meta_provenance_source"),
        value: shortSourceType(provenance.digital_source_type),
      },
      { label: t("models_page.test_meta_provenance_actions"), value: provenance.actions?.join(", ") },
    );
  }
  if (meta.response_fields?.length) {
    rows.push({
      label: t("models_page.test_meta_response_fields"),
      value: meta.response_fields.join(", "),
    });
  }

  const visible = rows.filter((row) => Boolean(row.value));

  return (
    <div className="space-y-2">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        {visible.map((row) => (
          <div key={row.label} className="contents">
            <dt className="whitespace-nowrap text-2xs text-slate-500 dark:text-white/45">
              {row.label}
            </dt>
            <dd className="break-all text-2xs text-slate-700 dark:text-white/75">{row.value}</dd>
          </div>
        ))}
      </dl>

      {meta.usage && Object.keys(meta.usage).length > 0 ? (
        <div>
          <p className="mb-1 text-2xs font-semibold text-slate-500 dark:text-white/45">
            {t("models_page.test_meta_usage")}
          </p>
          <JSONBlock value={meta.usage} />
        </div>
      ) : null}

      {provenance?.fields?.length ? (
        <RawProvenance provenance={provenance} />
      ) : null}
    </div>
  );
}

/**
 * The unfiltered key/value pairs recovered from the manifest.
 *
 * Extraction is best-effort — the manifest is CBOR inside JUMBF inside a COSE
 * envelope — so the raw pairs stay available for the case where the structured
 * fields above come back empty or wrong.
 */
function RawProvenance({ provenance }: { provenance: ModelTestC2PA }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="text-2xs text-slate-500 underline-offset-2 hover:underline dark:text-white/45"
      >
        {open
          ? t("models_page.test_meta_hide_raw_manifest")
          : t("models_page.test_meta_show_raw_manifest")}
      </button>
      {open ? (
        <pre className="mt-1 max-h-40 overflow-auto rounded-md bg-slate-900/[0.04] px-2 py-1.5 text-2xs text-slate-600 dark:bg-white/[0.06] dark:text-white/60">
          {provenance.fields?.map((field) => `${field.key}: ${field.value}`).join("\n")}
        </pre>
      ) : null}
    </div>
  );
}

function Disclosure({
  title,
  testId,
  children,
}: {
  title: string;
  testId: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div data-testid={testId} className={`overflow-hidden ${surface({ tone: "card", radius: "lg" })}`}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:text-white/70 dark:hover:bg-white/[0.04]"
      >
        <ChevronRight
          size={12}
          aria-hidden
          className={`shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
        />
        {title}
      </button>
      {open ? <div className="border-t border-slate-900/8 px-2.5 py-2 dark:border-white/10">{children}</div> : null}
    </div>
  );
}

function JSONBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-56 overflow-auto rounded-md bg-slate-900/[0.04] px-2 py-1.5 text-2xs leading-relaxed text-slate-700 dark:bg-white/[0.06] dark:text-white/70">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

/** IPTC source types are URLs; only the trailing term is meaningful here. */
function shortSourceType(value: string | undefined): string {
  if (!value) return "";
  const slash = value.lastIndexOf("/");
  return slash >= 0 ? value.slice(slash + 1) : value;
}
