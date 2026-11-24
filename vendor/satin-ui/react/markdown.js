"use client"; // Next.js 等 React 服务端组件环境：用到状态和副作用，是客户端组件
// satin-ui/react/markdown：Markdown 渲染（satin-ui/markdown 的 createMarkdown：代码高亮、表格、图片、XSS 过滤）包成的 React 组件。
//   import { Markdown } from "satin-ui/react/markdown";
//   <Markdown source={text} />   或   <Markdown>{"# 标题\n正文"}</Markdown>
// source 变了只更新变了的那几块（流式输出时一段段追加也不闪）；codeMax、imgH、tableMax 变了直接生效
import { createElement as h, forwardRef, Children } from "react";
import { createMarkdown } from "../src/markdown.js";
import { wrap } from "./wrap.js";

const Base = /* @__PURE__ */ wrap(createMarkdown, { valueKey: "source", events: [], displayName: "MarkdownInstance" });
export const Markdown = /* @__PURE__ */ forwardRef(function Markdown({ source, children, ...rest }, ref) {
  return h(Base, { ...rest, source: source ?? Children.toArray(children).filter((c) => typeof c === "string" || typeof c === "number").join(""), ref });
});
