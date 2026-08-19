import { Card, CardBody } from "@heroui/react";

import { saveCommandPoliciesAction } from "@/app/actions/system-settings";
import { SettingsSubmitButton } from "@/components/settings/settings-submit-button";

const selectClassName =
  "panel-input w-full rounded-[0.85rem] px-3 py-2 text-sm text-ink";

export function CommandPoliciesBoard({
  commandPolicies
}: {
  commandPolicies: Array<{
    name: string;
    description: string;
    accessLevel: "EVERYONE" | "OWNER";
  }>;
}) {
  return (
    <Card className="glass-panel rounded-[1rem] border-none">
      <CardBody className="space-y-4 p-4 sm:p-5">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="log-pill" data-tone="default">
              Command policy
            </span>
            <span className="log-pill" data-tone="warning">
              Owner control
            </span>
          </div>
          <h2 className="panel-title">
            Chọn command nào ai cũng dùng được, command nào chỉ owner mới exec
          </h2>
          <p className="panel-copy">
            Policy được kiểm tra ở runtime cho từng slash command. Người không đủ quyền sẽ bị từ chối trước khi thực thi.
          </p>
        </div>

        <form action={saveCommandPoliciesAction} className="space-y-3">
          <div className="space-y-2">
            {commandPolicies.map((command) => (
              <div
                key={command.name}
                className="grid gap-3 rounded-[0.9rem] border border-[var(--border-soft)] bg-[var(--bg-panel-muted)] px-3 py-3 md:grid-cols-[minmax(0,1fr)_11rem]"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-mono text-sm font-semibold text-ink">/{command.name}</p>
                    <span className="log-pill" data-tone={command.accessLevel === "OWNER" ? "warning" : "success"}>
                      {command.accessLevel === "OWNER" ? "Owner only" : "Everyone"}
                    </span>
                  </div>
                  <p className="text-xs leading-5 text-muted-ink">{command.description}</p>
                </div>

                <label className="panel-field">
                  <span className="panel-field-label">Quyền thực thi</span>
                  <select className={selectClassName} defaultValue={command.accessLevel} name={`command:${command.name}`}>
                    <option value="EVERYONE">Everyone</option>
                    <option value="OWNER">Owner only</option>
                  </select>
                </label>
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
