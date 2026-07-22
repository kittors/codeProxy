import type { TFunction } from "i18next";
import { extractQuotaValidationError } from "@code-proxy/api-client";
import { formatQuotaUsd } from "./PeriodSpendingCell";

export const formatQuotaValidationError = (error: unknown, t: TFunction): string => {
  const parsed = extractQuotaValidationError(error);
  if (!parsed) {
    return error instanceof Error ? error.message : t("common.operation_failed");
  }

  if (
    parsed.code === "key_period_limit_exceeds_account" &&
    parsed.details.period &&
    parsed.details.keyLimit != null &&
    parsed.details.accountLimit != null
  ) {
    return t("quota.validation.key_exceeds_account", {
      period: t(`quota.period.${parsed.details.period}`),
      keyLimit: formatQuotaUsd(parsed.details.keyLimit),
      accountLimit: formatQuotaUsd(parsed.details.accountLimit),
    });
  }
  if (parsed.code === "period_day_legacy_conflict") {
    return t("quota.validation.period_day_legacy_conflict");
  }
  if (parsed.code === "five_hour_quota_projection_warming") {
    return t("quota.validation.five_hour_projection_warming");
  }
  return parsed.message || t("common.operation_failed");
};
