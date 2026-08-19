"use client";

import { Button, type ButtonProps } from "@heroui/react";

type AdminButtonTone = "default" | "accent" | "success" | "warning" | "danger";
type AdminButtonKind = "soft" | "solid";
type AdminButtonSize = "sm" | "md" | "lg";

type AdminButtonProps = Omit<ButtonProps, "color" | "variant" | "size"> & {
  tone?: AdminButtonTone;
  kind?: AdminButtonKind;
  size?: AdminButtonSize;
};

export function AdminButton({
  tone = "default",
  kind = "soft",
  size = "sm",
  className,
  radius = "md",
  ...props
}: AdminButtonProps) {
  return (
    <Button
      {...props}
      className={["admin-button", className].filter(Boolean).join(" ")}
      color="default"
      data-kind={kind}
      data-size={size}
      data-tone={tone}
      radius={radius}
      size={size}
      variant="flat"
    />
  );
}
