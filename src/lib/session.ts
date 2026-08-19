import crypto from "node:crypto";

import type { AdminUser, PrismaClient } from "@prisma/client";

import { env, isProduction } from "../config/env";

export const ADMIN_SESSION_COOKIE = "discord_bot_admin_session";

const SESSION_TOUCH_INTERVAL_MS = 15 * 60 * 1000;

export type AuthenticatedAdmin = Pick<AdminUser, "id" | "username" | "lastLoginAt" | "createdAt">;

export function buildAdminSessionCookie(sessionId: string): {
  name: string;
  value: string;
  options: {
    httpOnly: true;
    sameSite: "strict";
    path: "/";
    secure: boolean;
    maxAge: number;
  };
} {
  return {
    name: ADMIN_SESSION_COOKIE,
    value: signSessionId(sessionId),
    options: {
      httpOnly: true,
      sameSite: "strict",
      path: "/",
      secure: isProduction,
      maxAge: env.ADMIN_SESSION_TTL_HOURS * 60 * 60
    }
  };
}

export function buildClearedAdminSessionCookie(): ReturnType<typeof buildAdminSessionCookie> {
  return {
    ...buildAdminSessionCookie("cleared"),
    value: "",
    options: {
      httpOnly: true,
      sameSite: "strict",
      path: "/",
      secure: isProduction,
      maxAge: 0
    }
  };
}

export function readSignedSessionId(cookieValue: string | null | undefined): string | null {
  if (!cookieValue) {
    return null;
  }

  const separatorIndex = cookieValue.lastIndexOf(".");
  if (separatorIndex <= 0) {
    return null;
  }

  const sessionId = cookieValue.slice(0, separatorIndex);
  const signature = cookieValue.slice(separatorIndex + 1);
  const expectedSignature = signPayload(sessionId);

  if (signature.length !== expectedSignature.length) {
    return null;
  }

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
    ? sessionId
    : null;
}

export async function createAdminSession(prisma: PrismaClient, adminUserId: string): Promise<string> {
  const sessionId = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + env.ADMIN_SESSION_TTL_HOURS * 60 * 60 * 1000);

  await prisma.adminSession.create({
    data: {
      id: sessionId,
      adminUserId,
      expiresAt
    }
  });

  return sessionId;
}

export async function destroyAdminSession(prisma: PrismaClient, sessionId: string): Promise<void> {
  await prisma.adminSession.deleteMany({
    where: {
      id: sessionId
    }
  });
}

export async function getAuthenticatedAdmin(
  prisma: PrismaClient,
  sessionId: string | null
): Promise<AuthenticatedAdmin | null> {
  if (!sessionId) {
    return null;
  }

  const session = await prisma.adminSession.findUnique({
    where: {
      id: sessionId
    },
    include: {
      adminUser: true
    }
  });

  if (!session) {
    return null;
  }

  if (session.expiresAt.getTime() <= Date.now()) {
    await destroyAdminSession(prisma, session.id);
    return null;
  }

  if (Date.now() - session.lastSeenAt.getTime() >= SESSION_TOUCH_INTERVAL_MS) {
    await prisma.adminSession.update({
      where: {
        id: session.id
      },
      data: {
        lastSeenAt: new Date()
      }
    });
  }

  return {
    id: session.adminUser.id,
    username: session.adminUser.username,
    lastLoginAt: session.adminUser.lastLoginAt,
    createdAt: session.adminUser.createdAt
  };
}

function signSessionId(sessionId: string): string {
  return `${sessionId}.${signPayload(sessionId)}`;
}

function signPayload(payload: string): string {
  if (!env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET is required to sign admin sessions.");
  }

  return crypto.createHmac("sha256", env.SESSION_SECRET).update(payload).digest("base64url");
}
