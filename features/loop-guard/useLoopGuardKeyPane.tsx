import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Repeat } from "lucide-react";
import { LoopGuardKeySection, isLoopGuardKeyShown } from "./LoopGuardKeySection";
import { hasLoopGuardErrors } from "./loopGuardDraft";
import type { LoopGuardKeyOverride } from "./useLoopGuardKey";

export const LOOP_GUARD_PANE_ID = "loop-guard";

/**
 * 分段式编辑器（左侧导航、一段一屏，例如账号 Key 的策略编辑器）里的一段。
 *
 * 字段与 access-policy 的 PolicyEditorSection 对得上（缺的 group 由编辑器补），但这里不引用它：
 * features 之间不互相依赖，由页面把两边接起来。
 */
export interface LoopGuardKeyPane {
  id: string;
  label: string;
  icon: ReactNode;
  /** 导航上的红色提示：有校验错误，或上次写入被拒。 */
  invalid: boolean;
  title: string;
  description: string;
  content: ReactNode;
}

/**
 * 这把 Key 的循环保护做成分段式编辑器里的一段。没有东西可显示（读取中、旧后端、没有读权限）
 * 返回 null，编辑器的导航里就没有这一项，和没有这个功能时完全一样。
 */
export function useLoopGuardKeyPane(
  override: LoopGuardKeyOverride,
  disabled: boolean,
): LoopGuardKeyPane | null {
  const { t } = useTranslation();
  if (!isLoopGuardKeyShown(override)) return null;
  return {
    id: LOOP_GUARD_PANE_ID,
    label: t("loop_guard.key_section_title"),
    icon: <Repeat />,
    invalid: hasLoopGuardErrors(override.form.errors) || override.saveError !== "",
    title: t("loop_guard.key_section_title"),
    description: t("loop_guard.key_section_hint"),
    content: <LoopGuardKeySection override={override} disabled={disabled} bare />,
  };
}
