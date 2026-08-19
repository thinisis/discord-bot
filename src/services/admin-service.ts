import type { PrismaClient } from "@prisma/client";

import { hashPassword, verifyPassword } from "../lib/password";
import { createAdminSession } from "../lib/session";

export async function ensureBootstrapAdmin(
  prisma: PrismaClient,
  username?: string,
  password?: string
): Promise<"created" | "skipped"> {
  if (!username || !password) {
    return "skipped";
  }

  const adminCount = await prisma.adminUser.count();
  if (adminCount > 0) {
    return "skipped";
  }

  await prisma.adminUser.create({
    data: {
      username,
      passwordHash: await hashPassword(password)
    }
  });

  return "created";
}

export async function createOrUpdateAdmin(
  prisma: PrismaClient,
  username: string,
  password: string
): Promise<"created" | "updated"> {
  const passwordHash = await hashPassword(password);
  const existing = await prisma.adminUser.findUnique({
    where: {
      username
    }
  });

  if (!existing) {
    await prisma.adminUser.create({
      data: {
        username,
        passwordHash
      }
    });

    return "created";
  }

  await prisma.adminUser.update({
    where: {
      id: existing.id
    },
    data: {
      passwordHash
    }
  });

  return "updated";
}

export async function authenticateAdmin(
  prisma: PrismaClient,
  username: string,
  password: string
): Promise<string | null> {
  const adminUser = await prisma.adminUser.findUnique({
    where: {
      username
    }
  });

  if (!adminUser) {
    return null;
  }

  const isValid = await verifyPassword(password, adminUser.passwordHash);
  if (!isValid) {
    return null;
  }

  await prisma.adminUser.update({
    where: {
      id: adminUser.id
    },
    data: {
      lastLoginAt: new Date()
    }
  });

  return createAdminSession(prisma, adminUser.id);
}
