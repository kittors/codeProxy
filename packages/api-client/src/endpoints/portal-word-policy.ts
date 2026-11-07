import { portalClient } from "../client/portal-client";
import type {
  WordPolicyInput,
  WordPolicyView,
  WordRuleInput,
  WordSettings,
  WordTestResult,
  WordValidateResult,
} from "./content-moderation-words";

/**
 * The signed-in portal account's own sensitive words (/v0/portal/word-policy). The account keeps
 * them only while its tenant allows it: `portalApi.me()` says so in `capabilities.wordPolicy`, and
 * every call here answers 403 (`word_policy_portal_forbidden`) once the tenant takes it back.
 *
 * They are applied to the requests of all the account's API keys, after the platform's and the
 * tenant's words, which the account cannot see or change: its own words can only add hits.
 */
export interface PortalWordPolicyView extends WordPolicyView {
  /** What a setting left empty means. */
  defaults: WordSettings;
  /** False when the operator has switched the word guard off: nothing is checked, whatever is saved. */
  guard_enabled: boolean;
}

const PATH = "/v0/portal/word-policy";

export const portalWordPolicyApi = {
  get() {
    return portalClient.get<PortalWordPolicyView>(PATH);
  },

  put(input: WordPolicyInput) {
    return portalClient.put<PortalWordPolicyView>(PATH, input);
  },

  /** Deleting a policy that is not there succeeds too. */
  remove() {
    return portalClient.delete(PATH);
  },

  validate(rules: Array<Pick<WordRuleInput, "kind" | "pattern" | "ignore_separators">>) {
    return portalClient.post<WordValidateResult>(`${PATH}/validate`, { rules });
  },

  /** Runs the text through the account's own words only (or the unsaved draft of them). */
  test(input: string, draft?: WordPolicyInput) {
    return portalClient.post<WordTestResult>(`${PATH}/test`, {
      input,
      ...(draft ? { draft } : {}),
    });
  },
};
