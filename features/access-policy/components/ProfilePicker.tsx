import { useRef, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Check, ShieldCheck } from "lucide-react";
import type { ModelRoute, ModelRule, QuotaMatrix } from "@code-proxy/api-client";
import { HUE_SOLID, HUE_TILE, cn } from "@code-proxy/ui";
import { summarizePolicy } from "../model/policySummary";

export interface PickableProfile {
  id: string;
  name: string;
  "quota-limits": QuotaMatrix;
  "model-rules": ModelRule[];
  "model-routes": ModelRoute[];
}

/**
 * 选择权限模板：每个模板一行，写明它限了什么、有几条规则 / 路由、多少账号在用——
 * 下拉框只给名字，选之前不知道选的是什么。语义是 radiogroup，方向键移动并选中。
 */
export function ProfilePicker({
  profiles,
  value,
  onChange,
  boundCounts,
  ariaLabel,
  disabled = false,
}: {
  profiles: readonly PickableProfile[];
  value: string;
  onChange: (id: string) => void;
  /** 每个模板绑定的账号数。 */
  boundCounts?: ReadonlyMap<string, number>;
  ariaLabel: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const buttonsRef = useRef<Record<string, HTMLButtonElement | null>>({});
  const selectedIndex = profiles.findIndex((profile) => profile.id === value);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const forward = event.key === "ArrowDown" || event.key === "ArrowRight";
    const backward = event.key === "ArrowUp" || event.key === "ArrowLeft";
    if ((!forward && !backward) || disabled || profiles.length === 0) return;
    event.preventDefault();
    const base = selectedIndex < 0 ? (forward ? -1 : 0) : selectedIndex;
    const next = profiles[(base + (forward ? 1 : -1) + profiles.length) % profiles.length];
    onChange(next.id);
    buttonsRef.current[next.id]?.focus();
  };

  return (
    <div role="radiogroup" aria-label={ariaLabel} className="space-y-1.5" onKeyDown={onKeyDown}>
      {profiles.map((profile, index) => {
        const selected = profile.id === value;
        const count = boundCounts?.get(profile.id);
        return (
          <button
            key={profile.id}
            ref={(node) => {
              buttonsRef.current[profile.id] = node;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected || (selectedIndex < 0 && index === 0) ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(profile.id)}
            className={cn(
              "flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-left transition-colors",
              selected
                ? "bg-accent-soft shadow-control"
                : "bg-subtle hover:bg-hover",
              disabled ? "cursor-not-allowed opacity-60" : null,
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl",
                selected ? "bg-accent text-accent-fg" : "bg-ink/[0.05] text-ink-2 dark:bg-white/[0.07]",
                selected ? HUE_SOLID.violet : HUE_TILE.violet,
              )}
            >
              <ShieldCheck size={16} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-ink">{profile.name}</span>
              <span className="mt-0.5 block truncate text-xs text-ink-3">
                {summarizePolicy(t, {
                  limits: profile["quota-limits"],
                  rules: profile["model-rules"],
                  routes: profile["model-routes"],
                })}
              </span>
            </span>
            {typeof count === "number" ? (
              <span className="shrink-0 text-2xs tabular-nums text-ink-3">
                {t("access_policy.bound_accounts", { count })}
              </span>
            ) : null}
            <span
              aria-hidden="true"
              className={cn(
                "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                selected ? "bg-accent text-accent-fg" : "bg-ink/[0.06] text-transparent dark:bg-white/[0.08]",
              )}
            >
              <Check size={12} />
            </span>
          </button>
        );
      })}
    </div>
  );
}
