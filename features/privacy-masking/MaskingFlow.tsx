import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Boxes, ShieldCheck, TerminalSquare } from "lucide-react";
import { VendorIcon, hasVendorIcon } from "@code-proxy/assets";
import type { MaskCount } from "@code-proxy/api-client";
import { formatCompact } from "./format";
import { CATEGORY_STYLE, clientMeta } from "./maskKinds";

/**
 * 流向图：左边是发出请求的客户端，中间是 CliRelay，右边是请求发往的上游渠道。左边的细线疏密
 * 不一（原值，各写各的），汇进 CliRelay 后换成右边整齐的紫线（占位符），一眼看出「值在这里被
 * 换掉了」。点一个节点就按它筛选下面的列表。
 *
 * 线按中间区域的实际像素宽度画：拉伸 viewBox 会把曲线压弯。动效只在第一次画出时走两轮，
 * 之后静止；系统要求减少动态效果时不动。
 */

const ROW = 40;
const SHOWN = 3;

type Side = "client" | "channel";

interface Node {
  id: string;
  label: string;
  places: number;
  vendor?: string;
  more?: boolean;
}

function toNodes(items: MaskCount[], label: (item: MaskCount) => string, moreLabel: (n: number) => string): Node[] {
  const sorted = [...items].sort((a, b) => b.places - a.places);
  const nodes: Node[] = sorted.slice(0, SHOWN).map((item) => ({
    id: item.name,
    label: label(item),
    places: item.places,
    vendor: item.vendor,
  }));
  const rest = sorted.slice(SHOWN);
  if (rest.length > 0) {
    nodes.push({
      id: "",
      label: moreLabel(rest.length),
      places: rest.reduce((sum, item) => sum + item.places, 0),
      more: true,
    });
  }
  return nodes;
}

/** 确定的伪随机：同一组数据每次画出来一样，截图和重绘不跳。 */
function seeded(seed: number) {
  let state = seed % 2147483647 || 1;
  return () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
}

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

export function MaskingFlow({
  clients,
  channels,
  selectedClient,
  selectedChannel,
  onSelect,
  channelsSelectable = true,
}: {
  clients: MaskCount[];
  channels: MaskCount[];
  selectedClient?: string;
  selectedChannel?: string;
  onSelect: (side: Side, id: string) => void;
  /** false：右边的节点只显示、不能点（门户里是上游厂商，不是渠道）。 */
  channelsSelectable?: boolean;
}) {
  const { t } = useTranslation();
  const middle = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = middle.current;
    if (!el) return;
    const measure = () => setWidth(Math.round(el.clientWidth));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const more = (n: number) => t("privacy_masking.flow.more", { count: n });
  const left = toNodes(
    clients,
    (item) => clientMeta(item.name).label ?? t("privacy_masking.client.other"),
    more,
  );
  const right = toNodes(channels, (item) => item.name, more);
  const rows = Math.max(left.length, right.length, 3);
  const height = rows * ROW;

  const paths = useMemo(() => {
    if (width < 40) return null;
    const mid = width / 2;
    const max = Math.max(1, ...left.map((n) => n.places), ...right.map((n) => n.places));
    const curve = (x0: number, y0: number, x1: number, y1: number) =>
      `M${x0},${y0} C${(x0 + x1) / 2},${y0} ${(x0 + x1) / 2},${y1} ${x1},${y1}`;
    const strands = (nodes: Node[], out: boolean) => {
      const random = seeded(out ? 7 : 3);
      const counts = nodes.map((n) => Math.max(1, Math.round((14 * n.places) / max)));
      const total = counts.reduce((a, b) => a + b, 0);
      const list: Array<{ d: string; opacity: number; lead: boolean; row: number }> = [];
      let j = 0;
      nodes.forEach((node, row) => {
        const y = (height - nodes.length * ROW) / 2 + (row + 0.5) * ROW;
        for (let q = 0; q < counts[row]; q++, j++) {
          // 在 CliRelay 处收拢到中间一段，两边各留出四分之一
          const at = total > 1 ? height * (0.28 + (0.44 * j) / (total - 1)) : height / 2;
          const spread = (q - (counts[row] - 1) / 2) * 1.5;
          const jitter = out ? 0 : (random() - 0.5) * 3;
          list.push({
            d: out ? curve(mid, at, width, y + spread) : curve(0, y + spread + jitter, mid, at),
            opacity: out ? 0.45 : 0.1 + random() * 0.18,
            lead: q === counts[row] >> 1,
            row,
          });
        }
      });
      return list;
    };
    return { mid, incoming: strands(left, false), outgoing: strands(right, true) };
    // 节点按内容重算；只看名字和数量，避免每次渲染都换一组线
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, JSON.stringify(left), JSON.stringify(right)]);

  const animate = !reducedMotion();
  const accent = CATEGORY_STYLE.secret.stroke;

  const nodeButton = (node: Node, side: Side, selected: boolean) => {
    const meta = side === "client" ? clientMeta(node.id) : null;
    const vendor = side === "client" ? meta?.vendor : node.vendor;
    const Fallback = side === "client" ? TerminalSquare : Boxes;
    const pickable = !node.more && (side === "client" || channelsSelectable);
    return (
      <button
        key={`${side}-${node.id || "more"}`}
        type="button"
        disabled={!pickable}
        onClick={() => onSelect(side, selected ? "" : node.id)}
        title={pickable ? t(`privacy_masking.flow.filter_${side}`, { name: node.label }) : undefined}
        aria-pressed={pickable ? selected : undefined}
        className={[
          // max-w-full：右列按内容右对齐，不封顶的话长渠道名（常是 OAuth 邮箱）会向左压到线上，truncate 也不生效
          "flex h-9 max-w-full min-w-0 items-center gap-2 rounded-xl px-2 text-left transition-colors",
          side === "channel" ? "flex-row-reverse text-right" : "",
          node.more ? "cursor-default text-ink-3" : pickable ? "hover:bg-ink/[0.04] dark:hover:bg-white/[0.06]" : "cursor-default",
          selected ? "bg-violet-500/10 dark:bg-violet-400/15" : "",
        ].join(" ")}
      >
        <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-subtle text-ink-3">
          {node.more ? null : vendor && hasVendorIcon(vendor) ? <VendorIcon modelId={vendor} size={14} /> : <Fallback size={14} aria-hidden="true" />}
        </span>
        <span className="min-w-0 leading-tight">
          <span className={`block truncate text-sm ${selected ? "font-medium text-violet-700 dark:text-violet-200" : "text-ink"}`}>
            {node.label}
          </span>
          <span className={`block text-2xs tabular-nums ${side === "channel" ? "text-violet-600/80 dark:text-violet-300/80" : "text-ink-3"}`}>
            {formatCompact(node.places)}
          </span>
        </span>
      </button>
    );
  };

  return (
    <figure className="m-0 flex min-w-0 flex-col gap-2">
      <div className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_minmax(0,10rem)] items-center gap-1">
        <div className="flex flex-col justify-center gap-1" style={{ minHeight: height }}>
          {left.map((node) => nodeButton(node, "client", !!selectedClient && selectedClient === node.id))}
        </div>
        <div ref={middle} className="relative" style={{ height }}>
          {paths ? (
            <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="absolute inset-0 overflow-visible">
              {paths.incoming.map((p, i) => (
                <path key={`in-${i}`} d={p.d} fill="none" strokeWidth={1} className="stroke-ink" strokeOpacity={p.opacity} pathLength={1}
                  style={animate ? { strokeDasharray: 1, strokeDashoffset: 1, animation: `pm-draw 1.6s ${0.15 + p.row * 0.08}s cubic-bezier(.3,.6,.1,1) forwards` } : undefined} />
              ))}
              {paths.outgoing.map((p, i) => (
                <path key={`out-${i}`} d={p.d} fill="none" strokeWidth={1.1} stroke={accent} strokeOpacity={p.opacity} pathLength={1}
                  style={animate ? { strokeDasharray: 1, strokeDashoffset: 1, animation: `pm-draw 1.6s ${0.7 + p.row * 0.08}s cubic-bezier(.3,.6,.1,1) forwards` } : undefined} />
              ))}
              {animate
                ? [...paths.incoming.map((p) => ({ ...p, out: false })), ...paths.outgoing.map((p) => ({ ...p, out: true }))]
                    .filter((p) => p.lead)
                    .map((p, i) => {
                      const dur = 1.8 + p.row * 0.35;
                      const begin = `${(p.out ? 1.2 : 0.3) + i * 0.15}s`;
                      return p.out ? (
                        <rect key={`dot-${i}`} x={-2} y={-2} width={4} height={4} rx={0.8} fill={accent} opacity={0}>
                          <animateMotion path={p.d} dur={`${dur}s`} begin={begin} repeatCount={2} />
                          <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.1;.85;1" dur={`${dur}s`} begin={begin} repeatCount={2} />
                        </rect>
                      ) : (
                        <circle key={`dot-${i}`} r={2} className="fill-ink-3" opacity={0}>
                          <animateMotion path={p.d} dur={`${dur}s`} begin={begin} repeatCount={2} />
                          <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.1;.85;1" dur={`${dur}s`} begin={begin} repeatCount={2} />
                        </circle>
                      );
                    })
                : null}
            </svg>
          ) : null}
          <span
            className="absolute top-1/2 left-1/2 grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-surface text-violet-600 shadow-card ring-4 ring-violet-500/12 dark:text-violet-300 dark:ring-violet-400/15"
            title="CliRelay"
          >
            <ShieldCheck size={20} aria-hidden="true" />
          </span>
        </div>
        <div className="flex flex-col items-end justify-center gap-1" style={{ minHeight: height }}>
          {right.map((node) => nodeButton(node, "channel", !!selectedChannel && selectedChannel === node.id))}
        </div>
      </div>
      <figcaption className="text-center text-2xs tracking-wide text-ink-3">
        {t("privacy_masking.flow.caption")}
      </figcaption>
    </figure>
  );
}
