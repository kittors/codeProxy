import {
  type FieldsetHTMLAttributes,
  type HTMLAttributes,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import { cn } from "../utils/selectStyles";

type FieldsetProps = PropsWithChildren<FieldsetHTMLAttributes<HTMLFieldSetElement>>;
type FieldsetLegendProps = PropsWithChildren<
  HTMLAttributes<HTMLLegendElement> & {
    description?: ReactNode;
  }
>;
type FieldsetGroupProps = PropsWithChildren<HTMLAttributes<HTMLDivElement>>;
type FieldsetActionsProps = PropsWithChildren<HTMLAttributes<HTMLDivElement>>;
type FieldsetDescriptionProps = PropsWithChildren<HTMLAttributes<HTMLParagraphElement>>;

function FieldsetRoot({ children, className, ...props }: FieldsetProps) {
  return (
    <fieldset
      data-slot="fieldset"
      className={cn("flex min-w-0 flex-1 basis-0 flex-col gap-6 border-0 p-0", className)}
      {...props}
    >
      {children}
    </fieldset>
  );
}

function FieldsetLegend({ children, className, description, ...props }: FieldsetLegendProps) {
  return (
    <>
      <legend
        data-slot="fieldset-legend"
        className={cn("text-base font-medium text-slate-950 dark:text-white", className)}
        {...props}
      >
        {children}
      </legend>
      {description ? <FieldsetDescription>{description}</FieldsetDescription> : null}
    </>
  );
}

function FieldsetGroup({ children, className, ...props }: FieldsetGroupProps) {
  return (
    <div data-slot="fieldset-field-group" className={cn("w-full space-y-4", className)} {...props}>
      {children}
    </div>
  );
}

function FieldsetActions({ children, className, ...props }: FieldsetActionsProps) {
  return (
    <div
      data-slot="fieldset-actions"
      className={cn("flex flex-wrap items-center gap-2 pt-1", className)}
      {...props}
    >
      {children}
    </div>
  );
}

function FieldsetDescription({ children, className, ...props }: FieldsetDescriptionProps) {
  return (
    <p
      data-slot="description"
      className={cn("text-sm leading-6 text-slate-500 dark:text-white/55", className)}
      {...props}
    >
      {children}
    </p>
  );
}

export const Fieldset = Object.assign(FieldsetRoot, {
  Actions: FieldsetActions,
  Description: FieldsetDescription,
  Group: FieldsetGroup,
  Legend: FieldsetLegend,
});
