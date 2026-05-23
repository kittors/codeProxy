/**
 * Resolver functions for extracting data from auth files.
 */

import type { AuthFileItem } from "@/lib/http/types";
import { normalizeStringValue, normalizePlanType, parseIdTokenPayload } from "./parsers";

export function extractCodexChatgptAccountId(value: unknown): string | null {
  const payload = parseIdTokenPayload(value);
  if (!payload) return null;
  const directId = normalizeStringValue(
    payload.chatgpt_account_id ??
      payload.chatgptAccountId ??
      payload.account_id ??
      payload.accountId,
  );
  if (directId) return directId;
  const nested = payload["https://api.openai.com/auth"];
  if (!nested || typeof nested !== "object" || Array.isArray(nested)) return null;
  return normalizeStringValue(
    (nested as Record<string, unknown>).chatgpt_account_id ??
      (nested as Record<string, unknown>).chatgptAccountId ??
      (nested as Record<string, unknown>).account_id ??
      (nested as Record<string, unknown>).accountId,
  );
}

export function resolveCodexChatgptAccountId(file: AuthFileItem): string | null {
  const metadata =
    file && typeof file.metadata === "object" && file.metadata !== null
      ? (file.metadata as Record<string, unknown>)
      : null;
  const attributes =
    file && typeof file.attributes === "object" && file.attributes !== null
      ? (file.attributes as Record<string, unknown>)
      : null;

  const directCandidates = [
    file.chatgpt_account_id,
    file.chatgptAccountId,
    file.account_id,
    file.accountId,
    metadata?.chatgpt_account_id,
    metadata?.chatgptAccountId,
    metadata?.account_id,
    metadata?.accountId,
    attributes?.chatgpt_account_id,
    attributes?.chatgptAccountId,
    attributes?.account_id,
    attributes?.accountId,
  ];

  for (const candidate of directCandidates) {
    const id = normalizeStringValue(candidate);
    if (id) return id;
  }

  const candidates = [file.id_token, metadata?.id_token, attributes?.id_token];

  for (const candidate of candidates) {
    const payload = parseIdTokenPayload(candidate);
    if (!payload) continue;
    const directId = normalizeStringValue(
      payload.chatgpt_account_id ??
        payload.chatgptAccountId ??
        payload.account_id ??
        payload.accountId,
    );
    if (directId) return directId;
    const nested = payload["https://api.openai.com/auth"];
    const nestedId =
      nested && typeof nested === "object" && !Array.isArray(nested)
        ? normalizeStringValue(
            (nested as Record<string, unknown>).chatgpt_account_id ??
              (nested as Record<string, unknown>).chatgptAccountId ??
              (nested as Record<string, unknown>).account_id ??
              (nested as Record<string, unknown>).accountId,
          )
        : null;
    if (nestedId) return nestedId;
  }

  return null;
}

export function resolveCodexPlanType(file: AuthFileItem): string | null {
  const metadata =
    file && typeof file.metadata === "object" && file.metadata !== null
      ? (file.metadata as Record<string, unknown>)
      : null;
  const attributes =
    file && typeof file.attributes === "object" && file.attributes !== null
      ? (file.attributes as Record<string, unknown>)
      : null;
  const idToken =
    file && typeof file.id_token === "object" && file.id_token !== null
      ? (file.id_token as Record<string, unknown>)
      : null;
  const metadataIdToken =
    metadata && typeof metadata.id_token === "object" && metadata.id_token !== null
      ? (metadata.id_token as Record<string, unknown>)
      : null;
  const candidates = [
    file.plan_type,
    file.planType,
    file["plan_type"],
    file["planType"],
    file.id_token,
    idToken?.plan_type,
    idToken?.planType,
    metadata?.plan_type,
    metadata?.planType,
    metadata?.id_token,
    metadataIdToken?.plan_type,
    metadataIdToken?.planType,
    attributes?.plan_type,
    attributes?.planType,
    attributes?.id_token,
  ];

  for (const candidate of candidates) {
    const planType = normalizePlanType(candidate);
    if (planType) return planType;
  }

  return null;
}

export function extractGeminiCliProjectId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const matches = Array.from(value.matchAll(/\(([^()]+)\)/g));
  if (matches.length === 0) return null;
  const candidate = matches[matches.length - 1]?.[1]?.trim();
  return candidate ? candidate : null;
}

export function resolveGeminiCliProjectId(file: AuthFileItem): string | null {
  const metadata =
    file && typeof file.metadata === "object" && file.metadata !== null
      ? (file.metadata as Record<string, unknown>)
      : null;
  const attributes =
    file && typeof file.attributes === "object" && file.attributes !== null
      ? (file.attributes as Record<string, unknown>)
      : null;

  const candidates = [file.account, file["account"], metadata?.account, attributes?.account];

  for (const candidate of candidates) {
    const projectId = extractGeminiCliProjectId(candidate);
    if (projectId) return projectId;
  }

  return null;
}
