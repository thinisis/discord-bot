import type { Prisma, PrismaClient } from "@prisma/client";

export type CreateLogInput = {
  guildId: string;
  guildName: string;
  channelId?: string | null;
  userId?: string | null;
  targetId?: string | null;
  action: string;
  message: string;
  metadata?: Prisma.InputJsonValue;
};

export async function createLogRecord(prisma: PrismaClient, input: CreateLogInput): Promise<void> {
  await prisma.logRecord.create({
    data: {
      guildId: input.guildId,
      guildName: input.guildName,
      channelId: input.channelId ?? null,
      userId: input.userId ?? null,
      targetId: input.targetId ?? null,
      action: input.action,
      message: input.message,
      metadata: input.metadata
    }
  });
}
