import { apiClient } from "../client/client";

/** Language of the alert message text (not of the panel). */
export type AlertLanguage = "en" | "zh-CN";
export type AlertChannelKind = "webhook" | "feishu" | "telegram";
export type AlertRuleKey = "quota_window" | "account_failure" | "spending" | "use_it_or_lose_it";
export type AlertSeverity = "info" | "warning" | "critical";
/** `test` is the message the "send a test" button produces; it is never raised by a rule. */
export type AlertEventRule = AlertRuleKey | "test";
export type AlertSubjectKind = "account" | "key" | "end_user" | "channel";
/** `dropped`: the delivery queue was full, so the message was discarded rather than delayed. */
export type AlertDeliveryStatus = "sent" | "failed" | "dropped";

/**
 * A notification channel.
 *
 * `url`, `secret` and `bot_token` are masked when read back (`https://hooks.example.com/****abcd`,
 * `****`; empty = not set). Writing one back unchanged keeps the stored value, an empty string clears
 * it, anything else replaces it and must not contain `****`.
 */
export interface AlertChannel {
  /** Absent on a channel that has not been saved yet; the backend assigns it. */
  id?: string;
  kind: AlertChannelKind;
  name: string;
  enabled: boolean;
  /** webhook and feishu: the address messages are posted to. */
  url?: string;
  /** webhook: HMAC signing key. feishu: the bot's signature-verification key. Optional. */
  secret?: string;
  /** telegram. */
  bot_token?: string;
  /** telegram: not a secret, returned as is. */
  chat_id?: string;
}

export interface AlertRules {
  quota_window: { enabled: boolean; threshold_percent: number };
  /** Failures an operator has to act on (a revoked credential) alert at once regardless of this. */
  account_failure: { enabled: boolean; for_minutes: number };
  spending: { enabled: boolean; threshold_percent: number };
  use_it_or_lose_it: {
    enabled: boolean;
    min_remaining_percent: number;
    hours_before_reset: number;
  };
}

export interface AlertSettings {
  enabled: boolean;
  language: AlertLanguage;
  cooldown_minutes: number;
  channels: AlertChannel[];
  rules: AlertRules;
  /** Absent until the settings have been saved once. */
  updated_at?: string;
  /** False when the backend has no settings store: writes are answered with 503. */
  persistent: boolean;
  limits: { max_channels: number };
}

/**
 * A partial update. Omitted top-level fields and omitted rules stay as they are; `channels`, when
 * present, replaces the whole list (channels are matched to the stored ones by `id`).
 */
export interface AlertSettingsUpdate {
  enabled?: boolean;
  language?: AlertLanguage;
  cooldown_minutes?: number;
  channels?: AlertChannel[];
  rules?: { [Key in AlertRuleKey]?: AlertRules[Key] };
}

/**
 * `{}` tests every enabled channel; `channel_id` tests one saved channel; `channel` tests a draft
 * (masked values in it resolve against the stored channel with the same `id`; without an `id` a
 * masked value is invalid).
 */
export interface AlertTestRequest {
  channel_id?: string;
  channel?: AlertChannel;
}

export interface AlertTestResult {
  channel_id: string;
  channel_name: string;
  kind: AlertChannelKind;
  ok: boolean;
  status: "sent" | "failed";
  /** A short reason on failure; never contains the address or a token. */
  error: string;
  duration_ms: number;
}

export interface AlertTestResponse {
  results: AlertTestResult[];
}

export interface AlertEventDelivery {
  channel_id: string;
  channel_name: string;
  kind: AlertChannelKind;
  status: AlertDeliveryStatus;
  error: string;
}

export interface AlertEvent {
  id: string;
  at: string;
  rule: AlertEventRule;
  severity: AlertSeverity;
  subject: { kind: AlertSubjectKind; id: string; name: string };
  title: string;
  text: string;
  deliveries: AlertEventDelivery[];
}

export interface AlertEventsResponse {
  items: AlertEvent[];
  total: number;
}

export const alertsApi = {
  getSettings: (options?: { signal?: AbortSignal }) =>
    options?.signal
      ? apiClient.get<AlertSettings>("/alerts/settings", { signal: options.signal })
      : apiClient.get<AlertSettings>("/alerts/settings"),
  updateSettings: (body: AlertSettingsUpdate) =>
    apiClient.put<AlertSettings>("/alerts/settings", body),
  sendTest: (request: AlertTestRequest = {}) =>
    apiClient.post<AlertTestResponse>("/alerts/test", request),
  /** Newest first; the backend keeps 200 and caps `limit` there. */
  listEvents: (limit = 50, options?: { signal?: AbortSignal }) =>
    apiClient.get<AlertEventsResponse>("/alerts/events", {
      params: { limit },
      ...(options?.signal ? { signal: options.signal } : {}),
    }),
};
