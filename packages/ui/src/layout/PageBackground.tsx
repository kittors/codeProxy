import { type PropsWithChildren } from "react";

/**
 * 页面底色。控制台和门户页面不铺色斑、光晕或旋转渐变——层次交给排版、留白和卡片的细描边，
 * 弥散渐变会把版面拉回「模板感」，也会让中性配色里的状态色失去对比。唯一的例外是 `login`：
 * 首屏只有一张表单，需要一点氛围，所以那里有一层极淡、静止的品牌绿晕染（不做动画）。
 *
 * - `app`：控制台与门户页面，用内容区的底色（浅色纯白 / 深色 #212121）；
 *   控制台外壳自己再画图标栏和分区面板的灰底。
 * - `login`：登录、改密码这类首屏表单页。整个产品只有这里铺一层淡淡的品牌氛围：带一点绿意的
 *   浅灰底、角落里两团很淡的品牌绿晕染，再叠一层四周渐隐的点阵（与门户落地页首屏同一种语言）。
 *   白色卡片浮在上面才有层次；控制台内部仍然保持纯色，不受影响。
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
            ? "overflow-hidden bg-[#f3f6f4] dark:bg-[#141715]"
            : "overflow-hidden bg-canvas",
      ].join(" ")}
    >
      {variant === "login" ? (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(55%_50%_at_88%_6%,rgb(16_163_127/0.13),transparent_72%),radial-gradient(45%_45%_at_6%_96%,rgb(16_163_127/0.08),transparent_70%)] dark:bg-[radial-gradient(55%_50%_at_88%_6%,rgb(16_163_127/0.14),transparent_72%),radial-gradient(45%_45%_at_6%_96%,rgb(16_163_127/0.07),transparent_70%)]"
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
