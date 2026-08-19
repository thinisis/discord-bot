import { Card, CardBody } from "@heroui/react";
import Link from "next/link";

import { StatusPanel } from "@/components/dashboard/status-panel";
import { Reveal } from "@/components/motion/reveal";
import { AdminButton } from "@/components/ui/admin-button";
import { getDashboardData } from "@/lib/server/dashboard-data";
import { getGuildActionMeta, getSystemLogMeta } from "@/lib/ui";
import { formatDateTime, formatRelativeDuration } from "@/src/lib/format";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const data = await getDashboardData();
  const musicStatus = data.liveStatus.bot.music;

  const stats = [
    {
      label: "Guild theo dõi",
      value: String(data.stats.guildCount),
      detail: `${data.liveStatus.bot.guildCount} guild đang có trong cache bot`
    },
    {
      label: "Log 24 giờ",
      value: String(data.stats.recent24hLogs),
      detail: `${data.stats.logCount} bản ghi đã lưu`
    },
    {
      label: "Scheduler / Queue",
      value: `${data.stats.scheduledMessageCount}/${musicStatus.queuedTracks}`,
      detail: `${musicStatus.activeGuilds} guild music · ${data.stats.scheduledMessageCount} lịch gửi`
    },
    {
      label: "Owner-only cmd",
      value: String(data.stats.ownerOnlyCommandCount),
      detail: `${data.stats.recentSystemErrors} lỗi · ${data.stats.recentSystemWarnings} cảnh báo runtime`
    }
  ];

  const overviewRows = [
    {
      label: "App mode",
      value: data.liveStatus.system.appMode.toUpperCase()
    },
    {
      label: "Node",
      value: data.liveStatus.system.nodeVersion
    },
    {
      label: "Runtime",
      value: formatRelativeDuration(data.liveStatus.system.uptimeSeconds)
    },
    {
      label: "Lavalink session",
      value: musicStatus.sessionId ?? "chưa có session"
    },
    {
      label: "Guild gần đây",
      value: data.guilds.map((guild) => guild.guildName).join(" · ") || "chưa có guild"
    },
    {
      label: "Owner IDs",
      value: data.systemConfig.ownerDiscordIds.split(/\s+/).filter(Boolean).join(" · ")
    },
    {
      label: "System log file",
      value: data.systemLogFilePath
    }
  ];

  return (
    <div className="space-y-3 pb-4">
      <section className="grid gap-3 2xl:grid-cols-[minmax(0,1.3fr)_24rem]">
        <Reveal>
          <Card className="glass-panel rounded-[1rem] border-none">
            <CardBody className="space-y-3.5 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="log-pill" data-tone="default">
                      Dashboard
                    </span>
                    <span className="log-pill" data-tone={musicStatus.connected ? "success" : "danger"}>
                      {musicStatus.connected ? "Lavalink online" : "Lavalink offline"}
                    </span>
                    <span className="log-pill" data-tone={data.liveStatus.bot.ready ? "primary" : "secondary"}>
                      {data.liveStatus.bot.ready ? "Bot ready" : "Bot starting"}
                    </span>
                  </div>
                  <div>
                    <h1 className="panel-title text-base sm:text-lg">
                      Trung tâm giám sát vận hành
                    </h1>
                    <p className="panel-copy mt-1">
                      Giao diện chính đã được nén lại để ưu tiên mật độ thông tin, quan sát trạng thái và đọc log
                      nhanh hơn.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Link href="/logs">
                    <AdminButton kind="solid" size="sm" tone="accent">
                      Mở logs
                    </AdminButton>
                  </Link>
                  <Link href="/settings">
                    <AdminButton size="sm" tone="default">
                      Cài đặt
                    </AdminButton>
                  </Link>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {stats.map((stat) => (
                  <div key={stat.label} className="panel-card rounded-[0.9rem] px-3 py-2.5">
                    <p className="panel-meta">{stat.label}</p>
                    <p className="mt-1 text-base font-semibold tracking-[-0.02em] text-ink sm:text-lg">
                      {stat.value}
                    </p>
                    <p className="mt-1 text-[11px] leading-5 text-muted-ink">{stat.detail}</p>
                  </div>
                ))}
              </div>

              <div className="grid gap-2 lg:grid-cols-2">
                {overviewRows.map((row) => (
                  <div key={row.label} className="panel-strip rounded-[0.85rem] px-3 py-2.5">
                    <p className="panel-meta">{row.label}</p>
                    <p className="mt-1 break-words text-xs leading-5 text-ink">{row.value}</p>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </Reveal>

        <Reveal delay={0.03}>
          <Card className="glass-panel rounded-[1rem] border-none">
            <CardBody className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="panel-kicker">Cần xử lý</p>
                  <h2 className="panel-title">Guild cần chú ý</h2>
                </div>
                <Link href="/settings">
                  <AdminButton size="sm" tone="default">
                    Mở
                  </AdminButton>
                </Link>
              </div>

              {data.attentionGuilds.length === 0 ? (
                <div className="panel-empty rounded-[0.9rem] px-3 py-3 text-xs leading-5 text-muted-ink">
                  Tất cả guild gần đây đã có log channel.
                </div>
              ) : (
                <div className="space-y-2">
                  {data.attentionGuilds.map((guild) => (
                    <div key={guild.guildId} className="panel-card rounded-[0.9rem] px-3 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-ink">{guild.guildName}</p>
                          <p className="panel-meta mt-1 break-all">
                            {guild.guildId}
                          </p>
                        </div>
                        <span className="log-pill" data-tone="warning">
                          Chưa có log
                        </span>
                      </div>
                      <div className="mt-2 grid gap-1 text-xs leading-5 text-muted-ink">
                        <p>Âm lượng: {guild.musicVolume}%</p>
                        <p>Cập nhật: {formatDateTime(guild.updatedAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </Reveal>
      </section>

      <StatusPanel initialStatus={data.liveStatus} />

      <section className="grid gap-3 2xl:grid-cols-2">
        <Reveal delay={0.05}>
          <Card className="glass-panel rounded-[1rem] border-none">
            <CardBody className="space-y-3 p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="panel-kicker">PostgreSQL</p>
                  <h2 className="panel-title">Guild logs gần nhất</h2>
                </div>
                <Link href="/logs">
                  <AdminButton size="sm" tone="default">
                    Tất cả
                  </AdminButton>
                </Link>
              </div>

              {data.recentLogs.length === 0 ? (
                <div className="panel-empty rounded-[0.9rem] px-3 py-3 text-xs leading-5 text-muted-ink">
                  Chưa có bản ghi nào trong PostgreSQL.
                </div>
              ) : (
                <div className="space-y-2">
                  {data.recentLogs.map((log) => {
                    const meta = getGuildActionMeta(log.action);

                    return (
                      <CompactLogItem
                        key={log.id}
                        title={`${meta.label} · ${log.guildName}`}
                        subtitle={`${meta.family} · ${meta.severity}`}
                        timestamp={formatDateTime(log.createdAt)}
                        message={truncateText(log.message, 240)}
                        details={[
                          { label: "Action", value: log.action },
                          { label: "Guild ID", value: log.guildId },
                          ...(log.channelId ? [{ label: "Channel", value: log.channelId }] : []),
                          ...(log.userId ? [{ label: "User", value: log.userId }] : [])
                        ]}
                      />
                    );
                  })}
                </div>
              )}
            </CardBody>
          </Card>
        </Reveal>

        <Reveal delay={0.08}>
          <Card className="glass-panel rounded-[1rem] border-none">
            <CardBody className="space-y-3 p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="panel-kicker">Runtime file</p>
                  <h2 className="panel-title">System logs gần nhất</h2>
                </div>
                <p className="max-w-[18rem] truncate text-[11px] leading-5 text-muted-ink">{data.systemLogFilePath}</p>
              </div>

              {data.recentSystemLogs.length === 0 ? (
                <div className="panel-empty rounded-[0.9rem] px-3 py-3 text-xs leading-5 text-muted-ink">
                  Chưa có log hệ thống nào trong runtime hiện tại.
                </div>
              ) : (
                <div className="space-y-2">
                  {data.recentSystemLogs.map((log) => {
                    const meta = getSystemLogMeta(log.level);
                    const source = extractSystemLogSource(log.message);

                    return (
                      <CompactLogItem
                        key={log.id}
                        title={extractSystemLogHeadline(log.message)}
                        subtitle={`${meta.label} · ${source}`}
                        timestamp={formatDateTime(new Date(log.createdAt))}
                        message={truncateText(normalizeWhitespace(log.message), 260)}
                        details={[
                          { label: "Level", value: log.level.toUpperCase() },
                          { label: "Nguồn", value: source }
                        ]}
                      />
                    );
                  })}
                </div>
              )}
            </CardBody>
          </Card>
        </Reveal>
      </section>
    </div>
  );
}

function CompactLogItem({
  title,
  subtitle,
  timestamp,
  message,
  details
}: {
  title: string;
  subtitle: string;
  timestamp: string;
  message: string;
  details: Array<{ label: string; value: string }>;
}) {
  return (
    <article className="panel-card rounded-[0.9rem] px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="panel-meta">{subtitle}</p>
          <h3 className="mt-1 break-words text-sm font-medium text-ink">{title}</h3>
        </div>
        <p className="panel-meta">{timestamp}</p>
      </div>

      <p className="mt-2 text-[11px] leading-5 text-muted-ink">{message}</p>

      <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
        {details.map((detail) => (
          <div key={`${detail.label}-${detail.value}`} className="panel-strip rounded-[0.7rem] px-2.5 py-2">
            <p className="panel-meta">{detail.label}</p>
            <p className="mt-1 break-words text-[11px] leading-5 text-ink">{detail.value}</p>
          </div>
        ))}
      </div>
    </article>
  );
}

function extractSystemLogSource(message: string): string {
  const match = message.match(/^\[([^\]]+)\]/);
  return match?.[1]?.toUpperCase() ?? "RUNTIME";
}

function extractSystemLogHeadline(message: string): string {
  const firstLine = message.split(/\r?\n/, 1)[0]?.trim() ?? "";
  const normalized = normalizeWhitespace(firstLine.replace(/^\[[^\]]+\]\s*/, "").trim());

  if (normalized.length <= 110) {
    return normalized || "Dòng log runtime";
  }

  return `${normalized.slice(0, 107)}...`;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncateText(value: string, maxLength: number): string {
  const normalized = value.trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3)}...`;
}
