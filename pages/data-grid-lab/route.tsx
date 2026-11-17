import { preloadablePage } from "../preloadablePage";

/**
 * 新表格组件的演示页，只在开发环境注册：生产构建里 import.meta.env.DEV 是字面量 false，
 * 整个分支连同动态 import 一起被摇掉，不会多出一个页面块，也不会出现在任何菜单里。
 * 本地打开：`bun run dev` 后访问 http://127.0.0.1:<端口>/?preview=1#/lab/data-grid
 * （preview=1 只在 localhost 的开发服务器上生效，跳过登录）。
 */
const lab = import.meta.env.DEV
  ? preloadablePage(() =>
      import("./DataGridLabPage").then((module) => ({ default: module.DataGridLabPage })),
    )
  : null;

export const dataGridLabRoute = lab
  ? {
      path: "/lab/data-grid",
      component: "data-grid-lab",
      element: <lab.Page />,
      auth: true,
      layout: "dashboard",
      nav: null,
      preload: lab.preload,
    }
  : null;
