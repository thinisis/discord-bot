import {
  ScheduledMessageFrequency,
  type Prisma,
  type PrismaClient,
  type ScheduledMessage
} from "@prisma/client";

import { createUtcDateFromGmt7, getGmt7DateParts } from "../lib/gmt7";

export type ScheduledMessageInput = {
  name: string;
  guildId: string;
  channelId: string;
  message: string;
  frequency: ScheduledMessageFrequency;
  daysOfWeek: string | null;
  hour: number | null;
  minute: number | null;
  runAt: Date | null;
  enabled: boolean;
};

export function normalizeDaysOfWeek(input: string | null | undefined): string | null {
  const values = [...new Set((input ?? "").split(/[\s,]+/).map((value) => Number.parseInt(value, 10)).filter((value) => Number.isInteger(value) && value >= 0 && value <= 6))];
  if (values.length === 0) {
    return null;
  }

  return values.sort((left, right) => left - right).join(",");
}

export function parseDaysOfWeek(input: string | null | undefined): number[] {
  return (normalizeDaysOfWeek(input) ?? "")
    .split(",")
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isInteger(value));
}

export function validateScheduledMessageInput(input: ScheduledMessageInput): void {
  if (!input.name.trim()) {
    throw new Error("Tên lịch gửi không được để trống.");
  }

  if (!/^\d{10,25}$/.test(input.guildId.trim())) {
    throw new Error("Guild ID của lịch gửi không hợp lệ.");
  }

  if (!/^\d{10,25}$/.test(input.channelId.trim())) {
    throw new Error("Channel ID của lịch gửi không hợp lệ.");
  }

  if (!input.message.trim()) {
    throw new Error("Nội dung tin nhắn định kỳ không được để trống.");
  }

  if (input.frequency === ScheduledMessageFrequency.ONCE) {
    if (!input.runAt || Number.isNaN(input.runAt.getTime())) {
      throw new Error("Lịch gửi một lần cần có thời gian chạy cụ thể.");
    }
    if (input.runAt.getTime() <= Date.now()) {
      throw new Error("Thời gian của lịch gửi một lần phải nằm trong tương lai.");
    }
    return;
  }

  if (input.hour === null || input.minute === null) {
    throw new Error("Lịch gửi lặp lại cần có giờ và phút theo GMT+7.");
  }

  if (input.hour < 0 || input.hour > 23 || input.minute < 0 || input.minute > 59) {
    throw new Error("Giờ hoặc phút của lịch gửi không hợp lệ.");
  }

  if (input.frequency === ScheduledMessageFrequency.WEEKLY && parseDaysOfWeek(input.daysOfWeek).length === 0) {
    throw new Error("Lịch gửi hàng tuần cần ít nhất một ngày trong tuần.");
  }
}

export function computeNextScheduledRunAt(
  input: Pick<ScheduledMessageInput, "frequency" | "daysOfWeek" | "hour" | "minute" | "runAt" | "enabled">,
  referenceDate = new Date()
): Date | null {
  if (!input.enabled) {
    return null;
  }

  if (input.frequency === ScheduledMessageFrequency.ONCE) {
    return input.runAt && input.runAt.getTime() > referenceDate.getTime() ? input.runAt : null;
  }

  if (input.hour === null || input.minute === null) {
    return null;
  }

  const reference = referenceDate;
  const gmt7 = getGmt7DateParts(reference);

  if (input.frequency === ScheduledMessageFrequency.DAILY) {
    let candidate = createUtcDateFromGmt7({
      year: gmt7.year,
      monthIndex: gmt7.monthIndex,
      dayOfMonth: gmt7.dayOfMonth,
      hour: input.hour,
      minute: input.minute
    });

    if (candidate.getTime() <= reference.getTime()) {
      candidate = createUtcDateFromGmt7({
        year: gmt7.year,
        monthIndex: gmt7.monthIndex,
        dayOfMonth: gmt7.dayOfMonth + 1,
        hour: input.hour,
        minute: input.minute
      });
    }

    return candidate;
  }

  const days = parseDaysOfWeek(input.daysOfWeek);
  for (let offset = 0; offset <= 7; offset += 1) {
    const candidate = createUtcDateFromGmt7({
      year: gmt7.year,
      monthIndex: gmt7.monthIndex,
      dayOfMonth: gmt7.dayOfMonth + offset,
      hour: input.hour,
      minute: input.minute
    });
    const candidateDay = getGmt7DateParts(candidate).dayOfWeek;

    if (!days.includes(candidateDay)) {
      continue;
    }

    if (candidate.getTime() > reference.getTime()) {
      return candidate;
    }
  }

  return null;
}

export async function listScheduledMessages(prisma: PrismaClient): Promise<ScheduledMessage[]> {
  return prisma.scheduledMessage.findMany({
    orderBy: [{ enabled: "desc" }, { nextRunAt: "asc" }, { createdAt: "desc" }]
  });
}

export async function saveScheduledMessage(
  prisma: PrismaClient,
  input: ScheduledMessageInput,
  id?: string
): Promise<ScheduledMessage> {
  validateScheduledMessageInput(input);
  const nextRunAt = computeNextScheduledRunAt(input);

  const data: Prisma.ScheduledMessageUncheckedCreateInput | Prisma.ScheduledMessageUncheckedUpdateInput = {
    name: input.name.trim(),
    guildId: input.guildId.trim(),
    channelId: input.channelId.trim(),
    message: input.message.trim(),
    frequency: input.frequency,
    daysOfWeek: input.frequency === ScheduledMessageFrequency.WEEKLY ? normalizeDaysOfWeek(input.daysOfWeek) : null,
    hour: input.frequency === ScheduledMessageFrequency.ONCE ? null : input.hour,
    minute: input.frequency === ScheduledMessageFrequency.ONCE ? null : input.minute,
    runAt: input.frequency === ScheduledMessageFrequency.ONCE ? input.runAt : null,
    enabled: input.enabled,
    nextRunAt
  };

  if (id) {
    return prisma.scheduledMessage.update({
      where: { id },
      data
    });
  }

  return prisma.scheduledMessage.create({
    data: data as Prisma.ScheduledMessageUncheckedCreateInput
  });
}

export async function deleteScheduledMessage(prisma: PrismaClient, id: string): Promise<void> {
  await prisma.scheduledMessage.delete({
    where: { id }
  });
}
