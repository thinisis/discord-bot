import { CommandAccessLevel, type CommandPolicy, type PrismaClient } from "@prisma/client";

import { getSystemConfig, parseOwnerDiscordIds } from "./system-config-service";

export async function ensureCommandPolicies(
  prisma: PrismaClient,
  commandNames: string[]
): Promise<CommandPolicy[]> {
  const normalizedNames = [...new Set(commandNames.map((name) => name.trim()).filter(Boolean))];

  if (normalizedNames.length === 0) {
    return [];
  }

  const existing = await prisma.commandPolicy.findMany({
    where: {
      commandName: {
        in: normalizedNames
      }
    }
  });

  const existingNames = new Set(existing.map((item) => item.commandName));
  const missingNames = normalizedNames.filter((name) => !existingNames.has(name));

  if (missingNames.length > 0) {
    await prisma.$transaction(
      missingNames.map((commandName) =>
        prisma.commandPolicy.create({
          data: {
            commandName,
            accessLevel: CommandAccessLevel.EVERYONE
          }
        })
      )
    );
  }

  const allPolicies = missingNames.length > 0
    ? await prisma.commandPolicy.findMany({
        where: {
          commandName: {
            in: normalizedNames
          }
        }
      })
    : existing;

  const policyMap = new Map(allPolicies.map((policy) => [policy.commandName, policy]));
  return normalizedNames
    .map((name) => policyMap.get(name))
    .filter((policy): policy is CommandPolicy => Boolean(policy));
}

export async function updateCommandPolicies(
  prisma: PrismaClient,
  updates: Array<{ commandName: string; accessLevel: CommandAccessLevel }>
): Promise<void> {
  if (updates.length === 0) {
    return;
  }

  await prisma.$transaction(
    updates.map((update) =>
      prisma.commandPolicy.upsert({
        where: { commandName: update.commandName },
        update: { accessLevel: update.accessLevel },
        create: update
      })
    )
  );
}

export async function resolveCommandPermission(
  prisma: PrismaClient,
  commandNames: string[],
  commandName: string,
  userId: string
): Promise<{ allowed: boolean; accessLevel: CommandAccessLevel; ownerIds: string[] }> {
  const [systemConfig, policies] = await Promise.all([
    getSystemConfig(prisma),
    ensureCommandPolicies(prisma, commandNames)
  ]);

  const policy =
    policies.find((item) => item.commandName === commandName) ??
    ({ accessLevel: CommandAccessLevel.EVERYONE } as Pick<CommandPolicy, "accessLevel">);
  const ownerIds = parseOwnerDiscordIds(systemConfig.ownerDiscordIds);

  return {
    allowed: policy.accessLevel === CommandAccessLevel.EVERYONE || ownerIds.includes(userId),
    accessLevel: policy.accessLevel,
    ownerIds
  };
}
