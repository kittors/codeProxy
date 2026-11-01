import { useOptionalAuth } from "@app/providers/AuthProvider";
import { useConfigCapabilities } from "@features/backend-capabilities";
import { PoolCapacityCard } from "@features/pool-capacity";

function DeclaredPoolCapacity() {
  const capabilities = useConfigCapabilities();
  // 面板会自动更新到最新 release，旧后端没有这个接口：没声明（或读不到声明）就什么都不请求、不渲染。
  if (capabilities.status !== "ready" || !capabilities.capabilities.poolCapacity) return null;
  return <PoolCapacityCard />;
}

/**
 * 渠道分组页上的池容量卡。要同时满足两个条件才会出现、才会发请求：
 * 后端在 GET /config 里声明了 `pool-capacity`，并且当前账号有 `auth_files.read`
 * （接口汇总的是 AI 账号的额度，权限与 AI 账号页一致）。没有权限时连 GET /config 也不读。
 */
export function PoolCapacitySection() {
  const auth = useOptionalAuth();
  if (!(auth?.can("auth_files.read") ?? true)) return null;
  return <DeclaredPoolCapacity />;
}
