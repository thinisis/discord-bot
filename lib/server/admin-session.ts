import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "@/src/lib/prisma";
import {
  ADMIN_SESSION_COOKIE,
  buildAdminSessionCookie,
  buildClearedAdminSessionCookie,
  destroyAdminSession,
  getAuthenticatedAdmin,
  readSignedSessionId
} from "@/src/lib/session";

export async function getCurrentAdmin() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  return getAuthenticatedAdmin(prisma, readSignedSessionId(sessionCookie));
}

export async function requireCurrentAdmin() {
  const admin = await getCurrentAdmin();
  if (!admin) {
    redirect("/login");
  }

  return admin;
}

export async function persistAdminSession(sessionId: string): Promise<void> {
  const cookieStore = await cookies();
  const sessionCookie = buildAdminSessionCookie(sessionId);
  cookieStore.set(sessionCookie.name, sessionCookie.value, sessionCookie.options);
}

export async function clearPersistedAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const sessionId = readSignedSessionId(sessionCookie);

  if (sessionId) {
    await destroyAdminSession(prisma, sessionId);
  }

  const clearedCookie = buildClearedAdminSessionCookie();
  cookieStore.set(clearedCookie.name, clearedCookie.value, clearedCookie.options);
}
