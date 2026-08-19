"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireCurrentAdmin } from "@/lib/server/admin-session";
import { getBotRuntimeControl } from "@/src/lib/runtime-state";
import { prisma } from "@/src/lib/prisma";
import { updateGuildSettings } from "@/src/services/guild-service";

export async function saveGuildSettingsAction(formData: FormData): Promise<void> {
  await requireCurrentAdmin();

  const guildId = String(formData.get("guildId") ?? "").trim();
  const botEnabled = formData.get("botEnabled") === "on";
  const logChannelId = String(formData.get("logChannelId") ?? "").trim() || null;
  const musicVolume = Number(String(formData.get("musicVolume") ?? "").trim() || "50");

  if (!guildId) {
    redirect("/settings?flash=Guild%20kh%C3%B4ng%20h%E1%BB%A3p%20l%E1%BB%87&type=danger");
  }

  if (!Number.isInteger(musicVolume) || musicVolume < 0 || musicVolume > 200) {
    redirect(
      "/settings?flash=%C3%82m%20l%C6%B0%E1%BB%A3ng%20music%20ph%E1%BA%A3i%20n%E1%BA%B1m%20trong%20kho%E1%BA%A3ng%200-200&type=warning"
    );
  }

  const guild = await updateGuildSettings(prisma, guildId, {
    botEnabled,
    logChannelId,
    musicVolume
  });
  await getBotRuntimeControl()?.syncGuildSettings(guildId);

  revalidatePath("/dashboard");
  revalidatePath("/logs");
  revalidatePath("/settings");
  redirect(
    `/settings?flash=${encodeURIComponent(`Đã lưu cấu hình cho ${guild?.guildName ?? guildId}.`)}&type=success`
  );
}
