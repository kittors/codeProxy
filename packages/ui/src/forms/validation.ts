import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * 表单校验：一组可组合的规则 + 一个记录「哪些字段该显示错误」的 hook。
 *
 * 规则只返回「错在哪」（文案键 + 参数），文案统一在 `validation.*` 命名空间里，
 * 各页面不再各写一套「请输入整数」「格式不正确」。
 *
 * 显示时机：字段失焦后（touched）或用户点过提交之后才显示错误——边打字边报错会让人烦，
 * 一直不报错又会让人提交了才知道。提交时 `validate()` 打开全部错误，再由
 * `focusFirstInvalid()` 把焦点送到第一个出错的控件。
 */

export interface ValidationIssue {
  key: string;
  params?: Record<string, string | number>;
}

export type Rule<V = unknown> = (value: V) => ValidationIssue | null;

const isBlank = (value: unknown) =>
  value === undefined ||
  value === null ||
  (typeof value === "string" && value.trim() === "") ||
  (Array.isArray(value) && value.length === 0);

const asText = (value: unknown) => (typeof value === "string" ? value.trim() : String(value ?? ""));

/** 主机名（RFC 1123 标签）、IPv4，或方括号 / 不带方括号的 IPv6。 */
export function isValidHost(raw: string): boolean {
  const host = raw.trim();
  if (!host || host.length > 253) return false;
  const ipv6 = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  if (ipv6.includes(":")) return /^[0-9a-f:.]+$/i.test(ipv6) && ipv6.split(":").length <= 8;
  if (/^\d+(\.\d+){3}$/.test(host)) {
    return host.split(".").every((part) => Number(part) <= 255 && String(Number(part)) === part);
  }
  return host
    .split(".")
    .every((label) => /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i.test(label));
}

export function isValidPort(raw: string): boolean {
  const port = raw.trim();
  return /^\d{1,5}$/.test(port) && Number(port) >= 1 && Number(port) <= 65535;
}

/** 规则只在有值时检查格式；「必填」单独用 rules.required()，可选字段留空不报错。 */
export const rules = {
  required:
    (): Rule =>
    (value) =>
      isBlank(value) ? { key: "required" } : null,

  integer:
    ({ min, max, allowNegative = false }: { min?: number; max?: number; allowNegative?: boolean } = {}): Rule =>
    (value): ValidationIssue | null => {
      if (isBlank(value)) return null;
      const text = asText(value);
      if (!(allowNegative ? /^-?\d+$/ : /^\d+$/).test(text)) {
        return { key: allowNegative ? "integer" : "non_negative" };
      }
      const parsed = Number(text);
      if (!Number.isSafeInteger(parsed)) return { key: "integer" };
      if (min !== undefined && max !== undefined && (parsed < min || parsed > max)) {
        return { key: "range", params: { min, max } };
      }
      if (min !== undefined && parsed < min) return { key: "min", params: { min } };
      if (max !== undefined && parsed > max) return { key: "max", params: { max } };
      return null;
    },

  maxLength:
    (max: number): Rule =>
    (value) =>
      !isBlank(value) && asText(value).length > max ? { key: "max_length", params: { max } } : null,

  /**
   * 服务端按 UTF-8 字节数限制长度（Go 的 len，取去掉首尾空白后的值）：一个汉字算 3 个字节，
   * 只按字符数数会让中文名称在前端放行、到后端才被拒。
   */
  maxBytes:
    (max: number): Rule =>
    (value) =>
      !isBlank(value) && new TextEncoder().encode(asText(value)).length > max
        ? { key: "max_bytes", params: { max } }
        : null,

  pattern:
    (pattern: RegExp, key = "format"): Rule =>
    (value) =>
      !isBlank(value) && !pattern.test(asText(value)) ? { key } : null,

  email:
    (): Rule =>
    (value) =>
      !isBlank(value) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(asText(value)) ? { key: "email" } : null,

  url:
    ({ protocols = ["http", "https"] }: { protocols?: string[] } = {}): Rule =>
    (value): ValidationIssue | null => {
      if (isBlank(value)) return null;
      try {
        const url = new URL(asText(value));
        const scheme = url.protocol.replace(/:$/, "").toLowerCase();
        if (!protocols.includes(scheme)) {
          return { key: "url_protocol", params: { protocols: protocols.join(" / ") } };
        }
        return url.hostname ? null : { key: "url" };
      } catch {
        return { key: "url" };
      }
    },

  host:
    (): Rule =>
    (value) =>
      !isBlank(value) && !isValidHost(asText(value)) ? { key: "host" } : null,

  port:
    (): Rule =>
    (value) =>
      !isBlank(value) && !isValidPort(asText(value)) ? { key: "port" } : null,

  /** 单个 IP 或 CIDR（IPv4 / IPv6）。 */
  cidr:
    (): Rule =>
    (value): ValidationIssue | null => {
      if (isBlank(value)) return null;
      const [ip, prefix, extra] = asText(value).split("/");
      if (extra !== undefined || !ip) return { key: "cidr" };
      const v6 = ip.includes(":");
      if (!isValidHost(v6 ? `[${ip}]` : ip) || (!v6 && !/^\d+(\.\d+){3}$/.test(ip))) {
        return { key: "cidr" };
      }
      if (prefix === undefined) return null;
      const bits = Number(prefix);
      return /^\d{1,3}$/.test(prefix) && bits >= 0 && bits <= (v6 ? 128 : 32) ? null : { key: "cidr" };
    },

  json:
    (): Rule =>
    (value) => {
      if (isBlank(value)) return null;
      try {
        JSON.parse(asText(value));
        return null;
      } catch {
        return { key: "json" };
      }
    },

  /** 自定义规则：返回 false / 文案键时报错。 */
  custom:
    <V>(check: (value: V) => boolean | string): Rule<V> =>
    (value) => {
      const result = check(value);
      if (result === true) return null;
      return { key: typeof result === "string" ? result : "format" };
    },
};

export function runRules<V>(value: V, list: readonly Rule<V>[] | undefined): ValidationIssue | null {
  if (!list) return null;
  for (const rule of list) {
    const issue = rule(value);
    if (issue) return issue;
  }
  return null;
}

export type ValidationSchema<T> = { [K in keyof T]?: readonly Rule<T[K]>[] };

export function useFormValidation<T extends object>(values: T, schema: ValidationSchema<T>) {
  const { t } = useTranslation();
  const [touched, setTouched] = useState<ReadonlySet<keyof T>>(() => new Set());
  const [submitted, setSubmitted] = useState(false);
  // 填过内容的字段：只有它们在失焦时才开始显示错误。弹窗打开时自动聚焦的空字段，
  // 用户点去别处并不代表「填完了」，这时冒出「必填」只会让人烦；空着的必填项留到提交时再说。
  const everFilledRef = useRef<Set<keyof T>>(new Set());
  for (const field of Object.keys(schema) as (keyof T)[]) {
    const value = values[field];
    if (!isBlank(value)) everFilledRef.current.add(field);
  }

  // 每次渲染直接重算：规则是纯函数、字段不多，开销可以忽略；也避免 schema 依赖了
  // values 之外的东西（例如「编辑态才必填」）时拿到过期结果。
  const issues: Partial<Record<keyof T, ValidationIssue>> = {};
  for (const field of Object.keys(schema) as (keyof T)[]) {
    const issue = runRules(values[field], schema[field]);
    if (issue) issues[field] = issue;
  }

  const message = useCallback(
    (issue: ValidationIssue | undefined) =>
      issue ? t(`validation.${issue.key}`, { ...issue.params, defaultValue: t("validation.format") }) : undefined,
    [t],
  );

  /** 该显示的错误文案（没触碰过、也没提交过的字段返回 undefined）。 */
  const error = useCallback(
    (field: keyof T) => (submitted || touched.has(field) ? message(issues[field]) : undefined),
    [issues, message, submitted, touched],
  );

  const touch = useCallback((field: keyof T) => {
    if (!everFilledRef.current.has(field)) return;
    setTouched((previous) => {
      if (previous.has(field)) return previous;
      const next = new Set(previous);
      next.add(field);
      return next;
    });
  }, []);

  /** 提交前调用：打开全部错误，返回是否通过。 */
  const validate = useCallback(() => {
    setSubmitted(true);
    return Object.keys(issues).length === 0;
  }, [issues]);

  const reset = useCallback(() => {
    setTouched(new Set());
    setSubmitted(false);
    everFilledRef.current = new Set();
  }, []);

  /** 失焦即标记为 touched（填过内容才算）：展开到输入框上 `{...validation.bind("name")}`。 */
  const bind = useCallback((field: keyof T) => ({ onBlur: () => touch(field) }), [touch]);

  /** 把焦点送到容器里第一个标了 aria-invalid 的控件（等错误渲染出来的下一帧）。 */
  const focusFirstInvalid = useCallback((container: HTMLElement | null) => {
    window.requestAnimationFrame(() => {
      const target = container?.querySelector<HTMLElement>('[aria-invalid="true"]');
      target?.focus();
      target?.scrollIntoView?.({ block: "nearest" });
    });
  }, []);

  return {
    issues,
    isValid: Object.keys(issues).length === 0,
    error,
    touch,
    bind,
    validate,
    reset,
    focusFirstInvalid,
  };
}
