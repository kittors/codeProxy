/**
 * 滚动渐隐的 DOM 层：读滚动容器的位置，把「上面 / 下面还有没有」「渐隐多长」「哪段被 sticky 栏
 * 钉住」「滚动条占多宽」写到遮罩宿主上，CSS（primitives/ScrollArea.css）按这些值画 mask。
 *
 * 直接写 DOM、不走 React state：渐隐长度跟着剩余可滚距离连续变化，sticky 栏被所在区块推走时
 * 钉住区也逐帧收缩，走 state 会让宿主组件（例如整个 AppShell）跟着每一帧滚动重渲染。
 * 这些属性和变量 React 从不管理，所以不会被重渲染覆盖。
 */

export type ScrollFadeAxis = "x" | "y";

/** 宿主标记：pin 只归属离它最近的宿主，嵌套的滚动区（主内容区里的表格）互不串门。 */
export const SCROLL_FADE_HOST_ATTR = "data-scroll-fade-host";
/** 渐隐生效时写轴向（"x" | "y"），CSS 只认这个属性挂遮罩；不溢出时移除，遮罩随之撤掉。 */
export const SCROLL_FADE_ATTR = "data-scroll-fade";
/**
 * 写在 sticky 栏上（"top" / "bottom"）：渐隐从它的边缘开始，栏本身不被淡掉。
 * 只适合横贯整个滚动区的栏（页签栏、操作栏、表头）——遮罩是整行的，局部宽度的 sticky
 * 侧栏要靠把 `top` 调到渐隐区以下来避让。
 */
export const SCROLL_FADE_PIN_ATTR = "data-scroll-fade-pin";
/**
 * 内容动画结束后请外层滚动区重新量一次：入场位移（transform）会让 scrollHeight 短暂变大，
 * 而 transform 变化不触发 ResizeObserver，不补量就会留下一条不该有的底部渐隐。
 */
export const SCROLL_FADE_MEASURE_EVENT = "scrollfademeasure";

const MORE_ATTRS = {
  y: ["data-scroll-more-top", "data-scroll-more-bottom"],
  x: ["data-scroll-more-left", "data-scroll-more-right"],
} as const;
const LENGTH_VARS = {
  y: ["--scroll-fade-top", "--scroll-fade-bottom"],
  x: ["--scroll-fade-left", "--scroll-fade-right"],
} as const;
const TOP_INSET_VAR = "--scroll-fade-top-inset";
const BOTTOM_INSET_VAR = "--scroll-fade-bottom-inset";
const GUTTER_VAR = "--scroll-fade-gutter";

const px = (value: number) => `${Math.round(value * 10) / 10}px`;
const clamp = (value: number, max: number) => Math.min(Math.max(value, 0), Math.max(max, 0));

function setVar(node: HTMLElement, name: string, value: string) {
  if (node.style.getPropertyValue(name) !== value) node.style.setProperty(name, value);
}

function setFlag(node: HTMLElement, name: string, on: boolean) {
  if (!on) node.removeAttribute(name);
  else if (!node.hasAttribute(name)) node.setAttribute(name, "");
}

/** 撤掉渐隐：不溢出、被禁用或卸载时调用。 */
export function clearScrollFade(host: HTMLElement) {
  host.removeAttribute(SCROLL_FADE_ATTR);
  for (const name of [...MORE_ATTRS.x, ...MORE_ATTRS.y]) host.removeAttribute(name);
  for (const name of [
    ...LENGTH_VARS.x,
    ...LENGTH_VARS.y,
    TOP_INSET_VAR,
    BOTTOM_INSET_VAR,
    GUTTER_VAR,
  ]) {
    host.style.removeProperty(name);
  }
}

/** 请包住 `node` 的滚动区重新量一次（见 SCROLL_FADE_MEASURE_EVENT）。 */
export function requestScrollFadeMeasure(node: Element | null) {
  node?.dispatchEvent(new Event(SCROLL_FADE_MEASURE_EVENT, { bubbles: true }));
}

/** 竖向遮罩的版面：sticky 栏钉住的上下高度，和右侧滚动条那一条的宽度。 */
function measureLayout(scroller: HTMLElement, host: HTMLElement) {
  const box = host.getBoundingClientRect();
  const port = host === scroller ? box : scroller.getBoundingClientRect();
  const portTop = port.top + scroller.clientTop;
  const portBottom = portTop + scroller.clientHeight;
  // 滚动条那一条不淡：经典滚动条（Windows、接鼠标的 macOS）两头被抹淡看着像坏了。
  // 表格的自绘滚动条在宿主外面，这里量出来是 0。
  const gutter = clamp(
    box.right - (port.left + scroller.clientLeft + scroller.clientWidth),
    box.width,
  );
  let top = 0;
  let bottom = 0;
  host.querySelectorAll<HTMLElement>(`[${SCROLL_FADE_PIN_ATTR}]`).forEach((pin) => {
    if (pin.closest(`[${SCROLL_FADE_HOST_ATTR}]`) !== host) return;
    const rect = pin.getBoundingClientRect();
    if (rect.height <= 0) return;
    const computed = window.getComputedStyle(pin);
    // 只在栏真的贴住边缘时让开：还在原位时它跟着内容走，照常渐隐；被所在区块推走时
    // rect 跟着移出，钉住区随之收回。
    if (pin.getAttribute(SCROLL_FADE_PIN_ATTR) === "bottom") {
      if (portBottom - rect.bottom <= (parseFloat(computed.bottom) || 0) + 1) {
        bottom = Math.max(bottom, box.bottom - rect.top);
      }
    } else if (rect.top - portTop <= (parseFloat(computed.top) || 0) + 1) {
      top = Math.max(top, rect.bottom - box.top);
    }
  });
  return { top: clamp(top, box.height), bottom: clamp(bottom, box.height), gutter };
}

/**
 * 量一次并写到宿主上。渐隐长度等于这一侧还能滚的距离（上限 `size`）：离尽头越近渐隐越短，
 * 到头正好是 0——不会出现「只差几像素就到底，却有一整段内容被淡掉」。
 */
export function syncScrollFade(
  scroller: HTMLElement,
  host: HTMLElement,
  axis: ScrollFadeAxis,
  size: number,
) {
  const vertical = axis === "y";
  // overflow: hidden / clip 的容器滚不动，渐隐只会把边缘的内容抹掉；子元素入场位移
  // 也会让这类容器的 scrollHeight 短暂大于 clientHeight。
  const overflowStyle = window.getComputedStyle(scroller)[vertical ? "overflowY" : "overflowX"];
  const scrollable = overflowStyle !== "hidden" && overflowStyle !== "clip";
  const range = !scrollable
    ? 0
    : vertical
      ? scroller.scrollHeight - scroller.clientHeight
      : scroller.scrollWidth - scroller.clientWidth;
  if (range <= 1) {
    clearScrollFade(host);
    return;
  }
  const offset = clamp(vertical ? scroller.scrollTop : Math.abs(scroller.scrollLeft), range);
  const before = offset > 1 ? Math.min(offset, size) : 0;
  const after = range - offset > 1 ? Math.min(range - offset, size) : 0;
  const [moreBefore, moreAfter] = MORE_ATTRS[axis];
  const [beforeVar, afterVar] = LENGTH_VARS[axis];
  setFlag(host, moreBefore, before > 0);
  setFlag(host, moreAfter, after > 0);
  setVar(host, beforeVar, px(before));
  setVar(host, afterVar, px(after));
  if (vertical) {
    const layout = measureLayout(scroller, host);
    setVar(host, TOP_INSET_VAR, px(layout.top));
    setVar(host, BOTTOM_INSET_VAR, px(layout.bottom));
    setVar(host, GUTTER_VAR, px(layout.gutter));
  }
  if (host.getAttribute(SCROLL_FADE_ATTR) !== axis) host.setAttribute(SCROLL_FADE_ATTR, axis);
}
