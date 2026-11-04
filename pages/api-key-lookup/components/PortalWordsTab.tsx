import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ShieldOff } from "lucide-react";
import {
  ApiError,
  extractApiErrorCode,
  portalWordPolicyApi,
  type PortalWordPolicyView,
  type WordPolicyLimits,
} from "@code-proxy/api-client";
import { Callout, EmptyState } from "@code-proxy/ui";
import { useWordPolicyDraft, WordPolicyEditor, type WordPolicySource } from "@features/word-policy";

/** 视图自带上限；这里只在视图到达之前占位（编辑器在那之前只画骨架屏）。 */
const PORTAL_LIMITS_PLACEHOLDER: WordPolicyLimits = {
  max_rules: 1000,
  max_regex: 10,
  max_keyword_chars: 128,
  max_regex_bytes: 512,
  max_regex_program: 500,
  max_regex_program_total: 2000,
  max_note_chars: 200,
  max_replacement_chars: 64,
  max_block_message_chars: 500,
};

/** 管理员收回了权限（或从没给过）：服务端答 403 word_policy_portal_forbidden。 */
const isForbidden = (error: unknown): boolean =>
  error instanceof ApiError &&
  error.status === 403 &&
  extractApiErrorCode(error.payload) === "word_policy_portal_forbidden";

/**
 * 门户「敏感词」标签：门户账号给自己名下所有 API Key 设置敏感词。
 *
 * 只有租户允许时才出现这个标签（/auth/me 的 word_policy_allowed）。这里的词只会额外拦截：
 * 平台和管理员设置的规则照常生效，账号看不到也改不了。打开期间管理员收回权限的，
 * 下一次读写会得到 403，这里改为说明情况，不留一个存不进去的编辑器。
 */
export function PortalWordsTab() {
  const { t } = useTranslation();
  const source = useMemo<WordPolicySource<PortalWordPolicyView>>(
    () => ({
      id: "portal-self",
      load: () => portalWordPolicyApi.get(),
      save: (input) => portalWordPolicyApi.put(input),
      remove: () => portalWordPolicyApi.remove(),
    }),
    [],
  );
  const editor = useWordPolicyDraft(source);

  if (isForbidden(editor.loadError)) {
    return (
      <EmptyState
        title={t("apikey_lookup.words_forbidden_title")}
        description={t("apikey_lookup.words_forbidden_description")}
        icon={<ShieldOff size={32} />}
      />
    );
  }

  return (
    <WordPolicyEditor
      editor={editor}
      scope="end_user"
      title={t("apikey_lookup.words_title")}
      description={t("apikey_lookup.words_description")}
      limits={PORTAL_LIMITS_PLACEHOLDER}
      readOnly={false}
      canTest
      validate={(rules) => portalWordPolicyApi.validate(rules)}
      runTest={(input, draft) => portalWordPolicyApi.test(input, draft)}
      testDescription={t("apikey_lookup.words_test_description")}
      notices={
        editor.view?.guard_enabled === false ? (
          <Callout tone="warning" role="status">
            {t("apikey_lookup.words_guard_off")}
          </Callout>
        ) : null
      }
      removal={{
        label: t("apikey_lookup.words_clear"),
        title: t("apikey_lookup.words_clear_title"),
        consequence: t("apikey_lookup.words_clear_consequence"),
      }}
    />
  );
}
