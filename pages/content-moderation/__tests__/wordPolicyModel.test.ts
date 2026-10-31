import { describe, expect, test } from "vitest";
import type {
  WordPolicyView,
  WordRule,
  WordValidateResult,
} from "@code-proxy/api-client";
import {
  createDraftRule,
  draftFromView,
  filterRules,
  highlightSegments,
  inputFromDraft,
  parseRuleFile,
  reviewImport,
  ruleIdentity,
  type DraftRule,
} from "../components/word-rules/wordPolicyModel";

const EFFECTIVE = {
  action: "block" as const,
  replacement: "***",
  scan_scope: "all_user" as const,
  block_message: "Blocked",
  reply_filter: false,
  fold_traditional_chinese: false,
};

const view = (patch: Partial<WordPolicyView> = {}): WordPolicyView => ({
  exists: true,
  scope_type: "tenant",
  enabled: true,
  action: "",
  replacement: "",
  scan_scope: "",
  reply_filter: null,
  fold_traditional_chinese: null,
  inherit_tenant: true,
  block_message: "",
  version: 3,
  rules: [],
  effective: EFFECTIVE,
  can_edit: true,
  ...patch,
});

const rule = (id: string, pattern: string, patch: Partial<WordRule> = {}): WordRule => ({
  id,
  kind: "keyword",
  pattern,
  enabled: true,
  ...patch,
});

describe("draftFromView", () => {
  test("a tenant policy shows the values its empty settings resolve to", () => {
    const draft = draftFromView(view(), "tenant");
    // Saving writes what is on screen, so what the user sees is what will apply.
    expect(draft).toMatchObject({
      action: "block",
      scanScope: "all_user",
      replyFilter: false,
      foldTraditionalChinese: false,
    });
  });

  test("a key override keeps its empty settings empty so they keep following the tenant", () => {
    const draft = draftFromView(view({ scope_type: "key" }), "key");
    expect(draft).toMatchObject({
      action: "",
      scanScope: "",
      replyFilter: null,
      foldTraditionalChinese: null,
    });
  });

  test("a key override keeps the settings it does carry", () => {
    const draft = draftFromView(
      view({ scope_type: "key", action: "log", reply_filter: true, scan_scope: "with_tools" }),
      "key",
    );
    expect(draft).toMatchObject({ action: "log", replyFilter: true, scanScope: "with_tools" });
  });

  test("rules keep their server id as the list key", () => {
    const draft = draftFromView(view({ rules: [rule("r1", "alpha")] }), "tenant");
    expect(draft.rules[0]).toMatchObject({ id: "r1", key: "r1", pattern: "alpha" });
  });
});

describe("inputFromDraft", () => {
  test("sends the whole policy with the version that was read, and ids only for stored rules", () => {
    const draft = draftFromView(view({ rules: [rule("r1", "alpha", { note: "n" })] }), "tenant");
    draft.rules.push(createDraftRule({ kind: "regex", pattern: "\\d{4}" }));
    const input = inputFromDraft(draft, 3);
    expect(input.version).toBe(3);
    expect(input.rules).toEqual([
      { id: "r1", kind: "keyword", pattern: "alpha", enabled: true, note: "n" },
      { kind: "regex", pattern: "\\d{4}", enabled: true },
    ]);
  });

  test("an inherited key setting is sent as empty, not as the value it inherits", () => {
    const draft = draftFromView(view({ scope_type: "key" }), "key");
    const input = inputFromDraft(draft, 0);
    expect(input).toMatchObject({
      action: "",
      scan_scope: "",
      reply_filter: null,
      fold_traditional_chinese: null,
      version: 0,
    });
  });
});

describe("filterRules", () => {
  const rules: DraftRule[] = [
    { ...rule("1", "Alpha", { note: "first" }), key: "1" },
    { ...rule("2", "\\d{4}", { kind: "regex" }), key: "2" },
    { ...rule("3", "beta"), key: "3" },
  ];

  test("matches the pattern or the note, ignoring case", () => {
    expect(filterRules(rules, { query: "alpha", kind: "all" }).map((r) => r.id)).toEqual(["1"]);
    expect(filterRules(rules, { query: "FIRST", kind: "all" }).map((r) => r.id)).toEqual(["1"]);
  });

  test("filters by kind", () => {
    expect(filterRules(rules, { query: "", kind: "regex" }).map((r) => r.id)).toEqual(["2"]);
  });

  test("an empty filter keeps everything", () => {
    expect(filterRules(rules, { query: "  ", kind: "all" })).toHaveLength(3);
  });
});

describe("parseRuleFile", () => {
  test("one entry per line, ignoring blank lines, the BOM and CRLF", () => {
    const parsed = parseRuleFile("\uFEFFalpha\r\n\r\n  beta  \r\ngamma", "keyword", 100);
    expect(parsed.lines).toEqual([
      { line: 1, text: "alpha" },
      { line: 3, text: "beta" },
      { line: 4, text: "gamma" },
    ]);
    expect(parsed.tooMany).toBe(false);
  });

  test("a regular expression keeps its spaces (they can be part of the pattern)", () => {
    const parsed = parseRuleFile("foo bar \nx", "regex", 100);
    expect(parsed.lines[0].text).toBe("foo bar ");
  });

  test("reports a file with more entries than one check can judge", () => {
    const parsed = parseRuleFile("a\nb\nc", "keyword", 2);
    expect(parsed.lines).toHaveLength(2);
    expect(parsed.tooMany).toBe(true);
  });
});

describe("highlightSegments", () => {
  const hit = (start: number, end: number, normalized_only = false) => ({
    start,
    end,
    normalized_only,
  });

  test("cuts the text at the reported UTF-16 offsets", () => {
    // U+1D4B3 is a surrogate pair: two UTF-16 units, one code point.
    const text = "Hello \u{1D4B3} secret!";
    expect(text.indexOf("secret")).toBe(9);
    const segments = highlightSegments(text, [hit(9, 15)]);
    expect(segments.map((s) => [s.text, s.hits])).toEqual([
      ["Hello \u{1D4B3} ", 0],
      ["secret", 1],
      ["!", 0],
    ]);
  });

  test("marks a hit that only matched after normalization", () => {
    const [plain, marked] = highlightSegments("a ＳＥＣＲＥＴ", [hit(2, 8, true)]);
    expect(plain).toMatchObject({ text: "a ", hits: 0 });
    expect(marked).toMatchObject({ text: "ＳＥＣＲＥＴ", hits: 1, normalizedOnly: true });
  });

  test("overlapping hits become one segment, and it is as-written if any of them is", () => {
    const segments = highlightSegments("abcdefgh", [hit(1, 5, true), hit(3, 7, false)]);
    expect(segments.map((s) => [s.text, s.hits, s.normalizedOnly])).toEqual([
      ["a", 0, false],
      ["bcdefg", 2, false],
      ["h", 0, false],
    ]);
  });

  test("hits that only touch stay one highlighted run", () => {
    const segments = highlightSegments("abcd", [hit(0, 2), hit(2, 4)]);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ text: "abcd", hits: 2 });
  });

  test("clamps positions that run past the text and drops empty ranges", () => {
    const segments = highlightSegments("abc", [hit(1, 99), hit(2, 2)]);
    expect(segments.map((s) => [s.text, s.hits])).toEqual([
      ["a", 0],
      ["bc", 1],
    ]);
  });

  test("no hits leaves the text whole", () => {
    expect(highlightSegments("abc", [])).toEqual([{ text: "abc", hits: 0, normalizedOnly: false }]);
    expect(highlightSegments("", [])).toEqual([]);
  });
});

describe("ruleIdentity", () => {
  test("keywords ignore case and surrounding space, regular expressions do not", () => {
    expect(ruleIdentity("keyword", " Alpha ")).toBe(ruleIdentity("keyword", "alpha"));
    expect(ruleIdentity("regex", "A+")).not.toBe(ruleIdentity("regex", "a+"));
    expect(ruleIdentity("regex", "a")).not.toBe(ruleIdentity("keyword", "a"));
  });
});

describe("reviewImport", () => {
  const limits = { max_rules: 5, max_regex: 2 };
  const lines = ["alpha", "beta", "beta", "gamma", "(bad"].map((text, index) => ({
    line: index + 1,
    text,
  }));
  const result = (reviews: WordValidateResult["reviews"]): WordValidateResult => ({
    summary: {
      total: lines.length,
      new: 0,
      duplicate: 0,
      existing: 0,
      invalid: 0,
      existing_rules: 0,
      existing_regex: 0,
      new_regex: 0,
      fits: true,
    },
    reviews,
  });
  const serverView: WordValidateResult["reviews"] = [
    { index: 2, status: "duplicate", duplicate_of: 1 },
    {
      index: 4,
      status: "invalid",
      problem: { index: 4, kind: "keyword", pattern: "(bad", code: "x", message: "bad rule" },
    },
  ];

  test("lists what would be added, and why each other line is skipped", () => {
    const review = reviewImport({
      lines,
      kind: "keyword",
      result: result(serverView),
      draftRules: [],
      limits,
    });
    expect(review.fresh.map((r) => r.pattern)).toEqual(["alpha", "beta", "gamma"]);
    expect(review.duplicateInFile).toBe(1);
    expect(review.invalid).toEqual([{ line: 5, text: "(bad", message: "bad rule" }]);
    expect(review.fits).toBe(true);
  });

  test("a rule the server stored but the draft has since removed is new again", () => {
    const review = reviewImport({
      lines: [{ line: 1, text: "alpha" }],
      kind: "keyword",
      result: result([{ index: 0, status: "existing", existing_id: "r1" }]),
      draftRules: [],
      limits,
    });
    expect(review.fresh.map((r) => r.pattern)).toEqual(["alpha"]);
    expect(review.alreadyPresent).toBe(0);
  });

  test("a stored rule the draft still holds counts as already present", () => {
    const review = reviewImport({
      lines: [{ line: 1, text: "alpha" }],
      kind: "keyword",
      result: result([{ index: 0, status: "existing", existing_id: "r1" }]),
      draftRules: [{ ...rule("r1", "alpha"), key: "r1" }],
      limits,
    });
    expect(review.fresh).toEqual([]);
    expect(review.alreadyPresent).toBe(1);
  });

  test("an unsaved draft rule also counts as present, whatever the server says", () => {
    const review = reviewImport({
      lines: [{ line: 1, text: "ALPHA" }],
      kind: "keyword",
      result: result([]),
      draftRules: [createDraftRule({ kind: "keyword", pattern: "alpha" })],
      limits,
    });
    expect(review.fresh).toEqual([]);
    expect(review.alreadyPresent).toBe(1);
  });

  test("judges whether it fits against the draft, because the draft is what gets saved", () => {
    const draftRules = ["a", "b", "c", "d"].map((p) => ({ ...rule(p, p), key: p }));
    const review = reviewImport({
      lines: lines.slice(0, 2),
      kind: "keyword",
      result: result([]),
      draftRules,
      limits,
    });
    // Four rules in the draft plus two new ones is six; the limit is five.
    expect(review.rulesAfter).toBe(6);
    expect(review.fits).toBe(false);
  });

  test("regular expressions are counted against the regex limit", () => {
    const review = reviewImport({
      lines: ["a+", "b+", "c+"].map((text, index) => ({ line: index + 1, text })),
      kind: "regex",
      result: result([]),
      draftRules: [],
      limits,
    });
    expect(review.regexAfter).toBe(3);
    expect(review.fits).toBe(false);
  });
});
