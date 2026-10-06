import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { LoginProblem } from "../model/loginErrors";

/** Copy for a login problem: what happened and what to do about it. */
export function useLoginProblemText() {
  const { t } = useTranslation();
  return useCallback(
    (problem: LoginProblem, stage: "start" | "login" = "login") => {
      switch (problem.kind) {
        case "expired":
          return t("add_account.problems.expired");
        case "superseded":
          return t("add_account.problems.superseded");
        case "provider_mismatch":
          return t("add_account.problems.provider_mismatch");
        case "invalid_callback":
          return t("add_account.problems.invalid_callback");
        case "network":
          return t("add_account.problems.network");
        case "failed":
          if (stage === "start") {
            return problem.message
              ? t("add_account.problems.start_failed", { message: problem.message })
              : t("add_account.problems.start_failed_generic");
          }
          return problem.message
            ? t("add_account.problems.failed", { message: problem.message })
            : t("add_account.problems.failed_generic");
      }
    },
    [t],
  );
}
