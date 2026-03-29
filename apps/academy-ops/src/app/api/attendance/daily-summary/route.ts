import { AdminRole, AttendType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const SUBJECT_KO: Record<string, string> = {
  CONSTITUTIONAL_LAW: "헌법",
  CRIMINOLOGY: "범죄학",
  CRIMINAL_PROCEDURE: "형사소송법",
  CRIMINAL_LAW: "형법",
  POLICE_SCIENCE: "경찰학",
  CUMULATIVE: "누적",
};

// GET /api/attendance/daily-summary?date=2026-03-17
// 특정 날짜(기본값: 오늘)의 시험 세션 출결 요약
export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const sp = request.nextUrl.searchParams;
  const dateParam = sp.get("date");

  // 날짜 범위 계산 (서버 로컬 자정 기준)
  const base = dateParam ? new Date(dateParam) : new Date();
  const today = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  try {
    const sessions = await getPrisma().examSession.findMany({
      where: {
        examDate: { gte: today, lt: tomorrow },
        isCancelled: false,
      },
      include: {
        scores: {
          select: {
            examNumber: true,
            attendType: true,
            student: { select: { name: true } },
          },
        },
      },
      orderBy: [{ subject: "asc" }, { week: "asc" }],
    });

    // 전체 집계
    let totalPresent = 0;
    let totalAbsent = 0;
    let totalExcused = 0;
    let totalExpected = 0;

    const sessionBreakdown = sessions.map((session) => {
      const scores = session.scores;
      const present = scores.filter(
        (s) => s.attendType === AttendType.NORMAL || s.attendType === AttendType.LIVE,
      ).length;
      const absent = scores.filter((s) => s.attendType === AttendType.ABSENT).length;
      const excused = scores.filter((s) => s.attendType === AttendType.EXCUSED).length;
      const expected = scores.length;

      totalPresent += present;
      totalAbsent += absent;
      totalExcused += excused;
      totalExpected += expected;

      return {
        sessionId: session.id,
        subject: SUBJECT_KO[session.subject] ?? session.subject,
        subjectKey: session.subject,
        week: session.week,
        expected,
        present,
        absent,
        excused,
        attendanceRate: expected > 0 ? Math.round((present / expected) * 1000) / 10 : null,
      };
    });

    // 오늘 결석자 목록
    const recentAbsences: {
      examNumber: string;
      name: string;
      subject: string;
      attendType: AttendType;
      sessionId: number;
    }[] = [];

    for (const session of sessions) {
      for (const score of session.scores) {
        if (score.attendType === AttendType.ABSENT || score.attendType === AttendType.EXCUSED) {
          recentAbsences.push({
            examNumber: score.examNumber,
            name: score.student.name,
            subject: SUBJECT_KO[session.subject] ?? session.subject,
            attendType: score.attendType,
            sessionId: session.id,
          });
        }
      }
    }

    const presentAndAbsent = totalPresent + totalAbsent;
    const attendanceRate =
      presentAndAbsent > 0 ? Math.round((totalPresent / presentAndAbsent) * 1000) / 10 : null;

    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    return NextResponse.json({
      data: {
        date: dateStr,
        totalSessions: sessions.length,
        totalExpected,
        totalPresent,
        totalAbsent,
        totalExcused,
        attendanceRate,
        sessionBreakdown,
        recentAbsences,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "조회 실패" },
      { status: 500 },
    );
  }
}
