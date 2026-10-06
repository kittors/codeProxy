import { motion, useReducedMotion } from "framer-motion";
import { FileJson } from "lucide-react";
import { useRef, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { VendorIcon } from "@code-proxy/assets";
import { ACCOUNT_GROUPS, type AccountProvider, type AccountProviderId } from "../model/catalog";

export function ProviderGlyph({
  provider,
  size = 18,
}: {
  provider: AccountProvider;
  size?: number;
}) {
  return provider.icon ? (
    <VendorIcon modelId={provider.icon} size={size} />
  ) : (
    <FileJson size={size} className="text-ink-2" aria-hidden="true" />
  );
}

export const providerTabId = (id: AccountProviderId) => `add-account-tab-${id}`;
export const PROVIDER_PANEL_ID = "add-account-panel";

/**
 * The left column: every way to add an account, grouped by what the operator
 * will have to do (sign in in the browser, approve a code, or hand over a
 * credential). A vertical tab list, so arrow keys move through it.
 */
export function ProviderList({
  providers,
  value,
  onChange,
}: {
  providers: readonly AccountProvider[];
  value: AccountProviderId;
  onChange: (id: AccountProviderId) => void;
}) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const buttonsRef = useRef<Record<string, HTMLButtonElement | null>>({});

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys = ["ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft", "Home", "End"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const index = providers.findIndex((provider) => provider.id === value);
    const last = providers.length - 1;
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? last
          : event.key === "ArrowDown" || event.key === "ArrowRight"
            ? (index + 1) % providers.length
            : (index - 1 + providers.length) % providers.length;
    const target = providers[next];
    if (!target) return;
    onChange(target.id);
    buttonsRef.current[target.id]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-orientation="vertical"
      aria-label={t("add_account.list_label")}
      onKeyDown={onKeyDown}
      className="flex gap-1 overflow-x-auto px-3 pb-3 sm:grid sm:gap-0 sm:overflow-visible sm:px-3 sm:pb-4"
    >
      {ACCOUNT_GROUPS.map((group) => {
        const items = providers.filter((provider) => provider.group === group);
        if (items.length === 0) return null;
        return (
          <div key={group} role="presentation" className="flex shrink-0 gap-1 sm:grid sm:gap-0.5">
            <p
              role="presentation"
              className="hidden px-2.5 pt-4 pb-1.5 text-2xs font-semibold tracking-wide text-ink-3 uppercase sm:block"
            >
              {t(`add_account.groups.${group}`)}
            </p>
            {items.map((provider) => {
              const selected = provider.id === value;
              return (
                <button
                  key={provider.id}
                  ref={(node) => {
                    buttonsRef.current[provider.id] = node;
                  }}
                  type="button"
                  role="tab"
                  id={providerTabId(provider.id)}
                  aria-selected={selected}
                  aria-controls={PROVIDER_PANEL_ID}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => onChange(provider.id)}
                  className={[
                    "relative flex shrink-0 items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm transition-colors",
                    selected ? "text-ink" : "text-ink-2 hover:bg-hover hover:text-ink",
                  ].join(" ")}
                >
                  {selected ? (
                    <motion.span
                      layoutId="add-account-provider-selection"
                      aria-hidden="true"
                      className="absolute inset-0 rounded-xl border border-line bg-elevated shadow-xs"
                      transition={
                        reduceMotion
                          ? { duration: 0 }
                          : { type: "spring", stiffness: 520, damping: 40 }
                      }
                    />
                  ) : null}
                  <span className="relative grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-line bg-surface">
                    <ProviderGlyph provider={provider} size={16} />
                  </span>
                  <span className="relative truncate font-medium">
                    {t(`add_account.providers.${provider.copyKey}.name`)}
                  </span>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
