import { describe, expect, test } from "vitest";
import i18n from "@code-proxy/i18n";
import { ApiClientError } from "@code-proxy/api-client";
import { formatQuotaValidationError } from "../formatQuotaValidationError";

const quotaError = new ApiClientError({
  message: "request failed",
  status: 400,
  payload: {
    error: {
      code: "key_period_limit_exceeds_account",
      message: "server fallback",
      details: {
        period: "day",
        key_limit: 200,
        account_limit: 100,
      },
    },
  },
});

describe("formatQuotaValidationError", () => {
  test("formats the structured limit error in English", () => {
    expect(formatQuotaValidationError(quotaError, i18n.getFixedT("en"))).toBe(
      "Key Day quota $200 exceeds the account Day quota $100",
    );
  });

  test("formats the structured limit error in Simplified Chinese", () => {
    expect(formatQuotaValidationError(quotaError, i18n.getFixedT("zh-CN"))).toBe(
      "Key 一天额度 $200 超过账号一天额度 $100",
    );
  });

  test("localizes legacy day conflicts without parsing the server message", () => {
    const error = new ApiClientError({
      message: "request failed",
      status: 400,
      payload: {
        error: {
          code: "period_day_legacy_conflict",
          message: "do not expose this message",
        },
      },
    });

    expect(formatQuotaValidationError(error, i18n.getFixedT("en"))).toBe(
      "Daily quota conflicts with the legacy daily spending limit.",
    );
  });
});
