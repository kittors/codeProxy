import { useMemo } from "react";
import { useReducedMotion, type Variants } from "framer-motion";
import { EASE_OUT } from "../utils/motion";

/**
 * 一组元素依次淡入上移的 variants，给登录、改密这类首屏表单用。
 *
 * 单个元素只上移 8px、用时 0.45 秒，组内间隔 50ms，整组半秒左右落定——像排好队走进来，
 * 而不是飞进来。容器用 `container`（`initial="hidden" animate="show"`），子元素用 `item`。
 * 系统开启「减少动态效果」时只保留一次很短的淡入，没有位移也没有间隔。
 */
export function useStaggerVariants({
  stagger = 0.05,
  delay = 0,
}: { stagger?: number; delay?: number } = {}) {
  const reduceMotion = useReducedMotion();

  return useMemo(() => {
    const container: Variants = {
      hidden: {},
      show: {
        transition: reduceMotion ? {} : { staggerChildren: stagger, delayChildren: delay },
      },
    };
    const item: Variants = reduceMotion
      ? { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.2 } } }
      : {
          hidden: { opacity: 0, y: 8 },
          show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE_OUT } },
        };
    return { container, item };
  }, [delay, reduceMotion, stagger]);
}
