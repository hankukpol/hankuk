import { NextResponse } from "next/server";
import { authorizeCronRequest } from "@/lib/cron";
import { hasServiceRoleConfig } from "@/lib/env";
import { generateWeeklyReportXlsx } from "@/lib/export/weekly-report";
import { getPrisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WEEKLY_REPORT_BUCKET = process.env.WEEKLY_REPORT_BUCKET?.trim() || "scheduled-reports";

export async function GET(request: Request) {
  const auth = authorizeCronRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const activePeriod = await getPrisma().examPeriod.findFirst({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
    },
    orderBy: [{ startDate: "desc" }, { id: "desc" }],
  });

  if (!activePeriod) {
    return NextResponse.json({ skipped: "no active period" });
  }

  const report = await generateWeeklyReportXlsx(activePeriod.id);
  if (!report) {
    return NextResponse.json({
      skipped: "no completed sessions",
      periodId: activePeriod.id,
      periodName: activePeriod.name,
    });
  }

  if (!hasServiceRoleConfig()) {
    return NextResponse.json(
      {
        error: "Weekly report storage is not configured.",
        fileName: report.fileName,
        generatedAt: report.generatedAt.toISOString(),
        periodId: report.periodId,
        periodName: report.periodName,
      },
      { status: 503 },
    );
  }

  const storagePath = `weekly-reports/${report.generatedAt.toISOString().slice(0, 10)}/${report.fileName}`;
  const { error } = await createAdminClient()
    .storage
    .from(WEEKLY_REPORT_BUCKET)
    .upload(storagePath, report.buffer, {
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      upsert: true,
    });

  if (error) {
    return NextResponse.json(
      {
        error: error.message,
        fileName: report.fileName,
        generatedAt: report.generatedAt.toISOString(),
        periodId: report.periodId,
        periodName: report.periodName,
        scopes: report.scopes,
        storage: {
          uploaded: false,
          bucket: WEEKLY_REPORT_BUCKET,
          path: storagePath,
        },
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    success: true,
    fileName: report.fileName,
    generatedAt: report.generatedAt.toISOString(),
    periodId: report.periodId,
    periodName: report.periodName,
    scopes: report.scopes,
    storage: {
      uploaded: true,
      bucket: WEEKLY_REPORT_BUCKET,
      path: storagePath,
    },
  });
}
