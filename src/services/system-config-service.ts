import type { PrismaClient, SystemConfig } from "@prisma/client";

export const DEFAULT_OWNER_DISCORD_ID = "448715770696826890";
export const DEFAULT_QUEUE_PAGE_SIZE = 10;
export const DEFAULT_IDLE_TEXTS = {
  morning: "Chào buổi sáng",
  noon: "Chúc buổi trưa nhẹ nhàng",
  evening: "Chào buổi tối",
  night: "Chúc ngủ ngon"
} as const;

export type SystemConfigInput = {
  ownerDiscordIds: string;
  queuePageSize: number;
  idleMorningText: string;
  idleNoonText: string;
  idleEveningText: string;
  idleNightText: string;
};

export async function ensureSystemConfig(prisma: PrismaClient): Promise<SystemConfig> {
  return prisma.systemConfig.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      ownerDiscordIds: DEFAULT_OWNER_DISCORD_ID,
      queuePageSize: DEFAULT_QUEUE_PAGE_SIZE,
      idleMorningText: DEFAULT_IDLE_TEXTS.morning,
      idleNoonText: DEFAULT_IDLE_TEXTS.noon,
      idleEveningText: DEFAULT_IDLE_TEXTS.evening,
      idleNightText: DEFAULT_IDLE_TEXTS.night
    }
  });
}

export async function getSystemConfig(prisma: PrismaClient): Promise<SystemConfig> {
  return ensureSystemConfig(prisma);
}

export async function updateSystemConfig(prisma: PrismaClient, input: SystemConfigInput): Promise<SystemConfig> {
  return prisma.systemConfig.upsert({
    where: { id: 1 },
    update: input,
    create: {
      id: 1,
      ...input
    }
  });
}

export function normalizeDiscordIdList(input: string): string {
  const ids = parseOwnerDiscordIds(input);
  return ids.length > 0 ? ids.join("\n") : DEFAULT_OWNER_DISCORD_ID;
}

export function parseOwnerDiscordIds(input: string | null | undefined): string[] {
  return [...new Set((input ?? "").split(/[\s,]+/).map((value) => value.trim()).filter((value) => /^\d{10,25}$/.test(value)))];
}
