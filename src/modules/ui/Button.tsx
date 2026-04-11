import { Children, type ButtonHTMLAttributes, type PropsWithChildren } from "react";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
type ButtonSize = "sm" | "md";

export function Button({
  children,
  className,
  variant = "primary",
  size = "md",
  ...props
}: PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
  }
>) {
  const childNodes = Children.toArray(children);
  const iconOnly =
    childNodes.length === 1 &&
    typeof childNodes[0] !== "string" &&
    typeof childNodes[0] !== "number";

  const base =
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition focus-visible:outline-none focus-visible:ring-2";

  const sizeClass = iconOnly
    ? size === "sm"
      ? "h-8 w-8 px-0 text-sm"
      : "h-9 w-9 px-0 text-sm"
    : size === "sm"
      ? "h-9 px-3 text-sm"
      : "h-10 px-4 text-sm";

  const variantClass: Record<ButtonVariant, string> = {
    primary:
      "bg-slate-900 text-white hover:bg-slate-800 focus-visible:ring-slate-400/35 disabled:bg-slate-400/70 dark:bg-white dark:text-neutral-950 dark:hover:bg-slate-200 dark:focus-visible:ring-white/15 dark:disabled:bg-white/50",
    secondary:
      "border border-slate-200 bg-white/70 text-slate-800 hover:bg-white focus-visible:ring-slate-400/35 disabled:opacity-60 dark:border-neutral-800 dark:bg-neutral-950/60 dark:text-slate-100 dark:hover:bg-neutral-950/80 dark:focus-visible:ring-white/15",
    danger:
      "bg-rose-600 text-white hover:bg-rose-500 focus-visible:ring-rose-400/35 disabled:bg-rose-300/70 dark:bg-rose-500 dark:hover:bg-rose-400 dark:focus-visible:ring-rose-300/20 dark:disabled:bg-rose-500/40",
    ghost:
      "text-slate-700 hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-slate-400/35 disabled:opacity-50 dark:text-slate-200 dark:hover:bg-white/10 dark:hover:text-white dark:focus-visible:ring-white/15",
  };

  const iconOnlyToneClass: Record<ButtonVariant, string> = {
    primary:
      "bg-transparent text-slate-900 hover:bg-slate-100 active:bg-slate-200/80 focus-visible:ring-slate-400/35 disabled:opacity-45 dark:text-white dark:hover:bg-white/10 dark:active:bg-white/14 dark:focus-visible:ring-white/15",
    secondary:
      "bg-transparent text-slate-700 hover:bg-slate-100 active:bg-slate-200/80 focus-visible:ring-slate-400/35 disabled:opacity-45 dark:text-slate-200 dark:hover:bg-white/10 dark:active:bg-white/14 dark:focus-visible:ring-white/15",
    danger:
      "bg-transparent text-rose-600 hover:bg-rose-50 active:bg-rose-100 focus-visible:ring-rose-400/35 disabled:opacity-45 dark:text-rose-300 dark:hover:bg-rose-500/10 dark:active:bg-rose-500/15 dark:focus-visible:ring-rose-300/20",
    ghost:
      "bg-transparent text-slate-700 hover:bg-slate-100 active:bg-slate-200/80 focus-visible:ring-slate-400/35 disabled:opacity-45 dark:text-slate-200 dark:hover:bg-white/10 dark:active:bg-white/14 dark:focus-visible:ring-white/15",
  };

  return (
    <button
      type="button"
      {...props}
      className={[
        base,
        iconOnly ? "rounded-lg" : null,
        sizeClass,
        iconOnly ? iconOnlyToneClass[variant] : variantClass[variant],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </button>
  );
}
