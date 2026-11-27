// satin-ui/vue/tree：高性能树形控件（Tree）与文件管理/拟物文件夹（FileExplorer）包成的 Vue 组件。
//   import { Tree, FileExplorer } from "satin-ui/vue/tree";
import { createTree, createFileExplorer } from "../src/data/tree.js";
import { wrap } from "./wrap.js";

export const Tree = /* @__PURE__ */ wrap(createTree, {
  name: "SnTree",
  props: ["items", "expanded", "defaultExpanded", "selected", "defaultSelected", "selectable", "checked", "defaultChecked", "checkable", "searchable", "draggable", "virtual", "rowHeight", "height", "activeStyle", "loadChildren", "label"],
  valueKey: "selected",
  events: ["select", "check", "expand", "move"],
  modelEvent: null,
});

export const FileExplorer = /* @__PURE__ */ wrap(createFileExplorer, {
  name: "SnFileExplorer",
  props: ["items", "view", "path", "height", "searchable", "rootName", "activeStyle", "menuSurface", "loadChildren", "label"],
  valueKey: "view",
  events: ["change", "open", "select", "viewChange", "navigate", "move", "create", "rename", "delete", "colorChange"],
  modelEvent: null,
});
