import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import type { ControlSize } from "../utils/controlStyles";

type InputVariant = "solid" | "ghost";

export interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  variant?: InputVariant;
  size?: ControlSize;
  startAdornment?: ReactNode;
  endAdornment?: ReactNode;
  /** Explicit invalid visual; also reacts to aria-invalid from FormField. */
  invalid?: boolean;
}

const SIZE_CLASS: Record<ControlSize, string> = {
  sm: "sn-sm",
  default: "",
  lg: "sn-lg",
};

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  {
    className,
    endAdornment,
    startAdornment,
    variant = "solid",
    size = "default",
    invalid,
    ...props
  },
  ref,
) {
  const ariaLabel =
    props["aria-label"] ??
    (!props.id && !props["aria-labelledby"] && typeof props.placeholder === "string"
      ? props.placeholder
      : undefined);

  const ariaInvalid = props["aria-invalid"];
  const isInvalid = invalid === true || ariaInvalid === true || ariaInvalid === "true";

  const mergedClassName =
    variant === "ghost"
      ? [
          "w-full bg-transparent text-sm text-inherit outline-none placeholder:text-inherit placeholder:opacity-60",
          className,
        ]
          .filter(Boolean)
          .join(" ")
      : ["sn-input", SIZE_CLASS[size], className].filter(Boolean).join(" ");

  const inputProps = {
    ...props,
    "aria-invalid": isInvalid ? true : props["aria-invalid"],
  };

  if (!startAdornment && !endAdornment) {
    return <input ref={ref} className={mergedClassName} aria-label={ariaLabel} {...inputProps} />;
  }

  return (
    <span
      className={[
        "sn-ib w-full",
        startAdornment ? "sn-has-pre" : null,
        endAdornment ? "sn-has-post" : null,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {startAdornment ? (
        <span className="sn-pre inline-flex items-center justify-center">{startAdornment}</span>
      ) : null}
      <input ref={ref} className={mergedClassName} aria-label={ariaLabel} {...inputProps} />
      {endAdornment ? (
        <span className="sn-post inline-flex items-center justify-center">{endAdornment}</span>
      ) : null}
    </span>
  );
});
