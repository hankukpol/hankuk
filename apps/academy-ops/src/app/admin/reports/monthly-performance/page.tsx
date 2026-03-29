import Link from "next/link";
import { AdminRole, AttendType, ExamType } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

function sp(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function formatKoreanMonth(month: string): string {
  const [y, m] = month.split("-");
  return `${y}년 ${parseInt(m, 10)}월`;
}

function fmtKRW(amount: number): string {
  return amount.toLocaleString("ko-KR") + "원";
}

export default async function MonthlyPerformancePage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.MANAGER);

  const prisma = getPrisma();

  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthParam = sp(searchParams?.month) ?? defaultMonth;
  const [yearStr, monthStr] = monthParam.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 1);

  // Month options: last 24 months
  const monthOptions: string[] = [];
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthOptions.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  // ── Enrollment KPIs ───────────────────────────────────────────────────────
  const [newEnrollments, activeEnrollments, cancelledEnrollments] = await Promise.all([
    prisma.courseEnrollment.count({
      where: { createdAt: { gte: monthStart, lt: monthEnd } },
    }),
    prisma.courseEnrollment.count({
      where: { status: "ACTIVE" },
    }),
    prisma.courseEnrollment.count({
      where: {
        status: { in: ["CANCELLED", "WITHDRAWN"] },
        updatedAt: { gte: monthStart, lt: monthEnd },
      },
    }),
  ]);

  // ── Payment KPIs ──────────────────────────────────────────────────────────
  const payments = await prisma.payment.findMany({
    where: {
      processedAt: { gte: monthStart, lt: monthEnd },
      status: { in: ["APPROVED", "PARTIAL_REFUNDED"] },
    },
    select: { netAmount: true, grossAmount: true, discountAmount: true },
  });

  const refunds = await prisma.refund.findMany({
    where: {
      processedAt: { gte: monthStart, lt: monthEnd },
      status: "COMPLETED",
    },
    select: { amount: true },
  });

  const totalRevenue = payments.reduce((s, p) => s + p.netAmount, 0);
  const totalRefunds = refunds.reduce((s, r) => s + r.amount, 0);
  const netRevenue = totalRevenue - totalRefunds;
  const paymentCount = payments.length;

  // ── Score KPIs ────────────────────────────────────────────────────────────
  const examSessions = await prisma.examSession.findMany({
    where: {
      examDate: { gte: monthStart, lt: monthEnd },
      isCancelled: false,
    },
    select: { id: true, examType: true, subject: true },
  });

  const sessionIds = examSessions.map((s) => s.id);
  const sessionCount = examSessions.length;

  const scoreRows =
    sessionIds.length > 0
      ? await prisma.score.findMany({
          where: {
            sessionId: { in: sessionIds },
            attendType: { not: AttendType.ABSENT },
            finalScore: { not: null },
          },
          select: { finalScore: true, sessionId: true },
        })
      : [];

  // Score avg by examType
  const gongchaeSessionIds = new Set(
    examSessions.filter((s) => s.examType === ExamType.GONGCHAE).map((s) => s.id)
  );
  const gyeongchaeSessionIds = new Set(
    examSessions.filter((s) => s.examType === ExamType.GYEONGCHAE).map((s) => s.id)
  );

  const gongchaeScores = scoreRows
    .filter((r) => gongchaeSessionIds.has(r.sessionId))
    .map((r) => r.finalScore as number);
  const gyeongchaeScores = scoreRows
    .filter((r) => gyeongchaeSessionIds.has(r.sessionId))
    .map((r) => r.finalScore as number);

  const calcAvg = (arr: number[]) =>
    arr.length > 0 ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null;

  const gongchaeAvg = calcAvg(gongchaeScores);
  const gyeongchaeAvg = calcAvg(gyeongchaeScores);
  const overallScoreAvg = calcAvg(scoreRows.map((r) => r.finalScore as number));

  // Score distribution: 0-59, 60-69, 70-79, 80-89, 90-100
  const allScores = scoreRows.map((r) => r.finalScore as number);
  const bands = [
    { label: "90~100점", min: 90, max: 101 },
    { label: "80~89점", min: 80, max: 90 },
    { label: "70~79점", min: 70, max: 80 },
    { label: "60~69점", min: 60, max: 70 },
    { label: "0~59점", min: 0, max: 60 },
  ];
  const distribution = bands.map((b) => ({
    ...b,
    count: allScores.filter((s) => s >= b.min && s < b.max).length,
    pct:
      allScores.length > 0
        ? Math.round((allScores.filter((s) => s >= b.min && s < b.max).length / allScores.length) * 100)
        : 0,
  }));

  // ── Attendance KPIs ───────────────────────────────────────────────────────
  const attendanceLogs = await prisma.classroomAttendanceLog.findMany({
    where: { attendDate: { gte: monthStart, lt: monthEnd } },
    select: { attendType: true },
  });

  const totalAttendLogs = attendanceLogs.length;
  const presentCount = attendanceLogs.filter(
    (l) => l.attendType === AttendType.NORMAL || l.attendType === AttendType.LIVE
  ).length;
  const absentCount = attendanceLogs.filter((l) => l.attendType === AttendType.ABSENT).length;
  const attendanceRate =
    totalAttendLogs > 0 ? Math.round((presentCount / totalAttendLogs) * 1000) / 10 : null;

  // ── At-risk students ──────────────────────────────────────────────────────
  // Students whose last 2 sessions avg is below their overall avg
  // Get active students with scores in the last 2 sessions
  const last2Sessions = examSessions.slice(-2);
  const last2Ids = last2Sessions.map((s) => s.id);

  let atRiskStudents: {
    examNumber: string;
    name: string;
    last2Avg: number;
    overallAvg: number;
    delta: number;
  }[] = [];

  if (last2Ids.length > 0 && sessionIds.length > 2) {
    const last2Scores = await prisma.score.findMany({
      where: {
        sessionId: { in: last2Ids },
        attendType: { not: AttendType.ABSENT },
        finalScore: { not: null },
      },
      select: { examNumber: true, finalScore: true },
    });

    const allScoresForStudents = await prisma.score.findMany({
      where: {
        sessionId: { in: sessionIds },
        attendType: { not: AttendType.ABSENT },
        finalScore: { not: null },
      },
      select: { examNumber: true, finalScore: true },
    });

    // Group by student
    const last2Map = new Map<string, number[]>();
    for (const r of last2Scores) {
      if (!last2Map.has(r.examNumber)) last2Map.set(r.examNumber, []);
      last2Map.get(r.examNumber)!.push(r.finalScore as number);
    }

    const allMap = new Map<string, number[]>();
    for (const r of allScoresForStudents) {
      if (!allMap.has(r.examNumber)) allMap.set(r.examNumber, []);
      allMap.get(r.examNumber)!.push(r.finalScore as number);
    }

    // Find at-risk students: last2avg < overallAvg by more than 5 points
    const candidateExamNumbers: string[] = [];
    for (const [en, scores] of last2Map.entries()) {
      const l2avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      const allArr = allMap.get(en) ?? [];
      if (allArr.length < 2) continue;
      const oavg = allArr.reduce((a, b) => a + b, 0) / allArr.length;
      if (oavg - l2avg > 5) {
        candidateExamNumbers.push(en);
        atRiskStudents.push({
          examNumber: en,
          name: "",
          last2Avg: Math.round(l2avg * 10) / 10,
          overallAvg: Math.round(oavg * 10) / 10,
          delta: Math.round((oavg - l2avg) * 10) / 10,
        });
      }
    }

    if (candidateExamNumbers.length > 0) {
      const students = await prisma.student.findMany({
        where: { examNumber: { in: candidateExamNumbers } },
        select: { examNumber: true, name: true },
      });
      const studentNameMap = new Map(students.map((s) => [s.examNumber, s.name]));
      atRiskStudents = atRiskStudents.map((s) => ({
        ...s,
        name: studentNameMap.get(s.examNumber) ?? s.examNumber,
      }));
      atRiskStudents.sort((a, b) => b.delta - a.delta);
      atRiskStudents = atRiskStudents.slice(0, 20);
    }
  }

  const issuedAt = new Date().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

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
            href="/admin/reports"
            className="inline-flex items-center gap-2 rounded-full border border-[#111827]/10 px-4 py-2 text-sm text-[#4B5563] transition hover:border-[#111827]/30"
          >
            ← 보고서 목록
          </Link>
          <span className="text-lg font-bold text-[#111827]">
            월간 실적 보고서 — {formatKoreanMonth(monthParam)}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {/* Month selector */}
          <form method="GET" className="flex items-center gap-2">
            <select
              name="month"
              defaultValue={monthParam}
              className="rounded-2xl border border-ink/10 bg-white px-4 py-2 text-sm"
            >
              {monthOptions.map((m) => (
                <option key={m} value={m}>
                  {formatKoreanMonth(m)}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-full bg-[#111827] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1F4D3A]"
            >
              조회
            </button>
          </form>
          <PrintButton />
        </div>
      </div>

      {/* Document */}
      <div className="print-area mx-auto max-w-5xl px-6 py-10">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between border-b-2 border-[#1F4D3A] pb-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#C55A11]">
              학원명 미설정
            </p>
            <h1 className="mt-2 text-3xl font-bold text-[#111827]">
              {formatKoreanMonth(monthParam)} 월간 실적 보고서
            </h1>
            <p className="mt-1 text-sm text-[#4B5563]">발행일: {issuedAt}</p>
          </div>
        </div>

        {/* Section 1: Enrollment KPIs */}
        <section className="mb-8">
          <h2 className="mb-4 text-base font-bold text-[#1F4D3A]">1. 수강 현황</h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-[20px] border border-[#111827]/10 bg-white p-5 shadow-sm">
              <p className="text-xs font-medium text-[#4B5563]">신규 등록</p>
              <p className="mt-2 text-3xl font-bold text-[#111827]">{newEnrollments.toLocaleString()}</p>
              <p className="mt-0.5 text-xs text-[#4B5563]">건</p>
            </div>
            <div className="rounded-[20px] border border-[#111827]/10 bg-white p-5 shadow-sm">
              <p className="text-xs font-medium text-[#4B5563]">현재 수강 중</p>
              <p className="mt-2 text-3xl font-bold text-[#1F4D3A]">{activeEnrollments.toLocaleString()}</p>
              <p className="mt-0.5 text-xs text-[#4B5563]">명</p>
            </div>
            <div className="rounded-[20px] border border-[#111827]/10 bg-white p-5 shadow-sm">
              <p className="text-xs font-medium text-[#4B5563]">취소/탈퇴</p>
              <p className="mt-2 text-3xl font-bold text-[#C55A11]">{cancelledEnrollments.toLocaleString()}</p>
              <p className="mt-0.5 text-xs text-[#4B5563]">건</p>
            </div>
          </div>
        </section>

        {/* Section 2: Payment KPIs */}
        <section className="mb-8">
          <h2 className="mb-4 text-base font-bold text-[#1F4D3A]">2. 수납 현황</h2>
          <div className="grid grid-cols-4 gap-4">
            <div className="rounded-[20px] border border-[#111827]/10 bg-white p-5 shadow-sm">
              <p className="text-xs font-medium text-[#4B5563]">수납 건수</p>
              <p className="mt-2 text-3xl font-bold text-[#111827]">{paymentCount.toLocaleString()}</p>
              <p className="mt-0.5 text-xs text-[#4B5563]">건</p>
            </div>
            <div className="rounded-[20px] border border-[#111827]/10 bg-white p-5 shadow-sm">
              <p className="text-xs font-medium text-[#4B5563]">총 수납액</p>
              <p className="mt-2 text-2xl font-bold text-[#111827]">
                {totalRevenue >= 10000
                  ? `${Math.floor(totalRevenue / 10000).toLocaleString()}만`
                  : fmtKRW(totalRevenue)}
              </p>
              <p className="mt-0.5 text-xs text-[#4B5563]">{fmtKRW(totalRevenue)}</p>
            </div>
            <div className="rounded-[20px] border border-[#111827]/10 bg-white p-5 shadow-sm">
              <p className="text-xs font-medium text-[#4B5563]">환불 금액</p>
              <p className="mt-2 text-2xl font-bold text-[#C55A11]">
                {totalRefunds >= 10000
                  ? `${Math.floor(totalRefunds / 10000).toLocaleString()}만`
                  : fmtKRW(totalRefunds)}
              </p>
              <p className="mt-0.5 text-xs text-[#4B5563]">{fmtKRW(totalRefunds)}</p>
            </div>
            <div className="rounded-[20px] border border-[#1F4D3A]/30 bg-[#1F4D3A]/5 p-5 shadow-sm">
              <p className="text-xs font-medium text-[#1F4D3A]">순 수납액</p>
              <p className="mt-2 text-2xl font-bold text-[#1F4D3A]">
                {netRevenue >= 10000
                  ? `${Math.floor(netRevenue / 10000).toLocaleString()}만`
                  : fmtKRW(netRevenue)}
              </p>
              <p className="mt-0.5 text-xs text-[#1F4D3A]/70">{fmtKRW(netRevenue)}</p>
            </div>
          </div>
        </section>

        {/* Section 3: Score KPIs */}
        <section className="mb-8">
          <h2 className="mb-4 text-base font-bold text-[#1F4D3A]">3. 성적 현황</h2>
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div className="rounded-[20px] border border-[#111827]/10 bg-white p-5 shadow-sm">
              <p className="text-xs font-medium text-[#4B5563]">시험 횟수</p>
              <p className="mt-2 text-3xl font-bold text-[#111827]">{sessionCount}</p>
              <p className="mt-0.5 text-xs text-[#4B5563]">회</p>
            </div>
            <div className="rounded-[20px] border border-[#111827]/10 bg-white p-5 shadow-sm">
              <p className="text-xs font-medium text-[#4B5563]">전체 평균</p>
              <p className="mt-2 text-3xl font-bold text-[#111827]">
                {overallScoreAvg !== null ? overallScoreAvg : "—"}
              </p>
              <p className="mt-0.5 text-xs text-[#4B5563]">점</p>
            </div>
            <div className="rounded-[20px] border border-[#111827]/10 bg-white p-5 shadow-sm">
              <p className="text-xs font-medium text-[#4B5563]">공채반 평균</p>
              <p className="mt-2 text-3xl font-bold text-[#1F4D3A]">
                {gongchaeAvg !== null ? gongchaeAvg : "—"}
              </p>
              <p className="mt-0.5 text-xs text-[#4B5563]">점</p>
            </div>
            <div className="rounded-[20px] border border-[#111827]/10 bg-white p-5 shadow-sm">
              <p className="text-xs font-medium text-[#4B5563]">경채반 평균</p>
              <p className="mt-2 text-3xl font-bold text-[#C55A11]">
                {gyeongchaeAvg !== null ? gyeongchaeAvg : "—"}
              </p>
              <p className="mt-0.5 text-xs text-[#4B5563]">점</p>
            </div>
          </div>

          {/* Score distribution bar chart */}
          <div className="rounded-[20px] border border-[#111827]/10 bg-white p-6 shadow-sm">
            <p className="mb-4 text-sm font-semibold text-[#111827]">점수 분포</p>
            {allScores.length === 0 ? (
              <p className="text-sm text-[#4B5563]">이번 달 성적 데이터가 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {distribution.map((band) => (
                  <div key={band.label} className="flex items-center gap-3">
                    <span className="w-20 shrink-0 text-right text-xs text-[#4B5563]">{band.label}</span>
                    <div className="flex-1 rounded-full bg-[#F7F4EF]" style={{ height: "20px" }}>
                      <div
                        className="h-full rounded-full bg-[#1F4D3A] transition-all"
                        style={{ width: `${band.pct}%`, minWidth: band.count > 0 ? "4px" : "0" }}
                      />
                    </div>
                    <span className="w-16 shrink-0 text-xs text-[#4B5563]">
                      {band.count}명 ({band.pct}%)
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Section 4: Attendance KPIs */}
        <section className="mb-8">
          <h2 className="mb-4 text-base font-bold text-[#1F4D3A]">4. 출결 현황</h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-[20px] border border-[#111827]/10 bg-white p-5 shadow-sm">
              <p className="text-xs font-medium text-[#4B5563]">전체 출석률</p>
              <p className="mt-2 text-3xl font-bold text-[#1F4D3A]">
                {attendanceRate !== null ? `${attendanceRate}%` : "—"}
              </p>
              <div className="mt-2 rounded-full bg-[#F7F4EF]" style={{ height: "8px" }}>
                {attendanceRate !== null && (
                  <div
                    className="h-full rounded-full bg-[#1F4D3A]"
                    style={{ width: `${attendanceRate}%` }}
                  />
                )}
              </div>
            </div>
            <div className="rounded-[20px] border border-[#111827]/10 bg-white p-5 shadow-sm">
              <p className="text-xs font-medium text-[#4B5563]">총 출석 횟수</p>
              <p className="mt-2 text-3xl font-bold text-[#111827]">{presentCount.toLocaleString()}</p>
              <p className="mt-0.5 text-xs text-[#4B5563]">회</p>
            </div>
            <div className="rounded-[20px] border border-[#111827]/10 bg-white p-5 shadow-sm">
              <p className="text-xs font-medium text-[#4B5563]">총 결석 횟수</p>
              <p className="mt-2 text-3xl font-bold text-[#C55A11]">{absentCount.toLocaleString()}</p>
              <p className="mt-0.5 text-xs text-[#4B5563]">회</p>
            </div>
          </div>
        </section>

        {/* Section 5: At-risk students */}
        <section className="mb-8">
          <h2 className="mb-4 text-base font-bold text-[#1F4D3A]">5. 성적 하락 주의 학생</h2>
          {atRiskStudents.length === 0 ? (
            <div className="rounded-[20px] border border-[#111827]/10 bg-white p-6 text-center text-sm text-[#4B5563] shadow-sm">
              {sessionIds.length < 2
                ? "이번 달 시험 데이터가 충분하지 않습니다."
                : "성적 하락 추세 학생이 없습니다."}
            </div>
          ) : (
            <div className="rounded-[20px] border border-[#111827]/10 bg-white shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#111827]/10 bg-[#F7F4EF]/50">
                      <th className="px-5 py-3 text-left font-medium text-[#4B5563]">학번</th>
                      <th className="px-5 py-3 text-left font-medium text-[#4B5563]">이름</th>
                      <th className="px-5 py-3 text-right font-medium text-[#4B5563]">월 평균</th>
                      <th className="px-5 py-3 text-right font-medium text-[#4B5563]">최근 2회 평균</th>
                      <th className="px-5 py-3 text-right font-medium text-[#4B5563]">하락폭</th>
                      <th className="no-print px-5 py-3 text-right font-medium text-[#4B5563]">바로가기</th>
                    </tr>
                  </thead>
                  <tbody>
                    {atRiskStudents.map((s) => (
                      <tr key={s.examNumber} className="border-b border-[#111827]/5 last:border-0 hover:bg-[#F7F4EF]/30">
                        <td className="px-5 py-3 font-mono text-xs text-[#4B5563]">{s.examNumber}</td>
                        <td className="px-5 py-3 font-medium text-[#111827]">{s.name}</td>
                        <td className="px-5 py-3 text-right text-[#111827]">{s.overallAvg}점</td>
                        <td className="px-5 py-3 text-right text-[#C55A11] font-semibold">{s.last2Avg}점</td>
                        <td className="px-5 py-3 text-right">
                          <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">
                            -{s.delta}점
                          </span>
                        </td>
                        <td className="no-print px-5 py-3 text-right">
                          <Link
                            href={`/admin/students/${s.examNumber}`}
                            className="inline-flex items-center gap-1 rounded-full bg-[#C55A11]/10 px-3 py-1 text-xs font-semibold text-[#C55A11] transition hover:bg-[#C55A11]/20"
                          >
                            학생 보기
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {/* Footer */}
        <div className="mt-10 border-t border-[#111827]/10 pt-4 text-center text-xs text-[#4B5563]/60">
          학원 정보는 관리자 설정을 확인하세요
        </div>
      </div>

      <p className="no-print mt-2 pb-8 text-center text-xs text-[#4B5563]/60">
        인쇄 버튼을 누른 후 용지 크기를 A4로 선택하세요. PDF로 저장도 가능합니다.
      </p>
    </div>
  );
}
