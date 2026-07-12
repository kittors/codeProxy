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
} from "react";
import { cn } from "../utils/selectStyles";

/* ------------------------------------------------------------------ */
/*  Context                                                            */
/* ------------------------------------------------------------------ */

type FormFieldContextValue = {
  id: string;
  descriptionId?: string;
  errorId?: string;
  invalid: boolean;
};

const FormFieldContext = createContext<FormFieldContextValue | null>(null);

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

export type FormProps = FormHTMLAttributes<HTMLFormElement>;

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
    /** Layout: vertical stacks label above control; horizontal puts label beside control. */
    orientation?: FormFieldOrientation;
    /** Optional explicit control id; defaults to a generated id. */
    htmlFor?: string;
  }
>;

/** Fixed label column width so multi-field horizontal forms share one left edge. */
const HORIZONTAL_LABEL_CLASS = "w-12 shrink-0 text-left leading-9";

function FormField({
  children,
  className,
  label,
  description,
  error,
  required = false,
  orientation = "vertical",
  htmlFor,
  ...props
}: FormFieldProps) {
  const generatedId = useId();
  const id = htmlFor ?? generatedId;
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const invalid = Boolean(error);
  const isHorizontal = orientation === "horizontal";

  const contextValue = useMemo<FormFieldContextValue>(
    () => ({ id, descriptionId, errorId, invalid }),
    [descriptionId, errorId, id, invalid],
  );

  const control = <FormControl className={isHorizontal ? "min-w-0 w-full" : undefined}>{children}</FormControl>;
  const meta = (
    <>
      {description ? <FormDescription id={descriptionId}>{description}</FormDescription> : null}
      {error ? <FormError id={errorId}>{error}</FormError> : null}
    </>
  );

  return (
    <FormFieldContext.Provider value={contextValue}>
      <div
        data-slot="form-field"
        data-orientation={orientation}
        data-invalid={invalid || undefined}
        className={cn(
          isHorizontal ? "flex items-start gap-x-2" : "flex flex-col gap-1.5",
          className,
        )}
        {...props}
      >
        {label != null && label !== false ? (
          <FormLabel required={required} className={isHorizontal ? HORIZONTAL_LABEL_CLASS : undefined}>
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
};

function FormLabel({ children, className, required = false, ...props }: FormLabelProps) {
  const { id } = useFormFieldContext("FormLabel");
  return (
    <label
      data-slot="form-label"
      htmlFor={id}
      className={cn("text-sm font-medium text-slate-700 dark:text-slate-200", className)}
      {...props}
    >
      {children}
      {required ? (
        <span className="ml-0.5 text-rose-500" aria-hidden="true">
          *
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
  const { id, descriptionId, errorId, invalid } = useFormFieldContext("FormControl");
  const describedBy = [descriptionId, errorId].filter(Boolean).join(" ") || undefined;

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
      className={cn("text-xs leading-5 text-slate-500 dark:text-white/45", className)}
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
