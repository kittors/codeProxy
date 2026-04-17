import { useCallback, useMemo, useState } from "react";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type {
  PayloadFilterRule,
  PayloadParamValueType,
  PayloadProtocol,
  PayloadRule,
  RoutingChannelGroupEntry,
  RoutingChannelGroupMemberEntry,
  RoutingFallback,
  RoutingPathRouteEntry,
  VisualConfigValues,
} from "@/modules/config/visual/types";
import { DEFAULT_VISUAL_VALUES, makeClientId } from "@/modules/config/visual/types";

function hasOwn(obj: unknown, key: string): obj is Record<string, unknown> {
  return obj !== null && typeof obj === "object" && Object.prototype.hasOwnProperty.call(obj, key);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function deepClone<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function extractApiKeyValue(raw: unknown): string | null {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    return trimmed ? trimmed : null;
  }

  const record = asRecord(raw);
  if (!record) return null;

  const candidates = [record["api-key"], record.apiKey, record.key, record.Key];
  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      if (trimmed) return trimmed;
    }
  }

  return null;
}

function parseApiKeysText(raw: unknown): string {
  if (!Array.isArray(raw)) return "";

  const keys: string[] = [];
  for (const item of raw) {
    const key = extractApiKeyValue(item);
    if (key) keys.push(key);
  }
  return keys.join("\n");
}

function ensureRecord(parent: Record<string, unknown>, key: string): Record<string, unknown> {
  const existing = asRecord(parent[key]);
  if (existing) return existing;
  const next: Record<string, unknown> = {};
  parent[key] = next;
  return next;
}

function deleteIfEmpty(parent: Record<string, unknown>, key: string): void {
  const value = asRecord(parent[key]);
  if (!value) return;
  if (Object.keys(value).length === 0) delete parent[key];
}

function setBoolean(obj: Record<string, unknown>, key: string, value: boolean): void {
  if (value) {
    obj[key] = true;
    return;
  }
  if (hasOwn(obj, key)) obj[key] = false;
}

function setString(obj: Record<string, unknown>, key: string, value: unknown): void {
  const safe = typeof value === "string" ? value : "";
  const trimmed = safe.trim();
  if (trimmed !== "") {
    obj[key] = safe;
    return;
  }
  if (hasOwn(obj, key)) delete obj[key];
}

function setIntFromString(obj: Record<string, unknown>, key: string, value: unknown): void {
  const safe = typeof value === "string" ? value : "";
  const trimmed = safe.trim();
  if (trimmed === "") {
    if (hasOwn(obj, key)) delete obj[key];
    return;
  }

  const parsed = Number.parseInt(trimmed, 10);
  if (Number.isFinite(parsed)) {
    obj[key] = parsed;
    return;
  }

  if (hasOwn(obj, key)) delete obj[key];
}

function normalizeAutoUpdateChannel(value: unknown): "main" | "dev" {
  return typeof value === "string" && value.trim().toLowerCase() === "dev" ? "dev" : "main";
}

function parsePayloadParamValue(raw: unknown): { valueType: PayloadParamValueType; value: string } {
  if (typeof raw === "number") {
    return { valueType: "number", value: String(raw) };
  }
  if (typeof raw === "boolean") {
    return { valueType: "boolean", value: String(raw) };
  }
  if (raw === null || typeof raw === "object") {
    try {
      const json = JSON.stringify(raw, null, 2);
      return { valueType: "json", value: json ?? "null" };
    } catch {
      return { valueType: "json", value: String(raw) };
    }
  }
  return { valueType: "string", value: String(raw ?? "") };
}

const PAYLOAD_PROTOCOL_VALUES = [
  "openai",
  "openai-response",
  "gemini",
  "claude",
  "codex",
  "antigravity",
] as const satisfies ReadonlyArray<PayloadProtocol>;

function parsePayloadProtocol(raw: unknown): PayloadProtocol | undefined {
  if (typeof raw !== "string") return undefined;
  return PAYLOAD_PROTOCOL_VALUES.includes(raw as PayloadProtocol)
    ? (raw as PayloadProtocol)
    : undefined;
}

function parsePayloadRules(rules: unknown): PayloadRule[] {
  if (!Array.isArray(rules)) return [];

  return rules.map((rule, index) => {
    const record = asRecord(rule) ?? {};

    const modelsRaw = record.models;
    const models = Array.isArray(modelsRaw)
      ? modelsRaw.map((model, modelIndex) => {
          const modelRecord = asRecord(model);
          const nameRaw =
            typeof model === "string" ? model : (modelRecord?.name ?? modelRecord?.id ?? "");
          const name = typeof nameRaw === "string" ? nameRaw : String(nameRaw ?? "");
          return {
            id: `model-${index}-${modelIndex}`,
            name,
            protocol: parsePayloadProtocol(modelRecord?.protocol),
          };
        })
      : [];

    const paramsRecord = asRecord(record.params);
    const params = paramsRecord
      ? Object.entries(paramsRecord).map(([path, value], pIndex) => {
          const parsedValue = parsePayloadParamValue(value);
          return {
            id: `param-${index}-${pIndex}`,
            path,
            valueType: parsedValue.valueType,
            value: parsedValue.value,
          };
        })
      : [];

    return { id: `payload-rule-${index}`, models, params };
  });
}

function parsePayloadFilterRules(rules: unknown): PayloadFilterRule[] {
  if (!Array.isArray(rules)) return [];

  return rules.map((rule, index) => {
    const record = asRecord(rule) ?? {};

    const modelsRaw = record.models;
    const models = Array.isArray(modelsRaw)
      ? modelsRaw.map((model, modelIndex) => {
          const modelRecord = asRecord(model);
          const nameRaw =
            typeof model === "string" ? model : (modelRecord?.name ?? modelRecord?.id ?? "");
          const name = typeof nameRaw === "string" ? nameRaw : String(nameRaw ?? "");
          return {
            id: `filter-model-${index}-${modelIndex}`,
            name,
            protocol: parsePayloadProtocol(modelRecord?.protocol),
          };
        })
      : [];

    const paramsRaw = record.params;
    const params = Array.isArray(paramsRaw) ? paramsRaw.map(String) : [];

    return { id: `payload-filter-rule-${index}`, models, params };
  });
}

function parseRoutingFallback(raw: unknown): RoutingFallback {
  return raw === "default" ? "default" : "none";
}

function parseRoutingPriorityText(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const priority = Number(trimmed);
  return Number.isSafeInteger(priority) ? priority : null;
}

function parseRoutingChannelGroups(raw: unknown): RoutingChannelGroupEntry[] {
  if (!Array.isArray(raw)) return [];

  return raw.map((item, index) => {
    const record = asRecord(item) ?? {};
    const match = asRecord(record.match);
    const priorityRecord = asRecord(record["channel-priorities"]);
    const channels = Array.isArray(match?.channels)
      ? match.channels.map((value) => String(value ?? "").trim()).filter(Boolean)
      : [];
    const priorityNames = priorityRecord
      ? Object.keys(priorityRecord)
          .map((value) => String(value ?? "").trim())
          .filter(Boolean)
      : [];
    const names = Array.from(new Set([...channels, ...priorityNames]));
    const members: RoutingChannelGroupMemberEntry[] = names.map((name, memberIndex) => {
      let priority = "";
      if (priorityRecord) {
        const rawPriority = Object.entries(priorityRecord).find(
          ([key]) => key.trim().toLowerCase() === name.toLowerCase(),
        )?.[1];
        if (typeof rawPriority === "number" && Number.isFinite(rawPriority)) {
          priority = String(rawPriority);
        } else if (typeof rawPriority === "string" && rawPriority.trim()) {
          priority = rawPriority.trim();
        }
      }
      return {
        id: `routing-group-${index}-channel-${memberIndex}-${makeClientId()}`,
        name,
        priority,
      };
    });
    return {
      id: `routing-group-${index}-${makeClientId()}`,
      name: typeof record.name === "string" ? record.name : "",
      description: typeof record.description === "string" ? record.description : "",
      channels: members,
    };
  });
}

function parseRoutingPathRoutes(raw: unknown): RoutingPathRouteEntry[] {
  if (!Array.isArray(raw)) return [];

  return raw.map((item, index) => {
    const record = asRecord(item) ?? {};
    return {
      id: `routing-path-${index}-${makeClientId()}`,
      path: typeof record.path === "string" ? record.path : "",
      group: typeof record.group === "string" ? record.group : "",
      stripPrefix: record["strip-prefix"] !== false,
      fallback: parseRoutingFallback(record.fallback),
    };
  });
}

function serializePayloadRulesForYaml(rules: PayloadRule[]): Array<Record<string, unknown>> {
  return rules
    .map((rule) => {
      const models = (rule.models || [])
        .filter((m) => m.name?.trim())
        .map((m) => {
          const obj: Record<string, unknown> = { name: m.name.trim() };
          if (m.protocol) obj.protocol = m.protocol;
          return obj;
        });

      const params: Record<string, unknown> = {};
      for (const param of rule.params || []) {
        if (!param.path?.trim()) continue;
        let value: unknown = param.value;
        if (param.valueType === "number") {
          const num = Number(param.value);
          value = Number.isFinite(num) ? num : param.value;
        } else if (param.valueType === "boolean") {
          value = param.value === "true";
        } else if (param.valueType === "json") {
          try {
            value = JSON.parse(param.value);
          } catch {
            value = param.value;
          }
        }
        params[param.path.trim()] = value;
      }

      return { models, params };
    })
    .filter((rule) => rule.models.length > 0);
}

function serializePayloadFilterRulesForYaml(
  rules: PayloadFilterRule[],
): Array<Record<string, unknown>> {
  return rules
    .map((rule) => {
      const models = (rule.models || [])
        .filter((m) => m.name?.trim())
        .map((m) => {
          const obj: Record<string, unknown> = { name: m.name.trim() };
          if (m.protocol) obj.protocol = m.protocol;
          return obj;
        });

      const params = (Array.isArray(rule.params) ? rule.params : [])
        .map((path) => String(path).trim())
        .filter(Boolean);

      return { models, params };
    })
    .filter((rule) => rule.models.length > 0);
}

function serializeRoutingChannelGroupsForYaml(
  groups: RoutingChannelGroupEntry[],
): Array<Record<string, unknown>> {
  return groups
    .map((group) => {
      const name = group.name.trim();
      if (!name) return null;

      const item: Record<string, unknown> = { name };
      if (group.description.trim()) {
        item.description = group.description.trim();
      }

      const match: Record<string, unknown> = {};
      const channels = group.channels.map((channel) => channel.name.trim()).filter(Boolean);
      if (channels.length > 0) {
        match.channels = Array.from(new Set(channels));
      }
      if (Object.keys(match).length > 0) {
        item.match = match;
      }

      const channelPriorities = group.channels.reduce<Record<string, number>>((acc, channel) => {
        const channelName = channel.name.trim();
        const priority = parseRoutingPriorityText(channel.priority);
        if (channelName && priority !== null) {
          acc[channelName] = priority;
        }
        return acc;
      }, {});
      if (Object.keys(channelPriorities).length > 0) {
        item["channel-priorities"] = channelPriorities;
      }

      return item;
    })
    .filter((group): group is Record<string, unknown> => group !== null);
}

function serializeRoutingPathRoutesForYaml(
  routes: RoutingPathRouteEntry[],
): Array<Record<string, unknown>> {
  return routes
    .map((route) => {
      const path = route.path.trim();
      const group = route.group.trim();
      if (!path || !group) return null;

      const item: Record<string, unknown> = {
        path,
        group,
      };
      if (!route.stripPrefix) {
        item["strip-prefix"] = false;
      }
      if (route.fallback !== "none") {
        item.fallback = route.fallback;
      }
      return item;
    })
    .filter((route): route is Record<string, unknown> => route !== null);
}

export function useVisualConfig() {
  const [visualValues, setVisualValuesState] = useState<VisualConfigValues>({
    ...DEFAULT_VISUAL_VALUES,
  });
  const [baselineValues, setBaselineValues] = useState<VisualConfigValues>({
    ...DEFAULT_VISUAL_VALUES,
  });

  const visualDirty = useMemo(() => {
    return JSON.stringify(visualValues) !== JSON.stringify(baselineValues);
  }, [baselineValues, visualValues]);

  const loadVisualValuesFromYaml = useCallback((yamlContent: string) => {
    try {
      const parsedRaw: unknown = parseYaml(yamlContent) || {};
      const parsed = asRecord(parsedRaw) ?? {};
      const tls = asRecord(parsed.tls);
      const remoteManagement = asRecord(parsed["remote-management"]);
      const quotaExceeded = asRecord(parsed["quota-exceeded"]);
      const routing = asRecord(parsed.routing);
      const payload = asRecord(parsed.payload);
      const streaming = asRecord(parsed.streaming);
      const autoUpdate = asRecord(parsed["auto-update"]);

      const newValues: VisualConfigValues = {
        host: typeof parsed.host === "string" ? parsed.host : "",
        port: String(parsed.port ?? ""),

        tlsEnable: Boolean(tls?.enable),
        tlsCert: typeof tls?.cert === "string" ? tls.cert : "",
        tlsKey: typeof tls?.key === "string" ? tls.key : "",

        rmAllowRemote: Boolean(remoteManagement?.["allow-remote"]),
        rmSecretKey:
          typeof remoteManagement?.["secret-key"] === "string"
            ? remoteManagement["secret-key"]
            : "",
        rmDisableControlPanel: Boolean(remoteManagement?.["disable-control-panel"]),
        rmPanelRepo:
          typeof remoteManagement?.["panel-github-repository"] === "string"
            ? remoteManagement["panel-github-repository"]
            : typeof remoteManagement?.["panel-repo"] === "string"
              ? remoteManagement["panel-repo"]
              : "",

        authDir: typeof parsed["auth-dir"] === "string" ? parsed["auth-dir"] : "",
        apiKeysText: parseApiKeysText(parsed["api-keys"]),

        debug: Boolean(parsed.debug),
        commercialMode: Boolean(parsed["commercial-mode"]),
        loggingToFile: Boolean(parsed["logging-to-file"]),
        logsMaxTotalSizeMb: String(parsed["logs-max-total-size-mb"] ?? ""),
        usageStatisticsEnabled: Boolean(parsed["usage-statistics-enabled"]),
        autoUpdateEnabled: Boolean(autoUpdate?.enabled ?? true),
        autoUpdateChannel: normalizeAutoUpdateChannel(autoUpdate?.channel),
        autoUpdateDockerImage:
          typeof autoUpdate?.["docker-image"] === "string" && autoUpdate["docker-image"].trim()
            ? autoUpdate["docker-image"]
            : DEFAULT_VISUAL_VALUES.autoUpdateDockerImage,

        proxyUrl: typeof parsed["proxy-url"] === "string" ? parsed["proxy-url"] : "",
        forceModelPrefix: Boolean(parsed["force-model-prefix"]),
        requestRetry: String(parsed["request-retry"] ?? ""),
        maxRetryInterval: String(parsed["max-retry-interval"] ?? ""),
        wsAuth: Boolean(parsed["ws-auth"]),

        quotaSwitchProject: Boolean(quotaExceeded?.["switch-project"] ?? true),
        quotaSwitchPreviewModel: Boolean(quotaExceeded?.["switch-preview-model"] ?? true),

        routingStrategy: routing?.strategy === "fill-first" ? "fill-first" : "round-robin",
        routingIncludeDefaultGroup: routing?.["include-default-group"] !== false,
        routingChannelGroups: parseRoutingChannelGroups(routing?.["channel-groups"]),
        routingPathRoutes: parseRoutingPathRoutes(routing?.["path-routes"]),

        payloadDefaultRules: parsePayloadRules(payload?.default),
        payloadOverrideRules: parsePayloadRules(payload?.override),
        payloadFilterRules: parsePayloadFilterRules(payload?.filter),

        streaming: {
          keepaliveSeconds: String(streaming?.["keepalive-seconds"] ?? ""),
          bootstrapRetries: String(streaming?.["bootstrap-retries"] ?? ""),
          nonstreamKeepaliveInterval: String(parsed["nonstream-keepalive-interval"] ?? ""),
        },

        kimiHeaderDefaults: {
          userAgent: String(asRecord(parsed["kimi-header-defaults"])?.["user-agent"] ?? ""),
          platform: String(asRecord(parsed["kimi-header-defaults"])?.["platform"] ?? ""),
          version: String(asRecord(parsed["kimi-header-defaults"])?.["version"] ?? ""),
        },
      };

      setVisualValuesState(newValues);
      setBaselineValues(deepClone(newValues));
    } catch {
      setVisualValuesState({ ...DEFAULT_VISUAL_VALUES });
      setBaselineValues(deepClone(DEFAULT_VISUAL_VALUES));
    }
  }, []);

  const applyVisualChangesToYaml = useCallback(
    (currentYaml: string): string => {
      try {
        const parsed = (parseYaml(currentYaml) || {}) as Record<string, unknown>;
        const values = visualValues;

        setString(parsed, "host", values.host);
        setIntFromString(parsed, "port", values.port);

        if (
          hasOwn(parsed, "tls") ||
          values.tlsEnable ||
          values.tlsCert.trim() ||
          values.tlsKey.trim()
        ) {
          const tls = ensureRecord(parsed, "tls");
          setBoolean(tls, "enable", values.tlsEnable);
          setString(tls, "cert", values.tlsCert);
          setString(tls, "key", values.tlsKey);
          deleteIfEmpty(parsed, "tls");
        }

        if (
          hasOwn(parsed, "remote-management") ||
          values.rmAllowRemote ||
          values.rmSecretKey.trim() ||
          values.rmDisableControlPanel ||
          values.rmPanelRepo.trim()
        ) {
          const rm = ensureRecord(parsed, "remote-management");
          setBoolean(rm, "allow-remote", values.rmAllowRemote);
          setString(rm, "secret-key", values.rmSecretKey);
          setBoolean(rm, "disable-control-panel", values.rmDisableControlPanel);
          setString(rm, "panel-github-repository", values.rmPanelRepo);
          if (hasOwn(rm, "panel-repo")) delete rm["panel-repo"];
          deleteIfEmpty(parsed, "remote-management");
        }

        setString(parsed, "auth-dir", values.authDir);

        if (hasOwn(parsed, "api-keys") || values.apiKeysText.trim()) {
          const apiKeys = values.apiKeysText
            .split(/[\n,]+/)
            .map((key) => key.trim())
            .filter(Boolean);
          if (apiKeys.length > 0) {
            parsed["api-keys"] = apiKeys;
          } else if (hasOwn(parsed, "api-keys")) {
            delete parsed["api-keys"];
          }
        }

        setBoolean(parsed, "debug", values.debug);
        setBoolean(parsed, "commercial-mode", values.commercialMode);
        setBoolean(parsed, "logging-to-file", values.loggingToFile);
        setIntFromString(parsed, "logs-max-total-size-mb", values.logsMaxTotalSizeMb);
        setBoolean(parsed, "usage-statistics-enabled", values.usageStatisticsEnabled);

        if (
          hasOwn(parsed, "auto-update") ||
          !values.autoUpdateEnabled ||
          values.autoUpdateChannel !== "main" ||
          values.autoUpdateDockerImage.trim()
        ) {
          const autoUpdate = ensureRecord(parsed, "auto-update");
          autoUpdate.enabled = values.autoUpdateEnabled;
          autoUpdate.channel = values.autoUpdateChannel;
          setString(autoUpdate, "docker-image", values.autoUpdateDockerImage);
          deleteIfEmpty(parsed, "auto-update");
        }

        setString(parsed, "proxy-url", values.proxyUrl);
        setBoolean(parsed, "force-model-prefix", values.forceModelPrefix);
        setIntFromString(parsed, "request-retry", values.requestRetry);
        setIntFromString(parsed, "max-retry-interval", values.maxRetryInterval);
        setBoolean(parsed, "ws-auth", values.wsAuth);

        if (
          hasOwn(parsed, "quota-exceeded") ||
          !values.quotaSwitchProject ||
          !values.quotaSwitchPreviewModel
        ) {
          const quota = ensureRecord(parsed, "quota-exceeded");
          quota["switch-project"] = values.quotaSwitchProject;
          quota["switch-preview-model"] = values.quotaSwitchPreviewModel;
          deleteIfEmpty(parsed, "quota-exceeded");
        }

        if (
          hasOwn(parsed, "routing") ||
          values.routingStrategy !== "round-robin" ||
          !values.routingIncludeDefaultGroup ||
          values.routingChannelGroups.length > 0 ||
          values.routingPathRoutes.length > 0
        ) {
          const serializedRoutingGroups = serializeRoutingChannelGroupsForYaml(
            values.routingChannelGroups,
          );
          const serializedPathRoutes = serializeRoutingPathRoutesForYaml(values.routingPathRoutes);
          const routing = ensureRecord(parsed, "routing");
          routing.strategy = values.routingStrategy;
          if (!values.routingIncludeDefaultGroup) {
            routing["include-default-group"] = false;
          } else if (hasOwn(routing, "include-default-group")) {
            delete routing["include-default-group"];
          }
          if (serializedRoutingGroups.length > 0) {
            routing["channel-groups"] = serializedRoutingGroups;
          } else if (hasOwn(routing, "channel-groups")) {
            delete routing["channel-groups"];
          }
          if (serializedPathRoutes.length > 0) {
            routing["path-routes"] = serializedPathRoutes;
          } else if (hasOwn(routing, "path-routes")) {
            delete routing["path-routes"];
          }
          deleteIfEmpty(parsed, "routing");
        }

        const keepaliveSeconds =
          typeof values.streaming?.keepaliveSeconds === "string"
            ? values.streaming.keepaliveSeconds
            : "";
        const bootstrapRetries =
          typeof values.streaming?.bootstrapRetries === "string"
            ? values.streaming.bootstrapRetries
            : "";
        const nonstreamKeepaliveInterval =
          typeof values.streaming?.nonstreamKeepaliveInterval === "string"
            ? values.streaming.nonstreamKeepaliveInterval
            : "";

        const streamingDefined =
          hasOwn(parsed, "streaming") || keepaliveSeconds.trim() || bootstrapRetries.trim();
        if (streamingDefined) {
          const streaming = ensureRecord(parsed, "streaming");
          setIntFromString(streaming, "keepalive-seconds", keepaliveSeconds);
          setIntFromString(streaming, "bootstrap-retries", bootstrapRetries);
          deleteIfEmpty(parsed, "streaming");
        }

        setIntFromString(parsed, "nonstream-keepalive-interval", nonstreamKeepaliveInterval);

        // Handle kimi-header-defaults
        const kimiUserAgent =
          typeof values.kimiHeaderDefaults?.userAgent === "string"
            ? values.kimiHeaderDefaults.userAgent
            : "";
        const kimiPlatform =
          typeof values.kimiHeaderDefaults?.platform === "string"
            ? values.kimiHeaderDefaults.platform
            : "";
        const kimiVersion =
          typeof values.kimiHeaderDefaults?.version === "string"
            ? values.kimiHeaderDefaults.version
            : "";

        if (
          hasOwn(parsed, "kimi-header-defaults") ||
          kimiUserAgent.trim() ||
          kimiPlatform.trim() ||
          kimiVersion.trim()
        ) {
          const kimiHeaderDefaults: Record<string, unknown> = {};
          if (kimiUserAgent.trim()) {
            kimiHeaderDefaults["user-agent"] = kimiUserAgent.trim();
          }
          if (kimiPlatform.trim()) {
            kimiHeaderDefaults["platform"] = kimiPlatform.trim();
          }
          if (kimiVersion.trim()) {
            kimiHeaderDefaults["version"] = kimiVersion.trim();
          }
          if (Object.keys(kimiHeaderDefaults).length > 0) {
            parsed["kimi-header-defaults"] = kimiHeaderDefaults;
          } else if (hasOwn(parsed, "kimi-header-defaults")) {
            delete parsed["kimi-header-defaults"];
          }
        }

        if (
          hasOwn(parsed, "payload") ||
          values.payloadDefaultRules.length > 0 ||
          values.payloadOverrideRules.length > 0 ||
          values.payloadFilterRules.length > 0
        ) {
          const payload = ensureRecord(parsed, "payload");
          if (values.payloadDefaultRules.length > 0) {
            payload.default = serializePayloadRulesForYaml(values.payloadDefaultRules);
          } else if (hasOwn(payload, "default")) {
            delete payload.default;
          }
          if (values.payloadOverrideRules.length > 0) {
            payload.override = serializePayloadRulesForYaml(values.payloadOverrideRules);
          } else if (hasOwn(payload, "override")) {
            delete payload.override;
          }
          if (values.payloadFilterRules.length > 0) {
            payload.filter = serializePayloadFilterRulesForYaml(values.payloadFilterRules);
          } else if (hasOwn(payload, "filter")) {
            delete payload.filter;
          }
          deleteIfEmpty(parsed, "payload");
        }

        return stringifyYaml(parsed, { indent: 2, lineWidth: 120, minContentWidth: 0 });
      } catch {
        return currentYaml;
      }
    },
    [visualValues],
  );

  const setVisualValues = useCallback((newValues: Partial<VisualConfigValues>) => {
    setVisualValuesState((prev) => {
      const next: VisualConfigValues = { ...prev, ...newValues } as VisualConfigValues;
      if (newValues.streaming) {
        next.streaming = { ...prev.streaming, ...newValues.streaming };
      }
      if (newValues.kimiHeaderDefaults) {
        next.kimiHeaderDefaults = { ...prev.kimiHeaderDefaults, ...newValues.kimiHeaderDefaults };
      }
      return next;
    });
  }, []);

  const createEmptyPayloadRule = useCallback((): PayloadRule => {
    return {
      id: makeClientId(),
      models: [{ id: makeClientId(), name: "", protocol: undefined }],
      params: [],
    };
  }, []);

  const createEmptyPayloadFilterRule = useCallback((): PayloadFilterRule => {
    return {
      id: makeClientId(),
      models: [{ id: makeClientId(), name: "", protocol: undefined }],
      params: [],
    };
  }, []);

  return {
    visualValues,
    visualDirty,
    loadVisualValuesFromYaml,
    applyVisualChangesToYaml,
    setVisualValues,
    createEmptyPayloadRule,
    createEmptyPayloadFilterRule,
  };
}

export const VISUAL_CONFIG_PROTOCOL_OPTIONS: ReadonlyArray<{
  value: "" | PayloadProtocol;
  label: string;
}> = [
  { value: "", label: "Default" },
  { value: "openai", label: "OpenAI" },
  { value: "openai-response", label: "OpenAI Response" },
  { value: "gemini", label: "Gemini" },
  { value: "claude", label: "Claude" },
  { value: "codex", label: "Codex" },
  { value: "antigravity", label: "Antigravity" },
];

export const VISUAL_CONFIG_PAYLOAD_VALUE_TYPE_OPTIONS: ReadonlyArray<{
  value: PayloadParamValueType;
  label: string;
}> = [
  { value: "string", label: "String" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Boolean" },
  { value: "json", label: "JSON" },
];
