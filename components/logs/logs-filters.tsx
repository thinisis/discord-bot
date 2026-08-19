"use client";

import { Card, CardBody } from "@heroui/react";
import { startTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { AdminButton } from "@/components/ui/admin-button";

const actions = [
  {
    key: "",
    label: "Tất cả"
  },
  {
    key: "channel.created",
    label: "Tạo kênh"
  },
  {
    key: "channel.updated",
    label: "Cập nhật kênh"
  },
  {
    key: "channel.deleted",
    label: "Xóa kênh"
  },
  {
    key: "voice.joined",
    label: "Vào voice"
  },
  {
    key: "voice.left",
    label: "Rời voice"
  },
  {
    key: "voice.moved",
    label: "Chuyển voice"
  }
];

export function LogsFilters({
  guildOptions,
  selectedGuildId,
  selectedAction
}: {
  guildOptions: Array<{ guildId: string; guildName: string }>;
  selectedGuildId: string;
  selectedAction: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateFilters(nextGuildId: string, nextAction: string) {
    const nextSearchParams = new URLSearchParams(searchParams.toString());

    if (nextGuildId) {
      nextSearchParams.set("guildId", nextGuildId);
    } else {
      nextSearchParams.delete("guildId");
    }

    if (nextAction) {
      nextSearchParams.set("action", nextAction);
    } else {
      nextSearchParams.delete("action");
    }

    nextSearchParams.delete("guildPage");

    const nextUrl = nextSearchParams.size > 0 ? `${pathname}?${nextSearchParams.toString()}` : pathname;
    startTransition(() => {
      router.replace(nextUrl, {
        scroll: false
      });
    });
  }

  return (
    <Card className="glass-panel rounded-[1rem] border-none">
      <CardBody className="space-y-4 p-4">
        <div className="space-y-2">
          <div>
            <p className="panel-kicker">Bộ lọc</p>
            <h3 className="panel-title mt-1 text-sm">Action</h3>
          </div>

          <div className="flex flex-wrap gap-2">
            {actions.map((action) => {
              const isActive = selectedAction === action.key;

              return (
                <AdminButton
                  key={action.key || "all"}
                  className="h-8 px-3 text-xs"
                  kind={isActive ? "solid" : "soft"}
                  size="sm"
                  tone={isActive ? "accent" : "default"}
                  onPress={() => updateFilters(selectedGuildId, action.key)}
                >
                  {action.label}
                </AdminButton>
              );
            })}
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <p className="panel-kicker">Phạm vi</p>
            <h3 className="panel-title mt-1 text-sm">Guild</h3>
          </div>

          <div className="panel-strip flex items-center rounded-[0.85rem] px-3 py-2.5">
            <select
              aria-label="Guild filter"
              className="w-full bg-transparent text-sm text-ink outline-none"
              value={selectedGuildId}
              onChange={(event) => updateFilters(event.target.value, selectedAction)}
            >
              <option value="">Tất cả guild</option>
              {guildOptions.map((guild) => (
                <option key={guild.guildId} value={guild.guildId}>
                  {guild.guildName}
                </option>
              ))}
            </select>
          </div>
          {(selectedGuildId || selectedAction) && (
            <AdminButton size="sm" tone="default" onPress={() => updateFilters("", "")}>
              Xóa bộ lọc
            </AdminButton>
          )}
        </div>

        <div className="panel-strip rounded-[0.85rem] px-3 py-3 text-xs leading-5 text-muted-ink">
          Bộ lọc chỉ áp dụng cho guild log. System log vẫn được đọc trực tiếp từ file runtime đang chạy.
        </div>
      </CardBody>
    </Card>
  );
}
