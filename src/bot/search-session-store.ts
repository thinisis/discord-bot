import type { MusicTrack } from "./music-manager";

export type SearchSession = {
  id: string;
  guildId: string;
  userId: string;
  query: string;
  textChannelId: string | null;
  voiceChannelId: string;
  createdAt: number;
  expiresAt: number;
  tracks: MusicTrack[];
};

export class SearchSessionStore {
  private readonly ttlMs: number;
  private readonly sessions = new Map<string, SearchSession>();
  private sequence = 0;

  public constructor(ttlMs: number) {
    this.ttlMs = ttlMs;
  }

  public create(input: Omit<SearchSession, "id" | "createdAt" | "expiresAt">): SearchSession {
    this.pruneExpired();

    const createdAt = Date.now();
    const session: SearchSession = {
      ...input,
      id: this.nextId(),
      createdAt,
      expiresAt: createdAt + this.ttlMs
    };

    this.sessions.set(session.id, session);
    return session;
  }

  public get(id: string): SearchSession | null {
    this.pruneExpired();
    return this.sessions.get(id) ?? null;
  }

  public delete(id: string): void {
    this.sessions.delete(id);
  }

  public deleteGuildSessions(guildId: string): number {
    let deletedCount = 0;

    for (const [id, session] of this.sessions.entries()) {
      if (session.guildId === guildId) {
        this.sessions.delete(id);
        deletedCount += 1;
      }
    }

    return deletedCount;
  }

  private pruneExpired(): void {
    const now = Date.now();

    for (const [id, session] of this.sessions.entries()) {
      if (session.expiresAt <= now) {
        this.sessions.delete(id);
      }
    }
  }

  private nextId(): string {
    let id = "";

    do {
      this.sequence = (this.sequence + 1) % 1_679_616;
      id = `${Date.now().toString(36)}${this.sequence.toString(36).padStart(4, "0")}`.slice(-10);
    } while (this.sessions.has(id));

    return id;
  }
}
