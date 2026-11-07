import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { PolicyIssue } from "../model/policyValidation";

/** 错误文案：带点号的键原样查，不带点号的取通用的 validation.* 命名空间。 */
export function useIssueText() {
  const { t } = useTranslation();
  return useCallback(
    (issue: PolicyIssue) => t(issue.key.includes(".") ? issue.key : `validation.${issue.key}`, issue.params),
    [t],
  );
}
