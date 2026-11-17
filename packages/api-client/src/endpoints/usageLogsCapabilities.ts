/**
 * What /usage/logs says about itself. The panel updates itself to the latest release and may
 * run against an older backend, so a filter or column that needs a newer backend is only used
 * after a response declared it. Split out of usage.ts to keep that file under the size limit.
 */
export interface UsageLogsCapabilities {
  /**
   * The key filter is id-based ("api-key-id-filters"): the key facet is
   * filters.api_key_ids / api_key_id_names / api_key_id_counts, the api_key_id
   * query parameters select from it, and no field of the response holds a client
   * secret. A backend without it is older and still speaks the secret-keyed facet
   * (filters.api_keys / api_key_names / api_key_counts).
   */
  apiKeyIdFilters: boolean;
  /**
   * The backend has loop protection ("loop-guard"): rows carry guard_kind, the
   * guard_kind query parameters filter by it and filters.guard_kinds is its facet.
   */
  loopGuard: boolean;
  /** Rows carry client_name/client_version/user_agent and the Agent filter works. */
  requestLogClients: boolean;
}

/** Only an explicit true counts: a backend that predates a capability sends no object. */
export const readUsageLogsCapabilities = (value: unknown): UsageLogsCapabilities => {
  const declared = (name: string) =>
    value !== null && typeof value === "object" && (value as Record<string, unknown>)[name] === true;
  return {
    apiKeyIdFilters: declared("api-key-id-filters"),
    loopGuard: declared("loop-guard"),
    requestLogClients: declared("request-log-clients"),
  };
};
