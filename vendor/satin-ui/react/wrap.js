"use client"; // Next.js 等 React 服务端组件环境：这些封装用到状态和副作用，是客户端组件
// satin-ui/react 的公共底子：把 createXxx 包成 React 组件的 wrap()，主入口（react/index.js）和重组件的子路径（react/grid.js……）都从这里拿。
// · 受控 / 非受控：给 value 就是受控（onChange 里不改 value，组件会退回去）；只给 defaultValue 就是非受控
// · ref 拿到 Satin 实例（update / destroy / 各组件的方法）
// · SSR 安全：服务端输出和浏览器第一帧一样的标记（createXxx.html），水合以后再接交互；导入时不碰 document
// · StrictMode 下挂两次、卸载一次也不漏：每次挂载都配对一次 destroy
// · 第一次挂载任何组件时自动调 setup()（Tooltip、浮层栈这些页面级行为），最后一个组件卸载时撤掉
import { createElement as h, forwardRef, useEffect, useLayoutEffect, useRef, useState, useImperativeHandle } from "react";
import { setup } from "../src/setup.js";

export const useIso = typeof window === "undefined" ? useEffect : useLayoutEffect;
export const cx = (...a) => a.filter(Boolean).join(" ");
export const cap = (s) => s[0].toUpperCase() + s.slice(1);

// 把 createXxx 包成 React 组件。valueKey：受控的那个属性（value / page / tags……）；events：组件会发的事件名；
// stateKey：实例上读当前值的那一项（默认和 valueKey 同名；折叠面板的 open 是方法，当前值在 expanded）；
// passId：id 交给组件写在里面的输入框上（<label htmlFor> 才对得上），外层不写 id
export function wrap(create, { valueKey = "value", events = ["change"], stateKey = valueKey, passId = false, displayName } = {}) {
  const C = forwardRef(function SatinComponent(props, ref) {
    const { className, style, id } = props;
    const host = useRef(null), inst = useRef(null), latest = useRef(props);
    latest.current = props;
    const defKey = "default" + cap(valueKey);
    // 传给 Satin 的选项：去掉回调（回调走下面固定的转发函数，props 换了也不用重新挂）和 defaultValue
    const optsOf = (p) => { const o = {}; for (const [k, v] of Object.entries(p)) if (!/^on[A-Z]/.test(k) && k !== defKey && k !== "className" && k !== "style" && (passId || k !== "id") && k !== "children") o[k] = v; if (p[valueKey] === undefined && p[defKey] !== undefined) o[valueKey] = p[defKey]; return o; };
    const [initialHtml] = useState(() => ({ __html: create.html({ ...optsOf(props) }) }));
    const made = useRef(false);
    useIso(() => {
      // 同一个宿主再挂一次（StrictMode 挂两次、Fast Refresh）：先把标记恢复成没接过的样子——组件是接在已有标记上的，
      // 销毁时不会拿掉自己挂载时加进去的节点（流程图的节点、对话的消息……），不恢复就会叠两份
      if (made.current) host.current.innerHTML = initialHtml.__html;
      made.current = true;
      const unsetup = setup();
      const handlers = {};
      for (const ev of events) handlers["on" + cap(ev)] = (v) => {
        const out = latest.current["on" + cap(ev)]?.(v); // 返回值交回给组件（提示词输入框 onSend 返回 Promise）
        // 受控：父组件没把新值传回来，就退回到父组件给的值（组件只在"传进来的值换了"时跟过去，所以先清掉、再给一次）
        if (ev === "change" && latest.current[valueKey] !== undefined) setTimeout(() => { const want = latest.current[valueKey]; if (inst.current && want !== undefined && JSON.stringify(inst.current[stateKey]) !== JSON.stringify(want)) inst.current.update({ [valueKey]: undefined }).update({ [valueKey]: want }); });
        return out;
      };
      inst.current = create(host.current.firstElementChild, { ...optsOf(latest.current), ...handlers });
      return () => { inst.current?.destroy(); inst.current = null; unsetup(); };
    }, []);
    // 每次渲染把最新的选项交给实例（实例自己判断有没有变化、要不要动画）。
    // 非受控（没给 value、只给 defaultValue）时不带值：defaultValue 只管第一次，不然父组件一重新渲染，用户刚改的值就被打回去
    useIso(() => { const o = optsOf(props); if (props[valueKey] === undefined) delete o[valueKey]; inst.current?.update(o); });
    useImperativeHandle(ref, () => inst.current, []);
    // React 19 在 dangerouslySetInnerHTML 对象引用变化时会直接重写 domElement.innerHTML，
    // 导致挂载后由 Satin 写入的子 DOM（如 NumberFlow 数位、Avatar 等）在二次渲染时被清空；
    // 固定 initialHtml 引用，确保 React 仅在首次挂载时写入初始标记。
    return h("div", { ref: host, id: passId ? undefined : id, className: cx("sn-host", className), style: { display: "contents", ...style }, dangerouslySetInnerHTML: initialHtml, suppressHydrationWarning: true });
  });
  C.displayName = displayName || create.componentName;
  return C;
}
