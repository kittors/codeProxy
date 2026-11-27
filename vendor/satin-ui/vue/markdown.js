// satin-ui/vue/markdown：Markdown 渲染（satin-ui/markdown 的 createMarkdown：代码高亮、表格、图片、XSS 过滤）包成的 Vue 组件。
//   <script setup> import { Markdown } from "satin-ui/vue/markdown"; </script>
//   <Markdown :source="text" />
// source 变了只更新变了的那几块（流式输出时一段段追加也不闪）；code-max、img-h、table-max 变了直接生效
import { createMarkdown } from "../src/data/markdown.js";
import { wrap } from "./wrap.js";

export const Markdown = /* @__PURE__ */ wrap(createMarkdown, { name: "SnMarkdown", props: ["source", "codeMax", "imgH", "tableMax"], events: [], modelEvent: null });
