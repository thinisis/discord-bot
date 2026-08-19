"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { clearPersistedAdminSession, persistAdminSession } from "@/lib/server/admin-session";
import { prisma } from "@/src/lib/prisma";
import { authenticateAdmin } from "@/src/services/admin-service";
import {
  clearFailedLogins,
  getBlockedLoginMinutes,
  getClientIp,
  registerFailedLogin
} from "@/src/lib/login-throttle";

export type LoginFormState = {
  error: string | null;
};

export async function loginAction(
  _previousState: LoginFormState,
  formData: FormData
): Promise<LoginFormState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "").trim();

  if (!username || !password) {
    return {
      error: "Vui lòng nhập tên đăng nhập và mật khẩu."
    };
  }

  const headerStore = await headers();
  const ipAddress = getClientIp(headerStore.get("x-forwarded-for") ?? headerStore.get("x-real-ip"));
  const blockedMinutes = getBlockedLoginMinutes(ipAddress);

  if (blockedMinutes) {
    return {
      error: `Đăng nhập bị tạm khóa. Hãy thử lại sau ${blockedMinutes} phút.`
    };
  }

  const sessionId = await authenticateAdmin(prisma, username, password);
  if (!sessionId) {
    const nextBlockedMinutes = registerFailedLogin(ipAddress);

    return {
      error: nextBlockedMinutes
        ? `Đăng nhập bị tạm khóa. Hãy thử lại sau ${nextBlockedMinutes} phút.`
        : "Tên đăng nhập hoặc mật khẩu không đúng."
    };
  }

  clearFailedLogins(ipAddress);
  await persistAdminSession(sessionId);
  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  await clearPersistedAdminSession();
  redirect("/login");
}
