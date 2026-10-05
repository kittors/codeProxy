import { forwardRef, type TextareaHTMLAttributes } from "react";
import { controlMultilineSurface } from "../utils/controlStyles";
import { cn } from "../utils/selectStyles";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      className={cn(
        "min-h-28 w-full resize-y px-3.5 py-3 text-sm outline-none",
        "focus:outline-none focus-visible:outline-none",
        controlMultilineSurface,
        className,
      )}
      {...props}
    />
  );
});
