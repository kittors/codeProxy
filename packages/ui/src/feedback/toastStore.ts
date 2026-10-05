import type { ReactNode } from "react";

/**
 * 提示条的状态仓库：一个极小的发布/订阅，Toaster 用 useSyncExternalStore 订阅。
 *
 * 之前用的 goey-toast 会把带描述或操作按钮的提示「变形」成一张卡片（整行按钮 + 时间戳），
 * 和设计稿里底部居中的单行胶囊对不上，样式也只能靠覆盖第三方类名去凑。自己维护后：
 * - API 形状与 goeyToast 保持一致（`toast.success(title, options)` 等），页面与测试
 *   迁移只是换个导入；
 * - 外观全部由 Toaster.tsx 决定，跟设计令牌走。
 */

export type ToastType = "default" | "success" | "error" | "warning" | "info";

export interface ToastAction {
  label: string;
  onClick: () => void;
  /** 点击后把这条提示换成一条成功提示（例如「已恢复」），而不是直接关闭。 */
  successLabel?: string;
}

export interface ToastOptions {
  description?: ReactNode;
  action?: ToastAction;
  /** 停留时长（毫秒）。鼠标悬停在提示区域时暂停计时。 */
  duration?: number;
  /** 传入相同 id 会替换已有提示，而不是再叠一条。 */
  id?: string | number;
}

export interface ToastRecord {
  id: string | number;
  type: ToastType;
  title: string;
  description?: ReactNode;
  action?: ToastAction;
  duration: number;
  /** 每次内容被替换都会变，Toaster 据此重新开始计时。 */
  revision: number;
}

const DEFAULT_DURATION_MS = 4000;
/**
 * 同时最多显示几条。短时间内连续触发时直接丢掉最旧的，而不是排队等着之后再冒出来——
 * 过一会儿才弹出的旧提示只会让人困惑。
 */
const MAX_QUEUE = 3;

let records: ToastRecord[] = [];
let sequence = 0;
const listeners = new Set<() => void>();

const emit = () => {
  for (const listener of listeners) listener();
};

export function subscribeToasts(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getToasts(): ToastRecord[] {
  return records;
}

function push(type: ToastType, title: string, options: ToastOptions = {}): string | number {
  sequence += 1;
  const id = options.id ?? `toast-${sequence}`;
  const record: ToastRecord = {
    id,
    type,
    title,
    description: options.description,
    action: options.action,
    duration: options.duration ?? DEFAULT_DURATION_MS,
    revision: sequence,
  };
  const existing = records.findIndex((item) => item.id === id);
  if (existing >= 0) {
    records = records.map((item, index) => (index === existing ? record : item));
  } else {
    records = [...records, record].slice(-MAX_QUEUE);
  }
  emit();
  return id;
}

export function dismissToast(id?: string | number): void {
  records = id === undefined ? [] : records.filter((item) => item.id !== id);
  emit();
}

export function updateToast(
  id: string | number,
  patch: Partial<Pick<ToastRecord, "type" | "title" | "description" | "action" | "duration">>,
): void {
  sequence += 1;
  records = records.map((item) =>
    item.id === id ? { ...item, ...patch, revision: sequence } : item,
  );
  emit();
}

export const toast = Object.assign(
  (title: string, options?: ToastOptions) => push("default", title, options),
  {
    success: (title: string, options?: ToastOptions) => push("success", title, options),
    error: (title: string, options?: ToastOptions) => push("error", title, options),
    warning: (title: string, options?: ToastOptions) => push("warning", title, options),
    info: (title: string, options?: ToastOptions) => push("info", title, options),
    dismiss: dismissToast,
    update: updateToast,
  },
);
