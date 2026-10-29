import type { UsageLogsResponse } from "@code-proxy/api-client/endpoints/usage";
import { buildRequestLogKeyOptions, type RequestLogKeyOption } from "./requestLogsShared";

// The key filter of the request log, kept out of requestLogsShared.tsx so the
// one place that knows two backend generations speak different vocabularies is
// easy to find (and to delete once nobody runs the older one).

/**
 * The key facet of a /usage/logs response, in the vocabulary its backend speaks.
 *
 * A backend that declares the api-key-id-filters capability lists keys by stable
 * id and never sends a secret; the filter selects them with api_key_id. An older
 * backend (the panel updates itself, so it can meet one) lists them by client
 * secret, which is also the only thing it can filter by. Both are carried in the
 * same shape so the pages build one set of options; `byId` says how a selection
 * must be sent back, and the secrets of the older shape are never displayed (an
 * option is labelled by its name or its mask).
 */
export type RequestLogKeyFacet = {
  /** true: `values` are key ids ("__system__" for system calls); false: client secrets. */
  byId: boolean;
  values: string[];
  names: Record<string, string>;
  counts: Record<string, number>;
};

/**
 * Before any response the facet is empty, and nothing can be selected from it, so
 * which vocabulary an empty facet claims does not matter; id-based is the one a
 * current backend will answer in.
 */
export const EMPTY_REQUEST_LOG_KEY_FACET: RequestLogKeyFacet = {
  byId: true,
  values: [],
  names: {},
  counts: {},
};

export const readRequestLogKeyFacet = (
  response: Pick<UsageLogsResponse, "filters" | "capabilities">,
): RequestLogKeyFacet => {
  const { filters, capabilities } = response;
  // The API client fills every field, but a response that declares nothing is, by
  // definition, from a backend that predates the capability.
  if (capabilities?.apiKeyIdFilters) {
    return {
      byId: true,
      values: filters?.api_key_ids ?? [],
      names: filters?.api_key_id_names ?? {},
      counts: filters?.api_key_id_counts ?? {},
    };
  }
  return {
    byId: false,
    values: filters?.api_keys ?? [],
    names: filters?.api_key_names ?? {},
    counts: filters?.api_key_counts ?? {},
  };
};

/**
 * The query parameters that send a selection made from `facet` back. Ids go in
 * api_key_ids; an older backend would ignore those and answer with every key's
 * logs, so its secrets keep going in api_keys, the one parameter it reads.
 */
export const requestLogKeyFilterQuery = (
  facet: Pick<RequestLogKeyFacet, "byId">,
  selection: { values?: string[]; matchesNone: boolean },
): {
  api_key_ids?: string[];
  api_key_ids_empty?: boolean;
  api_keys?: string[];
  api_keys_empty?: boolean;
} =>
  facet.byId
    ? { api_key_ids: selection.values, api_key_ids_empty: selection.matchesNone }
    : { api_keys: selection.values, api_keys_empty: selection.matchesNone };

/** What a key with no name is called when all that is known is its id. */
export const shortRequestLogKeyId = (id: string): string => id.trim().slice(0, 8);

export const buildRequestLogKeyOptionsFromFacet = (
  facet: RequestLogKeyFacet,
  labels: { allKeys: string; systemCall: string },
): RequestLogKeyOption[] =>
  buildRequestLogKeyOptions(
    facet.values,
    facet.names,
    labels,
    facet.counts,
    facet.byId ? shortRequestLogKeyId : undefined,
  );
