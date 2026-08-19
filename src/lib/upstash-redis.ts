import { env } from "../config/env";

type UpstashResult<T> = {
  result?: T;
  error?: string;
};

export class UpstashRedisClient {
  private readonly baseUrl: string | null;
  private readonly token: string | null;

  public constructor(input?: { baseUrl?: string | null; token?: string | null }) {
    this.baseUrl = input?.baseUrl ?? env.UPSTASH_REDIS_REST_URL ?? null;
    this.token = input?.token ?? env.UPSTASH_REDIS_REST_TOKEN ?? null;
  }

  public get configured(): boolean {
    return Boolean(this.baseUrl && this.token);
  }

  public async command<T>(command: Array<string | number>): Promise<T> {
    if (!this.baseUrl || !this.token) {
      throw new Error("Upstash Redis REST chưa được cấu hình.");
    }

    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(command)
    });

    const payload = (await response.json()) as UpstashResult<T>;
    if (!response.ok || payload.error) {
      throw new Error(payload.error || `Upstash Redis REST request failed with status ${response.status}.`);
    }

    return payload.result as T;
  }

  public async pipeline<T>(commands: Array<Array<string | number>>): Promise<Array<UpstashResult<T>>> {
    if (!this.baseUrl || !this.token) {
      throw new Error("Upstash Redis REST chưa được cấu hình.");
    }

    const response = await fetch(`${this.baseUrl}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(commands)
    });

    const payload = (await response.json()) as Array<UpstashResult<T>>;
    if (!response.ok) {
      throw new Error(`Upstash Redis pipeline failed with status ${response.status}.`);
    }

    return payload;
  }
}
