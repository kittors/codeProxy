import type { ComponentProps } from "react";
import { LoopGuardKeySection, useLoopGuardKey } from "@features/loop-guard";
import { OwnedApiKeyQuotaModal } from "@features/period-spending";
import { useOptionalAuth } from "@app/providers/AuthProvider";

type QuotaModalProps = ComponentProps<typeof OwnedApiKeyQuotaModal>;

/**
 * 编辑账号名下的 Key：名称 + 子额度，加上这把 Key 的「循环保护」覆盖（后端有这个功能时）。
 *
 * 覆盖和 Key 本身是两个接口，一次提交按顺序写：先存覆盖，成功了才存 Key，覆盖写失败（或填错）
 * 时 Key 不动、用户留在弹窗里改；没动这一节就不发它的请求，也不会因为它读不到而存不了 Key。
 * 权限检查留在页面这一层（features 之间不互相依赖，也不碰登录态），所以由这里组装两个功能。
 */
export function OwnedApiKeyEditModal({
  keyId,
  ...props
}: Omit<QuotaModalProps, "mode" | "extra" | "beforeSubmit"> & {
  /** 正在编辑的 Key 的 id：用来读它的循环保护覆盖，还没有 id 的条目不查。 */
  keyId?: string;
}) {
  const auth = useOptionalAuth();
  const canWrite = auth?.can("api_keys.write") ?? true;
  const loopGuard = useLoopGuardKey(keyId, props.open);
  return (
    <OwnedApiKeyQuotaModal
      {...props}
      mode="edit"
      saving={props.saving || loopGuard.saving}
      extra={<LoopGuardKeySection override={loopGuard} disabled={props.saving || !canWrite} />}
      beforeSubmit={loopGuard.save}
    />
  );
}
