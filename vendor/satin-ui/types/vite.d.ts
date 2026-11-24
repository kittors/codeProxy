/** Vite 插件：把 theme-boot 内联进 index.html 的 <head>（第一帧之前写好深浅主题和圆角）。用法：plugins: [react(), satin()] */
export default function satin(): {
  name: string;
  transformIndexHtml(): { tag: "script"; children: string; injectTo: "head-prepend" }[];
};
