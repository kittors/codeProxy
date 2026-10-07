import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useId,
  useMemo,
  type FormHTMLAttributes,
  type HTMLAttributes,
  type LabelHTMLAttributes,
  type PropsWithChildren,
  type ReactElement,
  type ReactNode,
  type Ref,
} from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../utils/selectStyles";

/* ------------------------------------------------------------------ */
/*  Context                                                            */
/* ------------------------------------------------------------------ */

type FormFieldContextValue = {
  id: string;
  labelId: string;
  descriptionId?: string;
  errorId?: string;
  countId?: string;
  invalid: boolean;
};

const FormFieldContext = createContext<FormFieldContextValue | null>(null);

/**
 * 给不是原生表单元素的组合控件用（卡片单选是一组按钮，`<label for>` 指不到它）：
 * 在 FormField 里时拿到字段标签与说明的 id，自己挂 aria-labelledby / aria-describedby。
 */
export function useOptionalFormField(): FormFieldContextValue | null {
  return useContext(FormFieldContext);
}

function useFormFieldContext(component: string): FormFieldContextValue {
  const ctx = useContext(FormFieldContext);
  if (!ctx) {
    throw new Error(`${component} must be used within FormField`);
  }
  return ctx;
}

/* ------------------------------------------------------------------ */
/*  Form                                                               */
/* ------------------------------------------------------------------ */

/**
 * React 19 里 ref 是普通 prop，展开到 `<form>` 上就能拿到节点——提交校验失败时
 * `focusFirstInvalid(formRef.current)` 要用它，不必再在 Form 外面另包一层原生 form。
 */
export type FormProps = FormHTMLAttributes<HTMLFormElement> & { ref?: Ref<HTMLFormElement> };

function FormRoot({ className, ...props }: FormProps) {
  return <form data-slot="form" className={cn("space-y-4", className)} {...props} />;
}

/* ------------------------------------------------------------------ */
/*  FormField                                                          */
/* ------------------------------------------------------------------ */

export type FormFieldOrientation = "vertical" | "horizontal";

export type FormFieldProps = PropsWithChildren<
  HTMLAttributes<HTMLDivElement> & {
    /** Field label. Prefer this for the common label-above-control layout. */
    label?: ReactNode;
    /** Optional helper text under the control. */
    description?: ReactNode;
    /** Optional error message; also marks the field invalid for a11y. */
    error?: ReactNode;
    /** Show a required marker next to the label. */
    required?: boolean;
    /** Show a muted "optional" hint next to the label (instead of baking it into the label text). */
    optional?: boolean;
    /** Layout: vertical stacks label above control; horizontal puts label beside control. */
    orientation?: FormFieldOrientation;
    /** Optional explicit control id; defaults to a generated id. */
    htmlFor?: string;
    /** Reserve min height for meta rows so error appearance does not jump layout. Default true. */
    reserveMeta?: boolean;
    /** Current value length for the counter (pair with maxLength). */
    valueLength?: number;
    /** Max length shown in counter (display only; pass maxLength to control separately). */
    maxLength?: number;
    /** Horizontal label width class. Default w-28. */
    labelWidth?: string;
    /** Extra class for the label element. */
    labelClassName?: string;
  }
>;

const DEFAULT_HORIZONTAL_LABEL_WIDTH = "w-28";

function FormField({
  children,
  className,
  label,
  description,
  error,
  required = false,
  optional = false,
  orientation = "vertical",
  htmlFor,
  reserveMeta = true,
  valueLength,
  maxLength,
  labelWidth,
  labelClassName,
  ...props
}: FormFieldProps) {
  const generatedId = useId();
  const id = htmlFor ?? generatedId;
  const showCount = typeof maxLength === "number" && maxLength > 0;
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const countId = showCount ? `${id}-count` : undefined;
  const invalid = Boolean(error);
  const isHorizontal = orientation === "horizontal";
  const resolvedLabelWidth = labelWidth ?? DEFAULT_HORIZONTAL_LABEL_WIDTH;
  const length = typeof valueLength === "number" ? valueLength : 0;

  const contextValue = useMemo<FormFieldContextValue>(
    () => ({ id, labelId: `${id}-label`, descriptionId, errorId, countId, invalid }),
    [countId, descriptionId, errorId, id, invalid],
  );

  const control = (
    <FormControl className={isHorizontal ? "min-w-0 w-full" : undefined}>{children}</FormControl>
  );

  const infoRow =
    description || showCount ? (
      <div data-slot="form-field-info" className="flex min-h-5 items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {description ? <FormDescription id={descriptionId}>{description}</FormDescription> : null}
        </div>
        {showCount ? (
          <span
            data-slot="form-field-count"
            id={countId}
            className={cn(
              "shrink-0 text-xs leading-5 tabular-nums text-ink-3",
              length > maxLength! ? "text-rose-600 dark:text-rose-400" : null,
            )}
          >
            {length} / {maxLength}
          </span>
        ) : null}
      </div>
    ) : null;

  // 只预留一行：没有说明时，这一行留给随时可能出现的错误，出现时不会把下面的字段往下推；
  // 以前说明和错误各预留一行，每个字段下面都空着两行，弹窗里的表单显得很松。
  const errorRow = error ? (
    <div data-slot="form-field-error-slot" className="min-h-5">
      <FormError id={errorId}>{error}</FormError>
    </div>
  ) : reserveMeta && !infoRow ? (
    <div data-slot="form-field-error-slot" className="invisible min-h-5" aria-hidden="true">
      <span className="block text-xs leading-5">&nbsp;</span>
    </div>
  ) : null;

  // 竖排时说明 / 错误贴近输入框（往上收 4px），和下一个字段的标签拉开距离，
  // 一眼看得出这行小字属于上面的输入框。
  const meta =
    infoRow || errorRow ? (
      <div
        data-slot="form-field-meta"
        className={cn("space-y-0.5", isHorizontal ? null : "-mt-1")}
      >
        {infoRow}
        {errorRow}
      </div>
    ) : null;

  const labelClasses = cn(
    isHorizontal ? cn(resolvedLabelWidth, "shrink-0 text-left leading-9") : null,
    labelClassName,
  );

  return (
    <FormFieldContext.Provider value={contextValue}>
      <div
        data-slot="form-field"
        data-orientation={orientation}
        data-invalid={invalid || undefined}
        className={cn(
          // 竖排时标签和输入框之间留 0.625rem：输入框聚焦会向外画 4px 光晕，间距太小时
          // 标签看上去贴在框上。
          isHorizontal ? "flex items-start gap-x-3" : "flex flex-col gap-2.5",
          className,
        )}
        {...props}
      >
        {label != null && label !== false ? (
          <FormLabel
            required={required}
            optional={optional}
            className={labelClasses || undefined}
          >
            {label}
          </FormLabel>
        ) : null}
        {isHorizontal ? (
          <div data-slot="form-field-content" className="min-w-0 flex-1 space-y-1.5">
            {control}
            {meta}
          </div>
        ) : (
          <>
            {control}
            {meta}
          </>
        )}
      </div>
    </FormFieldContext.Provider>
  );
}

/* ------------------------------------------------------------------ */
/*  FormLabel                                                          */
/* ------------------------------------------------------------------ */

export type FormLabelProps = LabelHTMLAttributes<HTMLLabelElement> & {
  required?: boolean;
  optional?: boolean;
};

function FormLabel({
  children,
  className,
  required = false,
  optional = false,
  ...props
}: FormLabelProps) {
  const { id, labelId } = useFormFieldContext("FormLabel");
  const { t } = useTranslation();
  return (
    <label
      data-slot="form-label"
      id={labelId}
      htmlFor={id}
      // 标签用正文色、说明用浅灰：两层信息一眼分得开（以前标签和说明都是灰的）。
      className={cn("text-sm font-medium text-ink", className)}
      {...props}
    >
      {children}
      {required ? (
        <span className="ml-0.5 text-rose-500" aria-hidden="true">
          *
        </span>
      ) : null}
      {optional && !required ? (
        <span className="ml-1.5 text-xs font-normal text-ink-3">
          {t("common.optional", { defaultValue: "可选" })}
        </span>
      ) : null}
    </label>
  );
}

/* ------------------------------------------------------------------ */
/*  FormControl                                                        */
/* ------------------------------------------------------------------ */

export type FormControlProps = PropsWithChildren<HTMLAttributes<HTMLDivElement>>;

function FormControl({ children, className, ...props }: FormControlProps) {
  const { id, descriptionId, errorId, countId, invalid } = useFormFieldContext("FormControl");
  const describedBy = [descriptionId, countId, errorId].filter(Boolean).join(" ") || undefined;

  const child = Children.only(children);
  if (!isValidElement(child)) {
    return (
      <div data-slot="form-control" className={className} {...props}>
        {children}
      </div>
    );
  }

  const element = child as ReactElement<Record<string, unknown>>;
  const existingDescribedBy =
    typeof element.props["aria-describedby"] === "string"
      ? element.props["aria-describedby"]
      : undefined;
  const mergedDescribedBy = [existingDescribedBy, describedBy].filter(Boolean).join(" ") || undefined;

  return (
    <div data-slot="form-control" className={className} {...props}>
      {cloneElement(element, {
        id: (element.props.id as string | undefined) ?? id,
        "aria-invalid": element.props["aria-invalid"] ?? (invalid || undefined),
        "aria-describedby": mergedDescribedBy,
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  FormDescription / FormError                                        */
/* ------------------------------------------------------------------ */

export type FormDescriptionProps = PropsWithChildren<HTMLAttributes<HTMLParagraphElement>>;

function FormDescription({ children, className, id, ...props }: FormDescriptionProps) {
  return (
    <p
      data-slot="form-description"
      id={id}
      className={cn("text-xs leading-5 text-ink-3", className)}
      {...props}
    >
      {children}
    </p>
  );
}

export type FormErrorProps = PropsWithChildren<HTMLAttributes<HTMLParagraphElement>>;

function FormError({ children, className, id, ...props }: FormErrorProps) {
  return (
    <p
      data-slot="form-error"
      id={id}
      role="alert"
      className={cn("text-xs leading-5 text-rose-600 dark:text-rose-400", className)}
      {...props}
    >
      {children}
    </p>
  );
}

/* ------------------------------------------------------------------ */
/*  Export compound                                                    */
/* ------------------------------------------------------------------ */

export const Form = Object.assign(FormRoot, {
  Field: FormField,
  Label: FormLabel,
  Control: FormControl,
  Description: FormDescription,
  Error: FormError,
});

export { FormField, FormLabel, FormControl, FormDescription, FormError };
