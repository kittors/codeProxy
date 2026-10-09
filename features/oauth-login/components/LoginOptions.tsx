import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { useId, useState, type ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import type { ProxyPoolEntry } from "@code-proxy/api-client";
import { Select, TextInput } from "@code-proxy/ui";
import { ProxyPoolSelect } from "@features/proxy-pool";
import type { AccountProvider } from "../model/catalog";

export interface LoginOptionValues {
  proxyId: string;
  projectId: string;
  usingApi: boolean;
}

/**
 * Choices made before signing in. Most logins need none of them, so they sit
 * behind one row whose chips still show what is in effect — the proxy one
 * matters more than it looks, since the account keeps using it afterwards.
 */
export function LoginOptions({
  provider,
  values,
  onChange,
  proxyEntries,
  proxyCheckState,
  disabled,
  showProxy = true,
}: {
  provider: AccountProvider;
  values: LoginOptionValues;
  onChange: (next: Partial<LoginOptionValues>) => void;
  proxyEntries: ProxyPoolEntry[];
  proxyCheckState: ComponentProps<typeof ProxyPoolSelect>["checkState"];
  disabled?: boolean;
  showProxy?: boolean;
}) {
  const { t } = useTranslation();
  const panelId = useId();
  const [open, setOpen] = useState(false);

  const proxyEntry = proxyEntries.find((entry) => entry.id === values.proxyId);
  const chips: { key: string; label: string; custom: boolean }[] = [];
  if (showProxy) {
    chips.push({
      key: "proxy",
      label: t("add_account.options.chip_proxy", {
        value: proxyEntry ? proxyEntry.name || proxyEntry.id : t("add_account.options.proxy_none"),
      }),
      custom: Boolean(proxyEntry),
    });
  }
  if (provider.projectId) {
    chips.push({
      key: "project",
      label: t("add_account.options.chip_project", {
        value: values.projectId.trim() || t("add_account.options.project_auto"),
      }),
      custom: Boolean(values.projectId.trim()),
    });
  }
  if (provider.endpointMode) {
    chips.push({
      key: "endpoint",
      label: t(
        values.usingApi
          ? "add_account.options.chip_endpoint_api"
          : "add_account.options.chip_endpoint_build",
      ),
      custom: values.usingApi,
    });
  }
  if (chips.length === 0) return null;

  return (
    <div className="grid gap-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full min-w-0 items-center gap-2 rounded-xl py-1 text-left text-xs text-ink-2 transition-colors hover:text-ink"
      >
        <SlidersHorizontal size={13} className="shrink-0" aria-hidden="true" />
        <span className="shrink-0 font-medium">{t("add_account.options.title")}</span>
        <span className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          {chips.map((chip) => (
            <span
              key={chip.key}
              className={[
                "truncate rounded-full px-2 py-0.5",
                // 改过默认值的项标出来（简约风格强调色淡底，多彩风格天蓝淡底），其余中性。
                chip.custom
                  ? "bg-accent-soft text-accent-ink colorful:bg-sky-500/12 colorful:text-sky-800 colorful:dark:text-sky-200"
                  : "bg-ink/[0.05] text-ink-3 dark:bg-white/[0.07]",
              ].join(" ")}
            >
              {chip.label}
            </span>
          ))}
        </span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="shrink-0"
        >
          <ChevronDown size={14} aria-hidden="true" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            id={panelId}
            key="panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="grid gap-4 rounded-2xl bg-subtle p-4">
              {showProxy ? (
                <ProxyPoolSelect
                  value={values.proxyId}
                  onChange={(proxyId) => onChange({ proxyId })}
                  entries={proxyEntries}
                  checkState={proxyCheckState}
                  showDetails
                  noneLabel={t("add_account.options.proxy_none")}
                  label={t("add_account.options.proxy_label")}
                  hint={t("add_account.options.proxy_hint")}
                  ariaLabel={t("add_account.options.proxy_label")}
                />
              ) : null}
              {provider.projectId ? (
                <label className="grid gap-1.5">
                  <span className="text-xs font-medium text-ink-2">
                    {t("add_account.options.project_label")}
                  </span>
                  <TextInput
                    value={values.projectId}
                    disabled={disabled}
                    onChange={(event) => onChange({ projectId: event.currentTarget.value })}
                    placeholder={t("add_account.options.project_placeholder")}
                    aria-label={t("add_account.options.project_label")}
                  />
                  <span className="text-xs text-ink-3">
                    {t("add_account.options.project_hint")}
                  </span>
                </label>
              ) : null}
              {provider.endpointMode ? (
                <div className="grid gap-1.5">
                  <span className="text-xs font-medium text-ink-2">
                    {t("add_account.options.endpoint_label")}
                  </span>
                  <Select
                    value={values.usingApi ? "api" : "build"}
                    onChange={(value) => onChange({ usingApi: value === "api" })}
                    options={[
                      { value: "build", label: t("add_account.options.endpoint_build") },
                      { value: "api", label: t("add_account.options.endpoint_api") },
                    ]}
                    aria-label={t("add_account.options.endpoint_label")}
                    disabled={disabled}
                  />
                  <span className="text-xs text-ink-3">
                    {t(
                      values.usingApi
                        ? "add_account.options.endpoint_api_hint"
                        : "add_account.options.endpoint_build_hint",
                    )}
                  </span>
                </div>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
