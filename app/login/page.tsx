import { Card, CardBody } from "@heroui/react";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/login/login-form";
import { Reveal } from "@/components/motion/reveal";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { getCurrentAdmin } from "@/lib/server/admin-session";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const admin = await getCurrentAdmin();
  if (admin) {
    redirect("/dashboard");
  }

  return (
    <main className="relative min-h-screen overflow-hidden px-3 py-3 sm:px-4 lg:px-6">
      <div className="ambient-orb orb-a" />
      <div className="ambient-orb orb-b" />
      <div className="mx-auto grid min-h-[calc(100vh-1.5rem)] max-w-[1440px] gap-3 lg:grid-cols-[1fr_29rem]">
        <Reveal className="flex">
          <section className="glass-panel hero-panel surface-ring flex min-h-[24rem] flex-1 flex-col justify-between rounded-[1.1rem] p-5 sm:p-6 lg:p-7">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-3">
                <span className="log-pill w-fit" data-tone="secondary">
                  Truy cập admin
                </span>
                <div className="space-y-2">
                  <h1 className="panel-title-lg max-w-3xl font-display">
                    Panel vận hành cho Discord bot, Lavalink và log runtime.
                  </h1>
                  <p className="panel-copy max-w-2xl sm:text-sm">
                    Không còn lớp giới thiệu dài dòng. Sau khi đăng nhập, bạn sẽ thấy trạng thái bot, node nhạc,
                    nhật ký hệ thống, nhật ký guild và cấu hình thực tế theo GMT+7.
                  </p>
                </div>
              </div>
              <ThemeToggle className="hidden sm:inline-flex" />
            </div>

            <div className="grid gap-2.5 md:grid-cols-2">
              {[
                ["Bot + Lavalink", "Theo dõi kết nối, queue, player đang chạy và session của node nhạc."],
                ["Nhật ký", "Đọc system logs từ file runtime và guild logs từ PostgreSQL trong cùng một khu vực."],
                ["Guild settings", "Cập nhật log channel ID và âm lượng playback cho từng guild."],
                ["Múi giờ thống nhất", "Mọi mốc thời gian hiển thị đồng bộ theo GMT+7."]
              ].map(([title, description]) => (
                <Card key={title} className="panel-card rounded-[0.95rem] shadow-none">
                  <CardBody className="space-y-2 p-3.5">
                    <p className="panel-kicker">{title}</p>
                    <p className="panel-copy text-sm">{description}</p>
                  </CardBody>
                </Card>
              ))}
            </div>
          </section>
        </Reveal>

        <Reveal delay={0.08} className="flex">
          <div className="glass-panel surface-ring flex flex-1 items-center rounded-[1.1rem] p-3 sm:p-4">
            <LoginForm />
          </div>
        </Reveal>
      </div>
    </main>
  );
}
