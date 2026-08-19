import { redirect } from "next/navigation";

import { getCurrentAdmin } from "@/lib/server/admin-session";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const admin = await getCurrentAdmin();
  redirect(admin ? "/dashboard" : "/login");
}
