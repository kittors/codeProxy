import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "../utils/selectStyles";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      className={cn("sn-input min-h-24 resize-y", className)}
      {...props}
    />
  );
});
