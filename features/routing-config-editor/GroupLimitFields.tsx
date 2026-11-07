import type { ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import type { RoutingConfigSupport } from "@code-proxy/api-client/endpoints/routing-config";
import { TextInput } from "@code-proxy/ui";
import { DEFAULT_STICKY_MAX_REQUESTS, type RoutingSticky } from "@features/visual-config-editor";
import { Field } from "./fields";
import type { StreamGuardsDraft } from "./streamGuards";

/** Typed text is only accepted while it matches the pattern. */
const acceptMatching =
  (pattern: RegExp, apply: (value: string) => void) => (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.currentTarget.value;
    if (pattern.test(value)) apply(value);
  };

/** Session-sticky limits, shown while sticky scheduling is on. */
export function StickyLimitFields({
  sticky,
  disabled,
  onChange,
}: {
  sticky: RoutingSticky;
  disabled?: boolean;
  onChange: (patch: Partial<RoutingSticky>) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field
        label={t("channel_groups_page.sticky_max_requests_label")}
        hint={t("channel_groups_page.sticky_max_requests_hint")}
      >
        <TextInput
          value={sticky.maxRequests}
          onChange={acceptMatching(/^\d*$/, (maxRequests) => onChange({ maxRequests }))}
          placeholder={String(DEFAULT_STICKY_MAX_REQUESTS)}
          inputMode="numeric"
          aria-label={t("channel_groups_page.sticky_max_requests_label")}
          disabled={disabled}
        />
      </Field>
      <Field
        label={t("channel_groups_page.sticky_release_label")}
        hint={t("channel_groups_page.sticky_release_hint")}
      >
        <TextInput
          value={sticky.releaseAtLoad}
          onChange={acceptMatching(/^\d*\.?\d*$/, (releaseAtLoad) => onChange({ releaseAtLoad }))}
          placeholder="0.8"
          inputMode="decimal"
          aria-label={t("channel_groups_page.sticky_release_label")}
          disabled={disabled}
        />
      </Field>
    </div>
  );
}

/**
 * The first-token timeout and the busy-wait cap. Each appears only when the
 * backend advertises it: the panel updates on its own schedule, and an older
 * backend would neither store nor enforce a value typed here.
 */
export function StreamGuardFields({
  draft,
  support,
  disabled,
  onChange,
}: {
  draft: StreamGuardsDraft;
  support: RoutingConfigSupport;
  disabled?: boolean;
  onChange: (patch: Partial<StreamGuardsDraft>) => void;
}) {
  const { t } = useTranslation();
  if (!support.channelGroupFirstTokenTimeout && !support.channelGroupBusyWait) return null;
  const scope = t("channel_groups_page.stream_guards_scope_tooltip");
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {support.channelGroupFirstTokenTimeout ? (
        <Field
          label={t("channel_groups_page.first_token_timeout_label")}
          tooltip={scope}
          hint={t("channel_groups_page.first_token_timeout_hint")}
        >
          <TextInput
            value={draft.firstTokenTimeout}
            onChange={acceptMatching(/^\d*$/, (firstTokenTimeout) => onChange({ firstTokenTimeout }))}
            placeholder={t("channel_groups_page.first_token_timeout_placeholder")}
            inputMode="numeric"
            aria-label={t("channel_groups_page.first_token_timeout_label")}
            disabled={disabled}
          />
        </Field>
      ) : null}
      {support.channelGroupBusyWait ? (
        <Field
          label={t("channel_groups_page.busy_wait_label")}
          tooltip={scope}
          hint={t("channel_groups_page.busy_wait_hint")}
        >
          <TextInput
            value={draft.busyWaitMax}
            onChange={acceptMatching(/^\d*$/, (busyWaitMax) => onChange({ busyWaitMax }))}
            placeholder={t("channel_groups_page.busy_wait_placeholder")}
            inputMode="numeric"
            aria-label={t("channel_groups_page.busy_wait_label")}
            disabled={disabled}
          />
        </Field>
      ) : null}
    </div>
  );
}
