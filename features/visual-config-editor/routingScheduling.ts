import type {
  RoutingDistribution,
  RoutingScheduling,
  RoutingStrategy,
} from "./types";

/** Backend default for `sticky.max-requests`, mirrored so the UI can show it. */
export const DEFAULT_STICKY_MAX_REQUESTS = 200;

export function normalizeDistribution(value: unknown): RoutingDistribution {
  return value === "least-load" || value === "fill-first" ? value : "weighted";
}

export function defaultScheduling(): RoutingScheduling {
  return {
    distribution: "weighted",
    sticky: { enabled: false, maxRequests: "", releaseAtLoad: "" },
  };
}

/**
 * Derives a scheduling block from the legacy `strategy` enum.
 *
 * The old enum forced a choice: picking session-sticky meant giving up any say
 * in how new conversations were spread. Mapping it onto the new model keeps the
 * observable behaviour (sticky stays sticky) while making the distribution
 * underneath explicit and editable.
 */
export function schedulingFromStrategy(strategy: RoutingStrategy): RoutingScheduling {
  if (strategy === "session-sticky") {
    return {
      distribution: "weighted",
      sticky: { enabled: true, maxRequests: "", releaseAtLoad: "" },
    };
  }
  if (strategy === "fill-first") {
    return {
      distribution: "fill-first",
      sticky: { enabled: false, maxRequests: "", releaseAtLoad: "" },
    };
  }
  return defaultScheduling();
}

/**
 * Keeps the legacy field in sync on save so a backend or panel build that
 * predates `scheduling` still reads a coherent value during a staged rollout.
 * least-load has no legacy equivalent and degrades to round-robin.
 */
export function strategyFromScheduling(scheduling: RoutingScheduling): RoutingStrategy {
  if (scheduling.sticky.enabled) return "session-sticky";
  if (scheduling.distribution === "fill-first") return "fill-first";
  return "round-robin";
}

function readNumericText(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return String(value);
  }
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return "";
}

/**
 * Reads a scheduling block from an API/YAML record, falling back to the legacy
 * strategy when the block is absent.
 */
export function parseScheduling(record: Record<string, unknown> | null | undefined, strategy: RoutingStrategy): RoutingScheduling {
  if (!record) return schedulingFromStrategy(strategy);
  const distributionRaw = record.distribution;
  const stickyEnabled =
    record["sticky-enabled"] === true ||
    (typeof record.sticky === "object" &&
      record.sticky !== null &&
      (record.sticky as Record<string, unknown>).enabled === true);
  const hasBlock = typeof distributionRaw === "string" && distributionRaw.trim() !== "";
  if (!hasBlock && !stickyEnabled) {
    return schedulingFromStrategy(strategy);
  }

  const nested = (typeof record.sticky === "object" && record.sticky !== null
    ? (record.sticky as Record<string, unknown>)
    : {}) as Record<string, unknown>;

  return {
    distribution: normalizeDistribution(distributionRaw),
    sticky: {
      enabled: stickyEnabled,
      maxRequests: readNumericText(record["sticky-max-requests"] ?? nested["max-requests"]),
      releaseAtLoad: readNumericText(record["sticky-release-at-load"] ?? nested["release-at-load"]),
    },
  };
}

export function parseIntegerText(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/** Accepts a load ratio in (0,1]; anything else is treated as "not configured". */
export function parseLoadRatioText(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1) return null;
  return parsed;
}

export function serializeScheduling(scheduling: RoutingScheduling): Record<string, unknown> {
  const sticky: Record<string, unknown> = {};
  if (scheduling.sticky.enabled) {
    sticky.enabled = true;
    const maxRequests = parseIntegerText(scheduling.sticky.maxRequests);
    if (maxRequests !== null) sticky["max-requests"] = maxRequests;
    const releaseAtLoad = parseLoadRatioText(scheduling.sticky.releaseAtLoad);
    if (releaseAtLoad !== null) sticky["release-at-load"] = releaseAtLoad;
  }
  const out: Record<string, unknown> = { distribution: scheduling.distribution };
  if (Object.keys(sticky).length > 0) out.sticky = sticky;
  return out;
}
