/**
 * 模型工具函数
 * 迁移自基线 utils/models.js
 */

export interface ModelInfo {
  name: string;
  alias?: string;
  description?: string;
}

const MODEL_CATEGORIES = [
  { id: "gpt", label: "GPT", patterns: [/gpt/i, /\bo\d\b/i, /\bo\d+\.?/i, /\bchatgpt/i] },
  { id: "claude", label: "Claude", patterns: [/claude/i] },
  { id: "gemini", label: "Gemini", patterns: [/gemini/i, /\bgai\b/i] },
  { id: "kimi", label: "Kimi", patterns: [/kimi/i] },
  { id: "qwen", label: "Qwen", patterns: [/qwen/i] },
  { id: "glm", label: "GLM", patterns: [/glm/i, /chatglm/i] },
  { id: "grok", label: "Grok", patterns: [/grok/i] },
  { id: "deepseek", label: "DeepSeek", patterns: [/deepseek/i] },
  { id: "minimax", label: "MiniMax", patterns: [/minimax/i, /abab/i] },
];

const matchCategory = (text: string) => {
  for (const category of MODEL_CATEGORIES) {
    if (category.patterns.some((pattern) => pattern.test(text))) {
      return category.id;
    }
  }
  return null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export function normalizeModelList(payload: unknown, { dedupe = false } = {}): ModelInfo[] {
  const toModel = (entry: unknown): ModelInfo | null => {
    if (typeof entry === "string") {
      return { name: entry };
    }
    if (!isRecord(entry)) {
      return null;
    }
    const name = entry.id || entry.name || entry.model || entry.value;
    if (!name) return null;

    const alias = entry.alias || entry.display_name || entry.displayName;
    const description = entry.description || entry.note || entry.comment;
    const model: ModelInfo = { name: String(name) };
    if (alias && alias !== name) {
      model.alias = String(alias);
    }
    if (description) {
      model.description = String(description);
    }
    return model;
  };

  let models: (ModelInfo | null)[] = [];

  if (Array.isArray(payload)) {
    models = payload.map(toModel);
  } else if (isRecord(payload)) {
    if (Array.isArray(payload.data)) {
      models = payload.data.map(toModel);
    } else if (Array.isArray(payload.models)) {
      models = payload.models.map(toModel);
    }
  }

  const normalized = models.filter(Boolean) as ModelInfo[];
  if (!dedupe) {
    return normalized;
  }

  const seen = new Set<string>();
  return normalized.filter((model) => {
    const key = (model?.name || "").toLowerCase();
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export interface ModelGroup {
  id: string;
  label: string;
  items: ModelInfo[];
}

/** 预定义模型分组 — 用于供应商配置的快速加载 */
export const PREDEFINED_MODEL_GROUPS: ModelGroup[] = [
  {
    id: "gpt",
    label: "OpenAI / GPT",
    items: [
      { name: "gpt-4o", alias: "GPT-4o" },
      { name: "gpt-4o-mini", alias: "GPT-4o Mini" },
      { name: "gpt-4-turbo", alias: "GPT-4 Turbo" },
      { name: "gpt-4", alias: "GPT-4" },
      { name: "gpt-3.5-turbo", alias: "GPT-3.5 Turbo" },
      { name: "o1", alias: "o1" },
      { name: "o1-mini", alias: "o1 Mini" },
      { name: "o3-mini", alias: "o3 Mini" },
      { name: "chatgpt-4o-latest", alias: "ChatGPT-4o Latest" },
    ],
  },
  {
    id: "claude",
    label: "Anthropic / Claude",
    items: [
      { name: "claude-3-5-sonnet-20241022", alias: "Claude 3.5 Sonnet" },
      { name: "claude-3-5-sonnet-latest", alias: "Claude 3.5 Sonnet (Latest)" },
      { name: "claude-3-opus-20240229", alias: "Claude 3 Opus" },
      { name: "claude-3-sonnet-20240229", alias: "Claude 3 Sonnet" },
      { name: "claude-3-haiku-20240307", alias: "Claude 3 Haiku" },
      { name: "claude-3-5-haiku-20241022", alias: "Claude 3.5 Haiku" },
      { name: "claude-2.1", alias: "Claude 2.1" },
      { name: "claude-2.0", alias: "Claude 2.0" },
    ],
  },
  {
    id: "gemini",
    label: "Google / Gemini",
    items: [
      { name: "gemini-2.5-pro-exp-03-25", alias: "Gemini 2.5 Pro" },
      { name: "gemini-2.0-flash", alias: "Gemini 2.0 Flash" },
      { name: "gemini-2.0-flash-thinking-exp-01-21", alias: "Gemini 2.0 Flash Thinking" },
      { name: "gemini-2.0-pro-exp-02-05", alias: "Gemini 2.0 Pro" },
      { name: "gemini-1.5-pro", alias: "Gemini 1.5 Pro" },
      { name: "gemini-1.5-pro-latest", alias: "Gemini 1.5 Pro Latest" },
      { name: "gemini-1.5-flash", alias: "Gemini 1.5 Flash" },
      { name: "gemini-1.5-flash-latest", alias: "Gemini 1.5 Flash Latest" },
    ],
  },
  {
    id: "kimi",
    label: "Moonshot / Kimi",
    items: [
      { name: "kimi-k1.5", alias: "Kimi K1.5" },
      { name: "kimi-k2", alias: "Kimi K2" },
      { name: "kimi-moonshot", alias: "Kimi Moonshot" },
    ],
  },
  {
    id: "qwen",
    label: "Alibaba / Qwen",
    items: [
      { name: "qwen-turbo", alias: "Qwen Turbo" },
      { name: "qwen-plus", alias: "Qwen Plus" },
      { name: "qwen-max", alias: "Qwen Max" },
      { name: "qwen-coder-plus", alias: "Qwen Coder Plus" },
      { name: "qwen-coder-plus-latest", alias: "Qwen Coder Plus Latest" },
      { name: "qwen2.5-72b-instruct", alias: "Qwen 2.5 72B" },
    ],
  },
  {
    id: "glm",
    label: "Zhipu / GLM",
    items: [
      { name: "glm-4", alias: "GLM-4" },
      { name: "glm-4-plus", alias: "GLM-4 Plus" },
      { name: "glm-4-flash", alias: "GLM-4 Flash" },
      { name: "glm-4-air", alias: "GLM-4 Air" },
      { name: "glm-4-airx", alias: "GLM-4 AirX" },
      { name: "chatglm-turbo", alias: "ChatGLM Turbo" },
    ],
  },
  {
    id: "grok",
    label: "xAI / Grok",
    items: [
      { name: "grok-2", alias: "Grok 2" },
      { name: "grok-2-vision", alias: "Grok 2 Vision" },
      { name: "grok-2-vision-latest", alias: "Grok 2 Vision Latest" },
      { name: "grok-beta", alias: "Grok Beta" },
      { name: "grok-vision-beta", alias: "Grok Vision Beta" },
    ],
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    items: [
      { name: "deepseek-chat", alias: "DeepSeek Chat" },
      { name: "deepseek-coder", alias: "DeepSeek Coder" },
      { name: "deepseek-reasoner", alias: "DeepSeek Reasoner" },
      { name: "deepseek-v3", alias: "DeepSeek V3" },
      { name: "deepseek-r1", alias: "DeepSeek R1" },
    ],
  },
  {
    id: "minimax",
    label: "MiniMax",
    items: [
      { name: "minimax-text-01", alias: "MiniMax Text 01" },
      { name: "abab6.5", alias: "Abab 6.5" },
      { name: "abab6.5s", alias: "Abab 6.5s" },
      { name: "abab5.5", alias: "Abab 5.5" },
    ],
  },
];

/** 根据分组 ID 获取预定义模型列表 */
export function getPredefinedModelsByGroup(groupId: string): ModelInfo[] {
  const group = PREDEFINED_MODEL_GROUPS.find((g) => g.id === groupId);
  return group ? [...group.items] : [];
}

/** 获取所有预定义模型分组选项（用于下拉选择） */
export function getPredefinedModelGroupOptions(): { value: string; label: string }[] {
  return PREDEFINED_MODEL_GROUPS.map((g) => ({ value: g.id, label: g.label }));
}

export function classifyModels(
  models: ModelInfo[] = [],
  { otherLabel = "Other" } = {},
): ModelGroup[] {
  const groups: ModelGroup[] = MODEL_CATEGORIES.map((category) => ({
    id: category.id,
    label: category.label,
    items: [],
  }));

  const otherGroup: ModelGroup = { id: "other", label: otherLabel, items: [] };

  models.forEach((model) => {
    const name = (model?.name || "").toString();
    const alias = (model?.alias || "").toString();
    const haystack = `${name} ${alias}`.toLowerCase();
    const matchedId = matchCategory(haystack);
    const target = matchedId ? groups.find((group) => group.id === matchedId) : null;

    if (target) {
      target.items.push(model);
    } else {
      otherGroup.items.push(model);
    }
  });

  const populatedGroups = groups.filter((group) => group.items.length > 0);
  if (otherGroup.items.length) {
    populatedGroups.push(otherGroup);
  }

  return populatedGroups;
}
