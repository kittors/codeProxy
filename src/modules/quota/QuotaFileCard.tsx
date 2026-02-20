import { RefreshCw, ShieldAlert } from "lucide-react";
import type { AuthFileItem } from "@/lib/http/types";
import { Button } from "@/modules/ui/Button";
import { EmptyState } from "@/modules/ui/EmptyState";
import type { QuotaState } from "@/modules/quota/quota-helpers";
import {
  clampPercent,
  isDisabledAuthFile,
  resolveAuthProvider,
} from "@/modules/quota/quota-helpers";

function QuotaBar({ percent }: { percent: number | null }) {
  const segments = 20;
  const normalized = percent === null ? null : clampPercent(percent);
  const filled = normalized === null ? 0 : Math.round((normalized / 100) * segments);
  const tone =
    normalized === null
      ? "bg-slate-300/50 dark:bg-white/10"
      : normalized >= 60
        ? "bg-emerald-500"
        : normalized >= 20
          ? "bg-amber-500"
          : "bg-rose-500";

  return (
    <div className="flex gap-0.5">
      {Array.from({ length: segments }).map((_, idx) => (
        <span
          key={idx}
          className={[
            "h-2 flex-1 rounded-full",
            idx < filled ? tone : "bg-slate-200 dark:bg-neutral-800",
          ].join(" ")}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

export function QuotaFileCard({
  file,
  state,
  onRefresh,
}: {
  file: AuthFileItem;
  state: QuotaState;
  onRefresh: () => void;
}) {
  const provider = resolveAuthProvider(file);
  const disabled = isDisabledAuthFile(file);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-mono text-xs text-slate-900 dark:text-white">{file.name}</p>
          <p className="mt-1 text-xs text-slate-600 dark:text-white/65">
            provider：{provider || "--"} · {disabled ? "已禁用" : "已启用"}
            {state.updatedAt ? ` · 更新于 ${new Date(state.updatedAt).toLocaleTimeString()}` : ""}
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={onRefresh}
          disabled={state.status === "loading"}
        >
          <RefreshCw size={14} className={state.status === "loading" ? "animate-spin" : ""} />
          刷新
        </Button>
      </div>

      <div className="mt-3 space-y-2">
        {state.status === "error" ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-400/25 dark:bg-rose-500/15 dark:text-rose-100">
            <div className="flex items-start gap-2">
              <ShieldAlert size={16} className="mt-0.5 shrink-0" />
              <span>{state.error || "加载失败"}</span>
            </div>
          </div>
        ) : state.items.length === 0 ? (
          <EmptyState
            title="暂无额度数据"
            description="该文件可能不支持额度查询，或接口返回为空。"
          />
        ) : (
          state.items.map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-950/70"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{item.label}</p>
                <p className="font-mono text-xs tabular-nums text-slate-700 dark:text-slate-200">
                  {item.percent === null ? "--" : `${Math.round(clampPercent(item.percent))}%`}{" "}
                  <span className="text-slate-500 dark:text-white/55">
                    {item.resetLabel ? `· ${item.resetLabel}` : ""}
                  </span>
                </p>
              </div>
              <div className="mt-2">
                <QuotaBar percent={item.percent} />
              </div>
              {item.meta ? (
                <p className="mt-2 text-xs text-slate-600 dark:text-white/65">{item.meta}</p>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
