import { useEffect, useRef, useState, type RefObject } from "react";
import { usePrefersReducedMotion } from "@code-proxy/ui";
import { Bot, Code2, SquareTerminal } from "@code-proxy/ui/icons";
import { VendorIcon } from "@code-proxy/assets";
import "./loginNetwork.css";

/**
 * 登录卡片四周的「中继网络」：左边是调用方（终端、Agent、编辑器），右边是各家模型，
 * 曲线都连到登录卡片的两侧，整层随鼠标轻微反向阻尼位移（原生 rAF lerp，零外部动效库依赖）。
 */

const CYCLE_S = 6.4;
const NODE = 44;

const CLIENTS = [
  { key: "cli", Icon: SquareTerminal, dx: -235, dy: -112 },
  { key: "agent", Icon: Bot, dx: -290, dy: 4 },
  { key: "ide", Icon: Code2, dx: -228, dy: 118 },
];

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
        centerY: rect.top - base.top + rect.height / 2 - 24,
      });
    };
    measure();
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
  const layerRef = useRef<HTMLDivElement>(null);
  const geometry = useCardGeometry(rootRef, cardRef);
  const reduceMotion = usePrefersReducedMotion();
  const [variants, setVariants] = useState<number[]>(() => MODEL_SLOTS.map(() => 0));
  const [hovered, setHovered] = useState<string | null>(null);

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
    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;
    let rafId = 0;

    const tick = () => {
      currentX += (targetX - currentX) * 0.08;
      currentY += (targetY - currentY) * 0.08;
      const el = layerRef.current;
      if (el) {
        el.style.transform = `translate3d(${currentX.toFixed(2)}px, ${currentY.toFixed(2)}px, 0)`;
      }
      if (Math.abs(targetX - currentX) > 0.05 || Math.abs(targetY - currentY) > 0.05) {
        rafId = window.requestAnimationFrame(tick);
      } else {
        rafId = 0;
      }
    };

    const onMove = (event: PointerEvent) => {
      targetX = (event.clientX / (window.innerWidth || 1) - 0.5) * -16;
      targetY = (event.clientY / (window.innerHeight || 1) - 0.5) * -12;
      if (!rafId) rafId = window.requestAnimationFrame(tick);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [reduceMotion]);

  const side = geometry ? Math.min(geometry.left, geometry.width - geometry.right) : 0;
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
        variantIndex: variants[index] % slot.models.length,
      }))
    : [];

  return (
    <div ref={rootRef} aria-hidden="true" className="pointer-events-none absolute inset-0 hidden select-none lg:block">
      {visible ? (
        <div ref={layerRef} className="absolute inset-0 will-change-transform">
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
              className="cp-edge absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-xl bg-[var(--sn-raised)] text-ink-3 shadow-control"
              style={{ left: x, top: y }}
            >
              <span
                className="ln-depart absolute -inset-1 rounded-2xl ring-1 ring-accent/40 colorful:ring-ok/40"
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
                    "cp-edge ln-arrive relative flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--sn-raised)]",
                    "transition-[box-shadow] duration-200 ease-soft",
                    active ? "shadow-lift" : "shadow-control",
                  ].join(" ")}
                  style={delay}
                >
                  <span
                    className="ln-glow absolute -inset-1 rounded-2xl ring-1 ring-accent/40 colorful:ring-ok/40"
                    style={delay}
                  />
                  <span className={slot.variantIndex === 1 ? "sn-swap sn-on" : "sn-swap"}>
                    <span className="sn-a">
                      <VendorIcon modelId={slot.models[0]} size={22} />
                    </span>
                    <span className="sn-b">
                      <VendorIcon modelId={slot.models[1]} size={22} />
                    </span>
                  </span>
                </span>
                <span
                  className={[
                    "pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 rounded-md bg-accent px-2.5 py-1 text-xs font-medium whitespace-nowrap text-accent-fg shadow-pop",
                    "transition-[opacity,translate] duration-200 ease-soft",
                    active ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
                  ].join(" ")}
                >
                  {MODEL_NAMES[slot.model] ?? slot.model}
                </span>
              </span>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
