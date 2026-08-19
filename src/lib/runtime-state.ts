export type BotStatusSnapshot = {
  enabled: boolean;
  ready: boolean;
  guildCount: number;
  pingMs: number | null;
  uptimeSeconds: number;
  currentUserTag: string | null;
  music: {
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
};

export type BotStatusProvider = {
  getStatus(): BotStatusSnapshot;
};

export type BotRuntimeControl = {
  syncGuildSettings(guildId: string): Promise<void>;
  syncSystemSettings(): Promise<void>;
  syncScheduledMessage(scheduleId: string): Promise<void>;
  removeScheduledMessage(scheduleId: string): Promise<void>;
};

declare global {
  var __discordBotStatusProvider__: BotStatusProvider | undefined;
  var __discordBotRuntimeControl__: BotRuntimeControl | undefined;
  var __discordBotStartedAt__: number | undefined;
}

const fallbackStatusProvider: BotStatusProvider = {
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

export function setBotStatusProvider(provider: BotStatusProvider): void {
  globalThis.__discordBotStatusProvider__ = provider;
}

export function setBotRuntimeControl(control: BotRuntimeControl | undefined): void {
  globalThis.__discordBotRuntimeControl__ = control;
}

export function getBotStatusSnapshot(): BotStatusSnapshot {
  return (globalThis.__discordBotStatusProvider__ ?? fallbackStatusProvider).getStatus();
}

export function getBotRuntimeControl(): BotRuntimeControl | undefined {
  return globalThis.__discordBotRuntimeControl__;
}

export function markRuntimeStarted(): void {
  globalThis.__discordBotStartedAt__ = Date.now();
}

export function getRuntimeStartedAt(): number {
  return globalThis.__discordBotStartedAt__ ?? Date.now();
}
