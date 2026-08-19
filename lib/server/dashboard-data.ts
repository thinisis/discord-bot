import type { Prisma } from "@prisma/client";

import { managedSlashCommands } from "@/src/bot/managed-command-meta";
import { env } from "@/src/config/env";
import { formatBytes } from "@/src/lib/format";
import { createPaginationMeta } from "@/src/lib/pagination";
import { prisma } from "@/src/lib/prisma";
import { getBotStatusSnapshot, getRuntimeStartedAt } from "@/src/lib/runtime-state";
import { getSystemLogFilePath, readSystemLogEntries, readSystemLogPage } from "@/src/lib/system-logs";
import { ensureCommandPolicies } from "@/src/services/command-policy-service";
import { listScheduledMessages } from "@/src/services/scheduled-message-service";
import { getSystemConfig } from "@/src/services/system-config-service";

type LogFilters = {
  guildId?: string;
  action?: string;
  guildPage: number;
  systemPage: number;
};

export const GUILD_LOGS_PAGE_SIZE = 40;
export const SYSTEM_LOGS_PAGE_SIZE = 30;

export async function getDashboardData() {
  const [
    guilds,
    recentLogs,
    guildCount,
    logCount,
    adminCount,
    recent24hLogs,
    attentionGuilds,
    systemConfig,
    commandPolicies,
    scheduledMessages
  ] = await Promise.all([
    prisma.guildConfig.findMany({
      orderBy: {
        guildName: "asc"
      },
      take: 6
    }),
    prisma.logRecord.findMany({
      take: 8,
      orderBy: {
        createdAt: "desc"
      }
    }),
    prisma.guildConfig.count(),
    prisma.logRecord.count(),
    prisma.adminUser.count(),
    prisma.logRecord.count({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
        }
      }
    }),
    prisma.guildConfig.findMany({
      where: {
        botEnabled: true,
        logChannelId: null
      },
      orderBy: {
        updatedAt: "desc"
      },
      take: 6
    }),
    getSystemConfig(prisma),
    ensureCommandPolicies(prisma, managedSlashCommands.map((command) => command.name)),
    listScheduledMessages(prisma)
  ]);

  const recentSystemLogs = readSystemLogEntries(10);
  const recentSystemWarnings = recentSystemLogs.filter((entry) => entry.level === "warn").length;
  const recentSystemErrors = recentSystemLogs.filter((entry) => entry.level === "error").length;

  return {
    guilds,
    recentLogs,
    attentionGuilds,
    recentSystemLogs: recentSystemLogs.slice(0, 6),
    systemLogFilePath: getSystemLogFilePath(),
    stats: {
      guildCount,
      logCount,
      adminCount,
      recent24hLogs,
      recentSystemWarnings,
      recentSystemErrors,
      ownerOnlyCommandCount: commandPolicies.filter((policy) => policy.accessLevel === "OWNER").length,
      scheduledMessageCount: scheduledMessages.length
    },
    liveStatus: getLiveStatusSnapshot(),
    systemConfig
  };
}

export async function getGuildSettingsData() {
  const [guilds, systemConfig, commandPolicies, scheduledMessages] = await Promise.all([
    prisma.guildConfig.findMany({
      orderBy: {
        guildName: "asc"
      }
    }),
    getSystemConfig(prisma),
    ensureCommandPolicies(prisma, managedSlashCommands.map((command) => command.name)),
    listScheduledMessages(prisma)
  ]);

  const configuredLogGuilds = guilds.filter((guild) => Boolean(guild.logChannelId)).length;
  const enabledGuilds = guilds.filter((guild) => guild.botEnabled).length;
  const averageVolume =
    guilds.length === 0
      ? 0
      : Math.round(guilds.reduce((total, guild) => total + guild.musicVolume, 0) / guilds.length);

  return {
    guilds,
    summary: {
      totalGuilds: guilds.length,
      enabledGuilds,
      disabledGuilds: Math.max(0, guilds.length - enabledGuilds),
      configuredLogGuilds,
      averageVolume
    },
    systemConfig,
    commandPolicies: managedSlashCommands.map((command) => ({
      name: command.name,
      description: command.description,
      accessLevel: commandPolicies.find((policy) => policy.commandName === command.name)?.accessLevel ?? "EVERYONE"
    })),
    scheduledMessages
  };
}

export async function getLogsData(filters: LogFilters) {
  const where: Prisma.LogRecordWhereInput = {};

  if (filters.guildId) {
    where.guildId = filters.guildId;
  }

  if (filters.action) {
    where.action = filters.action;
  }

  const [guildOptions, guildLogsTotalCount] = await Promise.all([
    prisma.guildConfig.findMany({
      orderBy: {
        guildName: "asc"
      }
    }),
    prisma.logRecord.count({
      where: Object.keys(where).length > 0 ? where : undefined
    })
  ]);

  const guildLogsPagination = createPaginationMeta(filters.guildPage, GUILD_LOGS_PAGE_SIZE, guildLogsTotalCount);
  const [logs, systemLogs] = await Promise.all([
    prisma.logRecord.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      skip: guildLogsPagination.offset,
      take: guildLogsPagination.pageSize,
      orderBy: {
        createdAt: "desc"
      }
    }),
    Promise.resolve(readSystemLogPage(filters.systemPage, SYSTEM_LOGS_PAGE_SIZE))
  ]);

  return {
    guildOptions,
    guildLogs: {
      entries: logs,
      pagination: guildLogsPagination
    },
    systemLogs,
    systemLogFilePath: getSystemLogFilePath()
  };
}

export function getLiveStatusSnapshot() {
  const runtimeStartedAt = getRuntimeStartedAt();

  return {
    bot: getBotStatusSnapshot(),
    system: {
      appMode: env.APP_MODE,
      nodeVersion: process.version,
      memoryRss: process.memoryUsage().rss,
      memoryLabel: formatBytes(process.memoryUsage().rss),
      uptimeSeconds: Math.max(0, Math.floor((Date.now() - runtimeStartedAt) / 1000)),
      runtimeStartedAt
    }
  };
}
