"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

export interface SafeTextButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
}

export function SafeTextButton({ className, children, type = "button", ...props }: SafeTextButtonProps) {
  return (
    <button
      type={type}
      className={[
        "max-w-full overflow-hidden text-center leading-tight whitespace-normal break-all",
        className || "",
      ].join(" ")}
      {...props}
    >
      {children}
    </button>
  );
}