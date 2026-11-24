"use client"; // Next.js 等 React 服务端组件环境：用到状态和副作用，是客户端组件
// satin-ui/react/tree：高性能树形控件（Tree）与文件管理/拟物文件夹（FileExplorer）包成的 React 组件。
//   import { Tree, FileExplorer } from "satin-ui/react/tree";
import { createElement as h, forwardRef } from "react";
import { createTree, createFileExplorer } from "../src/tree.js";
import { wrap } from "./wrap.js";

const TreeBase = /* @__PURE__ */ wrap(createTree, {
  valueKey: "selected",
  events: ["select", "check", "expand", "move"],
  displayName: "TreeInstance",
});
export const Tree = /* @__PURE__ */ forwardRef(function Tree(props, ref) {
  return h(TreeBase, { ...props, ref });
});

const FileExplorerBase = /* @__PURE__ */ wrap(createFileExplorer, {
  valueKey: "view",
  events: ["change", "open", "select", "viewChange", "navigate", "move", "create", "rename", "delete", "colorChange"],
  displayName: "FileExplorerInstance",
});
export const FileExplorer = /* @__PURE__ */ forwardRef(function FileExplorer(props, ref) {
  return h(FileExplorerBase, { ...props, ref });
});
