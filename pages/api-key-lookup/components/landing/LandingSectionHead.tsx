import { LandingFade } from "./landingMotion";

export function LandingSectionHead({
  index,
  eyebrow,
  title,
  subtitle,
  align = "left",
}: {
  index: string;
  eyebrow: string;
  title: string;
  subtitle?: string;
  align?: "left" | "center";
}) {
  const centered = align === "center";

  return (
    <LandingFade className={centered ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      <div
        className={[
          "flex items-center gap-2.5 text-xs font-medium text-sn-label3",
          centered ? "justify-center" : "",
        ].join(" ")}
      >
        <span className="font-mono tabular-nums text-sn-label2">{index}</span>
        <span className="h-px w-5 bg-sn-line-control" aria-hidden />
        <span>{eyebrow}</span>
      </div>

      <h2 className="mt-3.5 font-sans text-2xl font-semibold leading-tight tracking-[-0.025em] text-sn-label sm:text-3xl">
        {title}
      </h2>

      {subtitle ? (
        <p className="mt-3 text-sm leading-7 text-sn-label2 sm:text-base">{subtitle}</p>
      ) : null}
    </LandingFade>
  );
}
