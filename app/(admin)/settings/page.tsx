import { Card, CardBody } from "@heroui/react";

import { CommandPoliciesBoard } from "@/components/settings/command-policies-board";
import { Reveal } from "@/components/motion/reveal";
import { GuildSettingsBoard } from "@/components/settings/guild-settings-board";
import { ScheduledMessagesBoard } from "@/components/settings/scheduled-messages-board";
import { SystemSettingsBoard } from "@/components/settings/system-settings-board";
import { getGuildSettingsData } from "@/lib/server/dashboard-data";
import { getQueryParamValue } from "@/lib/ui";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams
}: Readonly<{
  searchParams: SearchParams;
}>) {
  const params = await searchParams;
  const flash = getQueryParamValue(params.flash);
  const type = getQueryParamValue(params.type) || "default";
  const data = await getGuildSettingsData();

  return (
    <div className="space-y-4 pb-6">
      <Reveal>
        <Card className="glass-panel rounded-[1rem] border-none">
          <CardBody className="grid gap-3 p-4 sm:p-5 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="log-pill" data-tone="default">
                  Admin settings
                </span>
                <span className="log-pill" data-tone="secondary">
                  Runtime + policy
                </span>
              </div>
              <h1 className="panel-title text-lg sm:text-xl">
                Quản lý guild, command owner-only, presence và lịch gửi định kỳ trong cùng một trang.
              </h1>
              <p className="panel-copy max-w-3xl text-sm">
                Đây là khu vực cấu hình tác động trực tiếp tới vận hành. Giá trị được lưu bằng Prisma, scheduler dùng
                Redis queue và các thay đổi hợp lệ sẽ được áp dụng ngay cho runtime hiện tại.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <div className="panel-card rounded-[0.95rem] p-4">
                <p className="panel-meta">Guild đang bật bot</p>
                <p className="mt-2 text-xl font-semibold text-ink">{data.summary.enabledGuilds}</p>
                <p className="mt-1 text-xs leading-5 text-muted-ink">
                  {data.summary.disabledGuilds} guild đang tắt bot
                </p>
              </div>
              <div className="panel-card rounded-[0.95rem] p-4">
                <p className="panel-meta">Lịch gửi đang lưu</p>
                <p className="mt-2 text-xl font-semibold text-ink">{data.scheduledMessages.length}</p>
                <p className="mt-1 text-xs leading-5 text-muted-ink">
                  {data.commandPolicies.filter((policy) => policy.accessLevel === "OWNER").length} command đang owner-only
                </p>
              </div>
            </div>
          </CardBody>
        </Card>
      </Reveal>

      {flash ? (
        <Reveal delay={0.04}>
          <Card className="rounded-[1rem] border-none">
            <CardBody className="p-0">
              <div
                data-tone={type}
                className="panel-notice rounded-[1rem] px-4 py-3 text-sm"
              >
                {flash}
              </div>
            </CardBody>
          </Card>
        </Reveal>
      ) : null}

      <Reveal delay={0.03}>
        <SystemSettingsBoard systemConfig={data.systemConfig} />
      </Reveal>

      <Reveal delay={0.06}>
        <CommandPoliciesBoard commandPolicies={data.commandPolicies} />
      </Reveal>

      <Reveal delay={0.09}>
        <ScheduledMessagesBoard
          guildOptions={data.guilds.map((guild) => ({
            guildId: guild.guildId,
            guildName: guild.guildName
          }))}
          scheduledMessages={data.scheduledMessages}
        />
      </Reveal>

      <GuildSettingsBoard guilds={data.guilds} summary={data.summary} />
    </div>
  );
}
