/**
 * 敏感词策略的编辑器：管理端（平台 / 租户 / API Key / 门户账号各层）和门户（账号自己的词）共用。
 * 数据从哪里来、存到哪里由调用方给（WordPolicySource、validate、runTest），这里只管编辑体验。
 */
export { WordPolicyEditor, type WordPolicyEditorProps, type WordPolicyRemoval } from "./WordPolicyEditor";
export { WordTestResult } from "./WordTestResult";
export {
  useWordPolicyDraft,
  type WordPolicyDraftState,
  type WordPolicySource,
  type WordSaveOutcome,
} from "./useWordPolicyDraft";
export type { WordRuleValidator } from "./wordPolicyModel";
