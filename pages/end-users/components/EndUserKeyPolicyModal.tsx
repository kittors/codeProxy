import type { ComponentProps } from "react";
import { KeyPolicyModal } from "@features/access-policy";
import { useLoopGuardKey, useLoopGuardKeyPane } from "@features/loop-guard";
import { useOptionalAuth } from "@app/providers/AuthProvider";

type PolicyModalProps = ComponentProps<typeof KeyPolicyModal>;

/**
 * 编辑账号名下的一把 Key：名称、子额度、按模型规则，加上这把 Key 的「循环保护」覆盖
 * （后端有这个功能时，作为策略组末尾的一段）。新建时 Key 还不存在，没有这一段，建好后再编辑。
 *
 * 覆盖和 Key 本身是两个接口，一次提交按顺序写：先存覆盖，成功了才存 Key，覆盖填错或写失败时
 * Key 不动、弹窗留在原地并切到那一段；没动那一段就不发它的请求，也不会因为它读不到而存不了 Key。
 * 权限检查留在页面这一层（features 之间不互相依赖，也不碰登录态），所以由这里组装两个功能。
 * 后端把 Key 的覆盖挂在 Key 权限下，所以这里看 api_keys.write，而不是账号的写权限。
 */
export function EndUserKeyPolicyModal({
  keyId,
  ...props
}: Omit<PolicyModalProps, "extraSection" | "beforeSubmit"> & {
  /** 正在编辑的 Key 的 id：用来读它的循环保护覆盖；新建时没有。 */
  keyId?: string;
}) {
  const auth = useOptionalAuth();
  const canWrite = auth?.can("api_keys.write") ?? true;
  const loopGuard = useLoopGuardKey(props.mode === "edit" ? keyId : undefined, props.open);
  const pane = useLoopGuardKeyPane(loopGuard, props.saving || !canWrite);
  return (
    <KeyPolicyModal
      {...props}
      saving={props.saving || loopGuard.saving}
      extraSection={pane}
      beforeSubmit={loopGuard.save}
    />
  );
}
