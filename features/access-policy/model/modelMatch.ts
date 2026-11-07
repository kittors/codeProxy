/**
 * 模型模式匹配，与后端 internal/quota/model_match.go 一一对应：面板用它预览「这条规则会命中
 * 哪些模型」，并在保存前拦下后端一定会拒绝的写法（降级目标仍被规则命中、路由目标命中自己的来源）。
 * 两边各写一份时最怕结论不一致，所以规则逐条照抄，测试里有对照用例。
 */

/** 去掉末尾形如 "[1m]"、"[128k]" 的上下文窗口标记；"[beta]" 这类是模型名的一部分。 */
const stripContextWindowMarker = (model: string): string => {
  const open = model.lastIndexOf("[");
  if (open <= 0 || !model.endsWith("]")) return model;
  return /^\d+[km]?$/.test(model.slice(open + 1, -1)) ? model.slice(0, open) : model;
};

/** 去空白、转小写，去掉思考强度后缀 "(high)" 与上下文窗口标记。 */
export const normalizeModelName = (model: string): string => {
  let normalized = stripContextWindowMarker(model.trim().toLowerCase());
  const open = normalized.lastIndexOf("(");
  if (open > 0 && normalized.endsWith(")")) {
    normalized = stripContextWindowMarker(normalized.slice(0, open).trim());
  }
  return normalized;
};

/** 模式与模型名同样归一化，并把连续的 * 折叠成一个。 */
export const normalizeModelPattern = (pattern: string): string =>
  normalizeModelName(pattern).replace(/\*{2,}/g, "*");

export const isWildcardPattern = (pattern: string): boolean => pattern.includes("*");

/** 单独一个 * 不是合法模式：「全部模型」由总额度表达。 */
export const isStarOnlyPattern = (pattern: string): boolean =>
  normalizeModelPattern(pattern) === "*";

/** "provider/model" 形式的包装只是另一条通道，配额上视为裸模型。 */
const bareModelName = (model: string): string => {
  const index = model.indexOf("/");
  if (index < 0) return model;
  const bare = model.slice(index + 1).trim();
  return bare || model;
};

/** 只含 * 的通配匹配（贪心 + 回溯）。 */
const globMatch = (pattern: string, value: string): boolean => {
  if (!pattern.includes("*")) return pattern === value;
  let p = 0;
  let v = 0;
  let star = -1;
  let mark = 0;
  while (v < value.length) {
    if (p < pattern.length && pattern[p] === "*") {
      star = p;
      mark = v;
      p += 1;
    } else if (p < pattern.length && pattern[p] === value[v]) {
      p += 1;
      v += 1;
    } else if (star >= 0) {
      p = star + 1;
      mark += 1;
      v = mark;
    } else {
      return false;
    }
  }
  while (p < pattern.length && pattern[p] === "*") p += 1;
  return p === pattern.length;
};

/**
 * pattern 是否命中 model：不区分大小写、忽略后缀；裸模型名命中它的所有包装
 * （"gpt-oss:20b" 命中 "ollama/gpt-oss:20b"），反过来不成立。
 */
export const modelPatternMatches = (pattern: string, model: string): boolean => {
  const p = normalizeModelPattern(pattern);
  const m = normalizeModelName(model);
  if (!p || !m) return false;
  if (globMatch(p, m)) return true;
  const bare = bareModelName(m);
  return bare !== m && globMatch(p, bare);
};

export const matchesAnyModelPattern = (patterns: readonly string[], model: string): boolean =>
  patterns.some((pattern) => modelPatternMatches(pattern, model));

/** 从已知模型目录里挑出被这些模式命中的模型（用于「命中 N 个模型」预览）。 */
export const matchingCatalogModels = (
  patterns: readonly string[],
  catalog: readonly string[],
): string[] => (patterns.length === 0 ? [] : catalog.filter((model) => matchesAnyModelPattern(patterns, model)));
