export interface Guild {
  guildId: string;
  guildName: string;
  botEnabled: boolean;
  logChannelId: string | null;
  musicVolume: number;
  logCount: number;
}
export interface Track {
  encoded: string;
  info: { title: string; author: string; length: number; artworkUrl: string; identifier: string };
}
export interface Player {
  guildId: string;
  voiceChannelId: string;
  currentTrack: Track | null;
  queueLength: number;
  paused: boolean;
  volume: number;
  positionMs: number;
  connected: boolean;
}
export interface Status {
  runtime: string;
  uptimeSeconds: number;
  memoryMB: number;
  goroutines: number;
  guildCount: number;
  logCount: number;
  scheduleCount: number;
  startedAt: string;
  bot: {
    ready: boolean;
    enabled: boolean;
    currentUserTag?: string;
    pingMs?: number;
    guildCount?: number;
  };
  music: {
    connected: boolean;
    nodeVersion?: string;
    sources: string[];
    plugins: string[];
    lastError?: string;
    sessions: Player[];
    queuedTracks: number;
    activeTracks: number;
  };
}
export interface SystemConfig {
  ownerDiscordIds: string;
  queuePageSize: number;
  idleMorningText: string;
  idleNoonText: string;
  idleEveningText: string;
  idleNightText: string;
}
export interface Schedule {
  id?: string;
  name: string;
  guildId: string;
  channelId: string;
  message: string;
  frequency: 'DAILY' | 'WEEKLY' | 'ONCE';
  daysOfWeek: string | null;
  hour: number | null;
  minute: number | null;
  runAt: string | null;
  enabled: boolean;
  nextRunAt?: string | null;
  lastSentAt?: string | null;
}
export interface Settings {
  system: SystemConfig;
  policies: { commandName: string; accessLevel: string }[];
  schedules: Schedule[];
  commands: string[];
}
export interface Channel {
  id: string;
  name: string;
  type: number;
}
export interface Log {
  id: string;
  createdAt: string;
  level?: string;
  action?: string;
  message: string;
  guildName?: string;
}
export interface Logs {
  items: Log[];
  total: number;
  page: number;
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch('/api' + path, {
    credentials: 'same-origin',
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new ApiError('Phản hồi máy chủ không hợp lệ.', response.status);
  }
  if (!response.ok) {
    if (response.status === 401 && path !== '/login')
      window.dispatchEvent(new Event('session-expired'));
    throw new ApiError(
      typeof data === 'object' && data !== null && 'error' in data
        ? String(data.error)
        : `Lỗi HTTP ${response.status}`,
      response.status
    );
  }
  return data as T;
}
export const save = <T = unknown>(path: string, data: unknown, method = 'PUT') =>
  api<T>(path, { method, body: JSON.stringify(data) });
export function changed() {
  window.dispatchEvent(new Event('data-changed'));
}
export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Không thể hoàn tất yêu cầu.';
