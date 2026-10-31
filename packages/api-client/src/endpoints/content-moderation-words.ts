import { apiClient } from "../client/client";
import { ApiError } from "../client/errors";
import { isRecord } from "../client/response";

/**
 * Sensitive-word policies: the platform's, a tenant's and one API key's. They sit next to the
 * channel-bound moderation profiles (content-moderation.ts) and are independent of them.
 *
 * The backend declares support with `capabilities.word_guard` in the profile list; a panel that
 * runs against an older backend (it updates itself from the latest release) must not call any of
 * this, because those routes do not exist there.
 */

export type WordPolicyScope = "platform" | "tenant" | "key";
export type WordAction = "block" | "replace" | "log";
export type WordScanScope = "last_user" | "all_user" | "with_system" | "with_tools";
export type WordRuleKind = "keyword" | "regex";
/** What a whole request amounts to: the strongest thing any hit led to. */
export type WordVerdictAction = "allow" | "log" | "replace" | "block";

export const WORD_ACTIONS: readonly WordAction[] = ["block", "replace", "log"];
/** Each scope includes the ones before it. */
export const WORD_SCAN_SCOPES: readonly WordScanScope[] = [
  "last_user",
  "all_user",
  "with_system",
  "with_tools",
];

export interface WordRule {
  id: string;
  kind: WordRuleKind;
  pattern: string;
  enabled: boolean;
  note?: string;
}

/** A rule as submitted: the server gives a rule without an id one. */
export interface WordRuleInput {
  id?: string;
  kind: WordRuleKind;
  pattern: string;
  enabled: boolean;
  note?: string;
}

/** What a policy's empty settings resolve to (the defaults, or the tenant policy under a key's). */
export interface WordSettings {
  action: WordAction;
  replacement: string;
  scan_scope: WordScanScope;
  block_message: string;
  reply_filter: boolean;
  fold_traditional_chinese: boolean;
}

export interface WordPolicyLimits {
  max_rules: number;
  max_regex: number;
  max_keyword_chars: number;
  max_regex_bytes: number;
  max_note_chars: number;
  max_replacement_chars: number;
  max_block_message_chars: number;
}

export interface WordPolicyView {
  /** False for a policy that was never saved; the rest is what a first save starts from. */
  exists: boolean;
  scope_type: WordPolicyScope;
  scope_id?: string;
  enabled: boolean;
  /** Empty means "inherit" (the default, or for a key the tenant's). */
  action: WordAction | "";
  replacement: string;
  scan_scope: WordScanScope | "";
  /** null means "inherit". */
  reply_filter: boolean | null;
  fold_traditional_chinese: boolean | null;
  /** Key policies only: also apply the tenant policy's rules (the default) or only the key's own. */
  inherit_tenant: boolean;
  block_message: string;
  version: number;
  rules: WordRule[];
  created_at?: string;
  updated_at?: string;
  effective: WordSettings;
  /** The caller may change this policy. The platform policy is read-only to everyone but a platform administrator. */
  can_edit: boolean;
  key_name?: string;
}

/** The whole policy, which replaces the stored one. */
export interface WordPolicyInput {
  enabled: boolean;
  action: WordAction | "";
  replacement: string;
  scan_scope: WordScanScope | "";
  reply_filter: boolean | null;
  fold_traditional_chinese: boolean | null;
  inherit_tenant: boolean;
  block_message: string;
  rules: WordRuleInput[];
  /** The version that was read; the save is refused (409) if the policy has changed since. */
  version?: number;
}

export interface WordPolicyBrief {
  exists: boolean;
  scope_type: WordPolicyScope;
  enabled: boolean;
  action: WordAction | "";
  scan_scope: WordScanScope | "";
  reply_filter: boolean | null;
  rule_count: number;
  version: number;
  updated_at?: string;
}

export interface WordKeyPolicyBrief extends Omit<WordPolicyBrief, "exists"> {
  key_id: string;
  key_name: string;
}

export interface WordPolicyOverview {
  defaults: WordSettings;
  limits: WordPolicyLimits;
  can_manage_platform: boolean;
  platform: WordPolicyBrief;
  tenant: WordPolicyBrief;
  keys: WordKeyPolicyBrief[];
}

export interface WordRuleProblem {
  /** Position in the submitted list. */
  index: number;
  id?: string;
  kind: string;
  pattern: string;
  code: string;
  message: string;
}

export type WordReviewStatus = "new" | "duplicate" | "existing" | "invalid";

export interface WordValidateReview {
  index: number;
  status: Exclude<WordReviewStatus, "new">;
  duplicate_of?: number;
  existing_id?: string;
  problem?: WordRuleProblem;
}

export interface WordValidateSummary {
  total: number;
  new: number;
  duplicate: number;
  existing: number;
  invalid: number;
  existing_rules: number;
  existing_regex: number;
  new_regex: number;
  /** The new rules fit beside the stored ones within the limits of a policy. */
  fits: boolean;
}

/** Rules that are valid and new are not listed: the caller has them in the list it submitted. */
export interface WordValidateResult {
  summary: WordValidateSummary;
  reviews: WordValidateReview[];
}

export interface WordTestMatch {
  layer: WordPolicyScope;
  rule_id: string;
  kind: WordRuleKind;
  pattern: string;
  action: WordAction;
  source: string;
  /** Location of the hit in the tested text, in UTF-16 code units (a JavaScript string index). */
  start: number;
  end: number;
  /** The hit matched only after case, width, zero-width characters, white space or script were normalized. */
  normalized_only: boolean;
}

export interface WordTestResult {
  action: WordVerdictAction;
  blocked: boolean;
  block_message?: string;
  reason?: string;
  /** The text as the upstream would receive it. */
  output: string;
  /** The first hits only; match_count counts them all. */
  matches: WordTestMatch[];
  match_count: number;
  replaced: number;
  layers: WordPolicyScope[];
  /** Some applied layer also filters the model's reply; reply_output is the same text as a reply. */
  reply_filter: boolean;
  reply_output?: string;
  latency_ms: number;
}

export interface WordTestRequest {
  input: string;
  /** Add this API key's policy to the policies checked. */
  key_id?: string;
  /** With draft: which policy the draft stands in for (default tenant). */
  scope?: WordPolicyScope;
  /** An unsaved policy to try instead of the stored one. */
  draft?: WordPolicyInput;
}

export interface WordValidateRequest {
  scope: WordPolicyScope;
  key_id?: string;
  rules: Array<Pick<WordRuleInput, "kind" | "pattern">>;
}

const BASE = "/content-moderation/word-policies";

const policyPath = (scope: WordPolicyScope, keyId?: string): string =>
  scope === "key" ? `${BASE}/keys/${encodeURIComponent(keyId ?? "")}` : `${BASE}/${scope}`;

export const wordPolicyApi = {
  overview() {
    return apiClient.get<WordPolicyOverview>(BASE);
  },

  get(scope: WordPolicyScope, keyId?: string) {
    return apiClient.get<WordPolicyView>(policyPath(scope, keyId));
  },

  put(scope: WordPolicyScope, input: WordPolicyInput, keyId?: string) {
    return apiClient.put<WordPolicyView>(policyPath(scope, keyId), input);
  },

  /** Deleting a policy that is not there succeeds too. */
  remove(scope: WordPolicyScope, keyId?: string) {
    return apiClient.delete(policyPath(scope, keyId));
  },

  validate(request: WordValidateRequest) {
    return apiClient.post<WordValidateResult>(`${BASE}/validate`, request);
  },

  test(request: WordTestRequest) {
    return apiClient.post<WordTestResult>(`${BASE}/test`, request);
  },
};

/** The most rules one validate request is judged on; larger files have to be split. */
export const WORD_VALIDATE_MAX_RULES = 20000;

export interface WordRuleProblems {
  problems: WordRuleProblem[];
  /** How many rules failed; `problems` holds at most the first few hundred. */
  total: number;
}

/**
 * The rules a save was refused for (422 word_policy_invalid), each with its position, so the panel
 * can say which rule is wrong instead of only that something is.
 */
export const readWordRuleProblems = (error: unknown): WordRuleProblems | null => {
  if (!(error instanceof ApiError) || !isRecord(error.payload)) return null;
  const body = isRecord(error.payload.error) ? error.payload.error : null;
  if (!body || body.code !== "word_policy_invalid" || !Array.isArray(body.rules)) return null;
  const problems = body.rules.filter(isRecord).map(
    (item): WordRuleProblem => ({
      index: typeof item.index === "number" ? item.index : 0,
      id: typeof item.id === "string" ? item.id : undefined,
      kind: typeof item.kind === "string" ? item.kind : "",
      pattern: typeof item.pattern === "string" ? item.pattern : "",
      code: typeof item.code === "string" ? item.code : "",
      message: typeof item.message === "string" ? item.message : "",
    }),
  );
  if (problems.length === 0) return null;
  return {
    problems,
    total: typeof body.rules_total === "number" ? body.rules_total : problems.length,
  };
};

/** True when a save was refused because the policy changed since it was loaded (409). */
export const isWordPolicyVersionConflict = (error: unknown): boolean =>
  error instanceof ApiError &&
  isRecord(error.payload) &&
  isRecord(error.payload.error) &&
  error.payload.error.code === "word_policy_version_conflict";
