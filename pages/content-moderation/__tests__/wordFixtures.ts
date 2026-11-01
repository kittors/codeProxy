import type {
  ContentModerationProfileCapabilities,
  WordPolicyBrief,
  WordPolicyLimits,
  WordPolicyOverview,
  WordPolicyScope,
  WordPolicyView,
  WordRule,
  WordSettings,
} from "@code-proxy/api-client";

/** Fixtures for the sensitive-word rule tests. */

export const WORD_LIMITS: WordPolicyLimits = {
  max_rules: 10000,
  max_regex: 50,
  max_keyword_chars: 128,
  max_regex_bytes: 512,
  max_regex_program: 500,
  max_regex_program_total: 2000,
  max_note_chars: 200,
  max_replacement_chars: 64,
  max_block_message_chars: 500,
};

export const WORD_DEFAULTS: WordSettings = {
  action: "block",
  replacement: "***",
  scan_scope: "all_user",
  block_message: "Your request was blocked by the content policy.",
  reply_filter: false,
  fold_traditional_chinese: false,
};

export const WITH_WORD_GUARD: ContentModerationProfileCapabilities = {
  keywordFoldTraditionalChinese: false,
  apiIncludesToolOutput: false,
  wordGuard: true,
  secretMasking: false,
};

export const wordRule = (id: string, pattern: string, patch: Partial<WordRule> = {}): WordRule => ({
  id,
  kind: "keyword",
  pattern,
  enabled: true,
  ...patch,
});

export const wordView = (
  scope: WordPolicyScope,
  patch: Partial<WordPolicyView> = {},
): WordPolicyView => ({
  exists: true,
  scope_type: scope,
  enabled: true,
  action: scope === "key" ? "" : "block",
  replacement: "",
  scan_scope: scope === "key" ? "" : "all_user",
  reply_filter: scope === "key" ? null : false,
  fold_traditional_chinese: scope === "key" ? null : false,
  inherit_tenant: true,
  block_message: "",
  version: 3,
  rules: [],
  effective: WORD_DEFAULTS,
  rule_count: patch.rules?.length ?? 0,
  rules_hidden: false,
  unbounded_regex_ids: [],
  can_edit: true,
  ...patch,
});

const brief = (scope: WordPolicyScope, ruleCount: number): WordPolicyBrief => ({
  exists: true,
  scope_type: scope,
  enabled: true,
  action: "block",
  scan_scope: "all_user",
  reply_filter: false,
  rule_count: ruleCount,
  version: 3,
});

export const wordOverview = (patch: Partial<WordPolicyOverview> = {}): WordPolicyOverview => ({
  defaults: WORD_DEFAULTS,
  limits: WORD_LIMITS,
  can_manage_platform: false,
  platform: brief("platform", 1),
  tenant: brief("tenant", 2),
  keys: [],
  ...patch,
});

/** A validate answer for rules that are all fine and new (those are not listed). */
export const allNew = (total: number) => ({
  summary: {
    total,
    new: total,
    duplicate: 0,
    existing: 0,
    invalid: 0,
    existing_rules: 0,
    existing_regex: 0,
    new_regex: 0,
    fits: true,
  },
  reviews: [],
});
