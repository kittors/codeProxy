import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

/** 品牌名不翻译；顺序与登录页中继网络里的模型大致对应。 */
const MODEL_NAMES = ["Claude", "Gemini", "GPT", "DeepSeek", "Qwen", "Grok", "Kimi"];
const INTERVAL_MS = 2400;

/**
 * 标题里轮换的模型名：每 2.4 秒从下往上换一个，底部一道很淡的记号笔高亮——多彩风格是品牌绿，
 * 简约风格是强调色蓝（简约风格里绿色只表示成功）。
 *
 * 所有名字叠在同一个网格格子里，宽度恒等于最长的那个——换词时整行标题不会左右跳。
 * 减少动态效果时只显示第一个名字。
 */
export function RotatingModelName() {
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (reduceMotion) return;
    const timer = window.setInterval(
      () => setIndex((current) => (current + 1) % MODEL_NAMES.length),
      INTERVAL_MS,
    );
    return () => window.clearInterval(timer);
  }, [reduceMotion]);

  return (
    <span className="relative inline-grid text-left align-bottom">
      {/* 占位：撑出最长名字的宽度，本身不可见。 */}
      {MODEL_NAMES.map((name) => (
        <span key={name} aria-hidden="true" className="invisible col-start-1 row-start-1 px-0.5">
          {name}
        </span>
      ))}
      <span className="col-start-1 row-start-1 overflow-hidden px-0.5">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={MODEL_NAMES[index]}
            className="inline-block bg-[linear-gradient(transparent_64%,rgb(42_110_232/0.18)_64%,rgb(42_110_232/0.18)_92%,transparent_92%)] dark:bg-[linear-gradient(transparent_64%,rgb(95_147_236/0.24)_64%,rgb(95_147_236/0.24)_92%,transparent_92%)] colorful:bg-[linear-gradient(transparent_64%,rgb(16_163_127/0.24)_64%,rgb(16_163_127/0.24)_92%,transparent_92%)]"
            initial={{ y: "70%", opacity: 0 }}
            animate={{ y: "0%", opacity: 1 }}
            exit={{ y: "-70%", opacity: 0 }}
            transition={{ duration: 0.36, ease: [0.2, 0.8, 0.2, 1] }}
          >
            {MODEL_NAMES[index]}
          </motion.span>
        </AnimatePresence>
      </span>
    </span>
  );
}
