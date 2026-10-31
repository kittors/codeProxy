import { beforeEach, describe, expect, test, vi } from "vitest";
import { ApiError } from "../../client/errors";
import {
  isWordPolicyVersionConflict,
  readWordRuleProblems,
  wordPolicyApi,
  type WordPolicyInput,
} from "../content-moderation-words";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("../../client/client", () => ({
  apiClient: mocks,
}));

const policy: WordPolicyInput = {
  enabled: true,
  action: "replace",
  replacement: "***",
  scan_scope: "all_user",
  reply_filter: null,
  fold_traditional_chinese: null,
  inherit_tenant: true,
  block_message: "",
  rules: [{ kind: "keyword", pattern: "alpha", enabled: true }],
  version: 4,
};

const apiError = (status: number, payload: unknown) =>
  new ApiError({ message: "failed", status, payload });

describe("wordPolicyApi", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
  });

  test("reads the overview and the three kinds of policy from their own paths", async () => {
    mocks.get.mockResolvedValue({});

    await wordPolicyApi.overview();
    await wordPolicyApi.get("platform");
    await wordPolicyApi.get("tenant");
    await wordPolicyApi.get("key", "key-1");

    expect(mocks.get.mock.calls.map((call) => call[0])).toEqual([
      "/content-moderation/word-policies",
      "/content-moderation/word-policies/platform",
      "/content-moderation/word-policies/tenant",
      "/content-moderation/word-policies/keys/key-1",
    ]);
  });

  test("escapes a key id that is not path-safe", async () => {
    mocks.get.mockResolvedValue({});
    mocks.put.mockResolvedValue({});
    mocks.delete.mockResolvedValue(undefined);

    await wordPolicyApi.get("key", "a/b c");
    await wordPolicyApi.put("key", policy, "a/b c");
    await wordPolicyApi.remove("key", "a/b c");

    expect(mocks.get).toHaveBeenCalledWith("/content-moderation/word-policies/keys/a%2Fb%20c");
    expect(mocks.put).toHaveBeenCalledWith(
      "/content-moderation/word-policies/keys/a%2Fb%20c",
      policy,
    );
    expect(mocks.delete).toHaveBeenCalledWith("/content-moderation/word-policies/keys/a%2Fb%20c");
  });

  test("saves the whole policy with the version that was read", async () => {
    mocks.put.mockResolvedValue({ version: 5 });

    await expect(wordPolicyApi.put("tenant", policy)).resolves.toEqual({ version: 5 });

    expect(mocks.put).toHaveBeenCalledWith("/content-moderation/word-policies/tenant", policy);
  });

  test("posts a validation and a test to their own routes", async () => {
    mocks.post.mockResolvedValue({});

    await wordPolicyApi.validate({
      scope: "key",
      key_id: "key-1",
      rules: [{ kind: "regex", pattern: "a+" }],
    });
    await wordPolicyApi.test({ input: "hello", scope: "tenant", draft: policy });

    expect(mocks.post).toHaveBeenNthCalledWith(1, "/content-moderation/word-policies/validate", {
      scope: "key",
      key_id: "key-1",
      rules: [{ kind: "regex", pattern: "a+" }],
    });
    expect(mocks.post).toHaveBeenNthCalledWith(2, "/content-moderation/word-policies/test", {
      input: "hello",
      scope: "tenant",
      draft: policy,
    });
  });
});

describe("readWordRuleProblems", () => {
  test("reads the rules a refused save names, with their positions", () => {
    const error = apiError(422, {
      error: {
        code: "word_policy_invalid",
        message: "invalid",
        rules_total: 3,
        rules: [
          { index: 2, id: "r2", kind: "regex", pattern: "(", code: "invalid_regex", message: "bad" },
          { index: 7, kind: "keyword", pattern: "", code: "empty", message: "empty" },
        ],
      },
    });

    expect(readWordRuleProblems(error)).toEqual({
      total: 3,
      problems: [
        { index: 2, id: "r2", kind: "regex", pattern: "(", code: "invalid_regex", message: "bad" },
        { index: 7, id: undefined, kind: "keyword", pattern: "", code: "empty", message: "empty" },
      ],
    });
  });

  test("falls back to the listed count when the server does not say how many failed", () => {
    const error = apiError(422, {
      error: {
        code: "word_policy_invalid",
        rules: [{ index: 0, kind: "keyword", pattern: "x", code: "c", message: "m" }],
      },
    });
    expect(readWordRuleProblems(error)?.total).toBe(1);
  });

  test("is null for other errors, for another code and for a problem without rules", () => {
    expect(readWordRuleProblems(new Error("x"))).toBeNull();
    expect(readWordRuleProblems(apiError(500, { error: { code: "other", rules: [{}] } }))).toBeNull();
    expect(
      readWordRuleProblems(apiError(422, { error: { code: "word_policy_invalid", message: "m" } })),
    ).toBeNull();
    expect(readWordRuleProblems(apiError(422, "plain text"))).toBeNull();
  });
});

describe("isWordPolicyVersionConflict", () => {
  test("recognises the 409 a stale save gets", () => {
    expect(
      isWordPolicyVersionConflict(
        apiError(409, { error: { code: "word_policy_version_conflict", message: "m" } }),
      ),
    ).toBe(true);
  });

  test("does not mistake any other failure for it", () => {
    expect(
      isWordPolicyVersionConflict(apiError(409, { error: { code: "content_moderation_version_conflict" } })),
    ).toBe(false);
    expect(isWordPolicyVersionConflict(new Error("x"))).toBe(false);
    expect(isWordPolicyVersionConflict(apiError(500, null))).toBe(false);
  });
});
