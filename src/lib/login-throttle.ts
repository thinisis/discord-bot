type LoginAttemptState = {
  count: number;
  windowStartedAt: number;
  blockedUntil: number | null;
};

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_BLOCK_MS = 15 * 60 * 1000;

declare global {
  var __discordBotLoginAttempts__: Map<string, LoginAttemptState> | undefined;
}

const loginAttempts = globalThis.__discordBotLoginAttempts__ ?? new Map<string, LoginAttemptState>();
globalThis.__discordBotLoginAttempts__ = loginAttempts;

export function getBlockedLoginMinutes(ip: string): number | null {
  const current = loginAttempts.get(ip);
  if (!current) {
    return null;
  }

  const now = Date.now();
  if (current.blockedUntil && current.blockedUntil > now) {
    return Math.max(1, Math.ceil((current.blockedUntil - now) / 60_000));
  }

  if (current.blockedUntil && current.blockedUntil <= now) {
    loginAttempts.delete(ip);
    return null;
  }

  if (current.windowStartedAt + LOGIN_WINDOW_MS <= now) {
    loginAttempts.delete(ip);
  }

  return null;
}

export function registerFailedLogin(ip: string): number | null {
  const now = Date.now();
  const current = loginAttempts.get(ip);

  if (!current || current.windowStartedAt + LOGIN_WINDOW_MS <= now) {
    loginAttempts.set(ip, {
      count: 1,
      windowStartedAt: now,
      blockedUntil: null
    });
    return null;
  }

  const nextCount = current.count + 1;
  const blockedUntil = nextCount >= LOGIN_MAX_ATTEMPTS ? now + LOGIN_BLOCK_MS : null;

  loginAttempts.set(ip, {
    count: nextCount,
    windowStartedAt: current.windowStartedAt,
    blockedUntil
  });

  return blockedUntil ? Math.ceil(LOGIN_BLOCK_MS / 60_000) : null;
}

export function clearFailedLogins(ip: string): void {
  loginAttempts.delete(ip);
}

export function getClientIp(headerValue: string | null): string {
  if (!headerValue) {
    return "unknown";
  }

  const firstForwardedIp = headerValue.split(",")[0]?.trim();
  return firstForwardedIp || "unknown";
}
