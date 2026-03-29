import { AdminRole, ExamType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { roleAtLeast } from "@/lib/auth";
import {
  buildIcalFileName,
  hasIcalFeedSecret,
  readIcalFeedToken,
  serializeExamScheduleIcal,
} from "@/lib/calendar/ical-feed";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseExamType(value: string | null) {
  if (!value || !Object.values(ExamType).includes(value as ExamType)) {
    return null;
  }

  return value as ExamType;
}

function textResponse(message: string, status: number) {
  return new NextResponse(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request: NextRequest) {
  if (!hasIcalFeedSecret()) {
    return textResponse("ICAL_FEED_SECRET is not configured.", 503);
  }

  const url = new URL(request.url);
  const periodId = Number(url.searchParams.get("periodId"));
  const examType = parseExamType(url.searchParams.get("examType"));
  const token = url.searchParams.get("token");

  if (!Number.isInteger(periodId) || periodId <= 0 || !examType || !token) {
    return textResponse("Invalid calendar feed parameters.", 400);
  }

  const payload = readIcalFeedToken(token);
  if (!payload) {
    return textResponse("Invalid calendar feed token.", 403);
  }

  if (
    payload.periodId !== periodId ||
    payload.examType !== examType
  ) {
    return textResponse("Calendar feed token does not match the requested scope.", 403);
  }

  const prisma = getPrisma();
  const adminUser = await prisma.adminUser.findUnique({
    where: { id: payload.adminId },
    select: {
      id: true,
      role: true,
      isActive: true,
    },
  });

  if (!adminUser || !adminUser.isActive || !roleAtLeast(adminUser.role, AdminRole.TEACHER)) {
    return textResponse("Calendar feed access has been revoked.", 403);
  }

  const period = await prisma.examPeriod.findUnique({
    where: { id: periodId },
    select: {
      id: true,
      name: true,
    },
  });

  if (!period) {
    return textResponse("Exam period not found.", 404);
  }

  const sessions = await prisma.examSession.findMany({
    where: {
      periodId,
      examType,
    },
    select: {
      id: true,
      week: true,
      subject: true,
      displaySubjectName: true,
      examDate: true,
      isCancelled: true,
      cancelReason: true,
      updatedAt: true,
    },
    orderBy: [{ examDate: "asc" }, { week: "asc" }, { id: "asc" }],
  });

  const feed = serializeExamScheduleIcal({
    periodName: period.name,
    examType,
    sessions,
    feedUrl: url.toString(),
  });

  return new NextResponse(feed, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${buildIcalFileName(period.name, examType)}"`,
      "Cache-Control": "private, no-store, max-age=0, must-revalidate",
    },
  });
}
