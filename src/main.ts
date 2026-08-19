import { createServer, type Server } from "node:http";
import { parse } from "node:url";

import next from "next";
import { PrismaClient } from "@prisma/client";

import { DiscordBotService } from "./bot/discord-bot";
import { env, isBotEnabled, isWebEnabled } from "./config/env";
import { prisma } from "./lib/prisma";
import {
  markRuntimeStarted,
  setBotRuntimeControl,
  setBotStatusProvider,
  type BotStatusProvider
} from "./lib/runtime-state";
import { installSystemLogCapture } from "./lib/system-logs";
import { ensureBootstrapAdmin } from "./services/admin-service";
import { ensureSystemConfig } from "./services/system-config-service";

type Startable = {
  stop(): Promise<void>;
};

installSystemLogCapture();

async function main(prismaClient: PrismaClient): Promise<void> {
  await prismaClient.$connect();
  const bootstrapAdminResult = await ensureBootstrapAdmin(
    prismaClient,
    env.ADMIN_BOOTSTRAP_USERNAME,
    env.ADMIN_BOOTSTRAP_PASSWORD
  );
  await ensureSystemConfig(prismaClient);

  if (bootstrapAdminResult === "created") {
    console.info(`[admin] created bootstrap admin "${env.ADMIN_BOOTSTRAP_USERNAME}"`);
  }

  const shutdownTasks: Startable[] = [];
  markRuntimeStarted();

  const botService = isBotEnabled ? new DiscordBotService(prismaClient) : null;
  const botStatusProvider: BotStatusProvider =
    botService ??
    {
      getStatus() {
        return {
          enabled: false,
          ready: false,
          guildCount: 0,
          pingMs: null,
          uptimeSeconds: 0,
          currentUserTag: null,
          music: {
            backend: "lavalink",
            configured: false,
            connected: false,
            resumed: false,
            sessionId: null,
            nodeHost: "",
            nodeVersion: null,
            sources: [],
            plugins: [],
            lavalinkPlayers: 0,
            lavalinkPlayingPlayers: 0,
            activeGuilds: 0,
            queuedTracks: 0,
            activeTracks: 0,
            uptimeMs: null,
            lastError: null,
            sessions: []
          }
        };
      }
  };

  setBotStatusProvider(botStatusProvider);
  setBotRuntimeControl(botService ?? undefined);

  if (botService) {
    await botService.start();
    shutdownTasks.push(botService);
  }

  let webServer: Awaited<ReturnType<typeof buildWebServer>> | null = null;

  if (isWebEnabled) {
    webServer = await buildWebServer();
    await webServer.listen();

    shutdownTasks.push({
      stop: () => webServer!.close()
    });
    console.info(`[web] listening on http://${env.HOST}:${env.PORT}`);
  }

  const handleSignal = async (signal: NodeJS.Signals) => {
    console.info(`[app] received ${signal}, shutting down`);

    for (const task of [...shutdownTasks].reverse()) {
      await task.stop();
    }

    await prismaClient.$disconnect();
    process.exit(0);
  };

  process.once("SIGINT", handleSignal);
  process.once("SIGTERM", handleSignal);
}

main(prisma).catch(async (error) => {
  console.error("[app] fatal startup error", error);
  await prisma.$disconnect();
  process.exit(1);
});

async function buildWebServer(): Promise<{
  listen(): Promise<void>;
  close(): Promise<void>;
}> {
  const app = next({
    dev: env.NODE_ENV !== "production",
    hostname: env.HOST,
    port: env.PORT
  });

  await app.prepare();
  const handle = app.getRequestHandler();
  const server: Server = createServer((request, response) => {
    if (!request.url) {
      response.statusCode = 400;
      response.end("Bad Request");
      return;
    }

    const parsedUrl = parse(request.url, true);
    void handle(request, response, parsedUrl);
  });

  return {
    listen() {
      return new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(env.PORT, env.HOST, () => {
          server.off("error", reject);
          resolve();
        });
      });
    },
    close() {
      return new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  };
}
