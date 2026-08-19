"use client";

import { useFormStatus } from "react-dom";

import { AdminButton } from "@/components/ui/admin-button";

export function SettingsSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <AdminButton className="w-full sm:w-auto" isLoading={pending} kind="solid" size="sm" tone="accent" type="submit">
      Lưu
    </AdminButton>
  );
}
