import { NextResponse } from "next/server";

import { getCurrentAdmin } from "@/lib/server/admin-session";
import { getLiveStatusSnapshot } from "@/lib/server/dashboard-data";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json(
      {
        error: "Unauthorized"
      },
      {
        status: 401
      }
    );
  }

  return NextResponse.json(getLiveStatusSnapshot());
}
