import type { PrismaClient, ScheduledMessage } from "@prisma/client";
import type { Client } from "discord.js";

import { UpstashRedisClient } from "../lib/upstash-redis";
import { computeNextScheduledRunAt } from "./scheduled-message-service";

const SCHEDULE_QUEUE_KEY = "discord-bot-admin:scheduled-messages";
const SCHEDULE_MEMBER_PREFIX = "schedule:";
const POLL_INTERVAL_MS = 15_000;
const FAILURE_RETRY_DELAY_MS = 5 * 60 * 1000;
const MAX_DUE_ITEMS_PER_POLL = 20;

export class ScheduledMessageQueueService {
  private readonly prisma: PrismaClient;
  private readonly client: Client;
  private readonly redis: UpstashRedisClient;
  private intervalId: NodeJS.Timeout | null = null;
  private syncInFlight = false;

  public constructor(prisma: PrismaClient, client: Client) {
    this.prisma = prisma;
    this.client = client;
    this.redis = new UpstashRedisClient();
  }

  public get configured(): boolean {
    return this.redis.configured;
  }

  public async start(): Promise<void> {
    if (!this.redis.configured) {
      console.warn("[scheduler] Upstash Redis REST chưa được cấu hình; bỏ qua lịch gửi định kỳ.");
      return;
    }

    await this.syncAll();
    this.intervalId = setInterval(() => {
      void this.pollDueMessages();
    }, POLL_INTERVAL_MS);
  }

  public async stop(): Promise<void> {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  public async syncAll(): Promise<void> {
    if (!this.redis.configured) {
      return;
    }

    const schedules = await this.prisma.scheduledMessage.findMany();
    const commands: Array<Array<string | number>> = [["DEL", SCHEDULE_QUEUE_KEY]];

    for (const schedule of schedules) {
      if (!schedule.enabled || !schedule.nextRunAt) {
        continue;
      }

      commands.push([
        "ZADD",
        SCHEDULE_QUEUE_KEY,
        schedule.nextRunAt.getTime(),
        this.buildMember(schedule.id)
      ]);
    }

    await this.redis.pipeline(commands);
  }

  public async syncMessage(scheduleId: string): Promise<void> {
    if (!this.redis.configured) {
      return;
    }

    const schedule = await this.prisma.scheduledMessage.findUnique({
      where: { id: scheduleId }
    });
    const member = this.buildMember(scheduleId);

    const commands: Array<Array<string | number>> = [["ZREM", SCHEDULE_QUEUE_KEY, member]];
    if (schedule?.enabled && schedule.nextRunAt) {
      commands.push(["ZADD", SCHEDULE_QUEUE_KEY, schedule.nextRunAt.getTime(), member]);
    }

    await this.redis.pipeline(commands);
  }

  public async removeMessage(scheduleId: string): Promise<void> {
    if (!this.redis.configured) {
      return;
    }

    await this.redis.command<number>(["ZREM", SCHEDULE_QUEUE_KEY, this.buildMember(scheduleId)]);
  }

  private async pollDueMessages(): Promise<void> {
    if (!this.redis.configured || this.syncInFlight) {
      return;
    }

    this.syncInFlight = true;

    try {
      const dueMembers = await this.redis.command<string[]>([
        "ZRANGEBYSCORE",
        SCHEDULE_QUEUE_KEY,
        "-inf",
        Date.now(),
        "LIMIT",
        0,
        MAX_DUE_ITEMS_PER_POLL
      ]);

      for (const member of dueMembers) {
        await this.processDueMember(member);
      }
    } catch (error) {
      console.error("[scheduler] failed to poll due scheduled messages", error);
    } finally {
      this.syncInFlight = false;
    }
  }

  private async processDueMember(member: string): Promise<void> {
    const removed = await this.redis.command<number>(["ZREM", SCHEDULE_QUEUE_KEY, member]);
    if (removed === 0) {
      return;
    }

    const scheduleId = this.parseMember(member);
    if (!scheduleId) {
      return;
    }

    const schedule = await this.prisma.scheduledMessage.findUnique({
      where: { id: scheduleId }
    });

    if (!schedule || !schedule.enabled) {
      return;
    }

    if (schedule.nextRunAt && schedule.nextRunAt.getTime() > Date.now()) {
      await this.redis.command<number>(["ZADD", SCHEDULE_QUEUE_KEY, schedule.nextRunAt.getTime(), member]);
      return;
    }

    try {
      await this.sendScheduledMessage(schedule);
      await this.persistPostSendState(schedule, new Date());
    } catch (error) {
      console.error(`[scheduler] failed to send scheduled message ${schedule.id}`, error);
      const retryAt = new Date(Date.now() + FAILURE_RETRY_DELAY_MS);

      await this.prisma.scheduledMessage.update({
        where: { id: schedule.id },
        data: {
          nextRunAt: retryAt
        }
      });

      await this.redis.command<number>(["ZADD", SCHEDULE_QUEUE_KEY, retryAt.getTime(), member]);
    }
  }

  private async persistPostSendState(schedule: ScheduledMessage, sentAt: Date): Promise<void> {
    const nextRunAt = computeNextScheduledRunAt(
      {
        enabled: schedule.enabled,
        frequency: schedule.frequency,
        daysOfWeek: schedule.daysOfWeek,
        hour: schedule.hour,
        minute: schedule.minute,
        runAt: schedule.runAt
      },
      sentAt
    );

    const updated = await this.prisma.scheduledMessage.update({
      where: { id: schedule.id },
      data: {
        lastSentAt: sentAt,
        nextRunAt,
        enabled: schedule.frequency === "ONCE" ? false : schedule.enabled
      }
    });

    if (updated.enabled && updated.nextRunAt) {
      await this.redis.command<number>([
        "ZADD",
        SCHEDULE_QUEUE_KEY,
        updated.nextRunAt.getTime(),
        this.buildMember(updated.id)
      ]);
    }
  }

  private async sendScheduledMessage(schedule: ScheduledMessage): Promise<void> {
    const channel = await this.client.channels.fetch(schedule.channelId);
    if (!channel || !channel.isTextBased() || !("send" in channel) || typeof channel.send !== "function") {
      throw new Error(`Channel ${schedule.channelId} không phải text channel hợp lệ.`);
    }

    const sendableChannel = channel as { send(content: string): Promise<unknown> };
    await sendableChannel.send(schedule.message);
    console.info("[scheduler] sent scheduled message", {
      id: schedule.id,
      guildId: schedule.guildId,
      channelId: schedule.channelId,
      name: schedule.name
    });
  }

  private buildMember(scheduleId: string): string {
    return `${SCHEDULE_MEMBER_PREFIX}${scheduleId}`;
  }

  private parseMember(member: string): string | null {
    return member.startsWith(SCHEDULE_MEMBER_PREFIX) ? member.slice(SCHEDULE_MEMBER_PREFIX.length) : null;
  }
}
