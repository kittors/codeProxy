import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ProxyPoolEntry } from "@code-proxy/api-client";
import { DialogIcon, Modal, ScrollFade } from "@code-proxy/ui";
import { useProxyPoolChecks } from "@features/proxy-pool";
import type { AddedAccount } from "../model/addedAccount";
import {
  ACCOUNT_PROVIDERS,
  findAccountProvider,
  resolveAccountProvider,
  type AccountMethod,
  type AccountProvider,
  type AccountProviderId,
} from "../model/catalog";
import { findCredentialImportSpec } from "../model/credentialImport";
import { isServerOnLoopback } from "../model/startedLogin";
import { DeviceFlowPanel } from "./DeviceFlowPanel";
import { AuthFileImport } from "./imports/AuthFileImport";
import { CredentialImport } from "./imports/CredentialImport";
import { IFlowCookieImport } from "./imports/IFlowCookieImport";
import { VertexImport } from "./imports/VertexImport";
import type { LoginOptionValues } from "./LoginOptions";
import { OAuthFlowPanel } from "./OAuthFlowPanel";
import { PROVIDER_PANEL_ID, ProviderGlyph, ProviderList, providerTabId } from "./ProviderList";
import { SuccessPanel } from "./SuccessPanel";

const EMPTY_OPTIONS: LoginOptionValues = { proxyId: "", projectId: "", usingApi: false };
const EASE = [0.2, 0.8, 0.2, 1] as const;

interface SuccessState {
  providerId: AccountProviderId;
  account?: string;
  details?: string[];
  /** The list is still refreshing, so the account name may follow. */
  resolving: boolean;
}

export interface AddAccountDialogProps {
  open: boolean;
  onClose: () => void;
  /** Refreshes the list once an account arrives; may resolve with that account for the success screen. */
  onAuthorized?: () => Promise<AddedAccount | null | void> | void;
  /** File type the list is filtered to (e.g. "claude"); preselects the matching provider. */
  providerHint?: string;
  proxyPoolEntries?: ProxyPoolEntry[];
  /** Management API base. Decides whether a localhost redirect can reach the server. */
  apiBase?: string;
  /** Uploads auth files through the page's own handler; without it the entry is hidden. */
  onImportAuthFiles?: (files: File[]) => Promise<string[]>;
}

/** Method switch for providers that offer more than one way in (iFlow: browser or cookie). */
function MethodSwitch({
  methods,
  value,
  onChange,
}: {
  methods: AccountMethod[];
  value: AccountMethod;
  onChange: (method: AccountMethod) => void;
}) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  return (
    <div
      role="radiogroup"
      aria-label={t("add_account.methods.label")}
      className="flex rounded-full bg-subtle p-0.5"
    >
      {methods.map((method) => {
        const selected = method === value;
        return (
          <button
            key={method}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(method)}
            className={[
              "relative rounded-full px-3 py-1 text-xs font-medium transition-colors",
              selected ? "text-ink" : "text-ink-3 hover:text-ink",
            ].join(" ")}
          >
            {selected ? (
              <motion.span
                layoutId="add-account-method"
                aria-hidden="true"
                className="absolute inset-0 rounded-full bg-elevated shadow-xs"
                transition={
                  reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 40 }
                }
              />
            ) : null}
            <span className="relative">{t(`add_account.methods.${method}`)}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * "Add AI account": every way to bring an account in, behind one button.
 *
 * Each provider gets the flow it actually has — a browser sign-in with a
 * picture of what to copy, a device code to approve, or a credential to drop in
 * — instead of one generic "paste the callback URL" box that left operators
 * asking where that URL was supposed to come from.
 */
export function AddAccountDialog({
  open,
  onClose,
  onAuthorized,
  providerHint,
  proxyPoolEntries = [],
  apiBase,
  onImportAuthFiles,
}: AddAccountDialogProps) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const providers = useMemo(
    () =>
      ACCOUNT_PROVIDERS.filter(
        (provider) => provider.id !== "auth-file" || Boolean(onImportAuthFiles),
      ),
    [onImportAuthFiles],
  );
  const [providerId, setProviderId] = useState<AccountProviderId>(() =>
    resolveAccountProvider(providerHint),
  );
  const [methodByProvider, setMethodByProvider] = useState<
    Partial<Record<AccountProviderId, AccountMethod>>
  >({});
  const [options, setOptions] = useState<LoginOptionValues>(EMPTY_OPTIONS);
  const [success, setSuccess] = useState<SuccessState | null>(null);
  // A late list refresh from an earlier success must not relabel a newer one.
  const successRunRef = useRef(0);
  const proxyCheckState = useProxyPoolChecks(proxyPoolEntries, open);
  const serverOnLoopback = useMemo(
    () =>
      isServerOnLoopback(apiBase, typeof window === "undefined" ? "" : window.location.hostname),
    [apiBase],
  );

  useEffect(() => {
    if (!open) return;
    successRunRef.current += 1;
    setProviderId(resolveAccountProvider(providerHint));
    setMethodByProvider({});
    setOptions(EMPTY_OPTIONS);
    setSuccess(null);
  }, [open, providerHint]);

  const provider = findAccountProvider(providerId);
  const method = methodByProvider[providerId] ?? provider.methods[0] ?? "oauth";
  const providerName = t(`add_account.providers.${provider.copyKey}.name`);
  const updateOptions = useCallback((next: Partial<LoginOptionValues>) => {
    setOptions((previous) => ({ ...previous, ...next }));
  }, []);

  const finish = useCallback(
    async (finished: AccountProvider, added: AddedAccount = {}, refreshList = true) => {
      successRunRef.current += 1;
      const run = successRunRef.current;
      setSuccess({
        providerId: finished.id,
        account: added.account,
        details: added.details,
        resolving: refreshList && !added.account,
      });
      if (!refreshList) return;
      try {
        const refreshed = await onAuthorized?.();
        if (successRunRef.current !== run) return;
        setSuccess((previous) =>
          previous
            ? {
                ...previous,
                account: previous.account ?? refreshed?.account ?? undefined,
                resolving: false,
              }
            : previous,
        );
      } catch {
        if (successRunRef.current === run) {
          setSuccess((previous) => (previous ? { ...previous, resolving: false } : previous));
        }
      }
    },
    [onAuthorized],
  );

  const selectProvider = (id: AccountProviderId) => {
    successRunRef.current += 1;
    setSuccess(null);
    setProviderId(id);
  };

  const panelKey = success ? `success-${success.providerId}` : `${providerId}-${method}`;
  const successProvider = success ? findAccountProvider(success.providerId) : null;

  const renderPanel = () => {
    if (success && successProvider) {
      return (
        <ScrollFade className="min-h-0 flex-1 overflow-y-auto">
          <SuccessPanel
            title={
              successProvider.id === "auth-file"
                ? t("add_account.success.title_files")
                : t("add_account.success.title", {
                    provider: t(`add_account.providers.${successProvider.copyKey}.name`),
                  })
            }
            icon={successProvider.icon || undefined}
            account={success.account}
            resolvingAccount={success.resolving}
            details={success.details}
            onAddAnother={() => {
              successRunRef.current += 1;
              setSuccess(null);
            }}
            onDone={onClose}
          />
        </ScrollFade>
      );
    }
    const shared = {
      provider,
      providerName,
      options,
      onOptionsChange: updateOptions,
      proxyEntries: proxyPoolEntries,
      proxyCheckState,
    };
    const importSpec = findCredentialImportSpec(providerId, method);
    if (importSpec) {
      return (
        <CredentialImport
          provider={provider}
          spec={importSpec}
          options={options}
          onOptionsChange={updateOptions}
          proxyEntries={proxyPoolEntries}
          proxyCheckState={proxyCheckState}
          // The batch keeps its own results in-panel; refresh the list beneath
          // it rather than swapping to the single-account success screen.
          onRefreshList={() => void onAuthorized?.()}
          onClose={onClose}
        />
      );
    }
    if (method === "cookie") {
      return <IFlowCookieImport {...shared} onImported={(added) => void finish(provider, added)} />;
    }
    if (method === "service-account") {
      return <VertexImport {...shared} onImported={(added) => void finish(provider, added)} />;
    }
    if (method === "auth-file" && onImportAuthFiles) {
      return (
        <AuthFileImport
          onImportFiles={onImportAuthFiles}
          // The page's upload already refreshed the list.
          onImported={(added) => void finish(provider, added, false)}
        />
      );
    }
    if (provider.group === "device") {
      return <DeviceFlowPanel {...shared} onSucceeded={() => void finish(provider)} />;
    }
    return (
      <OAuthFlowPanel
        {...shared}
        serverOnLoopback={serverOnLoopback}
        onSucceeded={() => void finish(provider)}
      />
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("add_account.title")}
      description={t("add_account.description")}
      maxWidth="max-w-5xl"
      bodyHeightClassName="h-[min(46rem,calc(100dvh-9rem))]"
      bodyOverflowClassName="overflow-hidden"
      bodyClassName="!p-0"
      bodyTestId="add-account-dialog-body"
    >
      {/* 左栏用一层淡底和右侧分开，不画竖线（窄屏横排时也不画横线）：选中项是一张浮起的白片，
          落在淡底上才读得出来。 */}
      <div className="flex h-full min-h-0 flex-col sm:flex-row">
        <nav className="shrink-0 sm:w-56 sm:overflow-y-auto sm:bg-subtle">
          <ProviderList providers={providers} value={providerId} onChange={selectProvider} />
        </nav>
        <section
          id={PROVIDER_PANEL_ID}
          role="tabpanel"
          aria-labelledby={providerTabId(providerId)}
          className="flex min-h-0 min-w-0 flex-1 flex-col"
        >
          {success ? null : (
            <header className="flex items-center gap-3 px-5 pt-5 sm:px-6">
              <DialogIcon>
                <ProviderGlyph provider={provider} size={20} />
              </DialogIcon>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-base font-semibold text-ink">{providerName}</h3>
                <p className="truncate text-xs text-ink-3">
                  {t(`add_account.providers.${provider.copyKey}.tagline`)}
                </p>
              </div>
              {provider.methods.length > 1 ? (
                <MethodSwitch
                  methods={provider.methods}
                  value={method}
                  onChange={(next) =>
                    setMethodByProvider((previous) => ({ ...previous, [providerId]: next }))
                  }
                />
              ) : null}
            </header>
          )}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={panelKey}
              className="flex min-h-0 flex-1 flex-col"
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: EASE }}
            >
              {renderPanel()}
            </motion.div>
          </AnimatePresence>
        </section>
      </div>
    </Modal>
  );
}
