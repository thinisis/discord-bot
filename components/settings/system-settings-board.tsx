import { Card, CardBody } from "@heroui/react";

import { saveSystemSettingsAction } from "@/app/actions/system-settings";
import { SettingsSubmitButton } from "@/components/settings/settings-submit-button";

const fieldClassName = "panel-field";
const fieldLabelClassName = "panel-field-label";
const fieldHintClassName = "panel-field-hint";
const fieldInputClassName =
  "panel-input w-full rounded-[0.9rem] px-3 py-2 text-sm text-ink placeholder:text-subtle-ink";

export function SystemSettingsBoard({
  systemConfig
}: {
  systemConfig: {
    ownerDiscordIds: string;
    queuePageSize: number;
    idleMorningText: string;
    idleNoonText: string;
    idleEveningText: string;
    idleNightText: string;
  };
}) {
  return (
    <Card className="glass-panel rounded-[1rem] border-none">
      <CardBody className="space-y-4 p-4 sm:p-5">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="log-pill" data-tone="default">
              Hệ thống
            </span>
            <span className="log-pill" data-tone="success">
              GMT+7
            </span>
          </div>
          <h2 className="panel-title">
            Presence, owner IDs và queue mặc định
          </h2>
          <p className="panel-copy">
            Các thay đổi ở đây áp dụng ngay cho runtime hiện tại, gồm owner command, số mục mỗi trang queue và trạng
            thái idle theo khung giờ cố định.
          </p>
        </div>

        <form action={saveSystemSettingsAction} className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <div className={fieldClassName}>
              <label className={fieldLabelClassName} htmlFor="ownerDiscordIds">
                Owner Discord IDs
              </label>
              <textarea
                className={`${fieldInputClassName} min-h-28 resize-y`}
                defaultValue={systemConfig.ownerDiscordIds}
                id="ownerDiscordIds"
                name="ownerDiscordIds"
                placeholder="448715770696826890"
              />
              <p className={fieldHintClassName}>Nhập một hoặc nhiều Discord ID, cách nhau bằng dấu phẩy, khoảng trắng hoặc xuống dòng.</p>
            </div>

            <div className="grid gap-4">
              <div className={fieldClassName}>
                <label className={fieldLabelClassName} htmlFor="queuePageSize">
                  Queue page size
                </label>
                <input
                  className={fieldInputClassName}
                  defaultValue={String(systemConfig.queuePageSize)}
                  id="queuePageSize"
                  max={25}
                  min={5}
                  name="queuePageSize"
                  type="number"
                />
                <p className={fieldHintClassName}>Khoảng hợp lệ 5-25 mục mỗi trang khi mở `/queue` hoặc nút queue.</p>
              </div>

              <div className="panel-strip rounded-[0.9rem] px-3 py-3 text-xs leading-5 text-muted-ink">
                Presence idle dùng 4 khung giờ cố định theo GMT+7:
                <br />
                05:00-10:59 sáng, 11:00-16:59 trưa, 17:00-21:59 tối, 22:00-04:59 chúc ngủ ngon.
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              ["idleMorningText", "Chào buổi sáng", systemConfig.idleMorningText],
              ["idleNoonText", "Chúc buổi trưa", systemConfig.idleNoonText],
              ["idleEveningText", "Chào buổi tối", systemConfig.idleEveningText],
              ["idleNightText", "Chúc ngủ ngon", systemConfig.idleNightText]
            ].map(([name, label, value]) => (
              <div key={name} className={fieldClassName}>
                <label className={fieldLabelClassName} htmlFor={name}>
                  {label}
                </label>
                <input className={fieldInputClassName} defaultValue={String(value)} id={name} name={name} type="text" />
              </div>
            ))}
          </div>

          <div className="flex justify-end">
            <SettingsSubmitButton />
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
