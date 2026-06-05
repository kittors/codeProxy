import { type PropsWithChildren } from "react";

type BackgroundVariant = "login" | "app";

export function PageBackground({
  children,
  variant,
}: PropsWithChildren<{
  variant: BackgroundVariant;
}>) {
  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-zinc-50 font-sans text-slate-900 antialiased dark:bg-neutral-950 dark:text-slate-50">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-44 h-[34rem] w-[34rem] rounded-full bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.14),transparent_70%)] blur-3xl dark:bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.22),transparent_70%)]" />
        <div className="absolute -right-40 -top-28 h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(circle_at_center,rgba(20,184,166,0.12),transparent_70%)] blur-3xl dark:bg-[radial-gradient(circle_at_center,rgba(45,212,191,0.16),transparent_70%)]" />
        <div className="absolute -bottom-44 left-1/4 h-[34rem] w-[34rem] rounded-full bg-[radial-gradient(circle_at_center,rgba(168,85,247,0.10),transparent_70%)] blur-3xl dark:bg-[radial-gradient(circle_at_center,rgba(168,85,247,0.14),transparent_70%)]" />

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
