import "dotenv/config";

import { z } from "zod";

const isBuildPhase =
  process.env.NEXT_PHASE === "phase-production-build" || process.env.npm_lifecycle_event === "build";

const optionalString = (minLength = 1) =>
  z.preprocess(
    (value) => {
      if (typeof value !== "string") {
        return value;
      }

      const trimmed = value.trim();
      return trimmed === "" ? undefined : trimmed;
    },
    z.string().min(minLength).optional()
  );

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    HOST: z.string().default("0.0.0.0"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    APP_MODE: z.enum(["all", "web", "bot"]).default("all"),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required."),
    SESSION_SECRET: optionalString(),
    ADMIN_SESSION_TTL_HOURS: z.coerce.number().int().positive().default(168),
    ADMIN_BOOTSTRAP_USERNAME: optionalString(3),
    ADMIN_BOOTSTRAP_PASSWORD: optionalString(8),
    DISCORD_TOKEN: optionalString(),
    DISCORD_APPLICATION_ID: optionalString(),
    DISCORD_COMMAND_GUILD_ID: optionalString(),
    BOT_PRESENCE_TEXT: z.string().default("Monitoring your server"),
    LAVALINK_URL: optionalString(),
    LAVALINK_PASSWORD: optionalString(),
    LAVALINK_CLIENT_NAME: z.string().default("discord-bot-admin/1.0.0"),
    LAVALINK_RESUME_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(60),
    MUSIC_PLAYLIST_MAX_ITEMS: z.coerce.number().int().positive().max(500).default(100),
    UPSTASH_REDIS_REST_URL: optionalString(),
    UPSTASH_REDIS_REST_TOKEN: optionalString()
  })
  .superRefine((value, ctx) => {
    if ((value.APP_MODE === "all" || value.APP_MODE === "web") && !value.SESSION_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "SESSION_SECRET is required when APP_MODE includes web."
      });
    }

    if (
      (value.APP_MODE === "all" || value.APP_MODE === "web") &&
      value.SESSION_SECRET &&
      value.SESSION_SECRET.length < 16
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "SESSION_SECRET must be at least 16 characters when APP_MODE includes web."
      });
    }

    if (!isBuildPhase && (value.APP_MODE === "all" || value.APP_MODE === "bot") && !value.DISCORD_TOKEN) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "DISCORD_TOKEN is required when APP_MODE includes bot."
      });
    }

    if (!isBuildPhase && (value.APP_MODE === "all" || value.APP_MODE === "bot") && !value.DISCORD_APPLICATION_ID) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "DISCORD_APPLICATION_ID is required when APP_MODE includes bot."
      });
    }

    if (!isBuildPhase && (value.APP_MODE === "all" || value.APP_MODE === "bot") && !value.LAVALINK_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "LAVALINK_URL is required when APP_MODE includes bot."
      });
    }

    if (!isBuildPhase && (value.APP_MODE === "all" || value.APP_MODE === "bot") && !value.LAVALINK_PASSWORD) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "LAVALINK_PASSWORD is required when APP_MODE includes bot."
      });
    }

    if (Boolean(value.ADMIN_BOOTSTRAP_USERNAME) !== Boolean(value.ADMIN_BOOTSTRAP_PASSWORD)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "ADMIN_BOOTSTRAP_USERNAME and ADMIN_BOOTSTRAP_PASSWORD must either both be set or both be omitted."
      });
    }

    if (Boolean(value.UPSTASH_REDIS_REST_URL) !== Boolean(value.UPSTASH_REDIS_REST_TOKEN)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must either both be set or both be omitted."
      });
    }
  });

export const env = envSchema.parse(process.env);

export const isProduction = env.NODE_ENV === "production";
export const isBotEnabled = env.APP_MODE === "all" || env.APP_MODE === "bot";
export const isWebEnabled = env.APP_MODE === "all" || env.APP_MODE === "web";
