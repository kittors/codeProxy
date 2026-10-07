/** What the success screen can say about the account that was just added. */
export interface AddedAccount {
  /** Display name, usually the account email. */
  account?: string;
  /** Extra facts worth confirming, e.g. the Vertex project and region. */
  details?: string[];
}
