import { setTimeout as sleep } from "node:timers/promises";

type LavalinkTrackInfo = {
  identifier: string;
  isSeekable: boolean;
  author: string;
  length: number;
  isStream: boolean;
  position: number;
  title: string;
  uri?: string | null;
  artworkUrl?: string | null;
  isrc?: string | null;
  sourceName: string;
};

export type LavalinkTrack = {
  encoded: string;
  info: LavalinkTrackInfo;
  pluginInfo?: Record<string, unknown>;
  userData?: Record<string, unknown>;
};

type LoadTracksResponse =
  | {
      loadType: "track" | "search";
      data: LavalinkTrack[];
    }
  | {
      loadType: "playlist";
      data: {
        info: {
          name: string;
          selectedTrack: number;
        };
        pluginInfo?: Record<string, unknown>;
        tracks: LavalinkTrack[];
      };
    }
  | {
      loadType: "empty";
      data: Record<string, never>;
    }
  | {
      loadType: "error";
      data: {
        message: string;
        severity?: string;
        cause?: string;
      };
    };

type LavalinkInfoResponse = {
  version?: {
    semver?: string;
  };
  sourceManagers?: string[];
  plugins?: Array<{ name?: string }>;
};

type LavalinkStatsPayload = {
  players: number;
  playingPlayers: number;
  uptime: number;
};

type LavalinkPlayerState = {
  connected: boolean;
  ping: number;
  position: number;
  time: number;
};

type LavalinkEventPayload =
  | {
      op: "event";
      type: "TrackStartEvent";
      guildId: string;
      track: LavalinkTrack;
    }
  | {
      op: "event";
      type: "TrackEndEvent";
      guildId: string;
      track: LavalinkTrack;
      reason: string;
    }
  | {
      op: "event";
      type: "TrackExceptionEvent";
      guildId: string;
      track: LavalinkTrack;
      exception: {
        message: string;
        severity?: string;
        cause?: string;
      };
    }
  | {
      op: "event";
      type: "TrackStuckEvent";
      guildId: string;
      track: LavalinkTrack;
      thresholdMs: number;
    }
  | {
      op: "event";
      type: "WebSocketClosedEvent";
      guildId: string;
      code: number;
      reason: string;
      byRemote: boolean;
    };

type LavalinkSocketPayload =
  | {
      op: "ready";
      resumed: boolean;
      sessionId: string;
    }
  | {
      op: "playerUpdate";
      guildId: string;
      state: LavalinkPlayerState;
    }
  | ({
      op: "stats";
    } & LavalinkStatsPayload)
  | LavalinkEventPayload;

type VoiceUpdatePayload = {
  token: string;
  endpoint: string;
  sessionId: string;
  channelId: string;
};

type UpdatePlayerPayload = {
  track?: {
    encoded: string | null;
    userData?: Record<string, unknown>;
  };
  volume?: number;
  paused?: boolean;
  position?: number;
  voice?: VoiceUpdatePayload;
};

type LavalinkStatus = {
  configured: boolean;
  connected: boolean;
  resumed: boolean;
  sessionId: string | null;
  host: string;
  version: string | null;
  sources: string[];
  plugins: string[];
  stats: LavalinkStatsPayload;
  lastError: string | null;
  reconnectAttempt: number;
};

type LavalinkCallbacks = {
  onReady?: (resumed: boolean) => Promise<void> | void;
  onPlayerUpdate?: (guildId: string, state: LavalinkPlayerState) => Promise<void> | void;
  onTrackStart?: (guildId: string, track: LavalinkTrack) => Promise<void> | void;
  onTrackEnd?: (guildId: string, track: LavalinkTrack, reason: string) => Promise<void> | void;
  onTrackException?: (
    guildId: string,
    track: LavalinkTrack,
    exception: { message: string; severity?: string; cause?: string }
  ) => Promise<void> | void;
  onTrackStuck?: (guildId: string, track: LavalinkTrack, thresholdMs: number) => Promise<void> | void;
  onWebSocketClosed?: (guildId: string, code: number, reason: string, byRemote: boolean) => Promise<void> | void;
};

type SearchResult = {
  loadType: LoadTracksResponse["loadType"];
  playlistName: string | null;
  selectedTrackIndex: number | null;
  tracks: LavalinkTrack[];
};

const READY_WAIT_DEFAULT_MS = 15_000;
const MAX_RECONNECT_DELAY_MS = 15_000;
const INITIAL_RECONNECT_DELAY_MS = 2_000;

export class LavalinkRequestError extends Error {
  public readonly statusCode: number;

  public constructor(message: string, statusCode: number) {
    super(message);
    this.name = "LavalinkRequestError";
    this.statusCode = statusCode;
  }
}

export class LavalinkClient {
  private readonly baseUrl: URL;
  private readonly wsUrl: URL;
  private readonly callbacks: LavalinkCallbacks;
  private readonly password: string;
  private readonly clientName: string;
  private readonly resumeTimeoutSeconds: number;
  private readonly status: LavalinkStatus;
  private userId: string | null = null;
  private socket: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private stopped = false;
  private readyPromise: Promise<void> | null = null;

  public constructor(input: {
    url: string;
    password: string;
    clientName: string;
    resumeTimeoutSeconds: number;
    callbacks?: LavalinkCallbacks;
  }) {
    this.baseUrl = normalizeBaseUrl(input.url);
    this.wsUrl = buildWebSocketUrl(this.baseUrl);
    this.password = input.password;
    this.clientName = input.clientName;
    this.resumeTimeoutSeconds = input.resumeTimeoutSeconds;
    this.callbacks = input.callbacks ?? {};
    this.status = {
      configured: true,
      connected: false,
      resumed: false,
      sessionId: null,
      host: this.baseUrl.host,
      version: null,
      sources: [],
      plugins: [],
      stats: {
        players: 0,
        playingPlayers: 0,
        uptime: 0
      },
      lastError: null,
      reconnectAttempt: 0
    };
  }

  public async start(userId: string): Promise<void> {
    this.userId = userId;
    this.stopped = false;
    this.connect();
  }

  public async stop(): Promise<void> {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    const socket = this.socket;
    this.socket = null;
    this.readyPromise = null;

    if (socket && socket.readyState <= WebSocket.OPEN) {
      socket.close(1000, "client shutdown");
      await sleep(50);
    }

    this.status.connected = false;
  }

  public getStatus(): LavalinkStatus {
    return {
      ...this.status,
      sources: [...this.status.sources],
      plugins: [...this.status.plugins],
      stats: {
        ...this.status.stats
      }
    };
  }

  public async waitUntilReady(timeoutMs = READY_WAIT_DEFAULT_MS): Promise<void> {
    if (this.status.connected && this.status.sessionId) {
      return;
    }

    this.connect();

    if (!this.readyPromise) {
      this.readyPromise = new Promise<void>((resolve, reject) => {
        const startedAt = Date.now();

        const tick = () => {
          if (this.status.connected && this.status.sessionId) {
            resolve();
            return;
          }

          if (Date.now() - startedAt >= timeoutMs) {
            reject(new Error("Không thể kết nối Lavalink trong thời gian cho phép."));
            return;
          }

          setTimeout(tick, 150);
        };

        tick();
      }).finally(() => {
        this.readyPromise = null;
      });
    }

    await this.readyPromise;
  }

  public async search(query: string): Promise<SearchResult> {
    const identifier = normalizeTrackIdentifier(query);
    const response = await this.request<LoadTracksResponse>(
      `/v4/loadtracks?identifier=${encodeURIComponent(identifier)}`
    );

    switch (response.loadType) {
      case "track":
      case "search":
        return {
          loadType: response.loadType,
          playlistName: null,
          selectedTrackIndex: null,
          tracks: response.data
        };
      case "playlist":
        return {
          loadType: response.loadType,
          playlistName: response.data.info.name,
          selectedTrackIndex: response.data.info.selectedTrack,
          tracks: response.data.tracks
        };
      case "empty":
        return {
          loadType: response.loadType,
          playlistName: null,
          selectedTrackIndex: null,
          tracks: []
        };
      case "error":
        throw new Error(response.data.message || "Lavalink không thể resolve track.");
      default:
        throw new Error("Lavalink trả về loadType không hợp lệ.");
    }
  }

  public async updatePlayer(guildId: string, payload: UpdatePlayerPayload, noReplace = false): Promise<void> {
    const sessionId = await this.requireSessionId();
    await this.request(`/v4/sessions/${sessionId}/players/${guildId}?noReplace=${String(noReplace)}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
  }

  public async destroyPlayer(guildId: string): Promise<void> {
    if (!this.status.sessionId) {
      return;
    }

    try {
      await this.request(`/v4/sessions/${this.status.sessionId}/players/${guildId}`, {
        method: "DELETE"
      });
    } catch (error) {
      if (error instanceof LavalinkRequestError && error.statusCode === 404) {
        return;
      }

      throw error;
    }
  }

  private connect(): void {
    if (this.stopped || !this.userId) {
      return;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket && this.socket.readyState <= WebSocket.OPEN) {
      return;
    }

    const headers: Record<string, string> = {
      Authorization: this.password,
      "User-Id": this.userId,
      "Client-Name": this.clientName
    };

    if (this.status.sessionId) {
      headers["Session-Id"] = this.status.sessionId;
    }

    const socket = new WebSocket(this.wsUrl.toString(), {
      headers
    });

    this.socket = socket;

    socket.addEventListener("open", () => {
      if (this.socket !== socket) {
        return;
      }

      console.info(`[music] connected websocket to Lavalink ${this.status.host}`);
    });

    socket.addEventListener("message", (event) => {
      if (this.socket !== socket) {
        return;
      }

      void this.handleSocketMessage(event.data);
    });

    socket.addEventListener("error", () => {
      if (this.socket !== socket) {
        return;
      }

      this.status.lastError = "WebSocket tới Lavalink gặp lỗi.";
    });

    socket.addEventListener("close", (event) => {
      if (this.socket !== socket) {
        return;
      }

      this.socket = null;
      this.status.connected = false;

      if (!this.stopped) {
        this.status.lastError = `Lavalink websocket đóng với mã ${event.code}.`;
        this.scheduleReconnect(`code=${event.code} reason=${event.reason || "không rõ"}`);
      }
    });
  }

  private scheduleReconnect(reason: string): void {
    if (this.reconnectTimer || this.stopped) {
      return;
    }

    const nextAttempt = this.status.reconnectAttempt + 1;
    const delay = Math.min(INITIAL_RECONNECT_DELAY_MS * 2 ** (nextAttempt - 1), MAX_RECONNECT_DELAY_MS);

    this.status.reconnectAttempt = nextAttempt;
    console.warn(`[music] Lavalink disconnected (${reason}). Reconnect sau ${delay}ms.`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private async handleSocketMessage(data: MessageEvent["data"]): Promise<void> {
    const raw = await readSocketMessage(data);
    if (!raw) {
      return;
    }

    let payload: LavalinkSocketPayload;

    try {
      payload = JSON.parse(raw) as LavalinkSocketPayload;
    } catch {
      this.status.lastError = "Không thể parse payload từ Lavalink.";
      return;
    }

    switch (payload.op) {
      case "ready":
        this.status.connected = true;
        this.status.resumed = payload.resumed;
        this.status.sessionId = payload.sessionId;
        this.status.reconnectAttempt = 0;
        this.status.lastError = null;
        try {
          await this.configureResuming();
        } catch (error) {
          this.status.lastError = error instanceof Error ? error.message : "Không thể bật session resume cho Lavalink.";
          console.warn("[music] failed to configure lavalink session resume", error);
        }
        void this.refreshInfo();
        await this.callbacks.onReady?.(payload.resumed);
        return;
      case "playerUpdate":
        await this.callbacks.onPlayerUpdate?.(payload.guildId, payload.state);
        return;
      case "stats":
        this.status.stats = {
          players: payload.players,
          playingPlayers: payload.playingPlayers,
          uptime: payload.uptime
        };
        return;
      case "event":
        await this.handleEventPayload(payload);
        return;
      default:
        return;
    }
  }

  private async handleEventPayload(payload: LavalinkEventPayload): Promise<void> {
    switch (payload.type) {
      case "TrackStartEvent":
        await this.callbacks.onTrackStart?.(payload.guildId, payload.track);
        return;
      case "TrackEndEvent":
        await this.callbacks.onTrackEnd?.(payload.guildId, payload.track, payload.reason);
        return;
      case "TrackExceptionEvent":
        await this.callbacks.onTrackException?.(payload.guildId, payload.track, payload.exception);
        return;
      case "TrackStuckEvent":
        await this.callbacks.onTrackStuck?.(payload.guildId, payload.track, payload.thresholdMs);
        return;
      case "WebSocketClosedEvent":
        await this.callbacks.onWebSocketClosed?.(
          payload.guildId,
          payload.code,
          payload.reason,
          payload.byRemote
        );
        return;
      default:
        return;
    }
  }

  private async configureResuming(): Promise<void> {
    if (!this.status.sessionId) {
      return;
    }

    await this.request(`/v4/sessions/${this.status.sessionId}`, {
      method: "PATCH",
      body: JSON.stringify({
        resuming: true,
        timeout: this.resumeTimeoutSeconds
      })
    });
  }

  private async refreshInfo(): Promise<void> {
    try {
      const response = await this.request<LavalinkInfoResponse>("/v4/info");
      this.status.version = response.version?.semver ?? null;
      this.status.sources = response.sourceManagers ?? [];
      this.status.plugins = response.plugins?.map((plugin) => plugin.name).filter(isNonEmptyString) ?? [];
    } catch (error) {
      console.warn("[music] không thể lấy Lavalink info", error);
    }
  }

  private async requireSessionId(): Promise<string> {
    await this.waitUntilReady();
    if (!this.status.sessionId) {
      throw new Error("Lavalink chưa trả sessionId.");
    }

    return this.status.sessionId;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const url = new URL(path.replace(/^\//, ""), this.baseUrl);
    const headers = new Headers(init.headers);

    headers.set("Authorization", this.password);

    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(url, {
      ...init,
      headers
    });

    if (response.status === 204) {
      return undefined as T;
    }

    const text = await response.text();
    const parsed = text ? tryParseJson(text) : null;

    if (!response.ok) {
      const message =
        parsed && typeof parsed === "object" && parsed !== null && "message" in parsed && typeof parsed.message === "string"
          ? parsed.message
          : text || `HTTP ${response.status}`;

      throw new LavalinkRequestError(message, response.status);
    }

    return (parsed ?? undefined) as T;
  }
}

function normalizeBaseUrl(input: string): URL {
  const url = new URL(input);
  if (!url.pathname.endsWith("/")) {
    url.pathname = `${url.pathname}/`;
  }

  return url;
}

function buildWebSocketUrl(baseUrl: URL): URL {
  const wsUrl = new URL("v4/websocket", baseUrl);
  wsUrl.protocol = baseUrl.protocol === "https:" ? "wss:" : "ws:";
  return wsUrl;
}

function normalizeTrackIdentifier(query: string): string {
  const trimmed = query.trim();

  if (/^(https?:)?\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (/^[a-z]+search:/i.test(trimmed)) {
    return trimmed;
  }

  return `ytsearch:${trimmed}`;
}

async function readSocketMessage(data: MessageEvent["data"]): Promise<string> {
  if (typeof data === "string") {
    return data;
  }

  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString("utf8");
  }

  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("utf8");
  }

  if (typeof Blob !== "undefined" && data instanceof Blob) {
    return Buffer.from(await data.arrayBuffer()).toString("utf8");
  }

  return "";
}

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function isNonEmptyString(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
