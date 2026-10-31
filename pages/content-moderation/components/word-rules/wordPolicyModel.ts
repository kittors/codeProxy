import type {
  WordAction,
  WordPolicyInput,
  WordPolicyLimits,
  WordPolicyView,
  WordRule,
  WordRuleInput,
  WordRuleKind,
  WordScanScope,
  WordTestMatch,
  WordValidateResult,
} from "@code-proxy/api-client";

/** 编辑中的规则。key 是仅用于列表渲染的稳定键：已保存的规则用服务端 id，新增的规则用本地序号。 */
export interface DraftRule extends WordRule {
  key: string;
}

/**
 * 编辑中的策略。空串 / null 表示「继承」：Key 层继承租户策略，其余层继承默认值。
 * 平台与租户层不展示「继承」选项，但草稿里仍保持空值：界面按服务端给的生效值显示，用户没动过的设置
 * 保存后依旧是「继承」。若把生效值写进草稿，一次无关的保存就会把当时的默认值钉死，
 * 以后默认值调整时这份策略不会跟着变，用户也不知道自己「选」过它。
 */
export interface WordPolicyDraft {
  enabled: boolean;
  action: WordAction | "";
  replacement: string;
  scanScope: WordScanScope | "";
  replyFilter: boolean | null;
  foldTraditionalChinese: boolean | null;
  inheritTenant: boolean;
  blockMessage: string;
  rules: DraftRule[];
}

/** 规则弹窗里能改的字段（和草稿里的规则字段名不完全一致，所以要经 applyRuleFields 落到草稿）。 */
export interface WordRuleFields {
  kind: WordRuleKind;
  pattern: string;
  note: string;
  enabled: boolean;
  /** 只对关键词有意义：正则要表达同样的意思，自己写 `敏\W*感`。 */
  ignoreSeparators: boolean;
}

let newRuleCounter = 0;

export const newRuleKey = (): string => `new-${++newRuleCounter}`;

// The server always gives a stored rule an id; a rule without one still needs a list key of its own.
export const draftRuleFrom = (rule: WordRule): DraftRule => ({ ...rule, key: rule.id || newRuleKey() });

/** 只有关键词能「忽略字间分隔符」；别的类型带着这个标记，服务端会整条拒收。 */
const ignoresSeparators = (kind: WordRuleKind, flag: boolean | undefined): boolean =>
  kind === "keyword" && flag === true;

export const createDraftRule = (input: {
  kind: WordRuleKind;
  pattern: string;
  note?: string;
  enabled?: boolean;
  ignoreSeparators?: boolean;
}): DraftRule => ({
  id: "",
  key: newRuleKey(),
  kind: input.kind,
  pattern: input.pattern,
  enabled: input.enabled ?? true,
  ...(input.note ? { note: input.note } : {}),
  ...(ignoresSeparators(input.kind, input.ignoreSeparators) ? { ignore_separators: true } : {}),
});

/**
 * 把弹窗里改好的字段落到一条草稿规则上：id 和列表键保持不变；备注清空就去掉；
 * 「忽略分隔符」只在关键词上保留，改成正则时一并清掉，别把一个无效的标记带到保存请求里。
 */
export function applyRuleFields(rule: DraftRule, fields: WordRuleFields): DraftRule {
  // 在原对象的副本上就地改：字段顺序不变，没改动的规则序列化后和载入时逐字相同（草稿是否「脏」就是这么比的）。
  const next: DraftRule = {
    ...rule,
    kind: fields.kind,
    pattern: fields.pattern,
    enabled: fields.enabled,
  };
  if (fields.note !== "") next.note = fields.note;
  else delete next.note;
  if (ignoresSeparators(fields.kind, fields.ignoreSeparators)) next.ignore_separators = true;
  else delete next.ignore_separators;
  return next;
}

export function draftFromView(view: WordPolicyView): WordPolicyDraft {
  return {
    enabled: view.enabled,
    action: view.action,
    replacement: view.replacement,
    scanScope: view.scan_scope,
    replyFilter: view.reply_filter,
    foldTraditionalChinese: view.fold_traditional_chinese,
    inheritTenant: view.inherit_tenant,
    blockMessage: view.block_message,
    rules: view.rules.map(draftRuleFrom),
  };
}

// 服务端把空白、控制字符、标点和符号都当作分隔符（Go 的 unicode.IsSpace / IsControl / IsPunct / IsSymbol），
// 这里用等价的 Unicode 属性。
const SEPARATORS = /[\p{White_Space}\p{Cc}\p{P}\p{S}]+/gu;

/**
 * 两条规则「效果相同」的粗判：同类型，关键词忽略大小写和两端空白，正则逐字相同。
 * 忽略分隔符的关键词另算一类（它和不忽略的同名关键词是两条不同的规则），并且去掉分隔符再比。
 * 服务端还会把全角 / 零宽字符 / 繁简体规范化之后相同的规则当作重复（保存时保留第一条），
 * 这里只用来提前提示，权威结论在服务端。
 */
export const ruleIdentity = (kind: WordRuleKind, pattern: string, ignoreSeparators = false): string => {
  if (kind !== "keyword") return `${kind}\u0000${pattern}`;
  const text = pattern.trim().toLowerCase();
  return ignoreSeparators
    ? `${kind}\u0000ignore-separators\u0000${text.replace(SEPARATORS, "")}`
    : `${kind}\u0000${text}`;
};

/** 关键词里除了分隔符什么都没有：打开「忽略分隔符」后它什么也匹配不到，服务端会拒绝（only_separators）。 */
export const isOnlySeparators = (pattern: string): boolean =>
  pattern.trim() !== "" && pattern.replace(SEPARATORS, "") === "";

export const ruleIdentityOf = (rule: Pick<WordRule, "kind" | "pattern" | "ignore_separators">): string =>
  ruleIdentity(rule.kind, rule.pattern, ignoresSeparators(rule.kind, rule.ignore_separators));

export const countRegex = (rules: readonly Pick<WordRule, "kind">[]): number =>
  rules.reduce((sum, rule) => sum + (rule.kind === "regex" ? 1 : 0), 0);

export const ruleInputFrom = (rule: DraftRule): WordRuleInput => ({
  ...(rule.id ? { id: rule.id } : {}),
  kind: rule.kind,
  pattern: rule.pattern,
  enabled: rule.enabled,
  ...(rule.note ? { note: rule.note } : {}),
  ...(ignoresSeparators(rule.kind, rule.ignore_separators) ? { ignore_separators: true } : {}),
});

/** 保存时发送整份策略；version 让服务端发现别人在这期间改过。 */
export const inputFromDraft = (draft: WordPolicyDraft, version: number): WordPolicyInput => ({
  enabled: draft.enabled,
  action: draft.action,
  replacement: draft.replacement,
  scan_scope: draft.scanScope,
  reply_filter: draft.replyFilter,
  fold_traditional_chinese: draft.foldTraditionalChinese,
  inherit_tenant: draft.inheritTenant,
  block_message: draft.blockMessage,
  rules: draft.rules.map(ruleInputFrom),
  version,
});

/**
 * 草稿里哪些规则是「匹配长度不限」的正则（`\d+` 这类）：服务端按已保存的规则数出来 id，
 * 这里只认草稿里仍启用、且模式没改过的那些——改过模式或新加的，服务端还没判断过，不拿旧结论说事。
 * 返回草稿规则的列表键。
 */
export function unboundedRegexKeys(view: WordPolicyView, draft: WordPolicyDraft): Set<string> {
  const flagged = new Set(view.unbounded_regex_ids);
  const keys = new Set<string>();
  if (flagged.size === 0) return keys;
  const saved = new Map(view.rules.map((rule) => [rule.id, rule.pattern]));
  for (const rule of draft.rules) {
    if (rule.kind === "regex" && rule.enabled && flagged.has(rule.id) && saved.get(rule.id) === rule.pattern) {
      keys.add(rule.key);
    }
  }
  return keys;
}

export interface RuleFilter {
  query: string;
  kind: WordRuleKind | "all";
}

export function filterRules(rules: readonly DraftRule[], filter: RuleFilter): DraftRule[] {
  const query = filter.query.trim().toLowerCase();
  if (!query && filter.kind === "all") return [...rules];
  return rules.filter((rule) => {
    if (filter.kind !== "all" && rule.kind !== filter.kind) return false;
    if (!query) return true;
    return (
      rule.pattern.toLowerCase().includes(query) || (rule.note ?? "").toLowerCase().includes(query)
    );
  });
}

export interface ParsedRuleLine {
  /** 文件里的行号（从 1 开始），校验报错时告诉用户是哪一行。 */
  line: number;
  text: string;
}

export interface ParsedRuleFile {
  lines: ParsedRuleLine[];
  /** 超过一次校验能处理的上限，需要拆文件。 */
  tooMany: boolean;
}

/**
 * 解析导入的文本文件：一行一条，空行忽略，去掉 BOM 和行尾的 \r。
 * 关键词两端的空白没有意义（服务端同样会去掉）；正则的空白可能是模式的一部分，只去掉换行符。
 */
export function parseRuleFile(content: string, kind: WordRuleKind, maxLines: number): ParsedRuleFile {
  const lines: ParsedRuleLine[] = [];
  const raw = content.replace(/^\uFEFF/, "").split("\n");
  let tooMany = false;
  for (let index = 0; index < raw.length; index += 1) {
    const withoutReturn = raw[index].replace(/\r$/, "");
    const text = kind === "keyword" ? withoutReturn.trim() : withoutReturn;
    if (text.trim() === "") continue;
    if (lines.length >= maxLines) {
      tooMany = true;
      break;
    }
    lines.push({ line: index + 1, text });
  }
  return { lines, tooMany };
}

export interface HighlightSegment {
  text: string;
  /** 命中这一段的规则数；0 表示普通文本。 */
  hits: number;
  /** 这一段只有在规范化（大小写、全角、零宽字符、空白、繁体）之后才命中。 */
  normalizedOnly: boolean;
}

/**
 * 按服务端给的命中位置（UTF-16 码元偏移，和 JS 字符串下标一致）把测试文本切成高亮段。
 * 来自不同层的命中可能重叠，重叠或相接的区间合并成一段；越界的位置按文本长度截断。
 */
export function highlightSegments(
  text: string,
  matches: readonly Pick<WordTestMatch, "start" | "end" | "normalized_only">[],
): HighlightSegment[] {
  const ranges = matches
    .map((match) => ({
      start: Math.max(0, Math.min(match.start, text.length)),
      end: Math.max(0, Math.min(match.end, text.length)),
      normalizedOnly: match.normalized_only,
    }))
    .filter((range) => range.end > range.start)
    .sort((left, right) => left.start - right.start || right.end - left.end);

  const merged: { start: number; end: number; hits: number; normalizedOnly: boolean }[] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
      last.hits += 1;
      // 只要有一条是按原样命中的，这一段就不是「仅规范化后命中」。
      last.normalizedOnly = last.normalizedOnly && range.normalizedOnly;
    } else {
      merged.push({ ...range, hits: 1 });
    }
  }

  const segments: HighlightSegment[] = [];
  let cursor = 0;
  for (const range of merged) {
    if (range.start > cursor) {
      segments.push({ text: text.slice(cursor, range.start), hits: 0, normalizedOnly: false });
    }
    segments.push({
      text: text.slice(range.start, range.end),
      hits: range.hits,
      normalizedOnly: range.normalizedOnly,
    });
    cursor = range.end;
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), hits: 0, normalizedOnly: false });
  }
  return segments;
}

export interface ImportProblem {
  line: number;
  text: string;
  message: string;
}

export interface ImportReview {
  /** 文件里有效的行数（空行已忽略）。 */
  total: number;
  /** 会加进草稿的新规则。 */
  fresh: DraftRule[];
  /** 和文件里更早的一行重复。 */
  duplicateInFile: number;
  /** 草稿里已经有同样的规则。 */
  alreadyPresent: number;
  invalid: ImportProblem[];
  /** 加上之后规则总数 / 正则数，以及有没有超过一份策略的上限。 */
  rulesAfter: number;
  regexAfter: number;
  fits: boolean;
}

/**
 * 把服务端对导入文件的逐行审核和草稿现状合在一起，得出「会加进来哪些、跳过哪些、为什么」。
 *
 * 服务端只对照已保存的规则，而用户可能已在草稿里删掉或新增了一些，所以
 * 「已存在」要用草稿重新判断：服务端说已存在、但那条规则已被草稿删掉的，仍然算新的；
 * 草稿里尚未保存的同款规则则算已存在。「能不能放下」也按草稿计，因为最终保存的是草稿。
 */
export function reviewImport(input: {
  lines: readonly ParsedRuleLine[];
  kind: WordRuleKind;
  /** 导入的关键词是否都「忽略字间分隔符」；对正则无意义。 */
  ignoreSeparators?: boolean;
  result: WordValidateResult;
  draftRules: readonly DraftRule[];
  limits: Pick<WordPolicyLimits, "max_rules" | "max_regex">;
}): ImportReview {
  const { lines, kind, result, draftRules, limits } = input;
  const ignoreSeparators = ignoresSeparators(kind, input.ignoreSeparators);
  const flagged = new Map(result.reviews.map((review) => [review.index, review]));
  const draftIds = new Set(draftRules.filter((rule) => rule.id).map((rule) => rule.id));
  const present = new Set(draftRules.map(ruleIdentityOf));

  const fresh: DraftRule[] = [];
  const invalid: ImportProblem[] = [];
  let duplicateInFile = 0;
  let alreadyPresent = 0;
  lines.forEach((line, index) => {
    const review = flagged.get(index);
    if (review?.status === "invalid") {
      invalid.push({ line: line.line, text: line.text, message: review.problem?.message ?? "" });
      return;
    }
    if (review?.status === "duplicate") {
      duplicateInFile += 1;
      return;
    }
    const identity = ruleIdentity(kind, line.text, ignoreSeparators);
    const storedAndKept = review?.status === "existing" && draftIds.has(review.existing_id ?? "");
    if (storedAndKept || present.has(identity)) {
      alreadyPresent += 1;
      return;
    }
    // 同一批里按本地口径再去一次重：服务端的「重复」比这更严，这里兜住它没覆盖的情形。
    present.add(identity);
    fresh.push(createDraftRule({ kind, pattern: line.text, ignoreSeparators }));
  });

  const rulesAfter = draftRules.length + fresh.length;
  const regexAfter = countRegex(draftRules) + (kind === "regex" ? fresh.length : 0);
  return {
    total: lines.length,
    fresh,
    duplicateInFile,
    alreadyPresent,
    invalid,
    rulesAfter,
    regexAfter,
    fits: rulesAfter <= limits.max_rules && regexAfter <= limits.max_regex,
  };
}
