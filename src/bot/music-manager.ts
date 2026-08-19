import { setTimeout as sleep } from "node:timers/promises";
import { GatewayOpcodes, type GatewayVoiceServerUpdateDispatchData, type GatewayVoiceStateUpdateData } from "discord-api-types/v10";
import type { PrismaClient } from "@prisma/client";
import {
  ChannelType,
  GuildMember,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type Client,
  type Guild,
  type VoiceBasedChannel,
  type VoiceState
} from "discord.js";

import { env } from "../config/env";
import { LavalinkClient, LavalinkRequestError, type LavalinkTrack } from "./lavalink-client";

export type MusicTrack = {
  encoded: string;
  identifier: string;
  title: string;
  author: string;
  url: string | null;
  durationMs: number;
  durationLabel: string;
  sourceName: string;
  isStream: boolean;
  requestedById: string;
  requestedByName: string;
};

export type MusicSearchResults = {
  loadType: "track" | "search" | "playlist" | "empty" | "error";
  playlistName: string | null;
  tracks: MusicTrack[];
};

type MusicLookupResult = MusicSearchResults & {
  selectedTrackIndex: number | null;
};

type PlaybackRequest = {
  loadType: MusicLookupResult["loadType"];
  playlistName: string | null;
  tracks: MusicTrack[];
  selectedTrackIndex: number | null;
  truncatedTrackCount: number;
};

type EnqueueTracksResult = {
  firstTrack: MusicTrack;
  queuePosition: number;
  startedPlayback: boolean;
  addedCount: number;
  snapshot: GuildPlayerSnapshot;
};

export type GuildPlayerSnapshot = {
  guildId: string;
  textChannelId: string | null;
  voiceChannelId: string | null;
  volume: number;
  paused: boolean;
  queueLength: number;
  currentTrack: MusicTrack | null;
};

export type GuildQueuePage = {
  page: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
  currentTrack: MusicTrack | null;
  paused: boolean;
  upcomingTracks: MusicTrack[];
};

type GuildMusicState = {
  guildId: string;
  queue: MusicTrack[];
  currentTrack: MusicTrack | null;
  textChannelId: string | null;
  currentVoiceChannelId: string | null;
  volume: number;
  paused: boolean;
  voice: {
    channelId: string | null;
    endpoint: string | null;
    token: string | null;
    sessionId: string | null;
    requestedAt: number | null;
    stateUpdatedAt: number | null;
    serverUpdatedAt: number | null;
  };
  player: {
    connected: boolean;
    ping: number | null;
    positionMs: number;
    updatedAt: number | null;
  };
  lastFailureTrackEncoded: string | null;
};

export type MusicServiceStatus = {
  backend: "lavalink";
  configured: boolean;
  connected: boolean;
  resumed: boolean;
  sessionId: string | null;
  nodeHost: string;
  nodeVersion: string | null;
  sources: string[];
  plugins: string[];
  lavalinkPlayers: number;
  lavalinkPlayingPlayers: number;
  activeGuilds: number;
  queuedTracks: number;
  activeTracks: number;
  uptimeMs: number | null;
  lastError: string | null;
  sessions: Array<{
    guildId: string;
    voiceChannelId: string | null;
    queueLength: number;
    connected: boolean;
    ping: number | null;
    currentTrack: string | null;
  }>;
};

const VOICE_WAIT_TIMEOUT_MS = 30_000;
const VOICE_WAIT_POLL_MS = 200;
const VOICE_REQUEST_RETRY_MS = 4_000;

export class MusicManager {
  private readonly prisma: PrismaClient;
  private readonly client: Client;
  private readonly states = new Map<string, GuildMusicState>();
  private readonly lavalink: LavalinkClient;

  public constructor(prisma: PrismaClient, client: Client) {
    this.prisma = prisma;
    this.client = client;
    this.lavalink = new LavalinkClient({
      url: env.LAVALINK_URL!,
      password: env.LAVALINK_PASSWORD!,
      clientName: env.LAVALINK_CLIENT_NAME,
      resumeTimeoutSeconds: env.LAVALINK_RESUME_TIMEOUT_SECONDS,
      callbacks: {
        onReady: (resumed) => this.restorePlayersAfterReconnect(resumed),
        onPlayerUpdate: (guildId, player) => this.handlePlayerUpdate(guildId, player),
        onTrackStart: (guildId, track) => this.handleTrackStart(guildId, track),
        onTrackEnd: (guildId, track, reason) => this.handleTrackEnd(guildId, track, reason),
        onTrackException: (guildId, track, exception) => this.handleTrackException(guildId, track, exception),
        onTrackStuck: (guildId, track, thresholdMs) => this.handleTrackStuck(guildId, track, thresholdMs),
        onWebSocketClosed: (guildId, code, reason) => this.handleVoiceGatewayClosed(guildId, code, reason)
      }
    });
  }

  public async start(userId: string): Promise<void> {
    await this.lavalink.start(userId);
  }

  public async stop(): Promise<void> {
    for (const guildId of [...this.states.keys()]) {
      await this.destroyState(guildId, false);
    }

    await this.lavalink.stop();
  }

  public async handlePlay(interaction: ChatInputCommandInteraction): Promise<string> {
    const query = interaction.options.getString("query", true).trim();
    const member = interaction.member;

    if (!(member instanceof GuildMember)) {
      return "Lệnh này chỉ có thể dùng bên trong một guild.";
    }

    const voiceChannel = member.voice.channel;
    if (!voiceChannel) {
      return "Hãy vào một voice channel trước khi dùng `/play`.";
    }

    const playback = await this.resolvePlaybackRequest(query, interaction.user.id, interaction.user.username);
    const result = await this.enqueueTracks({
      guildId: interaction.guildId!,
      voiceChannel,
      textChannelId: interaction.channelId,
      tracks: playback.tracks
    });

    if (playback.loadType === "playlist") {
      console.info("[music] queued playlist", {
        guildId: interaction.guildId,
        playlistName: playback.playlistName,
        addedCount: result.addedCount,
        queuePosition: result.queuePosition,
        startedPlayback: result.startedPlayback,
        selectedTrackIndex: playback.selectedTrackIndex,
        truncatedTrackCount: playback.truncatedTrackCount,
        requestedById: interaction.user.id
      });

      return this.formatPlaylistEnqueueMessage(playback, result);
    }

    return this.formatSingleTrackEnqueueMessage(result.firstTrack, result.queuePosition, result.startedPlayback);
  }

  public async searchTracks(
    query: string,
    requestedById: string,
    requestedByName: string,
    limit = 10
  ): Promise<MusicSearchResults> {
    const lookup = await this.lookupTracks(
      `ytsearch:${query.trim().replace(/^[a-z]+search:\s*/i, "")}`,
      requestedById,
      requestedByName
    );

    return {
      loadType: lookup.loadType,
      playlistName: lookup.playlistName,
      tracks: lookup.tracks.slice(0, Math.max(1, limit))
    };
  }

  public async enqueueTrack(input: {
    guildId: string;
    voiceChannel: VoiceBasedChannel;
    textChannelId: string | null;
    track: MusicTrack;
  }): Promise<{
    message: string;
    queuePosition: number;
    startedPlayback: boolean;
    snapshot: GuildPlayerSnapshot;
  }> {
    const result = await this.enqueueTracks({
      guildId: input.guildId,
      voiceChannel: input.voiceChannel,
      textChannelId: input.textChannelId,
      tracks: [input.track]
    });

    return {
      message: this.formatSingleTrackEnqueueMessage(result.firstTrack, result.queuePosition, result.startedPlayback),
      queuePosition: result.queuePosition,
      startedPlayback: result.startedPlayback,
      snapshot: result.snapshot
    };
  }

  public async handleSummon(interaction: ChatInputCommandInteraction): Promise<string> {
    const member = interaction.member;

    if (!(member instanceof GuildMember)) {
      return "Lệnh này chỉ có thể dùng bên trong một guild.";
    }

    const requestedChannel = interaction.options.getChannel("channel");
    const voiceChannel =
      requestedChannel && this.isVoiceChannel(requestedChannel)
        ? requestedChannel
        : member.voice.channel;

    if (!voiceChannel) {
      return "Hãy vào một voice channel trước hoặc truyền vào voice channel đích.";
    }

    const state = await this.ensureJoined(interaction.guildId!, voiceChannel, interaction.channelId);
    return `Đã vào **${voiceChannel.name}** qua Lavalink. Âm lượng hiện tại: ${state.volume}%.`;
  }

  public async handlePause(interaction: ChatInputCommandInteraction): Promise<string> {
    return this.pauseGuild(interaction.guildId!);
  }

  public async handleResume(interaction: ChatInputCommandInteraction): Promise<string> {
    return this.resumeGuild(interaction.guildId!);
  }

  public async handleLeave(interaction: ChatInputCommandInteraction): Promise<string> {
    return this.leaveGuild(interaction.guildId!);
  }

  public async handleQueue(interaction: ChatInputCommandInteraction, pageSize = 10): Promise<string> {
    return this.describeQueue(interaction.guildId!, 1, pageSize);
  }

  public async handleSkip(interaction: ChatInputCommandInteraction): Promise<string> {
    const position = interaction.options.getInteger("position");
    const skipAll = interaction.options.getBoolean("all") ?? false;

    if (skipAll && position !== null) {
      return "Hãy chọn một trong hai: bỏ qua theo số thứ tự hoặc bỏ qua toàn bộ.";
    }

    return this.skipSelection(interaction.guildId!, {
      position,
      skipAll
    });
  }

  public async handleVolume(interaction: ChatInputCommandInteraction): Promise<string> {
    const nextVolume = interaction.options.getInteger("value", true);
    const state = this.states.get(interaction.guildId!);

    await this.prisma.guildConfig.update({
      where: { guildId: interaction.guildId! },
      data: { musicVolume: nextVolume }
    });

    if (!state) {
      return `Đã lưu âm lượng mặc định là ${nextVolume}%. Hãy vào voice hoặc queue music để áp dụng.`;
    }

    state.volume = nextVolume;
    await this.lavalink.updatePlayer(interaction.guildId!, {
      volume: nextVolume
    });

    return `Đã đặt âm lượng thành ${nextVolume}%.`;
  }

  public async pauseGuild(guildId: string): Promise<string> {
    const state = this.states.get(guildId);
    if (!state || !state.currentTrack) {
      return "Hiện chưa có track nào đang phát.";
    }

    state.paused = true;
    await this.lavalink.updatePlayer(guildId, {
      paused: true
    });

    return "Đã tạm dừng playback.";
  }

  public async resumeGuild(guildId: string): Promise<string> {
    const state = this.states.get(guildId);
    if (!state || !state.currentTrack) {
      return "Hiện chưa có track nào đang phát.";
    }

    state.paused = false;
    await this.lavalink.updatePlayer(guildId, {
      paused: false
    });

    return "Đã tiếp tục playback.";
  }

  public async togglePauseGuild(guildId: string): Promise<string> {
    const state = this.states.get(guildId);
    if (!state || !state.currentTrack) {
      return "Hiện chưa có track nào đang phát.";
    }

    return state.paused ? this.resumeGuild(guildId) : this.pauseGuild(guildId);
  }

  public async leaveGuild(guildId: string): Promise<string> {
    const state = this.states.get(guildId);
    if (!state) {
      return "Bot hiện chưa kết nối voice trong server này.";
    }

    await this.destroyState(guildId, true);
    return "Đã ngắt kết nối voice và xóa hàng chờ.";
  }

  public async skipGuild(guildId: string): Promise<string> {
    return this.skipSelection(guildId, {});
  }

  public async skipSelection(
    guildId: string,
    options: {
      position?: number | null;
      skipAll?: boolean;
    }
  ): Promise<string> {
    const state = this.states.get(guildId);
    if (!state || (!state.currentTrack && state.queue.length === 0)) {
      return "Hiện chưa có track hoặc hàng chờ nào khả dụng.";
    }

    if (options.skipAll) {
      const removedCurrent = state.currentTrack;
      const removedQueued = state.queue.length;

      state.queue = [];
      state.currentTrack = null;
      state.paused = false;
      state.player.positionMs = 0;
      state.lastFailureTrackEncoded = null;

      await this.lavalink.updatePlayer(guildId, {
        track: {
          encoded: null
        },
        paused: false
      });

      if (removedCurrent) {
        return `Đã bỏ qua **${removedCurrent.title}** và xóa thêm ${removedQueued} mục còn lại trong hàng chờ.`;
      }

      return `Đã xóa toàn bộ ${removedQueued} mục trong hàng chờ.`;
    }

    if (options.position !== null && options.position !== undefined) {
      const normalizedPosition = Math.floor(options.position);
      if (!Number.isInteger(normalizedPosition) || normalizedPosition < 1) {
        return "Số thứ tự cần là số nguyên dương, bắt đầu từ 1 trong danh sách hàng chờ.";
      }

      const removedTrack = state.queue[normalizedPosition - 1];
      if (!removedTrack) {
        return `Không tìm thấy mục số ${normalizedPosition} trong hàng chờ hiện tại.`;
      }

      state.queue.splice(normalizedPosition - 1, 1);
      return `Đã bỏ mục số ${normalizedPosition}: **${removedTrack.title}** (${removedTrack.durationLabel}) do ${removedTrack.requestedByName} yêu cầu.`;
    }

    if (!state.currentTrack) {
      return "Hiện chưa có track nào đang phát. Hãy dùng tùy chọn số thứ tự để bỏ mục trong hàng chờ.";
    }

    const currentTrack = state.currentTrack;
    const nextTrack = state.queue[0] ?? null;

    if (nextTrack) {
      await this.lavalink.updatePlayer(guildId, {
        track: {
          encoded: nextTrack.encoded,
          userData: {
            requestedById: nextTrack.requestedById,
            requestedByName: nextTrack.requestedByName
          }
        },
        volume: state.volume,
        paused: false
      });

      state.queue.shift();
      state.currentTrack = nextTrack;
      state.paused = false;
      state.player.positionMs = 0;
      state.lastFailureTrackEncoded = null;

      return `Đã bỏ qua **${currentTrack.title}**. Đang chuyển sang **${nextTrack.title}**.`;
    }

    await this.lavalink.updatePlayer(guildId, {
      track: {
        encoded: null
      },
      paused: false
    });

    state.currentTrack = null;
    state.paused = false;
    state.player.positionMs = 0;
    state.lastFailureTrackEncoded = null;

    return `Đã bỏ qua **${currentTrack.title}**. Hàng chờ hiện không còn mục nào.`;
  }

  public getQueuePage(guildId: string, page: number, pageSize: number): GuildQueuePage | null {
    const state = this.states.get(guildId);
    if (!state || (!state.currentTrack && state.queue.length === 0)) {
      return null;
    }

    const normalizedPageSize = Math.min(Math.max(Math.floor(pageSize) || 10, 5), 25);
    const totalItems = state.queue.length;
    const totalPages = Math.max(1, Math.ceil(Math.max(totalItems, 1) / normalizedPageSize));
    const normalizedPage = Math.min(Math.max(Math.floor(page) || 1, 1), totalPages);
    const offset = (normalizedPage - 1) * normalizedPageSize;

    return {
      page: normalizedPage,
      totalPages,
      pageSize: normalizedPageSize,
      totalItems,
      currentTrack: state.currentTrack ? { ...state.currentTrack } : null,
      paused: state.paused,
      upcomingTracks: state.queue.slice(offset, offset + normalizedPageSize).map((track) => ({ ...track }))
    };
  }

  public describeQueue(guildId: string, page = 1, pageSize = 10): string {
    const queuePage = this.getQueuePage(guildId, page, pageSize);
    if (!queuePage) {
      return "Hàng chờ hiện đang trống.";
    }

    const lines: string[] = [];
    if (queuePage.currentTrack) {
      lines.push(
        `${queuePage.paused ? "Đang tạm dừng" : "Đang phát"}: **${queuePage.currentTrack.title}** (${queuePage.currentTrack.durationLabel}) · yêu cầu bởi ${queuePage.currentTrack.requestedByName}`
      );
    } else {
      lines.push("Hiện chưa có track đang phát.");
    }

    if (queuePage.totalItems === 0) {
      lines.push("Hàng chờ kế tiếp hiện đang trống.");
      return lines.join("\n");
    }

    lines.push(
      `Trang ${queuePage.page}/${queuePage.totalPages} · ${queuePage.totalItems} mục trong hàng chờ kế tiếp.`
    );
    lines.push(
      ...queuePage.upcomingTracks.map((track, index) => {
        const absoluteIndex = (queuePage.page - 1) * queuePage.pageSize + index + 1;
        return `${absoluteIndex}. ${track.title} (${track.durationLabel}) · ${track.author} · yêu cầu bởi ${track.requestedByName}`;
      })
    );

    return lines.join("\n");
  }

  public getPlayerSnapshot(guildId: string): GuildPlayerSnapshot | null {
    const state = this.states.get(guildId);
    if (!state) {
      return null;
    }

    this.hydrateBotVoiceCache(state);
    return this.createSnapshot(state);
  }

  public getBotVoiceChannelId(guildId: string): string | null {
    return this.getBotVoiceSnapshot(guildId).channelId;
  }

  public async handleBotVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): Promise<void> {
    const guildId = newState.guild.id;
    const state = this.states.get(guildId);
    this.logVoiceDebug(state ?? guildId, "bot VoiceStateUpdate", {
      oldChannelId: oldState.channelId ?? null,
      newChannelId: newState.channelId ?? null,
      oldSessionId: this.summarizeSessionId(oldState.sessionId ?? null),
      newSessionId: this.summarizeSessionId(newState.sessionId ?? null),
      hasTrackedState: Boolean(state)
    });

    if (!state) {
      return;
    }

    if (!newState.channelId) {
      const recentlyRequested = state.voice.requestedAt !== null && Date.now() - state.voice.requestedAt < VOICE_WAIT_TIMEOUT_MS;

      if (recentlyRequested) {
        this.logVoiceDebug(state, "bot VoiceStateUpdate ignore disconnect during pending join", {
          oldChannelId: oldState.channelId ?? null,
          newChannelId: null
        });
        return;
      }

      await this.notifyTextChannel(
        state,
        "Kết nối voice của bot đã bị ngắt. Hãy dùng `/play` hoặc `/join` sau khi vào lại voice channel."
      );
      await this.destroyState(guildId, false);
      return;
    }

    const channelChanged = oldState.channelId !== newState.channelId;
    const preserveLatestServerUpdate =
      state.voice.requestedAt !== null &&
      state.voice.serverUpdatedAt !== null &&
      state.voice.serverUpdatedAt >= state.voice.requestedAt;

    if (channelChanged && !preserveLatestServerUpdate) {
      state.voice.endpoint = null;
      state.voice.token = null;
      state.voice.serverUpdatedAt = null;
    }

    state.currentVoiceChannelId = newState.channelId;
    state.voice.channelId = newState.channelId;
    state.voice.sessionId = newState.sessionId ?? oldState.sessionId ?? state.voice.sessionId;
    state.voice.stateUpdatedAt = Date.now();

    if (this.canSyncVoiceState(state)) {
      await this.syncVoiceState(state, "bot VoiceStateUpdate");
    }
  }

  public async handleVoiceServerUpdate(payload: GatewayVoiceServerUpdateDispatchData): Promise<void> {
    const state = this.states.get(payload.guild_id);
    this.logVoiceDebug(state ?? payload.guild_id, "VoiceServerUpdate", {
      endpoint: payload.endpoint ?? null,
      tokenPresent: Boolean(payload.token),
      hasTrackedState: Boolean(state)
    });

    if (!state) {
      return;
    }

    state.voice.endpoint = payload.endpoint ?? null;
    state.voice.token = payload.token;
    state.voice.serverUpdatedAt = Date.now();

    if (this.canSyncVoiceState(state)) {
      await this.syncVoiceState(state, "VoiceServerUpdate");
    }
  }

  public getServiceStatus(): MusicServiceStatus {
    const nodeStatus = this.lavalink.getStatus();
    const sessions = [...this.states.values()]
      .map((state) => ({
        guildId: state.guildId,
        voiceChannelId: state.currentVoiceChannelId,
        queueLength: state.queue.length,
        connected: state.player.connected,
        ping: state.player.ping,
        currentTrack: state.currentTrack?.title ?? null
      }))
      .sort((left, right) => {
        const leftScore = Number(Boolean(left.currentTrack)) + Number(left.queueLength > 0);
        const rightScore = Number(Boolean(right.currentTrack)) + Number(right.queueLength > 0);
        return rightScore - leftScore;
      })
      .slice(0, 8);

    return {
      backend: "lavalink",
      configured: nodeStatus.configured,
      connected: nodeStatus.connected,
      resumed: nodeStatus.resumed,
      sessionId: nodeStatus.sessionId,
      nodeHost: nodeStatus.host,
      nodeVersion: nodeStatus.version,
      sources: nodeStatus.sources,
      plugins: nodeStatus.plugins,
      lavalinkPlayers: nodeStatus.stats.players,
      lavalinkPlayingPlayers: nodeStatus.stats.playingPlayers,
      activeGuilds: [...this.states.values()].filter((state) => Boolean(state.currentVoiceChannelId)).length,
      queuedTracks: [...this.states.values()].reduce((total, state) => total + state.queue.length, 0),
      activeTracks: [...this.states.values()].filter((state) => Boolean(state.currentTrack)).length,
      uptimeMs: nodeStatus.stats.uptime || null,
      lastError: nodeStatus.lastError,
      sessions
    };
  }

  private getOrCreateState(guildId: string, volume: number): GuildMusicState {
    const existing = this.states.get(guildId);
    if (existing) {
      existing.volume = volume;
      return existing;
    }

    const state: GuildMusicState = {
      guildId,
      queue: [],
      currentTrack: null,
      textChannelId: null,
      currentVoiceChannelId: null,
      volume,
      paused: false,
      voice: {
        channelId: null,
        endpoint: null,
        token: null,
        sessionId: null,
        requestedAt: null,
        stateUpdatedAt: null,
        serverUpdatedAt: null
      },
      player: {
        connected: false,
        ping: null,
        positionMs: 0,
        updatedAt: null
      },
      lastFailureTrackEncoded: null
    };

    this.states.set(guildId, state);
    return state;
  }

  private async ensureJoined(
    guildId: string,
    voiceChannel: VoiceBasedChannel,
    textChannelId: string | null
  ): Promise<GuildMusicState> {
    await this.lavalink.waitUntilReady();

    const permissionError = this.getVoicePermissionError(voiceChannel);
    if (permissionError) {
      throw new Error(permissionError);
    }

    const guildConfig = await this.prisma.guildConfig.findUnique({
      where: { guildId },
      select: {
        botEnabled: true,
        musicVolume: true
      }
    });

    if (guildConfig && !guildConfig.botEnabled) {
      throw new Error("Bot hiện đang tắt cho guild này. Hãy bật lại trong trang Cấu hình guild của admin panel.");
    }

    const state = this.getOrCreateState(guildId, guildConfig?.musicVolume ?? 50);
    state.textChannelId = textChannelId ?? state.textChannelId;
    this.hydrateBotVoiceCache(state);

    const botMember = voiceChannel.guild.members.me;
    if (!botMember) {
      throw new Error("Bot chưa sẵn sàng trong server này.");
    }

    const shouldRequestVoiceConnection =
      botMember.voice.channelId !== voiceChannel.id || !this.hasCompleteVoiceState(state);

    state.currentVoiceChannelId = voiceChannel.id;
    state.voice.channelId = voiceChannel.id;

    if (shouldRequestVoiceConnection) {
      state.voice.endpoint = null;
      state.voice.token = null;
      state.voice.requestedAt = Date.now();
      state.voice.serverUpdatedAt = null;
      this.logVoiceDebug(state, "requestVoiceStateUpdate", {
        targetChannelId: voiceChannel.id,
        botChannelId: botMember.voice.channelId ?? null,
        hadCompleteVoiceState: this.hasCompleteVoiceState(state)
      });
      this.requestVoiceStateUpdate(voiceChannel.guild, voiceChannel.id);
    }

    await this.waitForVoiceState(state, voiceChannel.guild, voiceChannel.id);
    await this.syncVoiceState(state, "ensureJoined");
    return state;
  }

  private async playNext(state: GuildMusicState): Promise<void> {
    const nextTrack = state.queue.shift();
    if (!nextTrack) {
      state.currentTrack = null;
      state.player.positionMs = 0;
      return;
    }

    if (!this.hasCompleteVoiceState(state)) {
      throw new Error("Bot chưa nhận đủ voice state để gửi sang Lavalink.");
    }

    state.currentTrack = nextTrack;
    state.paused = false;
    state.player.positionMs = 0;
    state.lastFailureTrackEncoded = null;

    try {
      await this.lavalink.updatePlayer(state.guildId, {
        track: {
          encoded: nextTrack.encoded,
          userData: {
            requestedById: nextTrack.requestedById,
            requestedByName: nextTrack.requestedByName
          }
        },
        volume: state.volume,
        paused: false
      });
    } catch (error) {
      state.currentTrack = null;
      await this.notifyTextChannel(state, this.formatPlaybackFailure(nextTrack, error));
      await this.playNext(state);
    }
  }

  private async enqueueTracks(input: {
    guildId: string;
    voiceChannel: VoiceBasedChannel;
    textChannelId: string | null;
    tracks: MusicTrack[];
  }): Promise<EnqueueTracksResult> {
    const firstTrack = input.tracks[0];
    if (!firstTrack) {
      throw new Error("Không có track nào khả dụng để đưa vào hàng chờ.");
    }

    const state = await this.ensureJoined(input.guildId, input.voiceChannel, input.textChannelId);
    const startedPlayback = !state.currentTrack && state.queue.length === 0;
    const queuePosition = state.queue.length + 1;

    state.queue.push(...input.tracks);

    if (startedPlayback || !state.currentTrack) {
      await this.playNext(state);
    }

    return {
      firstTrack,
      queuePosition,
      startedPlayback,
      addedCount: input.tracks.length,
      snapshot: this.createSnapshot(state)
    };
  }

  private async resolvePlaybackRequest(
    query: string,
    requestedById: string,
    requestedByName: string
  ): Promise<PlaybackRequest> {
    const lookup = await this.lookupTracks(query, requestedById, requestedByName);

    if (lookup.loadType !== "playlist") {
      const selectedTrack = lookup.tracks[lookup.selectedTrackIndex ?? 0] ?? lookup.tracks[0];

      if (!selectedTrack) {
        throw new Error("Lavalink không trả về track khả dụng.");
      }

      return {
        loadType: lookup.loadType,
        playlistName: lookup.playlistName,
        tracks: [selectedTrack],
        selectedTrackIndex: lookup.selectedTrackIndex,
        truncatedTrackCount: 0
      };
    }

    const orderedTracks = this.orderPlaylistTracks(lookup.tracks, lookup.selectedTrackIndex);

    if (orderedTracks.length === 0) {
      throw new Error("Playlist không có track khả dụng để thêm vào hàng chờ.");
    }

    return {
      loadType: lookup.loadType,
      playlistName: lookup.playlistName,
      tracks: orderedTracks.slice(0, env.MUSIC_PLAYLIST_MAX_ITEMS),
      selectedTrackIndex: lookup.selectedTrackIndex,
      truncatedTrackCount: Math.max(0, orderedTracks.length - env.MUSIC_PLAYLIST_MAX_ITEMS)
    };
  }

  private async lookupTracks(
    query: string,
    requestedById: string,
    requestedByName: string
  ): Promise<MusicLookupResult> {
    try {
      const result = await this.lavalink.search(query);

      if (result.tracks.length === 0) {
        throw new Error("Không tìm thấy kết quả nào phù hợp trên source đã cấu hình.");
      }

      const selectedTrackIndex =
        result.loadType === "playlist" && result.selectedTrackIndex !== null && result.selectedTrackIndex >= 0
          ? result.selectedTrackIndex
          : null;

      return {
        loadType: result.loadType,
        playlistName: result.playlistName,
        selectedTrackIndex,
        tracks: result.tracks.map((track) => this.toTrack(track, requestedById, requestedByName))
      };
    } catch (error) {
      throw new Error(this.describeLookupError(error));
    }
  }

  private orderPlaylistTracks(tracks: MusicTrack[], selectedTrackIndex: number | null): MusicTrack[] {
    if (selectedTrackIndex === null || selectedTrackIndex <= 0 || selectedTrackIndex >= tracks.length) {
      return tracks;
    }

    // Nếu URL playlist đã chỉ vào một mục cụ thể, bắt đầu phát từ mục đó nhưng vẫn giữ toàn bộ playlist.
    return [...tracks.slice(selectedTrackIndex), ...tracks.slice(0, selectedTrackIndex)];
  }

  private createSnapshot(state: GuildMusicState): GuildPlayerSnapshot {
    return {
      guildId: state.guildId,
      textChannelId: state.textChannelId,
      voiceChannelId: state.currentVoiceChannelId,
      volume: state.volume,
      paused: state.paused,
      queueLength: state.queue.length,
      currentTrack: state.currentTrack ? { ...state.currentTrack } : null
    };
  }

  private async syncVoiceState(state: GuildMusicState, reason: string): Promise<void> {
    this.hydrateBotVoiceCache(state);

    if (!this.hasCompleteVoiceState(state)) {
      this.logVoiceDebug(state, "syncVoiceState skip", {
        reason,
        missing: this.getMissingVoicePieces(state)
      });
      return;
    }

    const botVoice = this.getBotVoiceSnapshot(state.guildId);
    if (botVoice.channelId !== state.voice.channelId) {
      this.logVoiceDebug(state, "syncVoiceState skip", {
        reason,
        missing: this.getMissingVoicePieces(state),
        botChannelMismatch: true
      });
      return;
    }

    this.logVoiceDebug(state, "syncVoiceState send", {
      reason
    });
    await this.lavalink.updatePlayer(state.guildId, {
      voice: {
        channelId: state.voice.channelId!,
        endpoint: state.voice.endpoint!,
        token: state.voice.token!,
        sessionId: state.voice.sessionId!
      },
      volume: state.volume,
      paused: state.paused
    });
    state.voice.requestedAt = null;
    this.logVoiceDebug(state, "syncVoiceState sent", {
      reason
    });
  }

  private async waitForVoiceState(state: GuildMusicState, guild: Guild, expectedChannelId: string): Promise<void> {
    const startedAt = Date.now();
    let lastRequestAt = startedAt;

    this.logVoiceDebug(state, "waitForVoiceState start", {
      expectedChannelId
    });

    while (Date.now() - startedAt < VOICE_WAIT_TIMEOUT_MS) {
      this.hydrateBotVoiceCache(state);

      if (this.canSyncVoiceState(state) && state.voice.channelId === expectedChannelId) {
        this.logVoiceDebug(state, "waitForVoiceState resolved", {
          expectedChannelId,
          waitedMs: Date.now() - startedAt
        });
        return;
      }

      if (Date.now() - lastRequestAt >= VOICE_REQUEST_RETRY_MS) {
        this.logVoiceDebug(state, "waitForVoiceState retry", {
          expectedChannelId,
          waitedMs: Date.now() - startedAt,
          missing: this.getMissingVoicePieces(state)
        });
        state.voice.requestedAt = Date.now();
        this.requestVoiceStateUpdate(guild, expectedChannelId);
        lastRequestAt = Date.now();
      }

      await sleep(VOICE_WAIT_POLL_MS);
    }

    this.hydrateBotVoiceCache(state);
    this.logVoiceDebug(state, "waitForVoiceState timeout", {
      expectedChannelId,
      waitedMs: Date.now() - startedAt,
      missing: this.getMissingVoicePieces(state)
    });
    throw new Error("Discord chưa gửi đủ voice session/server update cho Lavalink. Hãy thử lại.");
  }

  private async restorePlayersAfterReconnect(resumed: boolean): Promise<void> {
    if (resumed) {
      return;
    }

    for (const state of this.states.values()) {
      try {
        this.hydrateBotVoiceCache(state);

        if (!this.hasCompleteVoiceState(state)) {
          continue;
        }

        await this.syncVoiceState(state, "restorePlayersAfterReconnect");

        if (state.currentTrack) {
          await this.lavalink.updatePlayer(state.guildId, {
            track: {
              encoded: state.currentTrack.encoded,
              userData: {
                requestedById: state.currentTrack.requestedById,
                requestedByName: state.currentTrack.requestedByName
              }
            },
            volume: state.volume,
            paused: state.paused
          });
          continue;
        }

        if (state.queue.length > 0) {
          await this.playNext(state);
        }
      } catch (error) {
        console.error(`[music] failed to restore player state for guild ${state.guildId}`, error);
      }
    }
  }

  private hydrateBotVoiceCache(state: GuildMusicState): void {
    const guild = this.client.guilds.cache.get(state.guildId);
    const botVoice = guild?.members.me?.voice;

    if (!botVoice?.channelId) {
      return;
    }

    state.currentVoiceChannelId = botVoice.channelId;
    state.voice.channelId = botVoice.channelId;
    state.voice.sessionId = botVoice.sessionId ?? state.voice.sessionId;
  }

  private async destroyState(guildId: string, disconnectVoice: boolean): Promise<void> {
    const state = this.states.get(guildId);
    if (!state) {
      return;
    }

    this.states.delete(guildId);

    try {
      await this.lavalink.destroyPlayer(guildId);
    } catch (error) {
      console.warn(`[music] failed to destroy lavalink player for guild ${guildId}`, error);
    }

    if (disconnectVoice) {
      const guild = this.client.guilds.cache.get(guildId);

      try {
        if (guild && (guild.members.me?.voice.channelId || state.currentVoiceChannelId)) {
          this.requestVoiceStateUpdate(guild, null);
        }
      } catch (error) {
        console.warn(`[music] failed to disconnect bot voice for guild ${guildId}`, error);
      }
    }
  }

  private async handlePlayerUpdate(
    guildId: string,
    player: { connected: boolean; ping: number; position: number; time: number }
  ): Promise<void> {
    const state = this.states.get(guildId);
    if (!state) {
      return;
    }

    state.player.connected = player.connected;
    state.player.ping = player.ping >= 0 ? player.ping : null;
    state.player.positionMs = Math.max(0, player.position);
    state.player.updatedAt = player.time;
  }

  private async handleTrackStart(guildId: string, rawTrack: LavalinkTrack): Promise<void> {
    const state = this.states.get(guildId);
    if (!state) {
      return;
    }

    const currentTrack = state.currentTrack;
    if (!currentTrack || currentTrack.encoded !== rawTrack.encoded) {
      state.currentTrack = this.toTrack(
        rawTrack,
        String(rawTrack.userData?.requestedById ?? "unknown"),
        String(rawTrack.userData?.requestedByName ?? "unknown")
      );
    }

    state.paused = false;
    state.player.positionMs = 0;

    if (state.currentTrack) {
      await this.notifyTextChannel(state, this.formatNowPlaying(state.currentTrack));
    }
  }

  private async handleTrackEnd(guildId: string, rawTrack: LavalinkTrack, reason: string): Promise<void> {
    const state = this.states.get(guildId);
    if (!state) {
      return;
    }

    if (reason === "replaced") {
      return;
    }

    const finishedTrack = state.currentTrack && this.tracksMatch(state.currentTrack, rawTrack) ? state.currentTrack : null;
    state.currentTrack = null;
    state.player.positionMs = 0;

    if (reason === "loadFailed" && finishedTrack) {
      if (state.lastFailureTrackEncoded !== finishedTrack.encoded) {
        await this.notifyTextChannel(state, this.formatPlaybackFailure(finishedTrack, "Lavalink báo loadFailed."));
      }

      state.lastFailureTrackEncoded = null;
    }

    if (reason === "cleanup") {
      return;
    }

    if (reason !== "loadFailed") {
      state.lastFailureTrackEncoded = null;
    }

    if (state.queue.length > 0) {
      await this.playNext(state);
    }
  }

  private async handleTrackException(
    guildId: string,
    rawTrack: LavalinkTrack,
    exception: { message: string; severity?: string; cause?: string }
  ): Promise<void> {
    const state = this.states.get(guildId);
    if (!state) {
      return;
    }

    const track =
      state.currentTrack && this.tracksMatch(state.currentTrack, rawTrack)
        ? state.currentTrack
        : this.toTrack(rawTrack, String(rawTrack.userData?.requestedById ?? "unknown"), String(rawTrack.userData?.requestedByName ?? "unknown"));

    state.lastFailureTrackEncoded = track.encoded;
    await this.notifyTextChannel(state, this.formatPlaybackFailure(track, exception.message));
  }

  private async handleTrackStuck(guildId: string, rawTrack: LavalinkTrack, thresholdMs: number): Promise<void> {
    const state = this.states.get(guildId);
    if (!state) {
      return;
    }

    const trackTitle = state.currentTrack?.title ?? rawTrack.info.title;
    await this.notifyTextChannel(
      state,
      `Track **${trackTitle}** đã bị kẹt hơn ${Math.round(thresholdMs / 1000)} giây. Lavalink sẽ tự xử lý hoặc chuyển tiếp event kết thúc nếu cần.`
    );
  }

  private async handleVoiceGatewayClosed(guildId: string, code: number, reason: string): Promise<void> {
    const state = this.states.get(guildId);
    if (!state) {
      return;
    }

    await this.notifyTextChannel(
      state,
      `Voice gateway cho guild này đã đóng (code ${code}${reason ? `, ${reason}` : ""}). Hãy dùng lại \`/join\` hoặc \`/play\` nếu playback không tự phục hồi.`
    );
  }

  private async notifyTextChannel(state: GuildMusicState, content: string): Promise<void> {
    if (!state.textChannelId) {
      return;
    }

    try {
      const channel = await this.client.channels.fetch(state.textChannelId);
      if (channel?.isTextBased() && "send" in channel && typeof channel.send === "function") {
        await channel.send(content);
      }
    } catch (error) {
      console.error(`[music] failed to send player update for guild ${state.guildId}`, error);
    }
  }

  private isVoiceChannel(channel: unknown): channel is VoiceBasedChannel {
    return (
      typeof channel === "object" &&
      channel !== null &&
      "isVoiceBased" in channel &&
      typeof channel.isVoiceBased === "function" &&
      channel.isVoiceBased()
    );
  }

  private getVoicePermissionError(voiceChannel: VoiceBasedChannel): string | null {
    const botMember = voiceChannel.guild.members.me;
    if (!botMember) {
      return "Bot chưa sẵn sàng trong server này. Hãy thử lại sau ít phút.";
    }

    const permissions = voiceChannel.permissionsFor(botMember);
    if (!permissions?.has(PermissionFlagsBits.ViewChannel) || !permissions.has(PermissionFlagsBits.Connect)) {
      return `Bot cần quyền View Channel và Connect cho **${voiceChannel.name}**.`;
    }

    if (voiceChannel.type !== ChannelType.GuildStageVoice && !permissions.has(PermissionFlagsBits.Speak)) {
      return `Bot cần quyền Speak cho **${voiceChannel.name}**.`;
    }

    return null;
  }

  private hasCompleteVoiceState(state: GuildMusicState): boolean {
    return Boolean(state.voice.channelId && state.voice.endpoint && state.voice.token && state.voice.sessionId);
  }

  private canSyncVoiceState(state: GuildMusicState): boolean {
    if (!this.hasCompleteVoiceState(state)) {
      return false;
    }

    const botVoice = this.getBotVoiceSnapshot(state.guildId);
    return Boolean(botVoice.channelId && botVoice.channelId === state.voice.channelId);
  }

  private requestVoiceStateUpdate(guild: Guild, channelId: string | null): void {
    const payload: GatewayVoiceStateUpdateData = {
      guild_id: guild.id,
      channel_id: channelId,
      self_mute: false,
      self_deaf: true
    };

    guild.shard.send(
      {
        op: GatewayOpcodes.VoiceStateUpdate,
        d: payload
      },
      true
    );
  }

  private getBotVoiceSnapshot(guildId: string): {
    channelId: string | null;
    sessionId: string | null;
  } {
    const guild = this.client.guilds.cache.get(guildId);
    const botVoice = guild?.members.me?.voice;

    return {
      channelId: botVoice?.channelId ?? null,
      sessionId: botVoice?.sessionId ?? null
    };
  }

  private getMissingVoicePieces(state: GuildMusicState): string[] {
    const missing: string[] = [];

    if (!state.voice.channelId) {
      missing.push("channelId");
    }

    if (!state.voice.sessionId) {
      missing.push("sessionId");
    }

    if (!state.voice.endpoint) {
      missing.push("endpoint");
    }

    if (!state.voice.token) {
      missing.push("token");
    }

    const botVoice = this.getBotVoiceSnapshot(state.guildId);
    if (!botVoice.channelId) {
      missing.push("botVoiceChannel");
    } else if (botVoice.channelId !== state.voice.channelId) {
      missing.push("botVoiceChannelMismatch");
    }

    return missing;
  }

  private summarizeSessionId(sessionId: string | null): string | null {
    if (!sessionId) {
      return null;
    }

    if (sessionId.length <= 12) {
      return sessionId;
    }

    return `${sessionId.slice(0, 6)}...${sessionId.slice(-4)}`;
  }

  private logVoiceDebug(stateOrGuildId: GuildMusicState | string, label: string, details: Record<string, unknown>): void {
    const guildId = typeof stateOrGuildId === "string" ? stateOrGuildId : stateOrGuildId.guildId;
    const state = typeof stateOrGuildId === "string" ? this.states.get(stateOrGuildId) ?? null : stateOrGuildId;
    const botVoice = this.getBotVoiceSnapshot(guildId);

    console.info(`[music][voice] ${label}`, {
      guildId,
      tracked: state
        ? {
            channelId: state.voice.channelId,
            sessionId: this.summarizeSessionId(state.voice.sessionId),
            endpoint: state.voice.endpoint,
            tokenPresent: Boolean(state.voice.token),
            requestedAt: state.voice.requestedAt,
            stateUpdatedAt: state.voice.stateUpdatedAt,
            serverUpdatedAt: state.voice.serverUpdatedAt
          }
        : null,
      bot: {
        channelId: botVoice.channelId,
        sessionId: this.summarizeSessionId(botVoice.sessionId)
      },
      ...details
    });
  }

  private toTrack(track: LavalinkTrack, requestedById: string, requestedByName: string): MusicTrack {
    return {
      encoded: track.encoded,
      identifier: track.info.identifier,
      title: track.info.title,
      author: track.info.author,
      url: track.info.uri ?? null,
      durationMs: track.info.length,
      durationLabel: formatTrackDuration(track.info.length, track.info.isStream),
      sourceName: track.info.sourceName,
      isStream: track.info.isStream,
      requestedById,
      requestedByName
    };
  }

  private formatNowPlaying(track: MusicTrack): string {
    return `Đang phát **${track.title}** (${track.durationLabel}), nguồn ${track.sourceName}, được yêu cầu bởi ${track.requestedByName}.`;
  }

  private formatSingleTrackEnqueueMessage(track: MusicTrack, queuePosition: number, startedPlayback: boolean): string {
    return startedPlayback
      ? `Đang phát **${track.title}** (${track.durationLabel}) qua Lavalink.`
      : `Đã thêm **${track.title}** (${track.durationLabel}) vào hàng chờ qua Lavalink. Vị trí: ${queuePosition}.`;
  }

  private formatPlaylistEnqueueMessage(playback: PlaybackRequest, result: EnqueueTracksResult): string {
    const playlistLabel = playback.playlistName?.trim() || result.firstTrack.title;
    const lines = [
      result.startedPlayback
        ? `Đã nạp playlist **${playlistLabel}** gồm ${result.addedCount} bài. Đang phát **${result.firstTrack.title}** (${result.firstTrack.durationLabel}).`
        : `Đã thêm playlist **${playlistLabel}** gồm ${result.addedCount} bài vào hàng chờ qua Lavalink. Vị trí bắt đầu: ${result.queuePosition}.`
    ];

    if (result.startedPlayback && result.snapshot.queueLength > 0) {
      lines.push(`Hàng chờ hiện còn ${result.snapshot.queueLength} bài sau track đang phát.`);
    }

    if (!result.startedPlayback) {
      lines.push(`Track đầu tiên của playlist là **${result.firstTrack.title}** (${result.firstTrack.durationLabel}).`);
    }

    if (playback.selectedTrackIndex !== null && playback.selectedTrackIndex > 0) {
      lines.push("URL playlist có mục được chọn sẵn, nên playback sẽ bắt đầu từ mục đó.");
    }

    if (playback.truncatedTrackCount > 0) {
      lines.push(
        `Giới hạn playlist hiện tại là ${env.MUSIC_PLAYLIST_MAX_ITEMS} bài; đã bỏ qua ${playback.truncatedTrackCount} bài còn lại.`
      );
    }

    return lines.join(" ");
  }

  private formatPlaybackFailure(track: MusicTrack, error: unknown): string {
    return `Hiện không thể phát **${track.title}**. ${this.describeLookupError(error)} Player sẽ tiếp tục với mục tiếp theo nếu có.`;
  }

  private describeLookupError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error ?? "Không rõ nguyên nhân.");
    const normalizedMessage = message.toLowerCase();

    if (error instanceof LavalinkRequestError && error.statusCode === 401) {
      return "Lavalink từ chối xác thực. Hãy kiểm tra `LAVALINK_PASSWORD`.";
    }

    if (
      normalizedMessage.includes("not find") ||
      normalizedMessage.includes("no matches") ||
      normalizedMessage.includes("không tìm thấy")
    ) {
      return "Không tìm thấy kết quả phù hợp.";
    }

    if (
      normalizedMessage.includes("source") &&
      (normalizedMessage.includes("disabled") || normalizedMessage.includes("not loaded"))
    ) {
      return "Lavalink chưa bật source/plugin cần thiết. Với YouTube, hãy cấu hình plugin nguồn trong Lavalink.";
    }

    if (normalizedMessage.includes("econnrefused") || normalizedMessage.includes("fetch failed")) {
      return "Không thể kết nối tới dịch vụ Lavalink. Hãy kiểm tra tiến trình Java, host, port và firewall.";
    }

    if (normalizedMessage.includes("timeout")) {
      return "Lavalink phản hồi quá chậm. Hãy kiểm tra tài nguyên VPS hoặc đường truyền tới node Lavalink.";
    }

    return message.endsWith(".") ? message : `${message}.`;
  }

  private tracksMatch(track: MusicTrack, rawTrack: LavalinkTrack): boolean {
    return track.encoded === rawTrack.encoded || track.identifier === rawTrack.info.identifier;
  }
}

function formatTrackDuration(lengthMs: number, isStream: boolean): string {
  if (isStream) {
    return "live";
  }

  const totalSeconds = Math.max(0, Math.floor(lengthMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
