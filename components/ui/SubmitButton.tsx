"use client";

import type { ButtonHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";

import { cn } from "@/lib/cn";

type SubmitButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  pendingLabel?: string;
};

export function SubmitButton({
  pendingLabel,
  className,
  disabled,
  type,
  children,
  ...rest
}: SubmitButtonProps) {
  const { pending } = useFormStatus();
  const isDisabled = disabled || pending;
  const label = pending ? pendingLabel ?? "Working..." : children;

  return (
    <button
      {...rest}
      type={type ?? "submit"}
      disabled={isDisabled}
      aria-disabled={isDisabled}
      className={cn(className, pending ? "opacity-80" : "")}
    >
      {label}
    </button>
  );
}
