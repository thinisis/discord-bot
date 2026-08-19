import { Card, CardBody } from "@heroui/react";

import { LogAlertCard } from "@/components/logs/log-alert-card";
import { LogsFilters } from "@/components/logs/logs-filters";
import { LogsPagination } from "@/components/logs/logs-pagination";
import { Reveal } from "@/components/motion/reveal";
import { GUILD_LOGS_PAGE_SIZE, getLogsData, SYSTEM_LOGS_PAGE_SIZE } from "@/lib/server/dashboard-data";
import { getGuildActionMeta, getQueryParamValue, getSystemLogMeta } from "@/lib/ui";
import { formatDateTime } from "@/src/lib/format";
import { parsePageParam } from "@/src/lib/pagination";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type LogsData = Awaited<ReturnType<typeof getLogsData>>;
type GuildLogEntry = LogsData["guildLogs"]["entries"][number];
type SystemLogEntry = LogsData["systemLogs"]["entries"][number];

export const dynamic = "force-dynamic";

export default async function LogsPage({
  searchParams
}: Readonly<{
  searchParams: SearchParams;
}>) {
  const params = await searchParams;
  const selectedGuildId = getQueryParamValue(params.guildId);
  const selectedAction = getQueryParamValue(params.action);
  const requestedGuildPage = parsePageParam(params.guildPage);
  const requestedSystemPage = parsePageParam(params.systemPage);
  const data = await getLogsData({
    guildId: selectedGuildId || undefined,
    action: selectedAction || undefined,
    guildPage: requestedGuildPage,
    systemPage: requestedSystemPage
  });

  const paginationSearchParams = {
    ...(selectedGuildId ? { guildId: selectedGuildId } : {}),
    ...(selectedAction ? { action: selectedAction } : {}),
    ...(data.guildLogs.pagination.page > 1 ? { guildPage: String(data.guildLogs.pagination.page) } : {}),
    ...(data.systemLogs.pagination.page > 1 ? { systemPage: String(data.systemLogs.pagination.page) } : {})
  };

  const selectedGuildName =
    data.guildOptions.find((guild) => guild.guildId === selectedGuildId)?.guildName ?? selectedGuildId;

  return (
    <div className="space-y-3 pb-4">
      <div className="grid gap-3 xl:grid-cols-[18.5rem_minmax(0,1fr)]">
        <aside className="space-y-3 xl:sticky xl:top-0 xl:self-start">
          <Reveal>
            <Card className="glass-panel rounded-[1rem] border-none">
              <CardBody className="space-y-4 p-4">
                <div className="space-y-1.5">
                  <p className="panel-kicker">Nhật ký</p>
                  <h1 className="panel-title">
                    Trung tâm log runtime
                  </h1>
                  <p className="panel-copy">
                    Bố cục mới tách rõ phần lọc, tổng quan và hai luồng log để quan sát nhanh hơn trên màn hình quản trị.
                  </p>
                </div>

                <div className="grid gap-2">
                  <InfoRow label="Guild log" value={`${data.guildLogs.pagination.totalCount} bản ghi`} />
                  <InfoRow label="System log" value={`${data.systemLogs.pagination.totalCount} dòng runtime`} />
                  <InfoRow label="Guild page" value={`${data.guildLogs.pagination.page}/${data.guildLogs.pagination.totalPages}`} />
                  <InfoRow
                    label="System page"
                    value={`${data.systemLogs.pagination.page}/${data.systemLogs.pagination.totalPages}`}
                  />
                  <InfoRow
                    label="Guild đang chọn"
                    value={selectedGuildId ? selectedGuildName : "Tất cả guild"}
                  />
                  <InfoRow label="Action đang chọn" value={selectedAction || "Tất cả action"} />
                </div>

                <div className="panel-strip rounded-[0.85rem] px-3 py-3">
                  <p className="panel-meta">File runtime</p>
                  <p className="mt-1 break-all text-xs leading-5 text-ink">
                    {data.systemLogFilePath}
                  </p>
                </div>
              </CardBody>
            </Card>
          </Reveal>

          <LogsFilters
            guildOptions={data.guildOptions.map((guild) => ({
              guildId: guild.guildId,
              guildName: guild.guildName
            }))}
            selectedAction={selectedAction}
            selectedGuildId={selectedGuildId}
          />
        </aside>

        <div className="space-y-3">
          <Reveal delay={0.03}>
            <Card className="glass-panel rounded-[1rem] border-none">
              <CardBody className="space-y-3 p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="panel-kicker">Runtime file</p>
                    <h2 className="panel-title">
                      System logs
                    </h2>
                  </div>
                  <p className="panel-copy">{SYSTEM_LOGS_PAGE_SIZE} dòng mỗi trang</p>
                </div>

                <LogsPagination
                  itemLabel="log hệ thống"
                  note="System log đọc trực tiếp từ file runtime, không bị ảnh hưởng bởi bộ lọc guild."
                  pageParam="systemPage"
                  pagination={data.systemLogs.pagination}
                  pathname="/logs"
                  searchParams={paginationSearchParams}
                />

                {data.systemLogs.entries.length === 0 ? (
                  <div className="panel-empty rounded-[0.9rem] px-3 py-3 text-xs leading-5 text-muted-ink">
                    Chưa có log hệ thống nào được capture.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {data.systemLogs.entries.map((log) => {
                      const meta = getSystemLogMeta(log.level);
                      const source = extractSystemLogSource(log.message);

                      return (
                        <LogAlertCard
                          key={log.id}
                          codeLabel={`ID ${log.id}`}
                          compact
                          description={meta.description}
                          eyebrow="Runtime hệ thống"
                          message={<span className="whitespace-pre-wrap break-words">{log.message}</span>}
                          meta={buildSystemMetaItems(log, source)}
                          monospaceMessage
                          timestamp={formatDateTime(new Date(log.createdAt))}
                          title={extractSystemLogHeadline(log.message)}
                          tone={meta.tone}
                          chips={[
                            { label: log.level.toUpperCase(), color: meta.tone },
                            { label: source, color: "secondary" },
                            { label: meta.severity, color: "default" }
                          ]}
                        />
                      );
                    })}
                  </div>
                )}
              </CardBody>
            </Card>
          </Reveal>

          <Reveal delay={0.06}>
            <Card className="glass-panel rounded-[1rem] border-none">
              <CardBody className="space-y-3 p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="panel-kicker">PostgreSQL</p>
                    <h2 className="panel-title">
                      Guild logs
                    </h2>
                  </div>
                  <p className="panel-copy">{GUILD_LOGS_PAGE_SIZE} dòng mỗi trang</p>
                </div>

                <LogsPagination
                  itemLabel="log guild"
                  note="Bộ lọc ở cột trái chỉ tác động tới luồng guild log và giữ nguyên query string khi phân trang."
                  pageParam="guildPage"
                  pagination={data.guildLogs.pagination}
                  pathname="/logs"
                  searchParams={paginationSearchParams}
                />

                {data.guildLogs.entries.length === 0 ? (
                  <div className="panel-empty rounded-[0.9rem] px-3 py-3 text-xs leading-5 text-muted-ink">
                    Không có bản ghi nào phù hợp với bộ lọc hiện tại.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {data.guildLogs.entries.map((log) => {
                      const meta = getGuildActionMeta(log.action);

                      return (
                        <LogAlertCard
                          key={log.id}
                          codeLabel={`ID ${log.id}`}
                          compact
                          description={meta.description}
                          eyebrow="Hoạt động guild"
                          message={log.message}
                          meta={buildGuildMetaItems(log)}
                          timestamp={formatDateTime(log.createdAt)}
                          title={`${meta.label} · ${log.guildName}`}
                          tone={meta.tone}
                          chips={[
                            { label: meta.label, color: meta.tone },
                            { label: meta.family, color: meta.family === "Voice" ? "primary" : "secondary" },
                            { label: meta.severity, color: "default" }
                          ]}
                        />
                      );
                    })}
                  </div>
                )}
              </CardBody>
            </Card>
          </Reveal>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel-strip rounded-[0.8rem] px-3 py-2.5">
      <p className="panel-meta">{label}</p>
      <p className="mt-1.5 break-words text-xs leading-5 text-ink">{value}</p>
    </div>
  );
}

function buildGuildMetaItems(log: GuildLogEntry): Array<{ label: string; value: string }> {
  const items = [
    { label: "Action", value: log.action },
    { label: "Guild ID", value: log.guildId },
    { label: "Guild", value: log.guildName }
  ];

  if (log.channelId) {
    items.push({ label: "Channel ID", value: log.channelId });
  }

  if (log.userId) {
    items.push({ label: "User ID", value: log.userId });
  }

  if (log.targetId) {
    items.push({ label: "Target ID", value: log.targetId });
  }

  return [...items, ...extractMetadataPairs(log.metadata)].slice(0, 6);
}

function buildSystemMetaItems(log: SystemLogEntry, source: string): Array<{ label: string; value: string }> {
  return [
    { label: "Nguồn", value: source },
    { label: "Mức độ", value: log.level.toUpperCase() },
    { label: "Thời gian", value: formatDateTime(new Date(log.createdAt)) }
  ];
}

function extractSystemLogSource(message: string): string {
  const match = message.match(/^\[([^\]]+)\]/);
  return match?.[1]?.toUpperCase() ?? "RUNTIME";
}

function extractSystemLogHeadline(message: string): string {
  const firstLine = message.split(/\r?\n/, 1)[0]?.trim() ?? "";
  const normalized = normalizeWhitespace(firstLine.replace(/^\[[^\]]+\]\s*/, "").trim());
  return truncateText(normalized || "Dòng log runtime", 120);
}

function extractMetadataPairs(metadata: unknown): Array<{ label: string; value: string }> {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return [];
  }

  return Object.entries(metadata)
    .map(([key, value]) => ({
      label: formatMetadataLabel(key),
      value: formatMetadataValue(value)
    }))
    .filter((item) => item.value.length > 0);
}

function formatMetadataLabel(key: string): string {
  const labelMap: Record<string, string> = {
    oldChannelId: "Kênh cũ",
    newChannelId: "Kênh mới",
    parentId: "Parent ID",
    channelType: "Loại kênh",
    channelName: "Tên kênh",
    changes: "Thay đổi"
  };

  if (labelMap[key]) {
    return labelMap[key];
  }

  return key.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}

function formatMetadataValue(value: unknown): string {
  if (typeof value === "string") {
    return truncateText(value, 180);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return truncateText(value.map((item) => formatMetadataValue(item)).join(" · "), 180);
  }

  if (value && typeof value === "object") {
    return truncateText(JSON.stringify(value), 180);
  }

  return "";
}

function truncateText(value: string, maxLength: number): string {
  const normalized = normalizeWhitespace(value.trim());
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3)}...`;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
