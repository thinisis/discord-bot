"use client";

import { Card, CardBody } from "@heroui/react";
import { useDeferredValue, useState } from "react";

import { saveGuildSettingsAction } from "@/app/actions/guilds";
import { Reveal } from "@/components/motion/reveal";
import { SettingsSubmitButton } from "@/components/settings/settings-submit-button";

type GuildConfigView = {
  guildId: string;
  guildName: string;
  botEnabled: boolean;
  logChannelId: string | null;
  musicVolume: number;
};

const fieldClassName = "panel-field";
const fieldHintClassName = "panel-field-hint";
const fieldLabelClassName = "panel-field-label";
const fieldInputClassName =
  "panel-input w-full rounded-[1rem] px-3.5 py-2.5 text-sm text-ink placeholder:text-subtle-ink";

export function GuildSettingsBoard({
  guilds,
  summary
}: {
  guilds: GuildConfigView[];
  summary: {
    totalGuilds: number;
    enabledGuilds: number;
    disabledGuilds: number;
    configuredLogGuilds: number;
    averageVolume: number;
  };
}) {
  const [searchValue, setSearchValue] = useState("");
  const deferredSearch = useDeferredValue(searchValue.trim().toLowerCase());
  const searchInputId = "guild-settings-search";

  const filteredGuilds = guilds.filter((guild) => {
    if (!deferredSearch) return true;

    return (
      guild.guildName.toLowerCase().includes(deferredSearch) ||
      guild.guildId.toLowerCase().includes(deferredSearch)
    );
  });

  return (
    <div className="space-y-4">
      <section className="metric-grid">
        {[
          ["Tổng guild", String(summary.totalGuilds)],
          ["Guild đang bật bot", String(summary.enabledGuilds)],
          ["Guild đang tắt bot", String(summary.disabledGuilds)],
          ["Guild đã có log channel", String(summary.configuredLogGuilds)],
          ["Music volume trung bình", `${summary.averageVolume}%`]
        ].map(([label, value], index) => (
          <Reveal key={label} delay={0.03 * (index + 1)}>
            <Card className="glass-panel rounded-[1rem] border-none">
              <CardBody className="space-y-2 p-4">
                <p className="panel-kicker">{label}</p>
                <div className="text-2xl font-semibold leading-none tracking-[-0.03em] text-ink">
                  {value}
                </div>
              </CardBody>
            </Card>
          </Reveal>
        ))}
      </section>

      <Reveal delay={0.08}>
        <Card className="glass-panel rounded-[1rem] border-none">
          <CardBody className="p-4 sm:p-5">
            <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
              <div className={fieldClassName}>
                <label className={fieldLabelClassName} htmlFor={searchInputId}>
                  Tìm guild
                </label>
                <input
                  aria-label="Tìm guild"
                  className={fieldInputClassName}
                  id={searchInputId}
                  placeholder="Lọc theo tên guild hoặc guild ID"
                  type="search"
                  value={searchValue}
                  onChange={(event) => setSearchValue(event.target.value)}
                />
                <p className={fieldHintClassName}>Lọc theo tên hiển thị hoặc guild ID để thu gọn danh sách nhanh hơn.</p>
              </div>
              <div className="panel-strip rounded-[0.95rem] px-4 py-3 text-sm leading-6 text-muted-ink">
                Tắt bot ở đây sẽ chặn slash command, dừng playback đang chạy và ngừng ghi log tự động cho guild đó.
              </div>
            </div>
          </CardBody>
        </Card>
      </Reveal>

      <div className="space-y-4">
        {filteredGuilds.length === 0 ? (
          <Card className="glass-panel rounded-[1rem] border-none">
            <CardBody className="px-4 py-6 text-sm text-muted-ink">
              Không tìm thấy guild nào khớp với bộ lọc hiện tại.
            </CardBody>
          </Card>
        ) : (
          filteredGuilds.map((guild, index) => {
            const logChannelInputId = `guild-${guild.guildId}-log-channel`;
            const musicVolumeInputId = `guild-${guild.guildId}-music-volume`;

            return (
              <Reveal key={guild.guildId} delay={Math.min(index * 0.03, 0.18)}>
                <form action={saveGuildSettingsAction}>
                  <input type="hidden" name="guildId" value={guild.guildId} />
                  <Card className="glass-panel rounded-[1rem] border-none">
                    <CardBody className="space-y-4 p-4 sm:p-5">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="panel-title text-lg">
                              {guild.guildName}
                            </h2>
                            <span className="log-pill" data-tone={guild.botEnabled ? "success" : "danger"}>
                              {guild.botEnabled ? "Bot đang bật" : "Bot đang tắt"}
                            </span>
                            <span className="log-pill" data-tone={guild.logChannelId ? "primary" : "default"}>
                              {guild.logChannelId ? "Đã có log channel" : "Chưa cấu hình log channel"}
                            </span>
                          </div>
                          <p className="panel-meta">
                            Guild ID: {guild.guildId}
                          </p>
                        </div>
                        <div className="panel-strip rounded-[0.9rem] px-3 py-2 text-sm text-muted-ink">
                          {guild.botEnabled ? "Bot đang được phép hoạt động trong guild này." : "Bot đang bị chặn trong guild này."}
                        </div>
                      </div>

                      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.8fr)_auto]">
                        <label className="panel-card-strong flex cursor-pointer items-center justify-between gap-4 rounded-[1rem] px-4 py-4">
                          <div className="space-y-1">
                            <span className="block text-sm font-medium text-ink">Bật bot cho guild này</span>
                            <span className="block text-xs leading-5 text-muted-ink">
                              Khi tắt, bot sẽ rời voice và bỏ qua các log guild phát sinh sau đó.
                            </span>
                          </div>
                          <span className="panel-toggle">
                            <input
                              className="panel-toggle-input"
                              defaultChecked={guild.botEnabled}
                              name="botEnabled"
                              type="checkbox"
                            />
                            <span className="panel-toggle-track">
                              <span className="panel-toggle-thumb" />
                            </span>
                          </span>
                        </label>

                        <div className={fieldClassName}>
                          <label className={fieldLabelClassName} htmlFor={logChannelInputId}>
                            Log channel ID
                          </label>
                          <input
                            className={fieldInputClassName}
                            defaultValue={guild.logChannelId ?? ""}
                            id={logChannelInputId}
                            inputMode="numeric"
                            name="logChannelId"
                            placeholder="123456789012345678"
                            type="text"
                          />
                          <p className={fieldHintClassName}>Để trống nếu không mirror log từ guild sang Discord.</p>
                        </div>

                        <div className={fieldClassName}>
                          <label className={fieldLabelClassName} htmlFor={musicVolumeInputId}>
                            Music volume
                          </label>
                          <input
                            className={`${fieldInputClassName} [appearance:textfield]`}
                            defaultValue={String(guild.musicVolume)}
                            id={musicVolumeInputId}
                            max={200}
                            min={0}
                            name="musicVolume"
                            placeholder="0 - 200"
                            type="number"
                          />
                          <p className={fieldHintClassName}>Khoảng hợp lệ 0-200 và được áp dụng ngay cho runtime hiện tại.</p>
                        </div>

                        <div className="flex w-full items-end lg:w-auto">
                          <SettingsSubmitButton />
                        </div>
                      </div>
                    </CardBody>
                  </Card>
                </form>
              </Reveal>
            );
          })
        )}
      </div>
    </div>
  );
}
