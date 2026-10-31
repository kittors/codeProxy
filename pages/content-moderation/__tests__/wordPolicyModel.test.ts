import { describe, expect, test } from "vitest";
import type {
  WordPolicyView,
  WordRule,
  WordValidateResult,
} from "@code-proxy/api-client";
import {
  applyRuleFields,
  createDraftRule,
  draftFromView,
  filterRules,
  highlightSegments,
  inputFromDraft,
  isOnlySeparators,
  parseRuleFile,
  reviewImport,
  ruleIdentity,
  ruleInputFrom,
  unboundedRegexKeys,
  type DraftRule,
  type WordRuleFields,
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
  rule_count: patch.rules?.length ?? 0,
  rules_hidden: false,
  unbounded_regex_ids: [],
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
  test.each(["platform", "tenant", "key"] as const)(
    "a %s policy keeps its empty settings empty: the effective values are not written into the draft",
    (scope) => {
      // Writing them in would pin today's defaults into the stored policy on the next, unrelated
      // save, and the policy would stop following the defaults (or, for a key, the tenant).
      const draft = draftFromView(view({ scope_type: scope }));
      expect(draft).toMatchObject({
        action: "",
        scanScope: "",
        replyFilter: null,
        foldTraditionalChinese: null,
      });
    },
  );

  test("settings the policy does carry are kept, whatever the scope", () => {
    for (const scope of ["platform", "tenant", "key"] as const) {
      const draft = draftFromView(
        view({ scope_type: scope, action: "log", reply_filter: true, scan_scope: "with_tools" }),
      );
      expect(draft).toMatchObject({ action: "log", replyFilter: true, scanScope: "with_tools" });
    }
  });

  test("rules keep their server id as the list key", () => {
    const draft = draftFromView(view({ rules: [rule("r1", "alpha")] }));
    expect(draft.rules[0]).toMatchObject({ id: "r1", key: "r1", pattern: "alpha" });
  });

  test("a stored ignore-separators flag comes through", () => {
    const draft = draftFromView(view({ rules: [rule("r1", "敏感词", { ignore_separators: true })] }));
    expect(draft.rules[0]).toMatchObject({ id: "r1", ignore_separators: true });
  });
});

describe("inputFromDraft", () => {
  test("sends the whole policy with the version that was read, and ids only for stored rules", () => {
    const draft = draftFromView(view({ rules: [rule("r1", "alpha", { note: "n" })] }));
    draft.rules.push(createDraftRule({ kind: "regex", pattern: "\\d{4}" }));
    const input = inputFromDraft(draft, 3);
    expect(input.version).toBe(3);
    expect(input.rules).toEqual([
      { id: "r1", kind: "keyword", pattern: "alpha", enabled: true, note: "n" },
      { kind: "regex", pattern: "\\d{4}", enabled: true },
    ]);
  });

  test.each(["platform", "tenant", "key"] as const)(
    "an inherited %s setting is sent as empty, not as the value it inherits",
    (scope) => {
      const draft = draftFromView(view({ scope_type: scope }));
      const input = inputFromDraft(draft, 0);
      expect(input).toMatchObject({
        action: "",
        scan_scope: "",
        reply_filter: null,
        fold_traditional_chinese: null,
        version: 0,
      });
    },
  );

  test("the ignore-separators flag is sent for keywords that have it, and never for a regex", () => {
    const draft = draftFromView(
      view({
        rules: [
          rule("r1", "敏感词", { ignore_separators: true }),
          rule("r2", "plain"),
          // A flag a regular expression must not carry (the server refuses the whole rule).
          rule("r3", "\\d+", { kind: "regex", ignore_separators: true }),
        ],
      }),
    );
    expect(inputFromDraft(draft, 3).rules).toEqual([
      { id: "r1", kind: "keyword", pattern: "敏感词", enabled: true, ignore_separators: true },
      { id: "r2", kind: "keyword", pattern: "plain", enabled: true },
      { id: "r3", kind: "regex", pattern: "\\d+", enabled: true },
    ]);
  });
});

describe("rule fields", () => {
  const fields = (patch: Partial<WordRuleFields> = {}): WordRuleFields => ({
    kind: "keyword",
    pattern: "alpha",
    note: "",
    enabled: true,
    ignoreSeparators: false,
    ...patch,
  });
  const stored = (patch: Partial<WordRule> = {}): DraftRule => ({
    ...rule("r1", "alpha", patch),
    key: "r1",
  });

  test("a new rule carries the flag only when it is a keyword that asks for it", () => {
    expect(createDraftRule(fields({ ignoreSeparators: true }))).toMatchObject({
      ignore_separators: true,
    });
    expect(createDraftRule(fields())).not.toHaveProperty("ignore_separators");
    expect(
      createDraftRule(fields({ kind: "regex", pattern: "a+", ignoreSeparators: true })),
    ).not.toHaveProperty("ignore_separators");
  });

  test("an edit that changes nothing leaves the rule serializing exactly as it was loaded", () => {
    // The draft is told from the loaded one by comparing their JSON, so field order counts.
    const loaded = draftFromView(
      view({ rules: [rule("r1", "alpha", { note: "first", ignore_separators: true })] }),
    ).rules[0];
    const edited = applyRuleFields(
      loaded,
      fields({ note: "first", ignoreSeparators: true }),
    );
    expect(JSON.stringify(edited)).toBe(JSON.stringify(loaded));

    const plain = draftFromView(view({ rules: [rule("r2", "beta")] })).rules[0];
    expect(JSON.stringify(applyRuleFields(plain, fields({ pattern: "beta" })))).toBe(
      JSON.stringify(plain),
    );
  });

  test("turning the flag on and off again, or clearing a note, leaves no trace", () => {
    const loaded = stored({ note: "first" });
    const on = applyRuleFields(loaded, fields({ note: "first", ignoreSeparators: true }));
    expect(on.ignore_separators).toBe(true);
    const off = applyRuleFields(on, fields({ note: "first" }));
    expect(off).not.toHaveProperty("ignore_separators");
    expect(JSON.stringify(off)).toBe(JSON.stringify(loaded));

    const noNote = applyRuleFields(loaded, fields());
    expect(noNote).not.toHaveProperty("note");
    expect(noNote).toMatchObject({ id: "r1", key: "r1" });
  });

  test("changing a keyword that ignores separators into a regex drops the flag", () => {
    const regex = applyRuleFields(
      stored({ ignore_separators: true }),
      fields({ kind: "regex", pattern: "a\\W*b", ignoreSeparators: true }),
    );
    expect(regex).toMatchObject({ kind: "regex", pattern: "a\\W*b", id: "r1" });
    expect(regex).not.toHaveProperty("ignore_separators");
    expect(ruleInputFrom(regex)).not.toHaveProperty("ignore_separators");
  });
});

describe("unboundedRegexKeys", () => {
  const regexRule = (id: string, pattern: string, patch: Partial<WordRule> = {}) =>
    rule(id, pattern, { kind: "regex", ...patch });

  test("marks the enabled, unchanged regular expressions the server named", () => {
    const saved = view({
      rules: [regexRule("r1", "\\d+"), regexRule("r2", "\\d{11}"), rule("r3", "word")],
      unbounded_regex_ids: ["r1"],
    });
    expect([...unboundedRegexKeys(saved, draftFromView(saved))]).toEqual(["r1"]);
  });

  test("a pattern that was edited, or switched off, in the draft is not argued about", () => {
    const saved = view({
      rules: [regexRule("r1", "\\d+"), regexRule("r2", "\\w+")],
      unbounded_regex_ids: ["r1", "r2"],
    });
    const draft = draftFromView(saved);
    draft.rules = draft.rules.map((item) =>
      item.id === "r1" ? { ...item, pattern: "\\d{4}" } : { ...item, enabled: false },
    );
    expect(unboundedRegexKeys(saved, draft).size).toBe(0);
  });

  test("a policy the server found nothing in has nothing marked", () => {
    const saved = view({ rules: [regexRule("r1", "\\d+")] });
    expect(unboundedRegexKeys(saved, draftFromView(saved)).size).toBe(0);
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

  test("a keyword that ignores separators is another rule, whatever separators it is written with", () => {
    expect(ruleIdentity("keyword", "敏感词", true)).not.toBe(ruleIdentity("keyword", "敏感词"));
    expect(ruleIdentity("keyword", "敏 感-词", true)).toBe(ruleIdentity("keyword", "敏感词", true));
    expect(ruleIdentity("keyword", "Sen-Si", true)).toBe(ruleIdentity("keyword", "sen si", true));
    // Without the option the separators are part of the word.
    expect(ruleIdentity("keyword", "敏 感 词")).not.toBe(ruleIdentity("keyword", "敏感词"));
  });

  test("the flag means nothing to a regular expression", () => {
    expect(ruleIdentity("regex", "a-b", true)).toBe(ruleIdentity("regex", "a-b"));
  });
});

describe("isOnlySeparators", () => {
  test("spaces, punctuation and symbols are, letters, digits and ideographs are not", () => {
    expect(isOnlySeparators(" - _ ")).toBe(true);
    expect(isOnlySeparators("，。！")).toBe(true);
    expect(isOnlySeparators("★ ✓")).toBe(true);
    expect(isOnlySeparators("a-b")).toBe(false);
    expect(isOnlySeparators("敏-感")).toBe(false);
    expect(isOnlySeparators("42")).toBe(false);
  });

  test("an empty keyword is not a separators-only one: it has its own message", () => {
    expect(isOnlySeparators("   ")).toBe(false);
    expect(isOnlySeparators("")).toBe(false);
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

  test("keywords imported with ignore-separators carry the flag, and only they", () => {
    const loose = reviewImport({
      lines: [{ line: 1, text: "敏感词" }],
      kind: "keyword",
      ignoreSeparators: true,
      result: result([]),
      draftRules: [],
      limits,
    });
    expect(loose.fresh[0]).toMatchObject({ pattern: "敏感词", ignore_separators: true });

    // A regular expression cannot take the flag, however the modal was left.
    const regex = reviewImport({
      lines: [{ line: 1, text: "a+" }],
      kind: "regex",
      ignoreSeparators: true,
      result: result([]),
      draftRules: [],
      limits,
    });
    expect(regex.fresh[0]).not.toHaveProperty("ignore_separators");
  });

  test("a rule already in the draft only counts as present in the same mode", () => {
    const strict = createDraftRule({ kind: "keyword", pattern: "敏感词" });
    const loose = createDraftRule({ kind: "keyword", pattern: "敏感词", ignoreSeparators: true });
    const importing = (ignoreSeparators: boolean, draftRules: DraftRule[]) =>
      reviewImport({
        lines: [{ line: 1, text: "敏-感-词" }],
        kind: "keyword",
        ignoreSeparators,
        result: result([]),
        draftRules,
        limits,
      });
    // Written with the separators, a strict rule is another word than the loose one.
    expect(importing(true, [strict]).fresh).toHaveLength(1);
    expect(importing(true, [loose]).alreadyPresent).toBe(1);
    expect(importing(false, [loose]).fresh).toHaveLength(1);
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
