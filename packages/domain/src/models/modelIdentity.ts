/**
 * Whether a requested model name and the model actually used upstream denote the
 * same model.
 *
 * Provider aliases normally only add a routing segment — an Ollama Cloud account
 * exposing `deepseek-v4-flash:0731` as `ollama/deepseek-v4-flash:0731` makes the
 * request log carry the prefixed name and the upstream field the bare one. Those
 * are one model under two names, so surfacing a "real model ID" hint for them is
 * pure noise. Aliases that rename the model (`fast` -> `claude-sonnet-4`) stay
 * different and remain worth showing.
 *
 * The backend stopped recording alias-only upstream names, but request logs are
 * kept for months, so the UI normalizes historical rows the same way.
 */
export const isSameModelIdentity = (requested: string, upstream: string): boolean => {
  const a = requested.trim().toLowerCase();
  const b = upstream.trim().toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;
  return a.endsWith(`/${b}`) || b.endsWith(`/${a}`);
};

/** Inverse of {@link isSameModelIdentity}, for "should we disclose this name?" checks. */
export const isDistinctModelIdentity = (requested: string, upstream: string): boolean =>
  Boolean(requested.trim()) &&
  Boolean(upstream.trim()) &&
  !isSameModelIdentity(requested, upstream);
