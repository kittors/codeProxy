/**
 * The model gate of a routing channel group, mirrored from CliRelay so the panel
 * predicts what the backend will actually serve (config.RoutingChannelGroup and
 * sdk/routing.ChannelGroupExcludesModel in Go).
 *
 *   both lists empty → every model the group's channels serve, including ones
 *                      the upstream adds later
 *   allowed-models   → only these; a model the upstream adds later is rejected
 *   excluded-models  → everything except these, so later models pass untouched
 *   both             → the allow list minus the exclusions; an exclusion wins
 *
 * The two lists match differently on purpose. Allow entries are exact ids
 * (case-insensitive, and "*" is just a name there, not a wildcard). Exclusions
 * are loose — case-insensitive, "*" wildcards, and each side compared as written
 * and without its first route prefix — because an exclusion that misses serves
 * a model the operator blocked.
 */

export type ChannelGroupModelGate = {
  allowedModels?: readonly string[];
  excludedModels?: readonly string[];
};

/**
 * A model id lower-cased as written and, when it carries one, without its first
 * path segment: "xai/grok-4.7" is also "grok-4.7". Matches modelSpellings in Go,
 * including leaving a leading or trailing slash alone.
 */
function modelSpellings(id: string): string[] {
  const normalized = id.trim().toLowerCase();
  if (!normalized) return [];
  const slash = normalized.indexOf("/");
  if (slash > 0 && slash < normalized.length - 1) {
    return [normalized, normalized.slice(slash + 1)];
  }
  return [normalized];
}

/**
 * Whether value matches pattern, where "*" matches any substring including an
 * empty one. Case-sensitive, so callers lower-case both sides first. Same steps
 * as sdk/routing.MatchWildcard: fixed prefix, fixed suffix, then the middle
 * segments in order.
 */
export function matchesModelWildcard(pattern: string, value: string): boolean {
  if (!pattern) return false;
  if (!pattern.includes("*")) return pattern === value;
  const parts = pattern.split("*");
  let rest = value;
  const prefix = parts[0];
  if (prefix) {
    if (!rest.startsWith(prefix)) return false;
    rest = rest.slice(prefix.length);
  }
  const suffix = parts[parts.length - 1];
  if (suffix) {
    if (!rest.endsWith(suffix)) return false;
    rest = rest.slice(0, rest.length - suffix.length);
  }
  for (let index = 1; index < parts.length - 1; index += 1) {
    const segment = parts[index];
    if (!segment) continue;
    const found = rest.indexOf(segment);
    if (found < 0) return false;
    rest = rest.slice(found + segment.length);
  }
  return true;
}

/** Whether one excluded-models entry covers the model under the backend's loose rule. */
export function exclusionEntryMatchesModel(entry: string, model: string): boolean {
  const requested = modelSpellings(model);
  if (requested.length === 0) return false;
  return modelSpellings(entry).some((pattern) =>
    requested.some((candidate) => matchesModelWildcard(pattern, candidate)),
  );
}

/** Whether a group's excluded-models list blocks the model. */
export function channelGroupExcludesModel(excluded: readonly string[], model: string): boolean {
  return excluded.some((entry) => exclusionEntryMatchesModel(entry, model));
}

/** Exact, case-insensitive allow-list membership; there is no wildcard here. */
export function channelGroupAllowListHas(allowed: readonly string[], model: string): boolean {
  const target = model.trim().toLowerCase();
  if (!target) return false;
  return allowed.some((entry) => entry.trim().toLowerCase() === target);
}

/** Whether the group serves the model: an exclusion wins, an empty allow list admits all. */
export function channelGroupServesModel(gate: ChannelGroupModelGate, model: string): boolean {
  if (!model.trim()) return false;
  if (channelGroupExcludesModel(gate.excludedModels ?? [], model)) return false;
  const allowed = (gate.allowedModels ?? []).filter((entry) => entry.trim());
  return allowed.length === 0 || channelGroupAllowListHas(allowed, model);
}

/** The models out of `models` that the group serves, in their original order. */
export function filterModelsServedByChannelGroup(
  models: readonly string[],
  gate: ChannelGroupModelGate,
): string[] {
  return models.filter((model) => channelGroupServesModel(gate, model));
}
