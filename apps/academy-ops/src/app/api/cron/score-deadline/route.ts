import { NextResponse } from "next/server";
import { authorizeCronRequest } from "@/lib/cron";
import { runScoreDeadlineNotifications } from "@/lib/notifications/score-deadline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = authorizeCronRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const result = await runScoreDeadlineNotifications();
  if (result.error) {
    return NextResponse.json(result, { status: 503 });
  }

  return NextResponse.json(result);
}