import type { AuthFileItem } from "@code-proxy/api-client";
import { normalizeProviderKey } from "@code-proxy/domain";
import { parseIdTokenPayload } from "@features/quota-preview/quota-helpers";
import {
  isPlainObject,
  normalizeDedupKeyPart,
  parseCodexFilenameIdentity,
  readNestedStringField,
  readStringField,
  sanitizeCodexFilenamePart,
  sanitizeFilenamePart,
} from "./authFilesTabUtils";

/*
 * 「粘贴 JSON」导入：把粘贴的一段或多段 JSON（单个凭据、凭据数组、Codex 多账号导出包）拆成
 * 待上传的凭据文件，并按账号身份去掉与现有账号、彼此之间重复的条目。
 *
 * 从 AuthFilesFilesTab 原样搬出：那个文件在行数棘轮基线上只能变小，这些纯函数也与渲染无关。
 */

const collectAuthIdentityKeys = (record: Record<string, unknown>): string[] => {
  const credentials = isPlainObject(record.credentials) ? record.credentials : undefined;
  const metadata = isPlainObject(record.metadata) ? record.metadata : undefined;
  const attributes = isPlainObject(record.attributes) ? record.attributes : undefined;
  const provider =
    normalizeProviderKey(
      readNestedStringField([credentials, metadata, attributes, record], ["type", "provider"]),
    ) || "auth";
  const idTokenCandidate =
    credentials?.id_token ?? metadata?.id_token ?? attributes?.id_token ?? record.id_token;
  const parsedIdToken = parseIdTokenPayload(idTokenCandidate);
  const nestedIdToken = isPlainObject(parsedIdToken?.["https://api.openai.com/auth"])
    ? (parsedIdToken?.["https://api.openai.com/auth"] as Record<string, unknown>)
    : undefined;

  const accountId = readNestedStringField(
    [credentials, metadata, attributes, nestedIdToken, parsedIdToken ?? undefined, record],
    ["chatgpt_account_id", "chatgptAccountId", "account_id", "accountId"],
  );
  const email = readNestedStringField([credentials, metadata, attributes, record], ["email"]);
  const label = readNestedStringField([credentials, metadata, attributes, record], ["label"]);
  const fileName = readNestedStringField([record], ["name"]);
  const filenameIdentity =
    provider === "codex" && fileName ? parseCodexFilenameIdentity(fileName) : {};

  return [
    ...(accountId ? [`${provider}:account:${normalizeDedupKeyPart(accountId)}`] : []),
    ...(email ? [`${provider}:email:${normalizeDedupKeyPart(email)}`] : []),
    ...(label ? [`${provider}:label:${normalizeDedupKeyPart(label)}`] : []),
    ...(filenameIdentity.accountId
      ? [`${provider}:account:${normalizeDedupKeyPart(filenameIdentity.accountId)}`]
      : []),
    ...(filenameIdentity.email
      ? [`${provider}:email:${normalizeDedupKeyPart(filenameIdentity.email)}`]
      : []),
    ...(fileName ? [`${provider}:file:${normalizeDedupKeyPart(fileName)}`] : []),
  ];
};

const findJsonValueEnd = (input: string, start: number): number => {
  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let index = start; index < input.length; index += 1) {
    const char = input[index];
    if (inString) {
      if (escaping) {
        escaping = false;
      } else if (char === "\\") {
        escaping = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{" || char === "[") {
      depth += 1;
      continue;
    }
    if (char === "}" || char === "]") {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }

  throw new Error("incomplete json");
};

const findNextJsonValueStart = (input: string, start: number): number => {
  for (let index = start; index < input.length; index += 1) {
    const char = input[index];
    if (char === "{" || char === "[") {
      return index;
    }
  }
  return -1;
};

const parsePastedJsonValues = (input: string): unknown[] => {
  const values: unknown[] = [];
  let index = 0;

  while (index < input.length) {
    while (index < input.length && (/[\s,]/u.test(input[index]) || input[index] === "\uFEFF")) {
      index += 1;
    }
    if (index >= input.length) break;
    const startChar = input[index];
    if (startChar !== "{" && startChar !== "[") {
      const nextIndex = findNextJsonValueStart(input, index + 1);
      if (nextIndex === -1) break;
      index = nextIndex;
      continue;
    }
    const end = findJsonValueEnd(input, index);
    values.push(JSON.parse(input.slice(index, end)) as unknown);
    index = end;
  }

  return values;
};

const parsePastedAuthJsonRecords = (input: string): Record<string, unknown>[] => {
  const values = parsePastedJsonValues(input);
  const records: Record<string, unknown>[] = [];

  values.forEach((value) => {
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (!isPlainObject(item)) throw new Error("json array item is not object");
        records.push(item);
      });
      return;
    }
    if (!isPlainObject(value)) throw new Error("json value is not object");
    records.push(value);
  });

  return records;
};

const normalizeCodexPlanType = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const encodeBase64UrlJson = (value: unknown): string => {
  const raw = JSON.stringify(value);
  if (typeof btoa === "function") {
    return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
  }
  const buffer = (
    globalThis as {
      Buffer?: { from: (input: string, encoding: string) => unknown };
    }
  ).Buffer;
  if (buffer?.from) {
    const bytes = buffer.from(raw, "utf-8") as {
      toString: (encoding: string) => string;
    };
    return bytes.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
  }
  throw new Error("base64url encoder is unavailable");
};

const buildSyntheticCodexIdToken = (input: {
  accountId: string;
  email: string;
  expiresAt: Date;
  issuedAt: Date;
  planType: string;
  userId: string;
}): string => {
  const header = { alg: "none", typ: "JWT", cpa_synthetic: true };
  const payload = {
    iat: Math.floor(input.issuedAt.getTime() / 1000),
    exp: Math.floor(input.expiresAt.getTime() / 1000),
    "https://api.openai.com/auth": {
      chatgpt_account_id: input.accountId,
      chatgpt_plan_type: input.planType,
      chatgpt_user_id: input.userId,
      user_id: input.userId,
    },
    email: input.email,
  };
  return `${encodeBase64UrlJson(header)}.${encodeBase64UrlJson(payload)}.synthetic`;
};

const buildSyntheticCodexAuthRecord = (
  account: Record<string, unknown>,
  issuedAt: Date,
): Record<string, unknown> | null => {
  const credentials = isPlainObject(account.credentials) ? account.credentials : undefined;
  const email = readNestedStringField([credentials, account], ["email", "name"]);
  const accountId = readNestedStringField(
    [credentials, account],
    ["chatgpt_account_id", "account_id"],
  );
  const userId = readNestedStringField([credentials, account], ["chatgpt_user_id", "user_id"]);
  const planType = normalizeCodexPlanType(
    readNestedStringField([credentials, account], ["plan_type", "chatgpt_plan_type"]),
  );
  const accessToken = readNestedStringField([credentials, account], ["access_token"]);
  const refreshToken = readNestedStringField([credentials, account], ["refresh_token"]);
  const expired = readNestedStringField([credentials, account], ["expires_at", "expired"]);
  if (!email || !accountId || !accessToken || !expired || !userId) {
    return null;
  }

  const expiresAt = new Date(expired);
  if (Number.isNaN(expiresAt.getTime())) return null;

  const normalizedPlanType = planType || "plus";
  return {
    type: "codex",
    account_id: accountId,
    chatgpt_account_id: accountId,
    email,
    name: email,
    plan_type: normalizedPlanType,
    chatgpt_plan_type: normalizedPlanType,
    id_token: buildSyntheticCodexIdToken({
      accountId,
      email,
      expiresAt,
      issuedAt,
      planType: normalizedPlanType,
      userId,
    }),
    id_token_synthetic: true,
    access_token: accessToken,
    refresh_token: refreshToken,
    last_refresh: issuedAt.toISOString(),
    expired,
  };
};

const buildPastedAuthBundleRecords = (
  record: Record<string, unknown>,
  issuedAt: Date,
): Record<string, unknown>[] | null => {
  const accounts = record.accounts;
  if (!Array.isArray(accounts)) return null;

  return accounts.map((account, accountIndex) => {
    if (!isPlainObject(account)) {
      throw new Error(`bundle account ${accountIndex + 1} is not object`);
    }
    const synthesized = buildSyntheticCodexAuthRecord(account, issuedAt);
    if (!synthesized) {
      throw new Error(`bundle account ${accountIndex + 1} is not a supported Codex export`);
    }
    return synthesized;
  });
};

const buildPastedAuthFileName = (
  record: Record<string, unknown>,
  index: number,
  usedNames: Set<string>,
): string => {
  const provider = sanitizeFilenamePart(readStringField(record, ["type", "provider"])) || "auth";
  const email = readStringField(record, ["email", "name"]);
  const planType = normalizeCodexPlanType(
    readStringField(record, ["plan_type", "chatgpt_plan_type"]),
  );
  const identifier =
    provider === "codex" && email
      ? `codex-${sanitizeCodexFilenamePart(email)}${planType ? `-${planType}` : ""}`
      : sanitizeFilenamePart(
          readStringField(record, [
            "account_id",
            "chatgpt_account_id",
            "auth_index",
            "authIndex",
            "id",
          ]),
        ) || `import-${index + 1}`;
  const base =
    provider === "codex" && email
      ? identifier
      : `${provider}-${identifier}`.replace(/^-+|-+$/g, "") || `auth-import-${index + 1}`;
  let name = `${base}.json`;
  let suffix = 2;
  while (usedNames.has(name)) {
    name = `${base}-${suffix}.json`;
    suffix += 1;
  }
  usedNames.add(name);
  return name;
};

export const buildPastedAuthFiles = (input: string, existingFiles: AuthFileItem[] = []): File[] => {
  const records = parsePastedAuthJsonRecords(input);
  if (records.length === 0) return [];
  const issuedAt = new Date();
  const normalizedRecords: Record<string, unknown>[] = [];
  records.forEach((record) => {
    const bundledRecords = buildPastedAuthBundleRecords(record, issuedAt);
    if (bundledRecords) {
      normalizedRecords.push(...bundledRecords);
      return;
    }
    normalizedRecords.push(record);
  });
  const usedNames = new Set<string>();
  const usedIdentityKeys = new Set<string>();
  existingFiles.forEach((file) => {
    collectAuthIdentityKeys(file).forEach((key) => usedIdentityKeys.add(key));
  });

  const files: File[] = [];
  normalizedRecords.forEach((record, index) => {
    const identityKeys = collectAuthIdentityKeys(record);
    if (identityKeys.some((key) => usedIdentityKeys.has(key))) {
      return;
    }
    identityKeys.forEach((key) => usedIdentityKeys.add(key));
    const name = buildPastedAuthFileName(record, index, usedNames);
    files.push(
      new File([JSON.stringify(record, null, 2)], name, {
        type: "application/json",
      }),
    );
  });

  return files;
};
