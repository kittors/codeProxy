import type { ReactNode } from "react";
import { FormField, TextInput, rules, type Rule } from "@code-proxy/ui";

export const REQUEST_LIMIT_FIELDS = [
  "dailyLimit",
  "totalQuota",
  "concurrencyLimit",
  "rpmLimit",
  "tpmLimit",
] as const;

export type RequestLimitField = (typeof REQUEST_LIMIT_FIELDS)[number];
export type RequestLimitDraft = Record<RequestLimitField, string>;

/** 次数类限额的校验：留空 = 不限制，填了就必须是不小于 0 的整数。 */
export const requestLimitRules: Record<RequestLimitField, readonly Rule<string>[]> = {
  dailyLimit: [rules.integer({ min: 0 })],
  totalQuota: [rules.integer({ min: 0 })],
  concurrencyLimit: [rules.integer({ min: 0 })],
  rpmLimit: [rules.integer({ min: 0 })],
  tpmLimit: [rules.integer({ min: 0 })],
};

/**
 * 请求次数 / 实时速率这组限额（每日请求、总请求、并发、RPM、TPM）。
 *
 * 账号编辑和权限模板各写过一遍同样的五个输入框，这里收成一份；字段名由调用方按各自的
 * 文案命名空间传入（两边的措辞不同，统一成一份文案会改变其中一边的界面）。
 * `children` 追加在同一网格末尾，给「累计消费限额」这类只属于某一边的字段留位置。
 */
export function RequestLimitFields({
  value,
  onChange,
  labels,
  placeholder,
  disabled = false,
  errors = {},
  onFieldBlur,
  children,
}: {
  value: RequestLimitDraft;
  onChange: (field: RequestLimitField, value: string) => void;
  labels: Record<RequestLimitField, string>;
  placeholder: string;
  disabled?: boolean;
  errors?: Partial<Record<RequestLimitField, string>>;
  onFieldBlur?: (field: RequestLimitField) => void;
  children?: ReactNode;
}) {
  return (
    <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
      {REQUEST_LIMIT_FIELDS.map((field) => (
        <FormField key={field} label={labels[field]} error={errors[field]} reserveMeta={false}>
          <TextInput
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            value={value[field]}
            disabled={disabled}
            // 占位文字是「0 = 不限制」，不显式给名称的话读屏会把它当成字段名。
            aria-label={labels[field]}
            placeholder={placeholder}
            onBlur={() => onFieldBlur?.(field)}
            onChange={(event) => {
              const raw = event.target.value;
              // 次数类限额只接受整数；空串表示不限制。
              if (raw === "" || /^\d+$/.test(raw)) onChange(field, raw);
            }}
          />
        </FormField>
      ))}
      {children}
    </div>
  );
}
