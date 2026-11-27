import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "../utils/selectStyles";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Explicit invalid visual; also reacts to aria-invalid from FormField. */
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, invalid, ...props },
  ref,
) {
  const ariaInvalid = props["aria-invalid"];
  const isInvalid = invalid === true || ariaInvalid === true || ariaInvalid === "true";

  return (
    <textarea
      ref={ref}
      aria-invalid={isInvalid ? true : props["aria-invalid"]}
      className={cn("sn-input min-h-24 resize-y", className)}
      {...props}
    />
  );
});
