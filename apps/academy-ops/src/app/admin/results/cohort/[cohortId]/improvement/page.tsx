import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole, AttendType, Subject } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { EXAM_CATEGORY_LABEL } from "@/lib/constants";
import { ImprovementClient } from "./improvement-client";
import type { ImprovementRow } from "./improvement-client";

export const dynamic = "force-dynamic";

export default async function CohortImprovementPage({
  params,
}: {
  params: Promise<{ cohortId: string }>;
}) {
  await requireAdminContext(AdminRole.TEACHER);
  const { cohortId } = await params;

  const prisma = getPrisma();

  const cohort = await prisma.cohort.findUnique({
    where: { id: cohortId },
    select: {
      id: true,
      name: true,
      examCategory: true,
      startDate: true,
      endDate: true,
      isActive: true,
    },
  });

  if (!cohort) notFound();

  // Enrolled students (active / completed / suspended)
  const enrollments = await prisma.courseEnrollment.findMany({
    where: {
      cohortId,
      status: { in: ["ACTIVE", "COMPLETED", "SUSPENDED"] },
    },
    select: { examNumber: true },
  });

  const examNumbers = [...new Set(enrollments.map((e) => e.examNumber))];

  let rows: ImprovementRow[] = [];

  if (examNumbers.length > 0) {
    // Fetch student names
    const students = await prisma.student.findMany({
      where: { examNumber: { in: examNumbers } },
      select: { examNumber: true, name: true },
    });
    const nameMap = new Map(students.map((s) => [s.examNumber, s.name]));

    // Fetch all scores for these students (non-cumulative only)
    // ordered by sessionId asc to determine early/recent
    const allScores = await prisma.score.findMany({
      where: {
        examNumber: { in: examNumbers },
        session: { subject: { not: Subject.CUMULATIVE } },
      },
      select: {
        examNumber: true,
        finalScore: true,
        rawScore: true,
        attendType: true,
        sessionId: true,
      },
      orderBy: { sessionId: "asc" },
    });

    // Group by student
    const byStudent = new Map<
      string,
      {
        sessionId: number;
        score: number | null;
        attendType: AttendType;
      }[]
    >();

    for (const s of allScores) {
      const arr = byStudent.get(s.examNumber) ?? [];
      arr.push({
        sessionId: s.sessionId,
        score: s.finalScore ?? s.rawScore ?? null,
        attendType: s.attendType,
      });
      byStudent.set(s.examNumber, arr);
    }

    const validAttendTypes = [AttendType.NORMAL, AttendType.LIVE] as AttendType[];
    const presentTypes = validAttendTypes;
    const absentTypes = [AttendType.ABSENT, AttendType.EXCUSED] as AttendType[];

    rows = examNumbers.map((examNumber) => {
      const studentScores = byStudent.get(examNumber) ?? [];

      // Dedupe by sessionId, keep first occurrence (already ordered asc)
      const seen = new Set<number>();
      const deduped = studentScores.filter((s) => {
        if (seen.has(s.sessionId)) return false;
        seen.add(s.sessionId);
        return true;
      });

      const totalSessions = deduped.length;

      // Attendance
      const presentCount = deduped.filter((s) =>
        presentTypes.includes(s.attendType),
      ).length;
      const absentCount = deduped.filter((s) =>
        absentTypes.includes(s.attendType),
      ).length;
      const attendanceRate =
        totalSessions > 0
          ? Math.round((presentCount / totalSessions) * 1000) / 10
          : null;

      // Early period: first 4 sessions (by sessionId order) with a valid score
      const withScore = deduped.filter(
        (s) =>
          presentTypes.includes(s.attendType) &&
          s.score !== null &&
          s.score !== undefined,
      );

      const earlyScores = withScore.slice(0, 4).map((s) => s.score as number);
      const recentScores = withScore
        .slice(-4)
        .map((s) => s.score as number);

      // Avoid overlap when fewer than 8 sessions
      // If withScore.length <= 4, early and recent are the same set — set recent to null
      const earlyAvg =
        earlyScores.length > 0
          ? Math.round(
              (earlyScores.reduce((a, b) => a + b, 0) / earlyScores.length) *
                10,
            ) / 10
          : null;

      const recentAvg =
        recentScores.length > 0
          ? Math.round(
              (recentScores.reduce((a, b) => a + b, 0) /
                recentScores.length) *
                10,
            ) / 10
          : null;

      const delta =
        earlyAvg !== null && recentAvg !== null
          ? Math.round((recentAvg - earlyAvg) * 10) / 10
          : null;

      return {
        rank: 0, // will be filled by client
        examNumber,
        name: nameMap.get(examNumber) ?? "-",
        earlyAvg,
        recentAvg,
        delta,
        attendanceRate,
        sessionCount: totalSessions,
      };
    });

    // Sort by delta desc for initial server-side rank
    rows.sort((a, b) => {
      const da = a.delta ?? -Infinity;
      const db = b.delta ?? -Infinity;
      return db - da;
    });
    rows = rows.map((r, i) => ({ ...r, rank: i + 1 }));
  }

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            성적 관리
          </div>
          <h1 className="mt-5 text-3xl font-semibold text-ink">수강생 향상도 분석</h1>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                cohort.examCategory === "GONGCHAE"
                  ? "border-forest/30 bg-forest/10 text-forest"
                  : "border-ember/30 bg-ember/10 text-ember"
              }`}
            >
              {EXAM_CATEGORY_LABEL[cohort.examCategory] ?? cohort.examCategory}
            </span>
            <span className="text-base font-semibold text-ink">{cohort.name}</span>
            <span className="text-sm text-slate">
              {cohort.startDate.toLocaleDateString("ko-KR")} ~{" "}
              {cohort.endDate.toLocaleDateString("ko-KR")}
            </span>
            {cohort.isActive && (
              <span className="inline-flex items-center rounded-full border border-forest/30 bg-forest/10 px-2.5 py-0.5 text-xs font-semibold text-forest">
                현재
              </span>
            )}
          </div>
          <p className="mt-4 max-w-2xl text-sm leading-8 text-slate">
            초반 4회와 최근 4회의 성적을 비교하여 향상도를 분석합니다.
            성적 데이터가 4회 미만인 학생은 해당 구간이 비어 있을 수 있습니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/admin/results/cohort`}
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            <svg
              className="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
            기수별 통계로
          </Link>
        </div>
      </div>

      {examNumbers.length === 0 ? (
        <div className="mt-10 rounded-[28px] border border-dashed border-ink/10 p-10 text-center text-slate">
          이 기수에 등록된 수강생이 없습니다.
        </div>
      ) : (
        <ImprovementClient rows={rows} cohortId={cohortId} />
      )}
    </div>
  );
}
