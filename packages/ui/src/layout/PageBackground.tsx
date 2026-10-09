import { type PropsWithChildren } from "react";

/**
 * 页面底色。控制台和门户页面不铺色斑、光晕或旋转渐变——层次交给排版、留白和卡片的投影，
 * 弥散渐变会把版面拉回「模板感」，也会让中性配色里的状态色失去对比。唯一的例外是 `login`：
 * 首屏只有一张表单，需要一点氛围，所以那里有一层极淡、静止的晕染（不做动画）。
 *
 * - `app`：控制台与门户页面，用内容区的底色（浅色纯白 / 深色 #111114）；
 *   控制台外壳自己再画窗口底色与内容区。
 * - `login`：登录、改密码这类首屏表单页。整个产品只有这里铺一层淡淡的氛围：浅灰底、角落里
 *   两团很淡的晕染，再叠一层四周渐隐的点阵（与门户落地页首屏同一种语言）。多彩风格下是带一点
 *   绿意的底色和品牌绿晕染；简约风格只有一个强调色，底色微冷、晕染是强调蓝。白色卡片浮在上面
 *   才有层次；控制台内部仍然保持纯色。
 * - `landing`：公开落地页，整页可滚动，深色下用更深的底色拉开对比。
 */
type BackgroundVariant = "login" | "app" | "landing";

export function PageBackground({
  children,
  variant,
}: PropsWithChildren<{
  variant: BackgroundVariant;
}>) {
  return (
    <div
      className={[
        "relative min-h-[100dvh] font-sans text-ink antialiased",
        // 落地页要能整页滚动，不能被 overflow-hidden 截断。
        variant === "landing"
          ? "bg-zinc-50 dark:bg-[#08080A]"
          : variant === "login"
            ? "overflow-hidden bg-[#f4f5f7] dark:bg-[#0e0f12] colorful:bg-[#f3f6f4] colorful:dark:bg-[#0d100f]"
            : "overflow-hidden bg-canvas",
      ].join(" ")}
    >
      {variant === "login" ? (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(55%_50%_at_88%_6%,rgb(42_110_232/0.1),transparent_72%),radial-gradient(45%_45%_at_6%_96%,rgb(42_110_232/0.06),transparent_70%)] dark:bg-[radial-gradient(55%_50%_at_88%_6%,rgb(95_147_236/0.12),transparent_72%),radial-gradient(45%_45%_at_6%_96%,rgb(95_147_236/0.06),transparent_70%)] colorful:bg-[radial-gradient(55%_50%_at_88%_6%,rgb(16_163_127/0.13),transparent_72%),radial-gradient(45%_45%_at_6%_96%,rgb(16_163_127/0.08),transparent_70%)] colorful:dark:bg-[radial-gradient(55%_50%_at_88%_6%,rgb(16_163_127/0.14),transparent_72%),radial-gradient(45%_45%_at_6%_96%,rgb(16_163_127/0.07),transparent_70%)]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,rgb(0_0_0/0.065)_1px,transparent_1px)] bg-[size:22px_22px] [mask-image:radial-gradient(70%_65%_at_50%_45%,#000_15%,transparent_78%)] dark:bg-[radial-gradient(circle,rgb(255_255_255/0.06)_1px,transparent_1px)]"
          />
        </>
      ) : null}
      <div className="relative">{children}</div>
    </div>
  );
}
