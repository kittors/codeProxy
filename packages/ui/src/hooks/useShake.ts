import { useCallback } from "react";
import { useAnimationControls, useReducedMotion } from "framer-motion";

/**
 * 表单提交被拒时整张卡片轻轻左右晃一下：约 0.4 秒、位移不超过 8px，幅度逐次减小。
 *
 * 错误原因仍由 toast 或字段下方的文字说明，晃动只负责把视线拉回表单——所以它必须短、
 * 必须克制。系统开启「减少动态效果」时不晃。把 `controls` 交给卡片的 `animate`，
 * 出错时调用 `shake()`。
 */
export function useShake() {
  const controls = useAnimationControls();
  const reduceMotion = useReducedMotion();

  const shake = useCallback(() => {
    if (reduceMotion) return;
    void controls.start({
      x: [0, -8, 7, -5, 3, 0],
      transition: { duration: 0.42, ease: "easeInOut" },
    });
  }, [controls, reduceMotion]);

  return { controls, shake };
}
