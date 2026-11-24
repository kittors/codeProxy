"use client"; // Next.js 等 React 服务端组件环境：用到状态和副作用，是客户端组件
// satin-ui/react/chat：对话（satin-ui/chat 的 createChat）包成的 React 组件。重组件单独一个子路径，不拉进 satin-ui/react 主入口。
//   import { Chat } from "satin-ui/react/chat";
//   <Chat title="写作助手" placeholder="说点什么…" respond={async function* (text) { yield "第三集可以拆成三段："; yield "车站外、候车厅、站台。"; }} />
// respond 接模型：异步生成器一段段 yield（或返回一整段文字）；每次都用最新的 respond（换了不用重新挂）。
// status 变了更新顶栏；history、title、placeholder、max、maxLines、attach、empty 只在创建时用（要换一段对话就换 key）。ref 拿到实例：send(text)、receive(item)、fill(text)……
// 新对话：empty={{ icon, title, subtitle, suggestions }}；要自己画就给 renderEmpty={() => <… />}（画进空状态那一块，第一条消息进来时一起淡出）。
// 底部输入框：context（onContextChange、onContextClick）、mode（onModeChange）、models / model（onModelChange 里改 model）
import { createElement as h, forwardRef, useImperativeHandle, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createChat, createThreadRail } from "../src/chat.js";
import { wrap, useIso } from "./wrap.js";

const Base = /* @__PURE__ */ wrap(createChat, { events: ["modelChange", "modeChange", "contextChange", "contextClick", "menu", "newChat"], displayName: "ChatInstance" });
export const ThreadRail = /* @__PURE__ */ wrap(createThreadRail, { events: ["select"], displayName: "ThreadRail" });
export const Chat = /* @__PURE__ */ forwardRef(function Chat(props, ref) {
  const latest = useRef(props); latest.current = props;
  const [respond] = useState(() => (text, ctx) => latest.current.respond?.(text, ctx));
  const [hiRes] = useState(() => (bg) => latest.current.hiRes?.(bg) ?? bg);
  const { renderEmpty, ...rest } = props;
  // 自己画的空状态：库只留一个空容器（empty: true），挂好以后把 renderEmpty 的内容画进去
  const inner = useRef(null), [emptyEl, setEmptyEl] = useState(null);
  useImperativeHandle(ref, () => inner.current, []);
  useIso(() => { setEmptyEl(renderEmpty ? inner.current?.emptyEl ?? null : null); return () => setEmptyEl(null); }, []);
  return [
    h(Base, { key: "chat", ...rest, empty: renderEmpty ? true : props.empty, respond, hiRes: props.hiRes ? hiRes : undefined, ref: inner }),
    emptyEl && renderEmpty ? createPortal(renderEmpty(), emptyEl, "empty") : null,
  ];
});
