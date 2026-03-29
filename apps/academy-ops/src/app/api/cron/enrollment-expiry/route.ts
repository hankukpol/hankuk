import { NextResponse } from "next/server";
import { authorizeCronRequest } from "@/lib/cron";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = authorizeCronRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  // yesterday = today 00:00:00 KST (stored as UTC in DB)
  // endDate < today means the course ended before today → mark COMPLETED
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const result = await getPrisma().courseEnrollment.updateMany({
    where: {
      status: "ACTIVE",
      endDate: { lt: today },
    },
    data: { status: "COMPLETED" },
  });

  console.log(`[enrollment-expiry] completed=${result.count} at ${new Date().toISOString()}`);

  return NextResponse.json({ completed: result.count });
}
