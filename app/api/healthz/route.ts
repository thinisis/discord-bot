import { NextResponse } from "next/server";

import { env } from "@/src/config/env";
import { getBotStatusSnapshot } from "@/src/lib/runtime-state";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    mode: env.APP_MODE,
    bot: getBotStatusSnapshot()
  });
}
