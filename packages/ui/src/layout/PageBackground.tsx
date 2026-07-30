import { type PropsWithChildren } from "react";

/**
 * `landing` 刻意不铺任何色斑与光晕：公开落地页靠排版、留白和单一强调色建立层次，
 * 弥散渐变会把版面拉回「模板感」，与 hero 里精确的几何元素也互相打架。
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
        "relative min-h-[100dvh] bg-zinc-50 font-sans text-slate-900 antialiased dark:text-slate-50",
        // 落地页要能整页滚动，不能被 overflow-hidden 截断；同时用更深的底色拉开对比。
        variant === "landing" ? "dark:bg-[#08080A]" : "overflow-hidden dark:bg-neutral-950",
      ].join(" ")}
    >
      <div className="pointer-events-none absolute inset-0">
        {variant === "landing" ? null : (
          <>
            <div className="absolute -left-40 -top-44 h-[34rem] w-[34rem] rounded-full bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.14),transparent_70%)] blur-3xl dark:bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.22),transparent_70%)]" />
            <div className="absolute -right-40 -top-28 h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(circle_at_center,rgba(20,184,166,0.12),transparent_70%)] blur-3xl dark:bg-[radial-gradient(circle_at_center,rgba(45,212,191,0.16),transparent_70%)]" />
            <div className="absolute -bottom-44 left-1/4 h-[34rem] w-[34rem] rounded-full bg-[radial-gradient(circle_at_center,rgba(168,85,247,0.10),transparent_70%)] blur-3xl dark:bg-[radial-gradient(circle_at_center,rgba(168,85,247,0.14),transparent_70%)]" />
          </>
        )}

        {variant === "login" ? (
          <>
            <div className="absolute -inset-[45%] opacity-60 blur-3xl motion-reduce:hidden motion-safe:animate-[spin_60s_linear_infinite] dark:opacity-40">
              <div className="h-full w-full bg-[conic-gradient(from_90deg_at_50%_50%,rgba(59,130,246,0.22)_0deg,rgba(45,212,191,0.18)_120deg,rgba(168,85,247,0.18)_240deg,rgba(59,130,246,0.22)_360deg)] dark:bg-[conic-gradient(from_90deg_at_50%_50%,rgba(99,102,241,0.22)_0deg,rgba(45,212,191,0.14)_120deg,rgba(168,85,247,0.14)_240deg,rgba(99,102,241,0.22)_360deg)]" />
            </div>

            <div className="absolute left-1/2 top-1/2 h-[26rem] w-[26rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.55),transparent_65%)] blur-2xl motion-reduce:hidden motion-safe:animate-[pulse_8s_ease-in-out_infinite] dark:bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.10),transparent_65%)]" />
          </>
        ) : null}
      </div>

      <div className="relative">{children}</div>
    </div>
  );
}
