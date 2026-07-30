import { useReducedMotion } from "framer-motion";

/** 落地页统一缓动：出场偏快、收尾极缓，读起来像「滑到位」而不是「弹一下」。 */
export const LANDING_EASE = [0.16, 1, 0.3, 1] as const;

/**
 * whileInView 的统一视口配置。
 * `once` 避免来回滚动时反复重播；负的下边距让元素露出约 80px 才触发，
 * 否则贴着视口底部就开始动，用户实际看到的已经是动画尾巴。
 */
export const LANDING_IN_VIEW = {
  once: true,
  amount: 0.15,
  margin: "0px 0px -80px 0px",
} as const;

export interface FadeUpOptions {
  delay?: number;
  /** 位移距离；大区块用大一点的值，小元素用小值，避免整页都在同一幅度晃。 */
  distance?: number;
  duration?: number;
}

/**
 * 返回一组 fade-up 动画属性生成器。
 *
 * 关闭动效时直接返回终态（opacity: 1），而不是把 duration 设成 0——后者仍会触发一次
 * 重绘，且 framer-motion 依旧会挂 IntersectionObserver，对 prefers-reduced-motion
 * 用户没有意义。
 */
export function useLandingFade() {
  const reduceMotion = useReducedMotion();

  return (options: FadeUpOptions = {}) => {
    const { delay = 0, distance = 16, duration = 0.6 } = options;
    if (reduceMotion) {
      return { initial: { opacity: 1 }, animate: { opacity: 1 } } as const;
    }
    return {
      initial: { opacity: 0, y: distance },
      whileInView: { opacity: 1, y: 0 },
      viewport: LANDING_IN_VIEW,
      transition: { duration, delay, ease: LANDING_EASE },
    } as const;
  };
}

