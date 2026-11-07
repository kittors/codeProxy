import type {
  LoopGuardInfo,
  LoopGuardKeyView,
  LoopGuardTenantView,
  LoopGuardWrite,
} from "@code-proxy/api-client";

/**
 * 循环保护设置的编辑草稿。输入框里是文字，写给后端的是数字，所以草稿用字符串存阈值：
 * 空串就是「不填 = 跟随上一层」（后端里的 0），不会因为转成数字而丢掉用户正在输入的半截内容。
 */

/** 租户一层只有开 / 关；一把 Key 还可以跟随租户。 */
export type LoopGuardMode = "inherit" | "on" | "off";

export type LoopGuardScope = "tenant" | "key";

export interface LoopGuardDraft {
  replyMode: LoopGuardMode;
  replyWindow: string;
  replyMaxDistinct: string;
  toolMode: LoopGuardMode;
  toolRepeats: string;
}

export type LoopGuardField = "replyWindow" | "replyMaxDistinct" | "toolRepeats";

/** 校验失败的原因：i18n 键加插值，由界面翻译，这里不碰语言。 */
export interface LoopGuardFieldError {
  key: string;
  values: Record<string, number>;
}

export type LoopGuardDraftErrors = Partial<Record<LoopGuardField, LoopGuardFieldError>>;

const modeOf = (enabled: boolean | null): LoopGuardMode =>
  enabled === null ? "inherit" : enabled ? "on" : "off";

const thresholdText = (value: number): string => (value > 0 ? String(value) : "");

export function draftFromTenant(view: LoopGuardTenantView): LoopGuardDraft {
  return {
    replyMode: modeOf(view.reply.enabled),
    replyWindow: thresholdText(view.reply.window),
    replyMaxDistinct: thresholdText(view.reply.max_distinct),
    toolMode: modeOf(view.tool.enabled),
    toolRepeats: thresholdText(view.tool.repeats),
  };
}

export function draftFromKey(view: LoopGuardKeyView): LoopGuardDraft {
  return {
    replyMode: modeOf(view.reply.enabled),
    replyWindow: thresholdText(view.reply.window),
    replyMaxDistinct: thresholdText(view.reply.max_distinct),
    toolMode: modeOf(view.tool.enabled),
    toolRepeats: thresholdText(view.tool.repeats),
  };
}

export function loopGuardDraftsEqual(a: LoopGuardDraft, b: LoopGuardDraft): boolean {
  return (
    a.replyMode === b.replyMode &&
    a.replyWindow.trim() === b.replyWindow.trim() &&
    a.replyMaxDistinct.trim() === b.replyMaxDistinct.trim() &&
    a.toolMode === b.toolMode &&
    a.toolRepeats.trim() === b.toolRepeats.trim()
  );
}

/** 阈值输入框什么时候显示：检查关着时没有阈值可言。 */
export const showsReplyThresholds = (draft: LoopGuardDraft) => draft.replyMode !== "off";
export const showsToolThresholds = (draft: LoopGuardDraft) => draft.toolMode !== "off";

/** 空串 = 不填；其余必须是正整数文字。无效返回 NaN。 */
function parseThreshold(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  return /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
}

/**
 * 与后端同一套规则（sdk/loopdetect 的 Validate）：窗口在 [min, max]；max_distinct 至多是窗口的
 * 1 / share，窗口没填时按默认窗口算。后端的范围随响应返回，这里不放数字常量。
 * 后端校验仍是最终的：这里只是让用户在点保存之前就看到原因。
 */
export function validateLoopGuardDraft(
  draft: LoopGuardDraft,
  info: Pick<LoopGuardInfo, "defaults" | "bounds">,
): LoopGuardDraftErrors {
  const errors: LoopGuardDraftErrors = {};
  const { bounds, defaults } = info;

  if (showsReplyThresholds(draft)) {
    const window = parseThreshold(draft.replyWindow);
    if (
      window !== null &&
      !(window >= bounds.min_reply_window && window <= bounds.max_reply_window)
    ) {
      errors.replyWindow = {
        key: "loop_guard.error_window",
        values: { min: bounds.min_reply_window, max: bounds.max_reply_window },
      };
    }
    const distinct = parseThreshold(draft.replyMaxDistinct);
    if (distinct !== null) {
      // 窗口无效时按默认窗口估上限，免得一个错误引出第二个错误。
      const basis =
        window !== null && !Number.isNaN(window) && !errors.replyWindow
          ? window
          : defaults.reply_window;
      const upper = maxDistinctFor(basis, info);
      if (!(distinct >= bounds.min_reply_distinct && distinct <= upper)) {
        errors.replyMaxDistinct = {
          key: "loop_guard.error_max_distinct",
          values: { min: bounds.min_reply_distinct, max: upper, window: basis },
        };
      }
    }
  }

  if (showsToolThresholds(draft)) {
    const repeats = parseThreshold(draft.toolRepeats);
    if (
      repeats !== null &&
      !(repeats >= bounds.min_tool_repeats && repeats <= bounds.max_tool_repeats)
    ) {
      errors.toolRepeats = {
        key: "loop_guard.error_repeats",
        values: { min: bounds.min_tool_repeats, max: bounds.max_tool_repeats },
      };
    }
  }
  return errors;
}

/** 窗口为 window 时 max_distinct 的上限。 */
export function maxDistinctFor(window: number, info: Pick<LoopGuardInfo, "bounds">): number {
  const { bounds } = info;
  const share = bounds.reply_distinct_window_share;
  const clamped = Math.min(Math.max(window, bounds.min_reply_window), bounds.max_reply_window);
  return share > 0 ? Math.floor(clamped / share) : clamped;
}

export const hasLoopGuardErrors = (errors: LoopGuardDraftErrors): boolean =>
  Object.keys(errors).length > 0;

const positive = (text: string): number | undefined => {
  const value = parseThreshold(text);
  return value !== null && Number.isFinite(value) && value > 0 ? value : undefined;
};

/**
 * 草稿 → PUT 请求体。两个分段都带上：分段整段替换已存的那一段，所以没填的阈值会回到默认 / 跟随，
 * 正是输入框留空表示的意思。检查关着（或租户一层的关）只存 enabled:false，不留下看不见的旧阈值。
 * 租户一层没有「跟随」：inherit 只会出现在 Key 的草稿里。
 */
export function loopGuardWriteOf(draft: LoopGuardDraft, scope: LoopGuardScope): LoopGuardWrite {
  const enabledOf = (mode: LoopGuardMode): boolean | null => {
    if (mode === "inherit") return scope === "key" ? null : false;
    return mode === "on";
  };
  const reply: NonNullable<LoopGuardWrite["reply"]> = { enabled: enabledOf(draft.replyMode) };
  if (showsReplyThresholds(draft)) {
    const window = positive(draft.replyWindow);
    const distinct = positive(draft.replyMaxDistinct);
    if (window !== undefined) reply.window = window;
    if (distinct !== undefined) reply.max_distinct = distinct;
  }
  const tool: NonNullable<LoopGuardWrite["tool"]> = { enabled: enabledOf(draft.toolMode) };
  if (showsToolThresholds(draft)) {
    const repeats = positive(draft.toolRepeats);
    if (repeats !== undefined) tool.repeats = repeats;
  }
  return { reply, tool };
}
