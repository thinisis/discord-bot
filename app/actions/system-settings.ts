"use server";

import { CommandAccessLevel, ScheduledMessageFrequency } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireCurrentAdmin } from "@/lib/server/admin-session";
import { managedSlashCommands } from "@/src/bot/managed-command-meta";
import { createUtcDateFromGmt7 } from "@/src/lib/gmt7";
import { getBotRuntimeControl } from "@/src/lib/runtime-state";
import { prisma } from "@/src/lib/prisma";
import { updateCommandPolicies } from "@/src/services/command-policy-service";
import {
  deleteScheduledMessage,
  saveScheduledMessage
} from "@/src/services/scheduled-message-service";
import {
  DEFAULT_IDLE_TEXTS,
  normalizeDiscordIdList,
  updateSystemConfig
} from "@/src/services/system-config-service";

function redirectSettings(message: string, type: string): never {
  redirect(`/settings?flash=${encodeURIComponent(message)}&type=${encodeURIComponent(type)}`);
}

function revalidateSettingsViews(): void {
  revalidatePath("/dashboard");
  revalidatePath("/logs");
  revalidatePath("/settings");
}

export async function saveSystemSettingsAction(formData: FormData): Promise<void> {
  await requireCurrentAdmin();

  const queuePageSize = Number.parseInt(String(formData.get("queuePageSize") ?? "").trim(), 10);
  if (!Number.isInteger(queuePageSize) || queuePageSize < 5 || queuePageSize > 25) {
    redirectSettings("Kích thước trang queue phải nằm trong khoảng 5-25.", "warning");
  }

  await updateSystemConfig(prisma, {
    ownerDiscordIds: normalizeDiscordIdList(String(formData.get("ownerDiscordIds") ?? "")),
    queuePageSize,
    idleMorningText: String(formData.get("idleMorningText") ?? "").trim() || DEFAULT_IDLE_TEXTS.morning,
    idleNoonText: String(formData.get("idleNoonText") ?? "").trim() || DEFAULT_IDLE_TEXTS.noon,
    idleEveningText: String(formData.get("idleEveningText") ?? "").trim() || DEFAULT_IDLE_TEXTS.evening,
    idleNightText: String(formData.get("idleNightText") ?? "").trim() || DEFAULT_IDLE_TEXTS.night
  });

  await getBotRuntimeControl()?.syncSystemSettings();
  revalidateSettingsViews();
  redirectSettings("Đã lưu cấu hình hệ thống.", "success");
}

export async function saveCommandPoliciesAction(formData: FormData): Promise<void> {
  await requireCurrentAdmin();

  await updateCommandPolicies(
    prisma,
    managedSlashCommands.map((command) => ({
      commandName: command.name,
      accessLevel:
        formData.get(`command:${command.name}`) === "OWNER"
          ? CommandAccessLevel.OWNER
          : CommandAccessLevel.EVERYONE
    }))
  );

  revalidateSettingsViews();
  redirectSettings("Đã cập nhật quyền thực thi command.", "success");
}

export async function saveScheduledMessageAction(formData: FormData): Promise<void> {
  await requireCurrentAdmin();

  const id = String(formData.get("id") ?? "").trim() || undefined;
  const frequencyValue = String(formData.get("frequency") ?? "").trim();
  const frequency = Object.values(ScheduledMessageFrequency).includes(frequencyValue as ScheduledMessageFrequency)
    ? (frequencyValue as ScheduledMessageFrequency)
    : ScheduledMessageFrequency.DAILY;
  const hourValue = String(formData.get("hour") ?? "").trim();
  const minuteValue = String(formData.get("minute") ?? "").trim();
  const runAtValue = String(formData.get("runAt") ?? "").trim();

  let schedule;
  try {
    schedule = await saveScheduledMessage(prisma, {
      name: String(formData.get("name") ?? "").trim(),
      guildId: String(formData.get("guildId") ?? "").trim(),
      channelId: String(formData.get("channelId") ?? "").trim(),
      message: String(formData.get("message") ?? "").trim(),
      frequency,
      daysOfWeek: String(formData.get("daysOfWeek") ?? "").trim() || null,
      hour: hourValue ? Number.parseInt(hourValue, 10) : null,
      minute: minuteValue ? Number.parseInt(minuteValue, 10) : null,
      runAt: parseDateTimeLocalAsGmt7(runAtValue),
      enabled: formData.get("enabled") === "on"
    }, id);
  } catch (error) {
    redirectSettings(error instanceof Error ? error.message : "Không thể lưu lịch gửi.", "warning");
  }

  await getBotRuntimeControl()?.syncScheduledMessage(schedule.id);
  revalidateSettingsViews();
  redirectSettings(`Đã lưu lịch gửi "${schedule.name}".`, "success");
}

export async function deleteScheduledMessageAction(formData: FormData): Promise<void> {
  await requireCurrentAdmin();

  const id = String(formData.get("id") ?? "").trim();
  if (!id) {
    redirectSettings("Không tìm thấy lịch gửi cần xóa.", "warning");
  }

  await deleteScheduledMessage(prisma, id);
  await getBotRuntimeControl()?.removeScheduledMessage(id);
  revalidateSettingsViews();
  redirectSettings("Đã xóa lịch gửi.", "success");
}

function parseDateTimeLocalAsGmt7(input: string): Date | null {
  if (!input) {
    return null;
  }

  const match = input.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = match[1]!;
  const month = match[2]!;
  const day = match[3]!;
  const hour = match[4]!;
  const minute = match[5]!;
  return createUtcDateFromGmt7({
    year: Number.parseInt(year, 10),
    monthIndex: Number.parseInt(month, 10) - 1,
    dayOfMonth: Number.parseInt(day, 10),
    hour: Number.parseInt(hour, 10),
    minute: Number.parseInt(minute, 10)
  });
}
