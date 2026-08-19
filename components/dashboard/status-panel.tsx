"use client";

import { Card, CardBody } from "@heroui/react";
import { motion } from "framer-motion";
import Link from "next/link";
import { startTransition, useEffect, useEffectEvent, useState } from "react";

import { AdminButton } from "@/components/ui/admin-button";
import { formatDateTime, formatRelativeDuration } from "@/src/lib/format";

type LiveStatus = {
  bot: {
    enabled: boolean;
    ready: boolean;
    guildCount: number;
    pingMs: number | null;
    uptimeSeconds: number;
    currentUserTag: string | null;
    music: {
      backend: "lavalink";
      configured: boolean;
      connected: boolean;
      resumed: boolean;
      sessionId: string | null;
      nodeHost: string;
      nodeVersion: string | null;
      sources: string[];
      plugins: string[];
      lavalinkPlayers: number;
      lavalinkPlayingPlayers: number;
      activeGuilds: number;
      queuedTracks: number;
      activeTracks: number;
      uptimeMs: number | null;
      lastError: string | null;
      sessions: Array<{
        guildId: string;
        voiceChannelId: string | null;
        queueLength: number;
        connected: boolean;
        ping: number | null;
        currentTrack: string | null;
      }>;
    };
  };
  system: {
    appMode: string;
    nodeVersion: string;
    memoryRss: number;
    memoryLabel: string;
    uptimeSeconds: number;
    runtimeStartedAt: number;
  };
};

export function StatusPanel({ initialStatus }: { initialStatus: LiveStatus }) {
  const [status, setStatus] = useState(initialStatus);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(Date.now());

  const refreshStatus = useEffectEvent(async () => {
    const response = await fetch("/api/status", {
      cache: "no-store"
    });

    if (!response.ok) {
      return;
    }

    const nextStatus = (await response.json()) as LiveStatus;
    startTransition(() => {
      setStatus(nextStatus);
      setLastUpdatedAt(Date.now());
    });
  });

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void refreshStatus();
    }, 15_000);

    void refreshStatus();

    return () => {
      window.clearInterval(intervalId);
    };
  }, [refreshStatus]);

  const readinessLevel = !status.bot.enabled
    ? 5
    : status.bot.ready && status.bot.music.connected
      ? 100
      : status.bot.ready
        ? 66
        : 34;
  const readinessTone = readinessLevel >= 90 ? "high" : readinessLevel >= 60 ? "medium" : "low";
  const readinessTextClassName =
    readinessTone === "high"
      ? "text-[var(--tone-success-text)]"
      : readinessTone === "medium"
        ? "text-[var(--tone-warning-text)]"
        : "text-[var(--tone-danger-text)]";

  const summaryItems = [
    { label: "Discord", value: status.bot.currentUserTag ?? "chưa sẵn sàng" },
    { label: "App mode", value: status.system.appMode.toUpperCase() },
    { label: "Gateway ping", value: status.bot.pingMs !== null ? `${status.bot.pingMs} ms` : "n/a" },
    { label: "Bot uptime", value: formatRelativeDuration(status.bot.uptimeSeconds) },
    { label: "Memory RSS", value: status.system.memoryLabel },
    { label: "Lavalink host", value: status.bot.music.nodeHost || "chưa cấu hình" },
    { label: "Node version", value: status.bot.music.nodeVersion ?? "n/a" },
    { label: "Nguồn", value: status.bot.music.sources.join(", ") || "n/a" }
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1], delay: 0.04 }}
    >
      <Card className="glass-panel rounded-[1rem] border-none">
        <CardBody className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1.5">
              <p className="panel-kicker">Runtime</p>
              <h2 className="panel-title text-base sm:text-lg">
                Bot, gateway và Lavalink
              </h2>
              <p className="panel-copy">
                Theo dõi các tín hiệu runtime chính và phiên music đang mở trong bố cục gọn hơn.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="log-pill" data-tone="default">
                {status.bot.ready ? "Bot sẵn sàng" : status.bot.enabled ? "Bot khởi động" : "Bot tắt"}
              </span>
              <span className="log-pill" data-tone={status.bot.music.connected ? "success" : "danger"}>
                {status.bot.music.connected ? "Lavalink online" : "Lavalink offline"}
              </span>
              <span className="log-pill" data-tone={status.bot.music.resumed ? "primary" : "secondary"}>
                {status.bot.music.resumed ? "Resume on" : "Resume off"}
              </span>
            </div>
          </div>

          <div className="panel-strip rounded-[0.9rem] px-3 py-3">
            <div className="mb-2 flex items-center justify-between gap-3 text-xs">
              <span className="panel-meta">Mức sẵn sàng tổng thể</span>
              <span className={`font-medium ${readinessTextClassName}`}>
                {readinessLevel}%
              </span>
            </div>
            <div aria-label="Bot connection readiness" className="status-meter" data-level={readinessTone}>
              <div className="status-meter-fill" style={{ width: `${readinessLevel}%` }} />
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {summaryItems.map((item) => (
              <StatusItem key={item.label} label={item.label} value={item.value} />
            ))}
          </div>

          {status.bot.music.lastError ? (
            <div data-tone="danger" className="panel-notice rounded-[0.9rem] px-3 py-3 text-xs leading-5">
              {status.bot.music.lastError}
            </div>
          ) : null}

          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="panel-kicker">Phiên music</p>
              <div className="flex flex-wrap gap-2">
                <AdminButton as={Link} href="/settings" size="sm" tone="default">
                  Cấu hình
                </AdminButton>
                <AdminButton as={Link} href="/logs" kind="solid" size="sm" tone="accent">
                  Logs
                </AdminButton>
              </div>
            </div>

            {status.bot.music.sessions.length === 0 ? (
              <div className="panel-empty rounded-[0.9rem] px-3 py-3 text-xs leading-5 text-muted-ink">
                Chưa có guild nào đang giữ phiên music hoặc queue.
              </div>
            ) : (
              <div className="space-y-2">
                {status.bot.music.sessions.map((session) => (
                  <div key={session.guildId} className="panel-card rounded-[0.9rem] px-3 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-ink">
                          {session.currentTrack ?? "Không có track đang phát"}
                        </p>
                        <p className="panel-meta mt-1 break-all">
                          Guild {session.guildId} · Voice {session.voiceChannelId ?? "chưa gắn"}
                        </p>
                      </div>

                      <div className="grid gap-1 text-right text-[11px] leading-5 text-muted-ink">
                        <div>Queue: {session.queueLength}</div>
                        <div>Ping: {session.ping !== null ? `${session.ping} ms` : "n/a"}</div>
                        <div>{session.connected ? "Connected" : "Disconnected"}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="panel-strip flex flex-wrap items-center justify-between gap-3 rounded-[0.9rem] px-3 py-3 text-xs leading-5 text-muted-ink">
            <div className="grid gap-1">
              <p>Cập nhật lần cuối: {formatDateTime(new Date(lastUpdatedAt))}</p>
              <p>Runtime bắt đầu: {formatDateTime(new Date(status.system.runtimeStartedAt))}</p>
            </div>
            <div className="grid gap-1 text-left sm:text-right">
              <p>Guild cache: {status.bot.guildCount}</p>
              <p>Player / Queue: {status.bot.music.activeTracks} / {status.bot.music.queuedTracks}</p>
            </div>
          </div>
        </CardBody>
      </Card>
    </motion.div>
  );
}

function StatusItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel-card rounded-[0.85rem] px-3 py-2.5">
      <p className="panel-meta">{label}</p>
      <p className="mt-1.5 break-words text-sm font-medium text-ink">{value}</p>
    </div>
  );
}
