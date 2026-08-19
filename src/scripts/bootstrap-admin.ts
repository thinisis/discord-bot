import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { createOrUpdateAdmin } from "../services/admin-service";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const username = args.username ?? env.ADMIN_BOOTSTRAP_USERNAME;
  const password = args.password ?? env.ADMIN_BOOTSTRAP_PASSWORD;

  if (!username || !password) {
    throw new Error("Provide a username and password via args or environment variables.");
  }

  if (password.length < 8) {
    throw new Error("Admin passwords must be at least 8 characters.");
  }

  const result = await createOrUpdateAdmin(prisma, username, password);
  console.log(`[admin] ${result} local admin "${username}"`);
}

function parseArgs(args: string[]): { username?: string; password?: string } {
  const parsed: { username?: string; password?: string } = {};

  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];
    const next = args[index + 1];

    if (current === "--username" && next) {
      parsed.username = next;
      index += 1;
      continue;
    }

    if (current === "--password" && next) {
      parsed.password = next;
      index += 1;
    }
  }

  return parsed;
}

main()
  .catch(async (error: unknown) => {
    console.error("[admin] bootstrap failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
