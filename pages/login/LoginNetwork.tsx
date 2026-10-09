import { useEffect, useRef, useState, type RefObject } from "react";
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring } from "framer-motion";
import { Bot, Code2, SquareTerminal } from "lucide-react";
import { VendorIcon } from "@code-proxy/assets";
import "./loginNetwork.css";

/**
 * 登录卡片四周的「中继网络」：左边是调用方（终端、Agent、编辑器），右边是各家模型，
 * 曲线都连到登录卡片的两侧——卡片本身就是那个网关。沿线路流过的短线代表一次请求（多彩风格是
 * 品牌绿，简约风格是强调色蓝），抵达时模型节点轻轻放大；右侧的模型图标会轮流换成别家，讲的是
 * 「接入所有模型」。
 * 整层随鼠标轻微反向位移，和卡片拉开前后层次。
 *
 * 节点是小卡片（伪元素细边 + 卡片投影），不画 border；出发 / 抵达时外圈闪一下的细环（动画的
 * 一部分，平时不可见）和短线同色。厂商 logo 保留各自的品牌色。
 *
 * 位置都按登录卡片的实际矩形算（ResizeObserver 跟踪），所以窗口多宽线路都接得上；
 * 两侧空间不够放节点时整层不渲染。纯装饰，对读屏隐藏；减少动态效果时只留静态线路。
 */

/** 与 loginNetwork.css 里的动画周期一致。 */
const CYCLE_S = 6.4;
const NODE = 44;

const CLIENTS = [
  { key: "cli", Icon: SquareTerminal, dx: -235, dy: -112 },
  { key: "agent", Icon: Bot, dx: -290, dy: 4 },
  { key: "ide", Icon: Code2, dx: -228, dy: 118 },
];

/** 每个槽位轮流展示两家模型；dx 相对卡片右边缘，dy 相对卡片垂直中心。 */
const MODEL_SLOTS = [
  { dx: 215, dy: -172, models: ["openai", "deepseek"] },
  { dx: 292, dy: -86, models: ["claude", "kimi"] },
  { dx: 242, dy: 2, models: ["gemini", "qwen"] },
  { dx: 300, dy: 90, models: ["grok", "glm"] },
  { dx: 222, dy: 176, models: ["minimax", "vertex"] },
];

const MODEL_NAMES: Record<string, string> = {
  openai: "OpenAI",
  deepseek: "DeepSeek",
  claude: "Claude",
  kimi: "Kimi",
  gemini: "Gemini",
  qwen: "Qwen",
  grok: "Grok",
  glm: "GLM",
  minimax: "MiniMax",
  vertex: "Vertex AI",
};

type Geometry = { width: number; height: number; left: number; right: number; centerY: number };

const curve = (x1: number, y1: number, x2: number, y2: number) => {
  const bend = (x2 - x1) * 0.5;
  return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
};

function useCardGeometry(rootRef: RefObject<HTMLDivElement | null>, cardRef: RefObject<HTMLElement | null>) {
  const [geometry, setGeometry] = useState<Geometry | null>(null);

  // 用 useEffect 而不是 useLayoutEffect：卡片在本组件之后渲染，布局阶段按树的顺序挂 ref，
  // 那时卡片的 ref 可能还没挂上；被动 effect 在所有 ref 都就位后才执行。
  useEffect(() => {
    const root = rootRef.current;
    const card = cardRef.current;
    if (!root || !card) return;
    const measure = () => {
      const base = root.getBoundingClientRect();
      const rect = card.getBoundingClientRect();
      setGeometry({
        width: base.width,
        height: base.height,
        left: rect.left - base.left,
        right: rect.right - base.left,
        // 网络的垂直中心比卡片中心略高：卡片上方还有标题，整组构图的重心在那里。
        centerY: rect.top - base.top + rect.height / 2 - 24,
      });
    };
    measure();
    // 卡片有一段上浮入场动画，getBoundingClientRect 会带上那段位移；入场结束后再量一次。
    const settle = window.setTimeout(measure, 700);
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    observer.observe(card);
    return () => {
      window.clearTimeout(settle);
      observer.disconnect();
    };
  }, [cardRef, rootRef]);

  return geometry;
}

export function LoginNetwork({ cardRef }: { cardRef: RefObject<HTMLElement | null> }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const geometry = useCardGeometry(rootRef, cardRef);
  const reduceMotion = useReducedMotion();
  const [variants, setVariants] = useState<number[]>(() => MODEL_SLOTS.map(() => 0));
  const [hovered, setHovered] = useState<string | null>(null);
  const offsetX = useSpring(useMotionValue(0), { stiffness: 60, damping: 18 });
  const offsetY = useSpring(useMotionValue(0), { stiffness: 60, damping: 18 });

  // 每隔一个节拍换一个槽位的模型，五个槽位轮流，画面始终在缓慢变化而不是一齐闪。
  useEffect(() => {
    if (reduceMotion) return;
    let step = 0;
    const timer = window.setInterval(() => {
      const slot = step % MODEL_SLOTS.length;
      step += 1;
      setVariants((current) => current.map((value, index) => (index === slot ? value + 1 : value)));
    }, (CYCLE_S * 1000) / MODEL_SLOTS.length);
    return () => window.clearInterval(timer);
  }, [reduceMotion]);

  useEffect(() => {
    if (reduceMotion) return;
    const onMove = (event: PointerEvent) => {
      offsetX.set((event.clientX / window.innerWidth - 0.5) * -16);
      offsetY.set((event.clientY / window.innerHeight - 0.5) * -12);
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [offsetX, offsetY, reduceMotion]);

  const side = geometry ? Math.min(geometry.left, geometry.width - geometry.right) : 0;
  // 两侧至少要放得下一列节点和一段线路；再窄就整层不画，免得节点压到卡片或出屏。
  const visible = geometry !== null && side >= 280;
  const scale = visible ? Math.min(1, Math.max(0.62, (side - 70) / 330)) : 1;

  const clients = visible
    ? CLIENTS.map((client, index) => ({
        ...client,
        x: geometry.left + client.dx * scale,
        y: geometry.centerY + client.dy,
        anchorY: geometry.centerY + (index - 1) * 46,
      }))
    : [];
  const slots = visible
    ? MODEL_SLOTS.map((slot, index) => ({
        ...slot,
        x: geometry.right + slot.dx * scale,
        y: geometry.centerY + slot.dy,
        anchorY: geometry.centerY + (index - 2) * 34,
        model: slot.models[variants[index] % slot.models.length],
      }))
    : [];

  return (
    <div ref={rootRef} aria-hidden="true" className="pointer-events-none absolute inset-0 hidden select-none lg:block">
      {visible ? (
        <motion.div className="absolute inset-0" style={{ x: offsetX, y: offsetY }}>
          <svg
            className="absolute inset-0 h-full w-full overflow-visible"
            viewBox={`0 0 ${geometry.width} ${geometry.height}`}
            fill="none"
          >
            {clients.map((client) => (
              <path
                key={`in-${client.key}`}
                d={curve(client.x + NODE / 2, client.y, geometry.left, client.anchorY)}
                className="stroke-line-strong"
                strokeWidth={1.25}
              />
            ))}
            {slots.map((slot, index) => (
              <path
                key={`out-${index}`}
                d={curve(geometry.right, slot.anchorY, slot.x - NODE / 2, slot.y)}
                strokeWidth={hovered === slot.model ? 1.6 : 1.25}
                className={[
                  "transition-[stroke,stroke-width] duration-200 ease-soft",
                  hovered === slot.model ? "stroke-ink-3" : "stroke-line-strong",
                ].join(" ")}
              />
            ))}
            {clients.map((client, index) => (
              <path
                key={`in-packet-${client.key}`}
                d={curve(client.x + NODE / 2, client.y, geometry.left, client.anchorY)}
                pathLength={100}
                className="ln-packet stroke-accent colorful:stroke-ok"
                style={{ animationDelay: `${(index * CYCLE_S) / CLIENTS.length}s` }}
              />
            ))}
            {slots.map((slot, index) => (
              <path
                key={`out-packet-${index}`}
                d={curve(geometry.right, slot.anchorY, slot.x - NODE / 2, slot.y)}
                pathLength={100}
                className="ln-packet stroke-accent colorful:stroke-ok"
                style={{ animationDelay: `${0.9 + (index * CYCLE_S) / MODEL_SLOTS.length}s` }}
              />
            ))}
          </svg>

          {clients.map(({ key, Icon, x, y }, index) => (
            <span
              key={key}
              className="cp-edge absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl bg-surface text-ink-3 shadow-card"
              style={{ left: x, top: y }}
            >
              <span
                className="ln-depart absolute -inset-1 rounded-3xl ring-1 ring-accent/40 colorful:ring-ok/40"
                style={{ animationDelay: `${(index * CYCLE_S) / CLIENTS.length}s`, animationDuration: `${CYCLE_S}s` }}
              />
              <Icon size={19} />
            </span>
          ))}

          {slots.map((slot, index) => {
            const delay = { animationDelay: `${0.9 + (index * CYCLE_S) / MODEL_SLOTS.length}s` };
            const active = hovered === slot.model;
            return (
              <span
                key={`slot-${index}`}
                className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: slot.x, top: slot.y }}
                onMouseEnter={() => setHovered(slot.model)}
                onMouseLeave={() => setHovered(null)}
              >
                <span
                  className={[
                    "cp-edge ln-arrive relative flex h-11 w-11 items-center justify-center rounded-2xl bg-surface",
                    "transition-[box-shadow] duration-200 ease-soft",
                    active ? "shadow-lift" : "shadow-card",
                  ].join(" ")}
                  style={delay}
                >
                  <span
                    className="ln-glow absolute -inset-1 rounded-3xl ring-1 ring-accent/40 colorful:ring-ok/40"
                    style={delay}
                  />
                  <AnimatePresence initial={false}>
                    <motion.span
                      key={slot.model}
                      className="absolute inset-0 flex items-center justify-center"
                      initial={{ opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.6 }}
                      transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
                    >
                      <VendorIcon modelId={slot.model} size={22} />
                    </motion.span>
                  </AnimatePresence>
                </span>
                <span
                  className={[
                    "pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 rounded-full bg-accent px-2.5 py-1 text-xs font-medium whitespace-nowrap text-accent-fg shadow-pop",
                    "transition-[opacity,translate] duration-200 ease-soft",
                    active ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
                  ].join(" ")}
                >
                  {MODEL_NAMES[slot.model] ?? slot.model}
                </span>
              </span>
            );
          })}
        </motion.div>
      ) : null}
    </div>
  );
}
