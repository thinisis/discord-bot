import type { GuildConfig, PrismaClient } from "@prisma/client";

export async function upsertGuildConfig(
  prisma: PrismaClient,
  guildId: string,
  guildName: string
): Promise<GuildConfig> {
  return prisma.guildConfig.upsert({
    where: {
      guildId
    },
    update: {
      guildName
    },
    create: {
      guildId,
      guildName
    }
  });
}

export async function syncGuildConfigs(
  prisma: PrismaClient,
  guilds: Array<{ id: string; name: string }>
): Promise<void> {
  if (guilds.length === 0) {
    return;
  }

  await prisma.$transaction(
    guilds.map((guild) =>
      prisma.guildConfig.upsert({
        where: {
          guildId: guild.id
        },
        update: {
          guildName: guild.name
        },
        create: {
          guildId: guild.id,
          guildName: guild.name
        }
      })
    )
  );
}

export async function updateGuildSettings(
  prisma: PrismaClient,
  guildId: string,
  data: {
    botEnabled: boolean;
    logChannelId: string | null;
    musicVolume: number;
  }
): Promise<GuildConfig> {
  return prisma.guildConfig.upsert({
    where: {
      guildId
    },
    update: data,
    create: {
      guildId,
      guildName: guildId,
      ...data
    }
  });
}
