import { useTranslation } from "react-i18next";
import type { ApiKeyEntry } from "@code-proxy/api-client/endpoints/api-keys";
import { maskApiKey } from "../apiKeyPageUtils";

/** 确认框里的「被操作的 Key」：名称 + 掩码后的 Key 值（删除、轮换共用）。 */
export function ApiKeySubject({ entry }: { entry?: Pick<ApiKeyEntry, "name" | "key"> | null }) {
  const { t } = useTranslation();
  if (!entry) return null;
  return (
    <span className="flex min-w-0 items-center justify-between gap-3">
      <span className="truncate font-medium">{entry.name || t("api_keys_page.unnamed")}</span>
      {entry.key ? (
        <code className="shrink-0 font-mono text-xs text-ink-3">{maskApiKey(entry.key)}</code>
      ) : null}
    </span>
  );
}
