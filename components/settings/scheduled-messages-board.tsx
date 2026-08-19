import { ScheduledMessageFrequency } from "@prisma/client";
import { Card, CardBody } from "@heroui/react";

import {
  deleteScheduledMessageAction,
  saveScheduledMessageAction
} from "@/app/actions/system-settings";
import { SettingsSubmitButton } from "@/components/settings/settings-submit-button";
import { formatDateTime } from "@/src/lib/format";

const fieldInputClassName =
  "panel-input w-full rounded-[0.85rem] px-3 py-2 text-sm text-ink placeholder:text-subtle-ink";

const frequencyOptions = [
  { value: ScheduledMessageFrequency.DAILY, label: "Hàng ngày" },
  { value: ScheduledMessageFrequency.WEEKLY, label: "Hàng tuần" },
  { value: ScheduledMessageFrequency.ONCE, label: "Một lần" }
] as const;

export function ScheduledMessagesBoard({
  guildOptions,
  scheduledMessages
}: {
  guildOptions: Array<{ guildId: string; guildName: string }>;
  scheduledMessages: Array<{
    id: string;
    name: string;
    guildId: string;
    channelId: string;
    message: string;
    frequency: ScheduledMessageFrequency;
    daysOfWeek: string | null;
    hour: number | null;
    minute: number | null;
    runAt: Date | null;
    enabled: boolean;
    lastSentAt: Date | null;
    nextRunAt: Date | null;
  }>;
}) {
  return (
    <Card className="glass-panel rounded-[1rem] border-none">
      <CardBody className="space-y-4 p-4 sm:p-5">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="log-pill" data-tone="default">
              Lịch gửi
            </span>
            <span className="log-pill" data-tone="primary">
              Upstash Redis
            </span>
          </div>
          <h2 className="panel-title">
            Gửi tin nhắn định kỳ tới Discord từ admin panel
          </h2>
          <p className="panel-copy">
            Dùng cho lời chúc sinh nhật, thông báo định kỳ hoặc message đã chuẩn bị sẵn. Giờ lặp lại được hiểu theo GMT+7.
          </p>
        </div>

        <div className="panel-card rounded-[0.95rem] p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="panel-meta">Tạo lịch mới</p>
              <p className="mt-1 text-xs leading-5 text-muted-ink">
                `daysOfWeek` dùng số 0-6, trong đó `0 = Chủ nhật`, `1 = Thứ hai`, ..., `6 = Thứ bảy`.
              </p>
            </div>
          </div>
          <ScheduledMessageForm guildOptions={guildOptions} />
        </div>

        <div className="space-y-3">
          {scheduledMessages.length === 0 ? (
            <div className="panel-empty rounded-[0.9rem] px-3 py-3 text-xs leading-5 text-muted-ink">
              Chưa có lịch gửi nào được tạo.
            </div>
          ) : (
            scheduledMessages.map((schedule) => (
              <div key={schedule.id} className="panel-card rounded-[0.95rem] p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-ink">{schedule.name}</h3>
                      <span className="log-pill" data-tone={schedule.enabled ? "success" : "secondary"}>
                        {schedule.enabled ? "Đang bật" : "Đang tắt"}
                      </span>
                      <span className="log-pill" data-tone="default">
                        {frequencyOptions.find((option) => option.value === schedule.frequency)?.label ?? schedule.frequency}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted-ink">
                      Chạy tiếp: {schedule.nextRunAt ? formatDateTime(schedule.nextRunAt) : "chưa có lịch"} · Gửi gần nhất:{" "}
                      {schedule.lastSentAt ? formatDateTime(schedule.lastSentAt) : "chưa gửi"}
                    </p>
                  </div>

                  <form action={deleteScheduledMessageAction}>
                    <input name="id" type="hidden" value={schedule.id} />
                    <button
                      className="panel-link-button rounded-[0.8rem] px-3 py-2 text-xs font-medium"
                      type="submit"
                    >
                      Xóa lịch
                    </button>
                  </form>
                </div>

                <ScheduledMessageForm guildOptions={guildOptions} schedule={schedule} />
              </div>
            ))
          )}
        </div>
      </CardBody>
    </Card>
  );
}

function ScheduledMessageForm({
  guildOptions,
  schedule
}: {
  guildOptions: Array<{ guildId: string; guildName: string }>;
  schedule?: {
    id: string;
    name: string;
    guildId: string;
    channelId: string;
    message: string;
    frequency: ScheduledMessageFrequency;
    daysOfWeek: string | null;
    hour: number | null;
    minute: number | null;
    runAt: Date | null;
    enabled: boolean;
  };
}) {
  return (
    <form action={saveScheduledMessageAction} className="space-y-3">
      {schedule ? <input name="id" type="hidden" value={schedule.id} /> : null}

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,0.9fr)]">
        <label className="panel-field">
          <span className="panel-field-label">Tên lịch</span>
          <input className={fieldInputClassName} defaultValue={schedule?.name ?? ""} name="name" placeholder="Chúc mừng sinh nhật" type="text" />
        </label>

        <label className="panel-field">
          <span className="panel-field-label">Guild</span>
          <select className={fieldInputClassName} defaultValue={schedule?.guildId ?? guildOptions[0]?.guildId ?? ""} name="guildId">
            {guildOptions.map((guild) => (
              <option key={guild.guildId} value={guild.guildId}>
                {guild.guildName}
              </option>
            ))}
          </select>
        </label>

        <label className="panel-field">
          <span className="panel-field-label">Channel ID</span>
          <input
            className={fieldInputClassName}
            defaultValue={schedule?.channelId ?? ""}
            name="channelId"
            placeholder="123456789012345678"
            type="text"
          />
        </label>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,0.7fr)_minmax(0,0.7fr)_minmax(0,0.9fr)_minmax(0,1fr)]">
        <label className="panel-field">
          <span className="panel-field-label">Tần suất</span>
          <select className={fieldInputClassName} defaultValue={schedule?.frequency ?? ScheduledMessageFrequency.DAILY} name="frequency">
            {frequencyOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="panel-field">
          <span className="panel-field-label">Giờ</span>
          <input className={fieldInputClassName} defaultValue={schedule?.hour ?? ""} max={23} min={0} name="hour" type="number" />
        </label>

        <label className="panel-field">
          <span className="panel-field-label">Phút</span>
          <input className={fieldInputClassName} defaultValue={schedule?.minute ?? ""} max={59} min={0} name="minute" type="number" />
        </label>

        <label className="panel-field">
          <span className="panel-field-label">Days of week</span>
          <input
            className={fieldInputClassName}
            defaultValue={schedule?.daysOfWeek ?? ""}
            name="daysOfWeek"
            placeholder="1,3,5"
            type="text"
          />
        </label>

        <label className="panel-field">
          <span className="panel-field-label">Một lần tại</span>
          <input
            className={fieldInputClassName}
            defaultValue={formatDateTimeLocalValue(schedule?.runAt ?? null)}
            name="runAt"
            type="datetime-local"
          />
        </label>
      </div>

      <label className="panel-field">
        <span className="panel-field-label">Nội dung tin nhắn</span>
        <textarea
          className={`${fieldInputClassName} min-h-28 resize-y`}
          defaultValue={schedule?.message ?? ""}
          name="message"
          placeholder="Chúc cả server một ngày vui vẻ..."
        />
      </label>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="panel-card-strong flex cursor-pointer items-center gap-3 rounded-[0.9rem] px-3 py-2 text-sm text-ink">
          <input className="panel-checkbox h-4 w-4" defaultChecked={schedule?.enabled ?? true} name="enabled" type="checkbox" />
          Bật lịch gửi này
        </label>

        <SettingsSubmitButton />
      </div>
    </form>
  );
}

function formatDateTimeLocalValue(value: Date | null): string {
  if (!value) {
    return "";
  }

  const shifted = new Date(value.getTime() + 7 * 60 * 60 * 1000);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  const hour = String(shifted.getUTCHours()).padStart(2, "0");
  const minute = String(shifted.getUTCMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hour}:${minute}`;
}
