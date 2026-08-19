import { AdminShell } from "@/components/shell/admin-shell";
import { requireCurrentAdmin } from "@/lib/server/admin-session";
import { formatDateTime } from "@/src/lib/format";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const admin = await requireCurrentAdmin();

  return (
    <AdminShell
      admin={{
        username: admin.username,
        lastLoginLabel: admin.lastLoginAt ? formatDateTime(admin.lastLoginAt) : "Chưa có"
      }}
    >
      {children}
    </AdminShell>
  );
}
