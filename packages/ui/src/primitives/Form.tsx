import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
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

function triggerSatinShake(field: HTMLElement | null) {
  if (!field || window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
  const target = field.querySelector<HTMLElement>(".sn-input, .sn-trigger, [role='combobox']") ?? field;
  target.classList.remove("sn-shake");
  void target.offsetWidth;
  target.classList.add("sn-shake");
  target.addEventListener("animationend", () => target.classList.remove("sn-shake"), { once: true });
}

type FormFieldContextValue = {
  id: string;
  labelId: string;
  descriptionId?: string;
  errorId?: string;
  countId?: string;
  invalid: boolean;
};

const FormFieldContext = createContext<FormFieldContextValue | null>(null);

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

export type FormProps = FormHTMLAttributes<HTMLFormElement> & { ref?: Ref<HTMLFormElement> };

function FormRoot({ className, ...props }: FormProps) {
  return <form data-slot="form" className={cn("sn-form max-w-none space-y-4", className)} {...props} />;
}

export type FormFieldOrientation = "vertical" | "horizontal";

export type FormFieldProps = PropsWithChildren<
  HTMLAttributes<HTMLDivElement> & {
    label?: ReactNode;
    description?: ReactNode;
    error?: ReactNode;
    required?: boolean;
    optional?: boolean;
    orientation?: FormFieldOrientation;
    htmlFor?: string;
    reserveMeta?: boolean;
    valueLength?: number;
    maxLength?: number;
    labelWidth?: string;
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
  const fieldRef = useRef<HTMLDivElement | null>(null);
  const showCount = typeof maxLength === "number" && maxLength > 0;
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const countId = showCount ? `${id}-count` : undefined;
  const invalid = Boolean(error);
  const wasInvalidRef = useRef(invalid);
  const isHorizontal = orientation === "horizontal";
  const resolvedLabelWidth = labelWidth ?? DEFAULT_HORIZONTAL_LABEL_WIDTH;
  const length = typeof valueLength === "number" ? valueLength : 0;

  // Satin 校验反馈微动效：错误首次出现时触发输入框轻微横向抖动。
  useEffect(() => {
    if (invalid && !wasInvalidRef.current && fieldRef.current) {
      triggerSatinShake(fieldRef.current);
    }
    wasInvalidRef.current = invalid;
  }, [invalid]);

  const contextValue = useMemo<FormFieldContextValue>(
    () => ({ id, labelId: `${id}-label`, descriptionId, errorId, countId, invalid }),
    [countId, descriptionId, errorId, id, invalid],
  );

  const control = (
    <FormControl className={isHorizontal ? "min-w-0 w-full" : undefined}>{children}</FormControl>
  );

  const infoRow =
    description || showCount ? (
      <div data-slot="form-field-info" className="sn-help items-start justify-between">
        <div className="min-w-0 flex-1">
          {description ? <FormDescription id={descriptionId}>{description}</FormDescription> : null}
        </div>
        {showCount ? (
          <span
            data-slot="form-field-count"
            id={countId}
            className={cn("sn-count shrink-0", length > maxLength! ? "sn-over" : null)}
          >
            {length} / {maxLength}
          </span>
        ) : null}
      </div>
    ) : null;

  const errorRow = error ? (
    <div data-slot="form-field-error-slot" className="sn-err">
      <span>
        <FormError id={errorId}>{error}</FormError>
      </span>
    </div>
  ) : reserveMeta && !infoRow ? (
    <div data-slot="form-field-error-slot" className="invisible min-h-[18px]" aria-hidden="true">
      <span className="block text-xs leading-[18px]">&nbsp;</span>
    </div>
  ) : null;

  const meta =
    infoRow || errorRow ? (
      <div data-slot="form-field-meta" className="space-y-0.5">
        {infoRow}
        {errorRow}
      </div>
    ) : null;

  const labelClasses = cn(
    isHorizontal ? cn(resolvedLabelWidth, "shrink-0 text-left leading-8") : null,
    labelClassName,
  );

  return (
    <FormFieldContext.Provider value={contextValue}>
      <div
        ref={fieldRef}
        data-slot="form-field"
        data-orientation={orientation}
        data-invalid={invalid || undefined}
        className={cn(
          "sn-field",
          invalid ? "sn-bad" : null,
          isHorizontal ? "flex items-start gap-x-3" : null,
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
      className={cn("sn-lbl", className)}
      {...props}
    >
      {children}
      {required ? (
        <span className="ml-0.5 text-[var(--sn-danger)]" aria-hidden="true">
          *
        </span>
      ) : null}
      {optional && !required ? (
        <span className="sn-opt">{t("common.optional", { defaultValue: "可选" })}</span>
      ) : null}
    </label>
  );
}

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

export type FormDescriptionProps = PropsWithChildren<HTMLAttributes<HTMLParagraphElement>>;

function FormDescription({ children, className, id, ...props }: FormDescriptionProps) {
  return (
    <p data-slot="form-description" id={id} className={cn("sn-help", className)} {...props}>
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
      className={cn("text-xs leading-[18px] text-[var(--sn-danger)]", className)}
      {...props}
    >
      {children}
    </p>
  );
}

export const Form = Object.assign(FormRoot, {
  Field: FormField,
  Label: FormLabel,
  Control: FormControl,
  Description: FormDescription,
  Error: FormError,
});

export { FormField, FormLabel, FormControl, FormDescription, FormError };
