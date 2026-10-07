import { useSyncExternalStore, type ComponentProps } from "react";
import { ConfirmModal } from "./ConfirmModal";

type ConfirmOptions = Omit<
  ComponentProps<typeof ConfirmModal>,
  "open" | "busy" | "onConfirm" | "onClose"
>;

type PendingConfirm = ConfirmOptions & { resolve: (confirmed: boolean) => void };

let pending: PendingConfirm | null = null;
const listeners = new Set<() => void>();
const emit = () => {
  for (const listener of listeners) listener();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/**
 * 命令式确认：`if (!(await confirmDialog({...}))) return;`，用来替换 `window.confirm`。
 *
 * 原生 confirm 是浏览器自带的灰色对话框：样式和面板割裂、阻塞整个页面、文案不能分层，
 * 也说不清「对谁做什么、有什么后果」。这里用同一个 ConfirmModal 渲染（由 ToastProvider
 * 里挂的 ConfirmHost 负责），参数与 ConfirmModal 一致。
 * 同时只会有一个：新的请求进来时，前一个按「取消」结算。
 */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    pending?.resolve(false);
    pending = { ...options, resolve };
    emit();
  });
}

function settle(confirmed: boolean) {
  const current = pending;
  if (!current) return;
  pending = null;
  emit();
  current.resolve(confirmed);
}

// 关闭后保留最后一次的参数：退场动画期间弹窗里的文字与布局不会瞬间清空。
let lastOptions: ConfirmOptions = { title: "", description: "" };

export function ConfirmHost() {
  const request = useSyncExternalStore(subscribe, () => pending, () => null);
  if (request) {
    const { resolve, ...options } = request;
    void resolve;
    lastOptions = options;
  }
  return (
    <ConfirmModal
      {...lastOptions}
      open={request !== null}
      onConfirm={() => settle(true)}
      onClose={() => settle(false)}
    />
  );
}
