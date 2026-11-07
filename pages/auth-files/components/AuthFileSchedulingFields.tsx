import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { TextInput } from "@code-proxy/ui";
import type { PrefixProxyEditorState } from "@code-proxy/domain";
import { ChannelCoolingField } from "@features/channel-cooling";

interface AuthFileSchedulingFieldsProps {
  editor: PrefixProxyEditorState;
  setEditor: Dispatch<SetStateAction<PrefixProxyEditorState>>;
}

/**
 * 账号详情里影响调度的字段：并发上限与 429/5xx 冷却开关。都改在账号 JSON 上，随「保存」一起写回。
 * 从 AuthFileDetailModal 拆出来，那个文件在行数基线里只许变小。
 */
export function AuthFileSchedulingFields({ editor, setEditor }: AuthFileSchedulingFieldsProps) {
  const { t } = useTranslation();
  return (
    <>
      <div className="grid gap-2">
        <p className="text-xs font-semibold text-ink-2">
          {t("auth_files.concurrency_limit_label")}
        </p>
        <TextInput
          type="number"
          min="0"
          step="1"
          value={editor.concurrencyLimit}
          onChange={(e) => {
            const value = e.currentTarget.value;
            setEditor((prev) => ({ ...prev, concurrencyLimit: value }));
          }}
          placeholder={t("auth_files.concurrency_limit_placeholder")}
          aria-label={t("auth_files.concurrency_limit_label")}
        />
        <p className="text-xs text-ink-3">{t("auth_files.concurrency_limit_hint")}</p>
      </div>
      <ChannelCoolingField
        scope="account"
        variant="field"
        value={editor.disableCooling}
        onChange={(disableCooling) => setEditor((prev) => ({ ...prev, disableCooling }))}
      />
    </>
  );
}
