import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { EXAM_TYPE_LABEL } from "@/lib/constants";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

function readParam(
  searchParams: PageProps["searchParams"],
  key: string,
): string | undefined {
  const v = searchParams?.[key];
  if (Array.isArray(v)) return v[0];
  return v ?? undefined;
}

type TopStudent = {
  rank: number;
  examNumber: string;
  name: string;
  avgScore: number;
  prevAvgScore: number | null;
  trend: "up" | "down" | "same" | null;
  attendanceRate: number | null;
  counselingCount: number;
  sessionCount: number;
  attendedCount: number;
};

export default async function TopStudentsPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.TEACHER);

  const examTypeParam = readParam(searchParams, "examType") ?? "ALL";
  const periodIdParam = readParam(searchParams, "periodId");
  const topNParam = readParam(searchParams, "topN") ?? "10";
  const topN = Math.min(parseInt(topNParam, 10) || 10, 50);

  const prisma = getPrisma();

  // Load available periods
  const periods = await prisma.examPeriod.findMany({
    orderBy: { startDate: "desc" },
    take: 20,
    select: {
      id: true,
      name: true,
      isActive: true,
      startDate: true,
      endDate: true,
    },
  });

  // Find selected period (default: most recent active)
  let selectedPeriod = periods[0] ?? null;
  if (periodIdParam) {
    const found = periods.find((p) => p.id === parseInt(periodIdParam, 10));
    if (found) selectedPeriod = found;
  }

  const examTypeFilter: { examType?: "GONGCHAE" | "GYEONGCHAE" } =
    examTypeParam === "GONGCHAE" || examTypeParam === "GYEONGCHAE"
      ? { examType: examTypeParam }
      : {};

  let topStudents: TopStudent[] = [];

  if (selectedPeriod) {
    // Fetch sessions in this period
    const sessions = await prisma.examSession.findMany({
      where: {
        periodId: selectedPeriod.id,
        isCancelled: false,
        ...examTypeFilter,
      },
      select: { id: true, examDate: true, week: true },
    });

    const sessionIds = sessions.map((s) => s.id);

    if (sessionIds.length > 0) {
      // Aggregate scores per student
      const scores = await prisma.score.findMany({
        where: {
          sessionId: { in: sessionIds },
          finalScore: { not: null },
          attendType: { not: "ABSENT" },
        },
        select: {
          examNumber: true,
          sessionId: true,
          finalScore: true,
          attendType: true,
        },
      });

      // Group by examNumber
      const studentScoreMap = new Map<
        string,
        { sum: number; count: number; sessionIds: Set<number> }
      >();

      for (const score of scores) {
        const prev = studentScoreMap.get(score.examNumber) ?? {
          sum: 0,
          count: 0,
          sessionIds: new Set<number>(),
        };
        if (score.finalScore !== null) {
          prev.sum += score.finalScore;
          prev.count += 1;
          prev.sessionIds.add(score.sessionId);
        }
        studentScoreMap.set(score.examNumber, prev);
      }

      // Get total attendance records for these students
      const examNumbers = Array.from(studentScoreMap.keys());

      // Get attendance data
      const attendanceLogs = await prisma.classroomAttendanceLog.groupBy({
        by: ["examNumber", "attendType"],
        _count: { attendType: true },
        where: {
          examNumber: { in: examNumbers },
          attendDate: {
            gte: selectedPeriod.startDate,
            lte: selectedPeriod.endDate,
          },
        },
      });

      // Build attendance map
      const attendanceMap = new Map<
        string,
        { present: number; total: number }
      >();
      for (const log of attendanceLogs) {
        const prev = attendanceMap.get(log.examNumber) ?? {
          present: 0,
          total: 0,
        };
        prev.total += log._count.attendType;
        if (log.attendType === "NORMAL" || log.attendType === "LIVE") {
          prev.present += log._count.attendType;
        }
        attendanceMap.set(log.examNumber, prev);
      }

      // Get counseling counts
      const counselingCounts = await prisma.counselingRecord.groupBy({
        by: ["examNumber"],
        _count: { id: true },
        where: {
          examNumber: { in: examNumbers },
          counseledAt: {
            gte: selectedPeriod.startDate,
            lte: selectedPeriod.endDate,
          },
        },
      });

      const counselingMap = new Map<string, number>();
      for (const c of counselingCounts) {
        counselingMap.set(c.examNumber, c._count.id);
      }

      // Get student names
      const students = await prisma.student.findMany({
        where: { examNumber: { in: examNumbers } },
        select: {
          examNumber: true,
          name: true,
          examType: true,
        },
      });

      const studentMap = new Map(students.map((s) => [s.examNumber, s]));

      // Compute previous period for trend comparison
      // Use scores from last half of sessions vs first half
      const halfPoint = Math.floor(sessionIds.length / 2);
      const firstHalfIds = new Set(sessionIds.slice(0, halfPoint));
      const secondHalfIds = new Set(sessionIds.slice(halfPoint));

      // Build sorted list by avg score descending
      const ranked = Array.from(studentScoreMap.entries())
        .filter(([examNumber]) => studentMap.has(examNumber))
        .map(([examNumber, data]) => {
          const avg = data.count > 0 ? data.sum / data.count : 0;

          // Compute first vs second half score for trend
          const firstHalfScores = scores.filter(
            (s) =>
              s.examNumber === examNumber &&
              firstHalfIds.has(s.sessionId) &&
              s.finalScore !== null,
          );
          const secondHalfScores = scores.filter(
            (s) =>
              s.examNumber === examNumber &&
              secondHalfIds.has(s.sessionId) &&
              s.finalScore !== null,
          );

          const firstAvg =
            firstHalfScores.length > 0
              ? firstHalfScores.reduce(
                  (s, sc) => s + (sc.finalScore ?? 0),
                  0,
                ) / firstHalfScores.length
              : null;

          const secondAvg =
            secondHalfScores.length > 0
              ? secondHalfScores.reduce(
                  (s, sc) => s + (sc.finalScore ?? 0),
                  0,
                ) / secondHalfScores.length
              : null;

          let trend: "up" | "down" | "same" | null = null;
          if (firstAvg !== null && secondAvg !== null) {
            const diff = secondAvg - firstAvg;
            if (diff > 2) trend = "up";
            else if (diff < -2) trend = "down";
            else trend = "same";
          }

          const attendance = attendanceMap.get(examNumber);
          const attendanceRate =
            attendance && attendance.total > 0
              ? Math.round((attendance.present / attendance.total) * 1000) / 10
              : null;

          return {
            examNumber,
            avgScore: Math.round(avg * 10) / 10,
            prevAvgScore: firstAvg !== null ? Math.round(firstAvg * 10) / 10 : null,
            trend,
            attendanceRate,
            counselingCount: counselingMap.get(examNumber) ?? 0,
            sessionCount: sessionIds.length,
            attendedCount: data.count,
          };
        })
        .sort((a, b) => b.avgScore - a.avgScore)
        .slice(0, topN);

      topStudents = ranked.map((r, idx) => ({
        ...r,
        rank: idx + 1,
        name: studentMap.get(r.examNumber)?.name ?? r.examNumber,
      }));
    }
  }

  const examTypeOptions = [
    { value: "ALL", label: "전체 직렬" },
    { value: "GONGCHAE", label: EXAM_TYPE_LABEL.GONGCHAE },
    { value: "GYEONGCHAE", label: EXAM_TYPE_LABEL.GYEONGCHAE },
  ];

  const topNOptions = [
    { value: "10", label: "상위 10명" },
    { value: "20", label: "상위 20명" },
    { value: "30", label: "상위 30명" },
  ];

  const now = new Date();
  const reportTitle =
    selectedPeriod
      ? `${selectedPeriod.name} 우수학생 보고서`
      : "우수학생 보고서";

  return (
    <div className="p-8 sm:p-10">
      {/* Print-only header */}
      <div className="mb-6 hidden print:block">
        <h1 className="text-2xl font-bold text-ink">{reportTitle}</h1>
        <p className="mt-1 text-sm text-slate">
          출력일: {now.toLocaleDateString("ko-KR")} |{" "}
          {examTypeParam === "ALL" ? "전체 직렬" : EXAM_TYPE_LABEL[examTypeParam as keyof typeof EXAM_TYPE_LABEL] ?? examTypeParam} |
          상위 {topN}명
        </p>
        <hr className="mt-3 border-ink/20" />
      </div>

      {/* Screen header - hidden on print */}
      <div className="print:hidden">
        <div className="inline-flex rounded-full border border-ink/20 bg-ink/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate">
          보고서
        </div>
        <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">우수학생 보고서</h1>
            <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
              기간 내 평균 성적 기준 상위 학생 목록입니다.
              출석률, 면담 횟수, 점수 추이를 함께 확인할 수 있습니다.
            </p>
          </div>
          <PrintButton label="보고서 인쇄" />
        </div>

        {/* Filter Form */}
        <form
          method="get"
          className="mt-8 flex flex-wrap gap-4 rounded-[28px] border border-ink/10 bg-mist p-6 print:hidden"
        >
          <div className="min-w-[160px] flex-1">
            <label className="mb-2 block text-sm font-medium">시험 기간</label>
            <select
              name="periodId"
              defaultValue={periodIdParam ?? ""}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            >
              <option value="">최근 기간</option>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.isActive ? " (활성)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[140px] flex-1">
            <label className="mb-2 block text-sm font-medium">직렬</label>
            <select
              name="examType"
              defaultValue={examTypeParam}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            >
              {examTypeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[140px] flex-1">
            <label className="mb-2 block text-sm font-medium">표시 인원</label>
            <select
              name="topN"
              defaultValue={topNParam}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            >
              {topNOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-3">
            <button
              type="submit"
              className="inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest"
            >
              조회
            </button>
          </div>
        </form>
      </div>

      {/* Period Info */}
      {selectedPeriod && (
        <div className="mt-6 flex flex-wrap items-center gap-3 text-sm print:mt-2">
          <span className="font-semibold text-ink">{selectedPeriod.name}</span>
          <span className="text-slate">
            {selectedPeriod.startDate.toLocaleDateString("ko-KR")} ~{" "}
            {selectedPeriod.endDate.toLocaleDateString("ko-KR")}
          </span>
          {selectedPeriod.isActive && (
            <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-2 py-0.5 text-xs font-semibold text-forest">
              활성 기간
            </span>
          )}
        </div>
      )}

      {/* Top Students Table */}
      <div className="mt-6">
        {topStudents.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-ink/10 p-12 text-center print:hidden">
            <p className="text-sm font-medium text-ink">성적 데이터 없음</p>
            <p className="mt-1 text-xs text-slate">
              선택한 기간과 직렬의 성적 데이터가 없습니다.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-[28px] border border-ink/10 bg-white shadow-sm print:shadow-none print:border-gray-300">
            <div className="flex items-center justify-between border-b border-ink/10 px-6 py-4 print:hidden">
              <h2 className="font-semibold text-ink">
                {examTypeParam === "ALL"
                  ? "전체 직렬"
                  : EXAM_TYPE_LABEL[examTypeParam as keyof typeof EXAM_TYPE_LABEL] ?? examTypeParam}{" "}
                — 상위 {topStudents.length}명
              </h2>
              <p className="text-xs text-slate">
                * 결시자(ABSENT) 제외, 최종점수(finalScore) 기준
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-ink/10 bg-mist/60 text-left text-xs font-semibold text-slate">
                    <th className="px-4 py-3 text-center">순위</th>
                    <th className="px-4 py-3">학번</th>
                    <th className="px-4 py-3">이름</th>
                    <th className="px-4 py-3 text-right">평균점수</th>
                    <th className="px-4 py-3 text-center">추이</th>
                    <th className="px-4 py-3 text-right">출석률</th>
                    <th className="px-4 py-3 text-right">응시 회차</th>
                    <th className="px-4 py-3 text-right">면담 횟수</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {topStudents.map((student) => (
                    <tr
                      key={student.examNumber}
                      className="transition hover:bg-mist/40 print:hover:bg-transparent"
                    >
                      {/* Rank */}
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                            student.rank === 1
                              ? "bg-amber-400 text-white"
                              : student.rank === 2
                                ? "bg-slate-300 text-ink"
                                : student.rank === 3
                                  ? "bg-amber-700/80 text-white"
                                  : "bg-ink/5 text-slate"
                          }`}
                        >
                          {student.rank}
                        </span>
                      </td>

                      {/* Exam Number */}
                      <td className="px-4 py-3 font-mono text-xs text-slate print:text-black">
                        <Link
                          href={`/admin/students/${student.examNumber}`}
                          className="text-forest hover:underline print:text-black print:no-underline"
                        >
                          {student.examNumber}
                        </Link>
                      </td>

                      {/* Name */}
                      <td className="px-4 py-3 font-medium text-ink">
                        <Link
                          href={`/admin/students/${student.examNumber}`}
                          className="hover:text-forest hover:underline print:text-black print:no-underline"
                        >
                          {student.name}
                        </Link>
                      </td>

                      {/* Avg Score */}
                      <td className="px-4 py-3 text-right">
                        <span
                          className={`font-mono text-base font-bold ${
                            student.avgScore >= 80
                              ? "text-forest"
                              : student.avgScore >= 60
                                ? "text-amber-600"
                                : "text-red-600"
                          }`}
                        >
                          {student.avgScore.toFixed(1)}
                        </span>
                        {student.prevAvgScore !== null && (
                          <span className="ml-1.5 text-xs text-slate">
                            (전반 {student.prevAvgScore.toFixed(1)})
                          </span>
                        )}
                      </td>

                      {/* Trend */}
                      <td className="px-4 py-3 text-center">
                        {student.trend === "up" && (
                          <span className="text-base font-bold text-forest">
                            ▲
                          </span>
                        )}
                        {student.trend === "down" && (
                          <span className="text-base font-bold text-red-500">
                            ▼
                          </span>
                        )}
                        {student.trend === "same" && (
                          <span className="text-base text-slate">—</span>
                        )}
                        {student.trend === null && (
                          <span className="text-xs text-slate">-</span>
                        )}
                      </td>

                      {/* Attendance Rate */}
                      <td className="px-4 py-3 text-right font-mono">
                        {student.attendanceRate !== null ? (
                          <span
                            className={
                              student.attendanceRate >= 90
                                ? "text-forest font-semibold"
                                : student.attendanceRate >= 70
                                  ? "text-amber-600"
                                  : "text-red-600"
                            }
                          >
                            {student.attendanceRate.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-slate">—</span>
                        )}
                      </td>

                      {/* Session Count */}
                      <td className="px-4 py-3 text-right font-mono text-slate">
                        {student.attendedCount}/{student.sessionCount}회
                      </td>

                      {/* Counseling Count */}
                      <td className="px-4 py-3 text-right font-mono">
                        {student.counselingCount > 0 ? (
                          <span className="font-semibold text-sky-600">
                            {student.counselingCount}회
                          </span>
                        ) : (
                          <span className="text-slate">0</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Summary for print */}
      {topStudents.length > 0 && (
        <div className="mt-4 hidden print:block">
          <p className="text-xs text-slate">
            * 결시자(ABSENT) 제외 최종점수 기준 | 추이: 전반부 vs 후반부 평균 비교 (±2점 이내 =
            동일, +2점 초과 ▲ 상승, -2점 미만 ▼ 하락)
          </p>
        </div>
      )}

      {/* Print styles */}
      <style>{`
        @media print {
          .print\\:hidden { display: none !important; }
          .print\\:block { display: block !important; }
          body { font-size: 12px; }
          table { font-size: 11px; }
        }
      `}</style>

      {/* Navigation (hidden on print) */}
      <div className="mt-6 flex flex-wrap gap-3 print:hidden">
        <Link
          href="/admin/reports"
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-forest/40 hover:text-forest"
        >
          ← 보고서
        </Link>
        <Link
          href="/admin/analytics/subject-heatmap"
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-forest/40 hover:text-forest"
        >
          과목 히트맵 →
        </Link>
        <Link
          href="/admin/analytics/cohort-progression"
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-forest/40 hover:text-forest"
        >
          성적 추이 →
        </Link>
      </div>
    </div>
  );
}
