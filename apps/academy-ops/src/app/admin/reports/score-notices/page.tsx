import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole, AttendType, Subject } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { getSubjectDisplayLabel } from "@/lib/constants";
import { ScoreNoticePrint } from "./score-notice-print";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

function sp(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function formatKoreanDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function formatKoreanMonth(month: string): string {
  // month = "YYYY-MM"
  const [y, m] = month.split("-");
  return `${y}년 ${parseInt(m, 10)}월`;
}

export default async function ScoreNoticesPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.TEACHER);

  const prisma = getPrisma();

  const examNumberParam = sp(searchParams?.examNumber);
  const periodIdParam = sp(searchParams?.periodId);
  const monthParam = sp(searchParams?.month); // "YYYY-MM"

  // Load all active periods for filter UI
  const periods = await prisma.examPeriod.findMany({
    orderBy: { startDate: "desc" },
    select: { id: true, name: true, isActive: true, startDate: true, endDate: true },
  });

  const selectedPeriodId = periodIdParam ? parseInt(periodIdParam, 10) : (periods.find((p) => p.isActive)?.id ?? periods[0]?.id);

  // Determine month (default to current month)
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const selectedMonth = monthParam ?? defaultMonth;
  const [yearStr, monthStr] = selectedMonth.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 1);

  // ── Individual student view ──────────────────────────────────────────────
  if (examNumberParam) {
    const student = await prisma.student.findUnique({
      where: { examNumber: examNumberParam },
      select: {
        examNumber: true,
        name: true,
        phone: true,
        examType: true,
      },
    });
    if (!student) notFound();

    // Current active enrollment (cohort name)
    const activeEnrollment = await prisma.courseEnrollment.findFirst({
      where: { examNumber: examNumberParam, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      include: { cohort: { select: { name: true } } },
    });

    const cohortName = activeEnrollment?.cohort?.name ?? "반 미지정";

    // Fetch exam sessions for the selected period and month
    const sessionsFilter: Parameters<typeof prisma.examSession.findMany>[0] = {
      where: {
        ...(selectedPeriodId ? { periodId: selectedPeriodId } : {}),
        examDate: { gte: monthStart, lt: monthEnd },
        isCancelled: false,
      },
      orderBy: { examDate: "asc" },
      select: {
        id: true,
        subject: true,
        displaySubjectName: true,
        examDate: true,
        week: true,
      },
    };
    const sessions = await prisma.examSession.findMany(sessionsFilter);

    const sessionIds = sessions.map((s) => s.id);

    // Fetch scores for this student and these sessions
    const scores = sessionIds.length > 0
      ? await prisma.score.findMany({
          where: { examNumber: examNumberParam, sessionId: { in: sessionIds } },
          select: {
            sessionId: true,
            finalScore: true,
            rawScore: true,
            attendType: true,
          },
        })
      : [];

    const scoreMap = new Map(scores.map((s) => [s.sessionId, s]));

    // Attendance for the month (ClassroomAttendanceLog)
    const attendanceLogs = await prisma.classroomAttendanceLog.findMany({
      where: {
        examNumber: examNumberParam,
        attendDate: { gte: monthStart, lt: monthEnd },
      },
    });
    const presentDays = attendanceLogs.filter(
      (l) => l.attendType === AttendType.NORMAL || l.attendType === AttendType.LIVE
    ).length;
    const absentDays = attendanceLogs.filter((l) => l.attendType === AttendType.ABSENT).length;
    const lateDays = attendanceLogs.filter((l) => l.attendType === AttendType.EXCUSED).length;

    // Group scores by subject
    type SubjectAgg = {
      subject: Subject;
      displayName: string;
      scores: number[];
      thisMonthAvg: number | null;
    };
    const subjectMap = new Map<Subject, SubjectAgg>();

    for (const session of sessions) {
      if (session.subject === Subject.CUMULATIVE) continue; // Skip cumulative
      const score = scoreMap.get(session.id);
      const displayName = getSubjectDisplayLabel(session.subject, session.displaySubjectName);

      if (!subjectMap.has(session.subject)) {
        subjectMap.set(session.subject, {
          subject: session.subject,
          displayName,
          scores: [],
          thisMonthAvg: null,
        });
      }
      const agg = subjectMap.get(session.subject)!;
      const val = score?.finalScore ?? score?.rawScore;
      if (val !== null && val !== undefined && score?.attendType !== AttendType.ABSENT) {
        agg.scores.push(val);
      }
    }

    // Compute averages
    const subjectRows = Array.from(subjectMap.values()).map((agg) => ({
      ...agg,
      thisMonthAvg:
        agg.scores.length > 0
          ? Math.round((agg.scores.reduce((a, b) => a + b, 0) / agg.scores.length) * 10) / 10
          : null,
    }));

    // Overall stats
    const allScores = subjectRows.flatMap((r) => r.scores);
    const overallAvg =
      allScores.length > 0
        ? Math.round((allScores.reduce((a, b) => a + b, 0) / allScores.length) * 10) / 10
        : null;
    const totalPossible = subjectRows.length * 100;
    const totalActual =
      subjectRows.every((r) => r.thisMonthAvg !== null)
        ? Math.round(subjectRows.reduce((a, r) => a + (r.thisMonthAvg ?? 0), 0))
        : null;

    // Rank: among all students with scores in this period+month
    let rank: number | null = null;
    let totalRanked = 0;
    if (selectedPeriodId && overallAvg !== null) {
      // Get all period enrollments for this period to rank
      const allStudentsInPeriod = await prisma.periodEnrollment.findMany({
        where: { periodId: selectedPeriodId },
        select: { examNumber: true },
      });
      const allExamNumbers = allStudentsInPeriod.map((e) => e.examNumber);
      // Fetch all scores in month for these students
      const allScoreRows = sessionIds.length > 0
        ? await prisma.score.findMany({
            where: {
              sessionId: { in: sessionIds },
              examNumber: { in: allExamNumbers },
              attendType: { not: AttendType.ABSENT },
            },
            select: { examNumber: true, finalScore: true, rawScore: true },
          })
        : [];

      // Compute per-student average
      const studentScoreMap = new Map<string, number[]>();
      for (const row of allScoreRows) {
        const val = row.finalScore ?? row.rawScore;
        if (val === null) continue;
        if (!studentScoreMap.has(row.examNumber)) studentScoreMap.set(row.examNumber, []);
        studentScoreMap.get(row.examNumber)!.push(val);
      }
      const studentAvgs = Array.from(studentScoreMap.entries())
        .map(([en, vals]) => ({
          examNumber: en,
          avg: vals.reduce((a, b) => a + b, 0) / vals.length,
        }))
        .sort((a, b) => b.avg - a.avg);

      totalRanked = studentAvgs.length;
      const myIdx = studentAvgs.findIndex((x) => x.examNumber === examNumberParam);
      rank = myIdx >= 0 ? myIdx + 1 : null;
    }

    const issuedAt = formatKoreanDate(new Date());

    return (
      <div
        className="min-h-screen bg-[#F7F4EF]"
        style={{ fontFamily: "'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif" }}
      >
        <style>{`
          @media print {
            .no-print { display: none !important; }
            body { background: white !important; margin: 0; padding: 0; }
            .print-area { padding: 0 !important; margin: 0 !important; }
            @page { size: A4 portrait; margin: 15mm 15mm; }
          }
        `}</style>

        {/* Top bar */}
        <div className="no-print flex flex-wrap items-center justify-between gap-4 border-b border-[#111827]/10 bg-white px-6 py-4">
          <div className="flex items-center gap-3">
            <Link
              href={`/admin/reports/score-notices?${selectedPeriodId ? `periodId=${selectedPeriodId}&` : ""}month=${selectedMonth}`}
              className="inline-flex items-center gap-2 rounded-full border border-[#111827]/10 px-4 py-2 text-sm text-[#4B5563] transition hover:border-[#111827]/30"
            >
              ← 목록으로
            </Link>
            <span className="text-lg font-bold text-[#111827]">성적 통지표 — {student.name}</span>
          </div>
          <PrintButton />
        </div>

        {/* Document */}
        <div className="print-area flex justify-center px-8 py-10">
          <ScoreNoticePrint
            student={{ examNumber: student.examNumber, name: student.name, mobile: student.phone ?? "" }}
            cohortName={cohortName}
            issuedAt={issuedAt}
            periodLabel={formatKoreanMonth(selectedMonth)}
            subjectRows={subjectRows}
            overallAvg={overallAvg}
            totalPossible={totalPossible}
            totalActual={totalActual}
            rank={rank}
            totalRanked={totalRanked}
            attendPresent={presentDays}
            attendAbsent={absentDays}
            attendLate={lateDays}
          />
        </div>
        <p className="no-print mt-2 pb-8 text-center text-xs text-[#4B5563]/60">
          인쇄 버튼을 누른 후 용지 크기를 A4로 선택하세요. PDF로 저장도 가능합니다.
        </p>
      </div>
    );
  }

  // ── Bulk list view ────────────────────────────────────────────────────────
  let students: {
    examNumber: string;
    name: string;
    phone: string | null;
    scoreCount: number;
  }[] = [];

  if (selectedPeriodId) {
    // Get all period enrollments
    const periodEnrollments = await prisma.periodEnrollment.findMany({
      where: { periodId: selectedPeriodId },
      select: { examNumber: true, student: { select: { name: true, phone: true } } },
      orderBy: { student: { name: "asc" } },
    });

    // Get session ids in the selected month
    const sessionsInMonth = await prisma.examSession.findMany({
      where: {
        periodId: selectedPeriodId,
        examDate: { gte: monthStart, lt: monthEnd },
        isCancelled: false,
      },
      select: { id: true },
    });
    const sessionIds = sessionsInMonth.map((s) => s.id);

    // Count scores per student
    const scoreCounts = sessionIds.length > 0
      ? await prisma.score.groupBy({
          by: ["examNumber"],
          where: { sessionId: { in: sessionIds } },
          _count: { id: true },
        })
      : [];
    const scoreCountMap = new Map(scoreCounts.map((s) => [s.examNumber, s._count.id]));

    students = periodEnrollments.map((e) => ({
      examNumber: e.examNumber,
      name: e.student.name,
      phone: e.student.phone,
      scoreCount: scoreCountMap.get(e.examNumber) ?? 0,
    }));
  }

  // Month options: last 12 months
  const monthOptions: string[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthOptions.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        성적 통지표
      </div>
      <h1 className="mt-5 text-3xl font-semibold">성적 통지표 출력</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        시험 기간과 월을 선택하면 해당 기간 수강생의 월별 성적 통지표를 출력할 수 있습니다.
        학생 이름을 클릭하면 개별 통지표를 미리보기합니다.
      </p>

      {/* Filter form */}
      <form method="GET" className="mt-8 grid gap-4 rounded-[28px] border border-ink/10 bg-mist p-6 md:grid-cols-3">
        <div>
          <label className="mb-2 block text-sm font-medium text-ink">시험 기간</label>
          <select
            name="periodId"
            defaultValue={selectedPeriodId ? String(selectedPeriodId) : ""}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
          >
            <option value="">기간 선택</option>
            {periods.map((p) => (
              <option key={p.id} value={String(p.id)}>
                {p.name}{p.isActive ? " (현재)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-ink">월</label>
          <select
            name="month"
            defaultValue={selectedMonth}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
          >
            {monthOptions.map((m) => (
              <option key={m} value={m}>
                {formatKoreanMonth(m)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            className="inline-flex w-full items-center justify-center rounded-full bg-[#111827] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#1F4D3A]"
          >
            조회
          </button>
        </div>
      </form>

      {/* Student list */}
      {selectedPeriodId ? (
        <div className="mt-8 rounded-[28px] border border-ink/10 bg-white shadow-panel">
          <div className="flex items-center justify-between border-b border-ink/10 px-6 py-4">
            <h2 className="font-semibold text-ink">
              수강생 목록
              <span className="ml-2 text-sm font-normal text-slate">
                {students.length}명 · {formatKoreanMonth(selectedMonth)}
              </span>
            </h2>
          </div>

          {students.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate">
              해당 기간에 등록된 수강생이 없습니다.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink/10 bg-mist/50">
                    <th className="px-6 py-3 text-left font-medium text-slate">학번</th>
                    <th className="px-6 py-3 text-left font-medium text-slate">이름</th>
                    <th className="px-6 py-3 text-left font-medium text-slate">연락처</th>
                    <th className="px-6 py-3 text-right font-medium text-slate">이번 달 성적 수</th>
                    <th className="px-6 py-3 text-right font-medium text-slate">출력</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => (
                    <tr key={s.examNumber} className="border-b border-ink/5 last:border-0 hover:bg-mist/30">
                      <td className="px-6 py-3">
                        <Link
                          href={`/admin/students/${s.examNumber}`}
                          className="font-mono text-xs text-[#4B5563] hover:text-[#C55A11]"
                        >
                          {s.examNumber}
                        </Link>
                      </td>
                      <td className="px-6 py-3 font-medium text-ink">{s.name}</td>
                      <td className="px-6 py-3 text-slate">{s.phone ?? "—"}</td>
                      <td className="px-6 py-3 text-right">
                        {s.scoreCount > 0 ? (
                          <span className="inline-flex items-center rounded-full bg-forest/10 px-2 py-0.5 text-xs font-semibold text-forest">
                            {s.scoreCount}회
                          </span>
                        ) : (
                          <span className="text-xs text-slate/60">없음</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <Link
                          href={`/admin/reports/score-notices?examNumber=${s.examNumber}&periodId=${selectedPeriodId}&month=${selectedMonth}`}
                          className="inline-flex items-center gap-1 rounded-full bg-[#C55A11] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#C55A11]/80"
                        >
                          개별 출력
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-8 rounded-[28px] border border-dashed border-ink/10 p-8 text-sm text-slate">
          시험 기간을 선택하면 수강생 목록이 표시됩니다.
        </div>
      )}
    </div>
  );
}
