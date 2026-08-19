import {
  ActionRowBuilder,
  ActivityType,
  AuditLogEvent,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  GuildMember,
  MessageFlags,
  PermissionFlagsBits,
  REST,
  Routes,
  StringSelectMenuBuilder,
  type ButtonInteraction,
  type Channel,
  type ChatInputCommandInteraction,
  type Guild,
  type GuildBasedChannel,
  type GuildTextBasedChannel,
  type InteractionEditReplyOptions,
  type InteractionUpdateOptions,
  type StringSelectMenuInteraction,
} from "discord.js";
import { type Prisma, type PrismaClient, type SystemConfig } from "@prisma/client";

import { env } from "../config/env";
import { formatDateTime } from "../lib/format";
import { getGmt7DateParts } from "../lib/gmt7";
import { createLogRecord } from "../services/log-service";
import { ensureCommandPolicies, resolveCommandPermission } from "../services/command-policy-service";
import { syncGuildConfigs, upsertGuildConfig } from "../services/guild-service";
import { ScheduledMessageQueueService } from "../services/scheduled-message-queue-service";
import { getSystemConfig } from "../services/system-config-service";
import { MusicManager, type GuildPlayerSnapshot, type GuildQueuePage, type MusicServiceStatus } from "./music-manager";
import { managedSlashCommandNames, slashCommands } from "./slash-commands";
import { SearchSessionStore } from "./search-session-store";

type BotStatus = {
  enabled: boolean;
  ready: boolean;
  guildCount: number;
  pingMs: number | null;
  uptimeSeconds: number;
  currentUserTag: string | null;
  music: MusicServiceStatus;
};

type AuditActor = {
  executorId: string | null;
  executorTag: string | null;
};

type CommandResponse = string | InteractionEditReplyOptions;

const SEARCH_RESULTS_LIMIT = 8;
const SEARCH_SESSION_TTL_MS = 10 * 60 * 1000;
const SEARCH_SELECT_CUSTOM_ID_PREFIX = "music:search";
const PLAYER_TOGGLE_BUTTON_ID = "music:player:toggle";
const PLAYER_QUEUE_BUTTON_ID = "music:player:queue";
const PLAYER_SKIP_BUTTON_ID = "music:player:skip";
const PLAYER_LEAVE_BUTTON_ID = "music:player:leave";
const QUEUE_NAVIGATION_BUTTON_PREFIX = "music:queue:page";
const DISABLED_GUILD_MESSAGE =
  "Bot hiện đang tắt cho guild này. Hãy bật lại trong trang Cấu hình guild của admin panel nếu muốn dùng lệnh, playback và log tự động.";

export class DiscordBotService {
  public readonly client: Client;
  public readonly musicManager: MusicManager;
  private readonly prisma: PrismaClient;
  private readonly searchSessions = new SearchSessionStore(SEARCH_SESSION_TTL_MS);
  private readonly scheduler: ScheduledMessageQueueService;
  private readyAt: number | null = null;
  private systemConfigCache: SystemConfig | null = null;
  private presenceIntervalId: NodeJS.Timeout | null = null;

  public constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates]
    });
    this.musicManager = new MusicManager(prisma, this.client);
    this.scheduler = new ScheduledMessageQueueService(prisma, this.client);
  }

  public async start(): Promise<void> {
    this.registerCoreEvents();
    await this.client.login(env.DISCORD_TOKEN);
  }

  public async stop(): Promise<void> {
    if (this.presenceIntervalId) {
      clearInterval(this.presenceIntervalId);
      this.presenceIntervalId = null;
    }

    await this.scheduler.stop();
    await this.musicManager.stop();
    this.client.destroy();
  }

  public async syncGuildSettings(guildId: string): Promise<void> {
    const guildConfig = await this.prisma.guildConfig.findUnique({
      where: { guildId },
      select: { botEnabled: true }
    });

    if (!guildConfig || guildConfig.botEnabled) {
      return;
    }

    const clearedSessions = this.searchSessions.deleteGuildSessions(guildId);
    let stoppedPlayer = false;

    try {
      if (this.musicManager.getPlayerSnapshot(guildId)) {
        await this.musicManager.leaveGuild(guildId);
        stoppedPlayer = true;
      }
    } catch (error) {
      console.error(`[bot] failed to stop active player for disabled guild ${guildId}`, error);
    }

    console.info(
      `[bot] guild ${guildId} disabled in settings; cleared ${clearedSessions} search session(s)${stoppedPlayer ? " and stopped active playback" : ""}`
    );
  }

  public async syncSystemSettings(): Promise<void> {
    this.systemConfigCache = await getSystemConfig(this.prisma);
    await this.refreshPresence();
  }

  public async syncScheduledMessage(scheduleId: string): Promise<void> {
    await this.scheduler.syncMessage(scheduleId);
  }

  public async removeScheduledMessage(scheduleId: string): Promise<void> {
    await this.scheduler.removeMessage(scheduleId);
  }

  public getStatus(): BotStatus {
    return {
      enabled: true,
      ready: this.client.isReady(),
      guildCount: this.client.guilds.cache.size,
      pingMs: this.client.ws.ping === -1 ? null : this.client.ws.ping,
      uptimeSeconds: this.readyAt ? Math.floor((Date.now() - this.readyAt) / 1000) : 0,
      currentUserTag: this.client.user?.tag ?? null,
      music: this.musicManager.getServiceStatus()
    };
  }

  private registerCoreEvents(): void {
    this.client.once(Events.ClientReady, (client) => {
      this.runAsyncTask("client ready", async () => {
        this.readyAt = Date.now();

        await syncGuildConfigs(
          this.prisma,
          client.guilds.cache.map((guild) => ({ id: guild.id, name: guild.name }))
        );

        await this.registerSlashCommands(client.application.id);
        await ensureCommandPolicies(this.prisma, managedSlashCommandNames);
        await this.musicManager.start(client.user.id);
        await this.syncSystemSettings();
        await this.scheduler.start();
        this.startPresenceLoop();
        console.info(`[bot] ready as ${client.user.tag}`);
      });
    });

    this.client.on(Events.GuildCreate, (guild) => {
      this.runAsyncTask(`guild create ${guild.id}`, async () => {
        await upsertGuildConfig(this.prisma, guild.id, guild.name);
      });
    });

    this.client.on(Events.ChannelCreate, (channel) => {
      this.runAsyncTask("channel create", async () => {
        await this.handleChannelLifecycle("channel.created", channel, "Kênh đã được tạo", AuditLogEvent.ChannelCreate);
      });
    });

    this.client.on(Events.ChannelDelete, (channel) => {
      this.runAsyncTask("channel delete", async () => {
        await this.handleChannelLifecycle("channel.deleted", channel, "Kênh đã bị xóa", AuditLogEvent.ChannelDelete);
      });
    });

    this.client.on(Events.ChannelUpdate, (oldChannel, newChannel) => {
      this.runAsyncTask("channel update", async () => {
        if (!this.isGuildChannel(oldChannel) || !this.isGuildChannel(newChannel)) return;
        if (!(await this.isGuildBotEnabled(newChannel.guild.id, newChannel.guild.name))) return;

        const changes: string[] = [];
        if (oldChannel.name !== newChannel.name) changes.push(`tên: ${oldChannel.name} -> ${newChannel.name}`);
        if ("topic" in oldChannel && "topic" in newChannel && oldChannel.topic !== newChannel.topic) {
          changes.push("topic đã thay đổi");
        }
        if (oldChannel.parentId !== newChannel.parentId) changes.push("category đã thay đổi");

        const actor = await this.fetchAuditActor(newChannel.guild, AuditLogEvent.ChannelUpdate, newChannel.id);
        const actorText = actor?.executorTag ?? actor?.executorId ?? "không rõ";
        const message =
          changes.length > 0
            ? `Kênh được cập nhật bởi ${actorText}: ${this.channelLabel(newChannel)} (${changes.join(", ")})`
            : `Kênh được cập nhật bởi ${actorText}: ${this.channelLabel(newChannel)}`;

        await this.persistAndForwardLog({
          guild: newChannel.guild,
          action: "channel.updated",
          message,
          channelId: newChannel.id,
          targetId: newChannel.id,
          userId: actor?.executorId ?? null,
          metadata: {
            changes,
            channelType: ChannelType[newChannel.type]
          }
        });
      });
    });

    this.client.on(Events.VoiceStateUpdate, (oldState, newState) => {
      this.runAsyncTask("voice state update", async () => {
        if (newState.id === this.client.user?.id || oldState.id === this.client.user?.id) {
          await this.musicManager.handleBotVoiceStateUpdate(oldState, newState);
          return;
        }

        const guild = newState.guild;
        const member = newState.member ?? oldState.member;
        if (!member || member.user.bot) return;
        if (!(await this.isGuildBotEnabled(guild.id, guild.name))) return;

        let action: string | null = null;
        let message: string | null = null;

        if (!oldState.channelId && newState.channelId) {
          action = "voice.joined";
          message = `${member.user.tag} đã vào voice channel ${newState.channel?.name ?? newState.channelId}.`;
        } else if (oldState.channelId && !newState.channelId) {
          action = "voice.left";
          message = `${member.user.tag} đã rời voice channel ${oldState.channel?.name ?? oldState.channelId}.`;
        } else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
          action = "voice.moved";
          message = `${member.user.tag} đã chuyển từ ${oldState.channel?.name ?? oldState.channelId} sang ${newState.channel?.name ?? newState.channelId}.`;
        }

        if (!action || !message) return;

        await this.persistAndForwardLog({
          guild,
          action,
          message,
          channelId: newState.channelId ?? oldState.channelId,
          userId: member.id,
          targetId: newState.channelId ?? oldState.channelId,
          metadata: {
            oldChannelId: oldState.channelId,
            newChannelId: newState.channelId
          }
        });
      });
    });

    this.client.on(Events.VoiceServerUpdate, (payload) => {
      this.runAsyncTask("voice server update", async () => {
        await this.musicManager.handleVoiceServerUpdate(payload);
      });
    });

    this.client.on(Events.Raw, (packet) => {
      if (packet.t !== "VOICE_SERVER_UPDATE") {
        return;
      }

      this.runAsyncTask("raw voice server update", async () => {
        await this.musicManager.handleVoiceServerUpdate(packet.d as never);
      });
    });

    this.client.on(Events.InteractionCreate, (interaction) => {
      this.runAsyncTask("interaction create", async () => {
        if (!interaction.inGuild()) return;
        if (!(interaction.isChatInputCommand() || interaction.isStringSelectMenu() || interaction.isButton())) {
          return;
        }

        try {
          if (interaction.isChatInputCommand()) {
            await this.handleChatInputInteraction(interaction);
            return;
          }

          if (interaction.isStringSelectMenu()) {
            await this.handleSearchSelection(interaction);
            return;
          }

          if (interaction.isButton()) {
            await this.handlePlayerButton(interaction);
          }
        } catch (error) {
          const interactionLabel = interaction.isChatInputCommand() ? `/${interaction.commandName}` : interaction.customId;
          console.error(`[bot] interaction error for ${interactionLabel}`, error);
          const errorMessage =
            error instanceof Error
              ? error.message
              : "Lệnh thực thi thất bại. Hãy kiểm tra voice permissions, cấu hình Lavalink hoặc source plugin đang dùng.";

          if (interaction.isChatInputCommand()) {
            if (interaction.deferred || interaction.replied) {
              await interaction.editReply({ content: errorMessage, components: [] });
            } else {
              await interaction.reply({ content: errorMessage, flags: MessageFlags.Ephemeral });
            }

            return;
          }

          if (interaction.deferred || interaction.replied) {
            await interaction.followUp({ content: errorMessage, flags: MessageFlags.Ephemeral });
          } else {
            await interaction.reply({ content: errorMessage, flags: MessageFlags.Ephemeral });
          }
        }
      });
    });
  }

  private async handleChatInputInteraction(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!(await this.isGuildBotEnabled(interaction.guildId!, interaction.guild!.name))) {
      await this.replyGuildDisabled(interaction);
      return;
    }

    const permission = await resolveCommandPermission(
      this.prisma,
      managedSlashCommandNames,
      interaction.commandName,
      interaction.user.id
    );
    if (!permission.allowed) {
      await interaction.reply({
        content: `Lệnh \`/${interaction.commandName}\` hiện chỉ cho owner bot sử dụng.`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    await interaction.deferReply();
    const response = await this.handleSlashCommand(interaction);
    await interaction.editReply(typeof response === "string" ? { content: response } : response);
    await this.refreshPresence();
  }

  private async handleSlashCommand(interaction: ChatInputCommandInteraction): Promise<CommandResponse> {
    switch (interaction.commandName) {
      case "play":
        return this.createPlayerCommandResponse(interaction.guildId!, await this.musicManager.handlePlay(interaction));
      case "search":
        return this.handleSearchCommand(interaction);
      case "pause":
        return this.createPlayerCommandResponse(interaction.guildId!, await this.musicManager.handlePause(interaction));
      case "resume":
        return this.createPlayerCommandResponse(interaction.guildId!, await this.musicManager.handleResume(interaction));
      case "skip":
        return this.createPlayerCommandResponse(interaction.guildId!, await this.musicManager.handleSkip(interaction));
      case "join":
      case "summon":
        return this.createPlayerCommandResponse(interaction.guildId!, await this.musicManager.handleSummon(interaction));
      case "leave":
        return this.createPlayerCommandResponse(interaction.guildId!, await this.musicManager.handleLeave(interaction));
      case "queue":
        return this.createQueueCommandResponse(interaction.guildId!, 1);
      case "ping":
        return this.handlePingCommand();
      case "help":
        return this.handleHelpCommand();
      case "volume":
        return this.createPlayerCommandResponse(interaction.guildId!, await this.musicManager.handleVolume(interaction));
      default:
        return "Lệnh không hợp lệ.";
    }
  }

  private async handleSearchCommand(interaction: ChatInputCommandInteraction): Promise<CommandResponse> {
    const member = await this.resolveGuildMember(interaction);
    if (!member) {
      return "Lệnh này chỉ có thể dùng bên trong một guild.";
    }

    const voiceChannel = member.voice.channel;
    if (!voiceChannel) {
      return "Hãy vào một voice channel trước khi dùng `/search`.";
    }

    const query = interaction.options.getString("query", true).trim();
    if (!query) {
      return "Hãy nhập từ khóa tìm kiếm hợp lệ.";
    }

    const result = await this.musicManager.searchTracks(
      query,
      interaction.user.id,
      interaction.user.username,
      SEARCH_RESULTS_LIMIT
    );

    if (result.tracks.length === 0) {
      return "Không tìm thấy kết quả nào phù hợp trên source đã cấu hình.";
    }

    const session = this.searchSessions.create({
      guildId: interaction.guildId!,
      userId: interaction.user.id,
      query,
      textChannelId: interaction.channelId,
      voiceChannelId: voiceChannel.id,
      tracks: result.tracks
    });

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`${SEARCH_SELECT_CUSTOM_ID_PREFIX}:${session.id}`)
      .setPlaceholder("Chọn một bài để phát hoặc thêm vào hàng chờ")
      .addOptions(
        result.tracks.map((track, index) => ({
          label: this.truncateForComponent(track.title, 100),
          description: this.truncateForComponent(`${track.author} • ${track.durationLabel}`, 100),
          value: String(index)
        }))
      );

    return {
      content: [
        `**Kết quả YouTube cho:** ${query}`,
        result.playlistName ? `Playlist: ${result.playlistName}` : `Đã tìm thấy ${result.tracks.length} kết quả phù hợp.`,
        "Chọn một mục trong menu bên dưới. Phiên chọn sẽ tự hết hạn sau 10 phút."
      ].join("\n"),
      components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu)]
    };
  }

  private async handleSearchSelection(interaction: StringSelectMenuInteraction): Promise<void> {
    if (!interaction.customId.startsWith(`${SEARCH_SELECT_CUSTOM_ID_PREFIX}:`)) {
      return;
    }

    if (!(await this.isGuildBotEnabled(interaction.guildId!, interaction.guild!.name))) {
      await this.replyGuildDisabled(interaction);
      return;
    }

    const sessionId = interaction.customId.slice(`${SEARCH_SELECT_CUSTOM_ID_PREFIX}:`.length);
    const session = this.searchSessions.get(sessionId);
    if (!session || session.guildId !== interaction.guildId) {
      await interaction.reply({
        content: "Phiên tìm kiếm đã hết hạn hoặc không còn hợp lệ. Hãy dùng lại `/search`.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (interaction.user.id !== session.userId) {
      await interaction.reply({
        content: "Chỉ người đã tạo phiên tìm kiếm mới có thể chọn kết quả này.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const member = await this.resolveGuildMember(interaction);
    if (!member) {
      await interaction.reply({
        content: "Không thể xác định thành viên hiện tại trong guild này.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const voiceError = this.getSearchInteractionError(session.voiceChannelId, interaction.guildId!, member);
    if (voiceError) {
      await interaction.reply({ content: voiceError, flags: MessageFlags.Ephemeral });
      return;
    }

    const selectedValue = interaction.values[0];
    if (!selectedValue) {
      await interaction.reply({
        content: "Không thể đọc kết quả đã chọn. Hãy dùng lại `/search`.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const selectedIndex = Number.parseInt(selectedValue, 10);
    const track = Number.isInteger(selectedIndex) ? session.tracks[selectedIndex] : null;
    const voiceChannel = member.voice.channel;

    if (!track || !voiceChannel) {
      await interaction.reply({
        content: "Không thể đọc kết quả đã chọn. Hãy dùng lại `/search`.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const result = await this.musicManager.enqueueTrack({
      guildId: interaction.guildId!,
      voiceChannel,
      textChannelId: session.textChannelId ?? interaction.channelId,
      track
    });

    this.searchSessions.delete(session.id);

    await interaction.update({
      content: result.message,
      components: this.buildPlayerActionComponents(interaction.guildId!)
    });
    await this.refreshPresence();
  }

  private async handlePlayerButton(interaction: ButtonInteraction): Promise<void> {
    const isQueueNavigation = interaction.customId.startsWith(`${QUEUE_NAVIGATION_BUTTON_PREFIX}:`);
    if (
      interaction.customId !== PLAYER_TOGGLE_BUTTON_ID &&
      interaction.customId !== PLAYER_QUEUE_BUTTON_ID &&
      interaction.customId !== PLAYER_SKIP_BUTTON_ID &&
      interaction.customId !== PLAYER_LEAVE_BUTTON_ID &&
      !isQueueNavigation
    ) {
      return;
    }

    if (!(await this.isGuildBotEnabled(interaction.guildId!, interaction.guild!.name))) {
      await this.replyGuildDisabled(interaction);
      return;
    }

    if (interaction.customId === PLAYER_QUEUE_BUTTON_ID) {
      await interaction.reply({
        ...await this.createQueueCommandResponse(interaction.guildId!, 1),
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (isQueueNavigation) {
      const page = this.parseQueueNavigationPage(interaction.customId);
      await interaction.update(await this.createQueueCommandResponse(interaction.guildId!, page));
      return;
    }

    const member = await this.resolveGuildMember(interaction);
    if (!member) {
      await interaction.reply({
        content: "Không thể xác định thành viên hiện tại trong guild này.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const voiceError = this.getPlayerControlError(interaction.guildId!, member);
    if (voiceError) {
      await interaction.reply({ content: voiceError, flags: MessageFlags.Ephemeral });
      return;
    }

    let content: string;
    switch (interaction.customId) {
      case PLAYER_TOGGLE_BUTTON_ID:
        content = await this.musicManager.togglePauseGuild(interaction.guildId!);
        break;
      case PLAYER_SKIP_BUTTON_ID:
        content = await this.musicManager.skipGuild(interaction.guildId!);
        break;
      case PLAYER_LEAVE_BUTTON_ID:
        content = await this.musicManager.leaveGuild(interaction.guildId!);
        break;
      default:
        return;
    }

    await interaction.update(this.buildPlayerActionUpdate(interaction.guildId!, content));
    await this.refreshPresence();
  }

  private createPlayerCommandResponse(guildId: string, content: string): CommandResponse {
    const components = this.buildPlayerActionComponents(guildId);
    if (components.length === 0) {
      return content;
    }

    return {
      content,
      components
    };
  }

  private async createQueueCommandResponse(
    guildId: string,
    page: number
  ): Promise<{ content: string; components: Array<ActionRowBuilder<ButtonBuilder>> }> {
    const systemConfig = await this.getSystemConfigCached();
    const queuePage = this.musicManager.getQueuePage(guildId, page, systemConfig.queuePageSize);
    const content = this.musicManager.describeQueue(guildId, page, systemConfig.queuePageSize);

    return {
      content,
      components: queuePage ? this.buildQueueComponents(queuePage) : []
    };
  }

  private handlePingCommand(): string {
    const status = this.getStatus();
    const pingText = status.pingMs !== null ? `${status.pingMs}ms` : "không có";
    const lavalinkText = status.music.connected ? "đã kết nối" : "chưa kết nối";

    return [
      "**Pong!**",
      `- WebSocket ping: ${pingText}`,
      `- Guilds: ${status.guildCount}`,
      `- Lavalink: ${lavalinkText}`,
      `- Uptime: ${status.uptimeSeconds}s`
    ].join("\n");
  }

  private handleHelpCommand(): string {
    return [
      "**Danh sách lệnh cơ bản**",
      "- `/help`: Xem danh sách lệnh",
      "- `/ping`: Kiểm tra trạng thái bot",
      "- `/join`: Gọi bot vào voice channel của bạn",
      "- `/play <query>`: Phát hoặc thêm bài, playlist hoặc URL vào hàng chờ",
      "- `/search <query>`: Tìm trên YouTube và chọn kết quả bằng menu",
      "- `/pause`: Tạm dừng bài hiện tại",
      "- `/resume`: Tiếp tục bài đang tạm dừng",
      "- `/skip [position] [all]`: Bỏ bài hiện tại, bỏ một mục trong queue hoặc xóa toàn bộ queue",
      "- `/queue`: Xem hàng chờ hiện tại",
      "- `/volume <0-200>`: Đổi âm lượng phát",
      "- `/leave`: Rời voice và xóa hàng chờ"
    ].join("\n");
  }

  private async resolveGuildMember(
    interaction: ChatInputCommandInteraction | StringSelectMenuInteraction | ButtonInteraction
  ): Promise<GuildMember | null> {
    if (interaction.member instanceof GuildMember) {
      return interaction.member;
    }

    try {
      return await interaction.guild!.members.fetch(interaction.user.id);
    } catch (error) {
      console.error(`[bot] failed to resolve guild member ${interaction.user.id} in guild ${interaction.guildId}`, error);
      return null;
    }
  }

  private getSearchInteractionError(sessionVoiceChannelId: string, guildId: string, member: GuildMember): string | null {
    const memberVoiceChannelId = member.voice.channelId;
    if (!memberVoiceChannelId) {
      return "Hãy vào lại voice channel để chọn kết quả tìm kiếm.";
    }

    const botVoiceChannelId = this.musicManager.getBotVoiceChannelId(guildId);
    if (botVoiceChannelId && memberVoiceChannelId !== botVoiceChannelId) {
      return "Bạn cần ở cùng voice channel với bot để chọn kết quả này.";
    }

    if (!botVoiceChannelId && memberVoiceChannelId !== sessionVoiceChannelId) {
      return "Bạn đã đổi voice channel kể từ lúc tìm kiếm. Hãy dùng lại `/search` trong kênh hiện tại.";
    }

    return null;
  }

  private getPlayerControlError(guildId: string, member: GuildMember): string | null {
    const botVoiceChannelId = this.musicManager.getBotVoiceChannelId(guildId);
    if (!botVoiceChannelId) {
      return "Bot hiện chưa kết nối voice trong server này.";
    }

    if (!member.voice.channelId) {
      return "Hãy vào cùng voice channel với bot để dùng nút điều khiển.";
    }

    if (member.voice.channelId !== botVoiceChannelId) {
      return "Bạn cần ở cùng voice channel với bot để dùng nút điều khiển.";
    }

    return null;
  }

  private buildPlayerActionComponents(guildId: string): Array<ActionRowBuilder<ButtonBuilder>> {
    const snapshot = this.musicManager.getPlayerSnapshot(guildId);
    if (!snapshot) {
      return [];
    }

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(PLAYER_TOGGLE_BUTTON_ID)
        .setLabel(snapshot.paused ? "Tiếp tục" : "Tạm dừng")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!snapshot.currentTrack),
      new ButtonBuilder()
        .setCustomId(PLAYER_QUEUE_BUTTON_ID)
        .setLabel("Hàng chờ")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!snapshot.currentTrack && snapshot.queueLength === 0),
      new ButtonBuilder()
        .setCustomId(PLAYER_SKIP_BUTTON_ID)
        .setLabel("Bỏ qua")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!snapshot.currentTrack),
      new ButtonBuilder()
        .setCustomId(PLAYER_LEAVE_BUTTON_ID)
        .setLabel("Rời voice")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!snapshot.voiceChannelId)
    );

    return [row];
  }

  private buildQueueComponents(queuePage: GuildQueuePage): Array<ActionRowBuilder<ButtonBuilder>> {
    const previousPage = Math.max(1, queuePage.page - 1);
    const nextPage = Math.min(queuePage.totalPages, queuePage.page + 1);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${QUEUE_NAVIGATION_BUTTON_PREFIX}:prev:${previousPage}`)
        .setLabel("Trang trước")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(queuePage.page <= 1),
      new ButtonBuilder()
        .setCustomId(`${QUEUE_NAVIGATION_BUTTON_PREFIX}:current:${queuePage.page}`)
        .setLabel(`${queuePage.page}/${queuePage.totalPages}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`${QUEUE_NAVIGATION_BUTTON_PREFIX}:next:${nextPage}`)
        .setLabel("Trang sau")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(queuePage.page >= queuePage.totalPages)
    );

    return [row];
  }

  private buildPlayerActionUpdate(guildId: string, content: string): InteractionUpdateOptions {
    const components = this.buildPlayerActionComponents(guildId);
    const snapshot = this.musicManager.getPlayerSnapshot(guildId);
    const statusLine = this.describePlayerStatus(snapshot);

    return {
      content: statusLine ? `${content}\n${statusLine}` : content,
      components
    };
  }

  private parseQueueNavigationPage(customId: string): number {
    if (!customId.startsWith(`${QUEUE_NAVIGATION_BUTTON_PREFIX}:`)) {
      return 1;
    }

    const segments = customId.split(":");
    const page = Number.parseInt(segments[segments.length - 1] ?? "", 10);
    return Number.isInteger(page) && page > 0 ? page : 1;
  }

  private describePlayerStatus(snapshot: GuildPlayerSnapshot | null): string | null {
    if (!snapshot) {
      return null;
    }

    if (snapshot.currentTrack) {
      const queueSummary =
        snapshot.queueLength > 0 ? `Hàng chờ còn ${snapshot.queueLength} mục.` : "Hàng chờ hiện trống.";
      return `${snapshot.paused ? "Đang tạm dừng" : "Đang phát"}: **${snapshot.currentTrack.title}** (${snapshot.currentTrack.durationLabel}). ${queueSummary}`;
    }

    if (snapshot.voiceChannelId) {
      return "Bot đang ở trong voice channel nhưng chưa có track nào được phát.";
    }

    return null;
  }

  private async getSystemConfigCached(forceRefresh = false): Promise<SystemConfig> {
    if (!this.systemConfigCache || forceRefresh) {
      this.systemConfigCache = await getSystemConfig(this.prisma);
    }

    return this.systemConfigCache;
  }

  private startPresenceLoop(): void {
    if (this.presenceIntervalId) {
      clearInterval(this.presenceIntervalId);
    }

    this.presenceIntervalId = setInterval(() => {
      void this.refreshPresence();
    }, 15_000);

    void this.refreshPresence();
  }

  private async refreshPresence(): Promise<void> {
    if (!this.client.isReady() || !this.client.user) {
      return;
    }

    const playingSession = this.musicManager
      .getServiceStatus()
      .sessions.find((session) => typeof session.currentTrack === "string" && session.currentTrack.trim().length > 0);

    if (playingSession?.currentTrack) {
      this.client.user.setPresence({
        activities: [
          {
            name: this.truncatePresenceText(playingSession.currentTrack),
            type: ActivityType.Listening
          }
        ],
        status: "online"
      });
      return;
    }

    const systemConfig = await this.getSystemConfigCached();
    this.client.user.setPresence({
      activities: [
        {
          name: this.truncatePresenceText(this.resolveIdlePresenceText(systemConfig)),
          type: ActivityType.Watching
        }
      ],
      status: "online"
    });
  }

  private resolveIdlePresenceText(systemConfig: SystemConfig): string {
    const currentHour = getGmt7DateParts(new Date()).hour;

    if (currentHour >= 5 && currentHour < 11) {
      return systemConfig.idleMorningText || env.BOT_PRESENCE_TEXT;
    }

    if (currentHour >= 11 && currentHour < 17) {
      return systemConfig.idleNoonText || env.BOT_PRESENCE_TEXT;
    }

    if (currentHour >= 17 && currentHour < 22) {
      return systemConfig.idleEveningText || env.BOT_PRESENCE_TEXT;
    }

    return systemConfig.idleNightText || env.BOT_PRESENCE_TEXT;
  }

  private truncatePresenceText(value: string): string {
    return value.trim().slice(0, 120) || env.BOT_PRESENCE_TEXT;
  }

  private truncateForComponent(value: string, maxLength: number): string {
    const normalized = value.trim();
    if (normalized.length <= maxLength) {
      return normalized;
    }

    return `${normalized.slice(0, maxLength - 3)}...`;
  }

  private async registerSlashCommands(applicationId: string): Promise<void> {
    const rest = new REST({ version: "10" }).setToken(env.DISCORD_TOKEN!);

    if (env.DISCORD_COMMAND_GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(applicationId, env.DISCORD_COMMAND_GUILD_ID), {
        body: slashCommands
      });
      console.info(`[bot] registered guild commands for ${env.DISCORD_COMMAND_GUILD_ID}`);
      return;
    }

    await rest.put(Routes.applicationCommands(applicationId), { body: slashCommands });
    console.info("[bot] registered global commands");
  }

  private async handleChannelLifecycle(
    action: string,
    channel: Channel,
    title: string,
    auditType: AuditLogEvent.ChannelCreate | AuditLogEvent.ChannelDelete
  ): Promise<void> {
    if (!this.isGuildChannel(channel)) return;
    if (!(await this.isGuildBotEnabled(channel.guild.id, channel.guild.name))) return;

    const actor = await this.fetchAuditActor(channel.guild, auditType, channel.id);
    const actorText = actor?.executorTag ?? actor?.executorId ?? "không rõ";
    const message = `${title} bởi ${actorText}: ${this.channelLabel(channel)} (${ChannelType[channel.type]}).`;

    await this.persistAndForwardLog({
      guild: channel.guild,
      action,
      message,
      channelId: channel.id,
      userId: actor?.executorId ?? null,
      targetId: channel.id,
      metadata: {
        channelName: channel.name,
        channelType: ChannelType[channel.type],
        parentId: channel.parentId
      }
    });
  }

  private async fetchAuditActor(
    guild: Guild,
    type: AuditLogEvent.ChannelCreate | AuditLogEvent.ChannelDelete | AuditLogEvent.ChannelUpdate,
    targetId: string
  ): Promise<AuditActor | null> {
    if (!guild.members.me?.permissions.has(PermissionFlagsBits.ViewAuditLog)) return null;

    try {
      const logs = await guild.fetchAuditLogs({ type, limit: 6 });
      const match = logs.entries.find((entry) => entry.target?.id === targetId && Date.now() - entry.createdTimestamp < 15_000);
      if (!match) return null;

      return {
        executorId: match.executor?.id ?? null,
        executorTag: match.executor?.tag ?? null
      };
    } catch (error) {
      console.error(`[bot] failed to fetch audit log for guild ${guild.id}`, error);
      return null;
    }
  }

  private async persistAndForwardLog(input: {
    guild: Guild;
    action: string;
    message: string;
    channelId?: string | null;
    userId?: string | null;
    targetId?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const guildConfig = await upsertGuildConfig(this.prisma, input.guild.id, input.guild.name);
    if (!guildConfig.botEnabled) {
      return;
    }

    await createLogRecord(this.prisma, {
      guildId: input.guild.id,
      guildName: input.guild.name,
      action: input.action,
      message: input.message,
      channelId: input.channelId,
      userId: input.userId,
      targetId: input.targetId,
      metadata: input.metadata as Prisma.InputJsonValue | undefined
    });

    if (!guildConfig.logChannelId) return;

    try {
      const channel = await input.guild.channels.fetch(guildConfig.logChannelId);
      if (!channel || !channel.isTextBased()) return;

      const embed = new EmbedBuilder()
        .setTitle(input.action)
        .setDescription(input.message)
        .setColor(0x0f766e)
        .addFields(
          { name: "Guild", value: input.guild.name, inline: true },
          { name: "Thời gian", value: formatDateTime(new Date()), inline: true }
        )
        .setFooter({ text: "discord-bot-admin" });

      await (channel as GuildTextBasedChannel).send({ embeds: [embed] });
    } catch (error) {
      console.error(`[bot] failed to forward log message for guild ${input.guild.id}`, error);
    }
  }

  private runAsyncTask(label: string, task: () => Promise<void>): void {
    void task().catch((error) => {
      console.error(`[bot] ${label} failed`, error);
    });
  }

  private isGuildChannel(channel: Channel): channel is GuildBasedChannel {
    return "guild" in channel;
  }

  private channelLabel(channel: GuildBasedChannel): string {
    return channel.type === ChannelType.GuildText ? `<#${channel.id}>` : `${channel.name} (${channel.id})`;
  }

  private async isGuildBotEnabled(guildId: string, guildName: string): Promise<boolean> {
    const guildConfig = await upsertGuildConfig(this.prisma, guildId, guildName);
    return guildConfig.botEnabled;
  }

  private async replyGuildDisabled(
    interaction: ChatInputCommandInteraction | StringSelectMenuInteraction | ButtonInteraction
  ): Promise<void> {
    await interaction.reply({
      content: DISABLED_GUILD_MESSAGE,
      flags: MessageFlags.Ephemeral
    });
  }
}
