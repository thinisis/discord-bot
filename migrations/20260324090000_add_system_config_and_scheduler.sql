CREATE TYPE "CommandAccessLevel" AS ENUM ('EVERYONE', 'OWNER');

CREATE TYPE "ScheduledMessageFrequency" AS ENUM ('DAILY', 'WEEKLY', 'ONCE');

CREATE TABLE "SystemConfig" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "ownerDiscordIds" TEXT NOT NULL DEFAULT '448715770696826890',
  "queuePageSize" INTEGER NOT NULL DEFAULT 10,
  "idleMorningText" TEXT NOT NULL DEFAULT 'Chào buổi sáng',
  "idleNoonText" TEXT NOT NULL DEFAULT 'Chúc buổi trưa nhẹ nhàng',
  "idleEveningText" TEXT NOT NULL DEFAULT 'Chào buổi tối',
  "idleNightText" TEXT NOT NULL DEFAULT 'Chúc ngủ ngon',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommandPolicy" (
  "commandName" TEXT NOT NULL,
  "accessLevel" "CommandAccessLevel" NOT NULL DEFAULT 'EVERYONE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CommandPolicy_pkey" PRIMARY KEY ("commandName")
);

CREATE TABLE "ScheduledMessage" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "frequency" "ScheduledMessageFrequency" NOT NULL,
  "daysOfWeek" TEXT,
  "hour" INTEGER,
  "minute" INTEGER,
  "runAt" TIMESTAMP(3),
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "lastSentAt" TIMESTAMP(3),
  "nextRunAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ScheduledMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ScheduledMessage_enabled_nextRunAt_idx" ON "ScheduledMessage"("enabled", "nextRunAt" ASC);
CREATE INDEX "ScheduledMessage_guildId_enabled_idx" ON "ScheduledMessage"("guildId", "enabled");

INSERT INTO "SystemConfig" ("id") VALUES (1)
ON CONFLICT ("id") DO NOTHING;
