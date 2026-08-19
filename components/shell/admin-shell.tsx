"use client";

import { Card, CardBody } from "@heroui/react";
import { motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { logoutAction } from "@/app/actions/auth";
import { ThemeToggle } from "@/components/theme/theme-toggle";

const navigationItems = [
  { href: "/dashboard", label: "Tổng quan" },
  { href: "/logs", label: "Nhật ký" },
  { href: "/settings", label: "Cài đặt" }
];

export function AdminShell({
  admin,
  children
}: {
  admin: {
    username: string;
    lastLoginLabel: string;
  };
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="relative h-[100dvh] overflow-hidden px-2 py-2 sm:px-3 lg:px-4">
      <div className="ambient-orb orb-a" />
      <div className="ambient-orb orb-b" />
      <div className="mx-auto flex h-[calc(100dvh-1rem)] max-w-[1760px] items-start gap-3">
        <motion.aside
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className="glass-panel surface-ring hidden h-full w-[15.5rem] shrink-0 self-start rounded-[1rem] border-none p-2 lg:sticky lg:top-2 lg:flex"
        >
          <div className="flex h-full w-full flex-col gap-3 overflow-y-auto pr-1">
            <Card className="glass-panel rounded-[0.9rem] border-none shadow-none">
              <CardBody className="space-y-3 p-4">
                <div className="space-y-1">
                  <p className="panel-kicker">Admin</p>
                  <h2 className="panel-title">{admin.username}</h2>
                </div>
                <p className="panel-copy">Đăng nhập gần nhất: {admin.lastLoginLabel}</p>
                <div className="panel-strip rounded-[0.75rem] px-3 py-2 text-xs leading-5 text-muted-ink">
                  Giao diện quản trị compact. Tất cả thời gian hiển thị theo GMT+7.
                </div>
              </CardBody>
            </Card>

            <nav className="space-y-1.5">
              {navigationItems.map((item) => {
                const isActive = pathname === item.href;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="nav-pill flex h-9 w-full items-center rounded-[0.8rem] px-3 text-sm font-medium transition"
                    data-active={isActive ? "true" : "false"}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="mt-auto">
              <ThemeToggle className="mb-2 w-full justify-center" />
              <form action={logoutAction}>
                <button
                  className="nav-pill h-9 w-full rounded-[0.8rem] px-3 text-sm font-medium transition"
                  type="submit"
                >
                  Đăng xuất
                </button>
              </form>
            </div>
          </div>
        </motion.aside>

        <div className="flex h-full min-w-0 flex-1 flex-col gap-3 self-stretch">
          <motion.header
            initial={{ opacity: 0, y: -18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1], delay: 0.04 }}
            className="glass-panel surface-ring shrink-0 rounded-[1rem] border-none px-4 py-3"
          >
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="space-y-1.5">
                <div className="panel-meta flex flex-wrap items-center gap-2">
                  <span>Discord Bot Admin</span>
                  <span className="text-subtle-ink">•</span>
                  <span className="text-ink">{admin.username}</span>
                  <span className="text-subtle-ink">•</span>
                  <span>GMT+7</span>
                </div>
                <div>
                  <h1 className="panel-title text-lg sm:text-xl">
                    Bảng quan sát vận hành
                  </h1>
                  <p className="panel-copy">
                    Trạng thái bot, Lavalink, log và cấu hình được nén lại để dễ quan sát trên một màn hình.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="hidden lg:block">
                  <ThemeToggle />
                </div>
                {navigationItems.map((item) => {
                  const isActive = pathname === item.href;

                  return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="nav-pill inline-flex h-9 items-center rounded-[0.8rem] px-3 text-sm font-medium transition"
                    data-active={isActive ? "true" : "false"}
                  >
                    {item.label}
                  </Link>
                );
                })}
              </div>
            </div>
          </motion.header>

          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto pr-1">{children}</div>
        </div>
      </div>
    </div>
  );
}
