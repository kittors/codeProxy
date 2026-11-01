import { useTranslation } from "react-i18next";
import { Select } from "@code-proxy/ui";
import { guardFilterChoices, isGuardFilterValue, type GuardFilterValue } from "./requestLogGuard";

/**
 * Filter of the request log by loop protection: requests it ended, or one kind of them.
 * One control with a handful of choices rather than a multi-select: the kinds are two,
 * and "any of them" is a choice of its own. The page decides whether to show it (see
 * guardFilterVisible).
 */
export function RequestLogGuardFilter({
  value,
  kinds,
  onChange,
}: {
  value: GuardFilterValue;
  /** The kinds the last response found under the other filters (filters.guard_kinds). */
  kinds: readonly string[];
  onChange: (value: GuardFilterValue) => void;
}) {
  const { t } = useTranslation();
  const label = t("request_logs.guard_filter_label");
  return (
    <div className="w-full min-[480px]:w-auto sm:w-[180px]">
      <Select
        size="sm"
        value={value}
        onChange={(next) => {
          if (isGuardFilterValue(next)) onChange(next);
        }}
        aria-label={label}
        options={guardFilterChoices(kinds, value).map((choice) => ({
          value: choice,
          label: t(`request_logs.guard_filter_${choice}`),
          // Closed and unchosen it names the filter, like "All models" names its own.
          triggerLabel: choice === "all" ? label : undefined,
        }))}
      />
    </div>
  );
}
