import { isValidElement, type ReactNode } from "react";
import {
  dismissAllToasts as satinDismissAllToasts,
  toast as satinToast,
} from "satin-ui";

/**
 * 提示条状态桥接层：底层 100% 委托 Satin 原生 `toast()` 引擎（`satin-ui/src/feedback/feedback.js`），
 * 完整享有 Satin 液态毛玻璃胶囊、同文案 `×N` 合并脉动、倒计时圆环、原地宽度变形、
 * 上划/下滑跟手阻尼关闭、移动端 3D 纵深叠牌与成功扫光，同时保留稳定的业务调用 API
 * （`toast.success(title, options)` / `getToasts()` / `dismissToast()`）与 Top Layer 顶层兼容。
 */

export type ToastType = "default" | "success" | "error" | "warning" | "info";

export interface ToastAction {
  label: string;
  onClick: () => void;
  /** 点击后把这条提示原地变形为成功确认提示（例如「已恢复」），而不是直接关闭。 */
  successLabel?: string;
}

export interface ToastOptions {
  description?: ReactNode;
  action?: ToastAction;
  /** 停留时长（毫秒）。鼠标悬停或键盘聚焦在提示区域时自动暂停计时。 */
  duration?: number;
  /** 传入相同 id 会原地替换已有提示并播放宽度变形动画，而不是再叠一条。 */
  id?: string | number;
}

export interface ToastRecord {
  id: string | number;
  type: ToastType;
  title: string;
  description?: ReactNode;
  action?: ToastAction;
  duration: number;
  /** 每次内容被替换都会递增。 */
  revision: number;
  /** 当 description 为非字符串 ReactNode 时，由 Toaster 经 Portal 挂载到 Satin 原生描述插槽。 */
  descEl?: HTMLElement | null;
}

interface SatinToastHandle {
  id?: string | number;
  el: HTMLElement;
  descEl?: HTMLElement;
  readonly closed: boolean;
  update(opts: Record<string, unknown>): void;
  close(instant?: boolean): void;
}

const DEFAULT_DURATION_MS = 4000;
const SUCCESS_LABEL_DURATION_MS = 1800;

const TYPE_TO_SATIN: Record<
  ToastType,
  { tone: string; icon: string | false; alert: boolean }
> = {
  default: { tone: "neutral", icon: false, alert: false },
  success: { tone: "ok", icon: "circle-check", alert: false },
  error: { tone: "danger", icon: "circle-alert", alert: true },
  warning: { tone: "warn", icon: "triangle-alert", alert: false },
  info: { tone: "info", icon: "info", alert: false },
};

let records: ToastRecord[] = [];
let sequence = 0;
let dismissNotificationLabel = "Dismiss notification";
const handles = new Map<string | number, SatinToastHandle>();
const listeners = new Set<() => void>();

const emit = () => {
  for (const listener of listeners) listener();
};

export function setToastDismissLabel(label: string): void {
  if (label) dismissNotificationLabel = label;
}

export function subscribeToasts(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getToasts(): ToastRecord[] {
  return records;
}

function isCustomReactDescription(description: ReactNode): boolean {
  if (description === undefined || description === null || description === "") return false;
  if (typeof description === "string" || typeof description === "number") return false;
  return isValidElement(description) || Array.isArray(description) || typeof description === "object";
}

function buildSatinOptions(record: ToastRecord, passId: boolean): Record<string, unknown> {
  const meta = TYPE_TO_SATIN[record.type];
  const hasCustomDesc = isCustomReactDescription(record.description);
  const plainDesc =
    !hasCustomDesc && record.description !== undefined && record.description !== null && record.description !== ""
      ? String(record.description)
      : "";

  return {
    ...(passId ? { id: record.id } : {}),
    kind: record.action ? "action" : "status",
    tone: meta.tone,
    icon: meta.icon,
    alert: meta.alert,
    text: record.title,
    description: plainDesc,
    hasDescription: hasCustomDesc,
    dismissLabel: dismissNotificationLabel,
    duration: record.duration,
    action: record.action
      ? {
          label: record.action.label,
          run: () => {
            const action = record.action;
            if (!action) return;
            action.onClick();
            if (action.successLabel) {
              updateToast(record.id, {
                type: "success",
                title: action.successLabel,
                description: undefined,
                action: undefined,
                duration: SUCCESS_LABEL_DURATION_MS,
              });
            } else {
              dismissToast(record.id);
            }
          },
        }
      : null,
    onClose: () => {
      if (!handles.has(record.id)) return;
      handles.delete(record.id);
      records = records.filter((item) => item.id !== record.id);
      emit();
    },
  };
}

function push(type: ToastType, title: string, options: ToastOptions = {}): string | number {
  sequence += 1;
  const hasExplicitId = options.id !== undefined;
  const id = options.id ?? `toast-${sequence}`;
  const duration = options.duration ?? DEFAULT_DURATION_MS;

  const existingIndex = hasExplicitId ? records.findIndex((item) => item.id === id) : -1;
  if (existingIndex >= 0) {
    updateToast(id, {
      type,
      title,
      description: options.description,
      action: options.action,
      duration,
    });
    return id;
  }

  const record: ToastRecord = {
    id,
    type,
    title,
    description: options.description,
    action: options.action,
    duration,
    revision: sequence,
  };

  if (typeof document === "undefined") {
    records = [...records, record].slice(-3);
    emit();
    return id;
  }

  const handle = (satinToast as unknown as (o: Record<string, unknown>) => SatinToastHandle)(
    buildSatinOptions(record, hasExplicitId),
  );

  // 若命中 Satin 原生连续相同文案合并脉动（返回既有 handle），更新已有记录而非新增条目。
  for (const [existingId, existingHandle] of handles.entries()) {
    if (existingHandle === handle) {
      records = records.map((item) =>
        item.id === existingId ? { ...item, duration, revision: sequence } : item,
      );
      emit();
      return existingId;
    }
  }

  record.descEl = handle.descEl ?? null;
  handles.set(id, handle);
  records = [...records, record];
  emit();
  return id;
}

export function dismissToast(id?: string | number): void {
  if (id === undefined) {
    handles.clear();
    records = [];
    if (typeof document !== "undefined") {
      satinDismissAllToasts(true);
    }
    emit();
    return;
  }
  const handle = handles.get(id);
  handles.delete(id);
  records = records.filter((item) => item.id !== id);
  if (handle && !handle.closed) {
    handle.close(false);
  }
  emit();
}

export function updateToast(
  id: string | number,
  patch: Partial<Pick<ToastRecord, "type" | "title" | "description" | "action" | "duration">>,
): void {
  const existing = records.find((item) => item.id === id);
  if (!existing) return;
  sequence += 1;
  const next: ToastRecord = {
    ...existing,
    ...patch,
    revision: sequence,
  };
  records = records.map((item) => (item.id === id ? next : item));
  const handle = handles.get(id);
  if (handle && !handle.closed) {
    handle.update({
      ...buildSatinOptions(next, true),
      done: next.type === "success",
    });
    next.descEl = handle.descEl ?? null;
  }
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
