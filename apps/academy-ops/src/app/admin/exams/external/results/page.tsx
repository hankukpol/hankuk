import Link from "next/link";
import { AdminRole, ExamEventType, PassType } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

// ── Types ──────────────────────────────────────────────────────────────────────

type ExternalEventSummary = {
  id: string;
  title: string;
  examDate: string;
  venue: string | null;
  totalRegistrations: number;
  internalStudents: number;
  externalApplicants: number;
  paidCount: number;
  divisionCounts: Record<string, number>;
};

type StudentRegistrationRow = {
  examNumber: string;
  name: string;
  mobile: string | null;
  registeredEvents: {
    eventId: string;
    title: string;
    examDate: string;
    division: string;
    isPaid: boolean;
  }[];
  graduateRecord: {
    passType: PassType;
    examName: string;
    writtenPassDate: string | null;
    finalPassDate: string | null;
  } | null;
};

type YearTrend = {
  year: number;
  eventCount: number;
  totalRegistrations: number;
  internalStudents: number;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

const DIVISION_LABEL: Record<string, string> = {
  GONGCHAE_M: "공채 남자",
  GONGCHAE_F: "공채 여자",
  GYEONGCHAE: "경채",
  ONLINE: "온라인",
};

const PASS_TYPE_LABEL: Record<PassType, string> = {
  WRITTEN_PASS: "필기합격",
  FINAL_PASS: "최종합격",
  APPOINTED: "임용",
  WRITTEN_FAIL: "필기불합격",
  FINAL_FAIL: "최종불합격",
};

const PASS_TYPE_COLOR: Record<PassType, string> = {
  WRITTEN_PASS: "border-amber-200 bg-amber-50 text-amber-800",
  FINAL_PASS: "border-forest/30 bg-forest/10 text-forest",
  APPOINTED: "border-blue-200 bg-blue-50 text-blue-800",
  WRITTEN_FAIL: "border-red-200 bg-red-50 text-red-700",
  FINAL_FAIL: "border-red-200 bg-red-50 text-red-700",
};

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function ExternalExamResultsPage({
  searchParams,
}: {
  searchParams: { year?: string };
}) {
  await requireAdminContext(AdminRole.TEACHER);

  const prisma = getPrisma();
  const now = new Date();
  const filterYear = searchParams.year ? parseInt(searchParams.year, 10) : now.getFullYear();
  const yearStart = new Date(filterYear, 0, 1);
  const yearEnd = new Date(filterYear + 1, 0, 1);

  // ── 1. External events this year ──────────────────────────────────────────
  const events = await prisma.examEvent.findMany({
    where: {
      eventType: ExamEventType.EXTERNAL,
      examDate: { gte: yearStart, lt: yearEnd },
    },
    orderBy: { examDate: "asc" },
    include: {
      registrations: {
        where: { cancelledAt: null },
        select: {
          examNumber: true,
          externalName: true,
          division: true,
          isPaid: true,
        },
      },
    },
  });

  // Derive available years from all external events
  const allEvents = await prisma.examEvent.findMany({
    where: { eventType: ExamEventType.EXTERNAL },
    orderBy: { examDate: "desc" },
    select: { examDate: true },
  });
  const availableYears = Array.from(
    new Set(allEvents.map((e) => e.examDate.getFullYear())),
  ).sort((a, b) => b - a);

  // Build per-event summaries
  const eventSummaries: ExternalEventSummary[] = events.map((e) => {
    const regs = e.registrations;
    const internalStudents = regs.filter((r) => r.examNumber !== null).length;
    const externalApplicants = regs.filter((r) => r.examNumber === null).length;
    const paidCount = regs.filter((r) => r.isPaid).length;
    const divisionCounts: Record<string, number> = {};
    for (const r of regs) {
      divisionCounts[r.division] = (divisionCounts[r.division] ?? 0) + 1;
    }
    return {
      id: e.id,
      title: e.title,
      examDate: e.examDate.toISOString(),
      venue: e.venue,
      totalRegistrations: regs.length,
      internalStudents,
      externalApplicants,
      paidCount,
      divisionCounts,
    };
  });

  // ── 2. KPI totals ─────────────────────────────────────────────────────────
  const totalEvents = eventSummaries.length;
  const totalRegistrations = eventSummaries.reduce(
    (s, e) => s + e.totalRegistrations,
    0,
  );
  const totalInternalStudents = eventSummaries.reduce(
    (s, e) => s + e.internalStudents,
    0,
  );
  const totalExternal = eventSummaries.reduce(
    (s, e) => s + e.externalApplicants,
    0,
  );

  // ── 3. Students who registered for external exams this year ───────────────
  const studentExamNums = Array.from(
    new Set(
      events.flatMap((e) =>
        e.registrations
          .filter((r) => r.examNumber !== null)
          .map((r) => r.examNumber as string),
      ),
    ),
  );

  // Fetch student details
  const students = await prisma.student.findMany({
    where: { examNumber: { in: studentExamNums } },
    select: {
      examNumber: true,
      name: true,
      phone: true,
      graduateRecords: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          passType: true,
          examName: true,
          writtenPassDate: true,
          finalPassDate: true,
        },
      },
    },
  });

  const studentMap = new Map(students.map((s) => [s.examNumber, s]));

  // Build per-student registration rows
  const studentRegMap = new Map<
    string,
    {
      events: {
        eventId: string;
        title: string;
        examDate: string;
        division: string;
        isPaid: boolean;
      }[];
    }
  >();
  for (const e of events) {
    for (const r of e.registrations) {
      if (!r.examNumber) continue;
      const entry = studentRegMap.get(r.examNumber) ?? { events: [] };
      entry.events.push({
        eventId: e.id,
        title: e.title,
        examDate: e.examDate.toISOString(),
        division: r.division,
        isPaid: r.isPaid,
      });
      studentRegMap.set(r.examNumber, entry);
    }
  }

  const studentRows: StudentRegistrationRow[] = Array.from(
    studentRegMap.entries(),
  )
    .map(([examNumber, { events: regs }]) => {
      const student = studentMap.get(examNumber);
      const latestGrad = student?.graduateRecords[0];
      return {
        examNumber,
        name: student?.name ?? "(알 수 없음)",
        mobile: student?.phone ?? null,
        registeredEvents: regs.sort(
          (a, b) =>
            new Date(a.examDate).getTime() - new Date(b.examDate).getTime(),
        ),
        graduateRecord: latestGrad
          ? {
              passType: latestGrad.passType,
              examName: latestGrad.examName,
              writtenPassDate:
                latestGrad.writtenPassDate?.toISOString() ?? null,
              finalPassDate: latestGrad.finalPassDate?.toISOString() ?? null,
            }
          : null,
      };
    })
    .sort((a, b) => b.registeredEvents.length - a.registeredEvents.length);

  // ── 4. Graduate record correlation ────────────────────────────────────────
  // Students who registered for external exams this year AND have a graduate record
  const withGradRecord = studentRows.filter((s) => s.graduateRecord !== null);
  const passTypeBreakdown: Record<PassType, number> = {
    WRITTEN_PASS: 0,
    FINAL_PASS: 0,
    APPOINTED: 0,
    WRITTEN_FAIL: 0,
    FINAL_FAIL: 0,
  };
  for (const s of withGradRecord) {
    if (s.graduateRecord) {
      passTypeBreakdown[s.graduateRecord.passType] += 1;
    }
  }

  // ── 5. Year-over-year trend ────────────────────────────────────────────────
  const trendYears = availableYears.slice(0, 5);
  const yearTrends: YearTrend[] = await Promise.all(
    trendYears.map(async (y) => {
      const yStart = new Date(y, 0, 1);
      const yEnd = new Date(y + 1, 0, 1);
      const yEvents = await prisma.examEvent.findMany({
        where: {
          eventType: ExamEventType.EXTERNAL,
          examDate: { gte: yStart, lt: yEnd },
        },
        select: {
          _count: { select: { registrations: true } },
          registrations: {
            where: { cancelledAt: null, examNumber: { not: null } },
            select: { examNumber: true },
          },
        },
      });
      const yTotalRegs = yEvents.reduce(
        (s, e) => s + e.registrations.length,
        0,
      );
      const yInternalStudents = new Set(
        yEvents.flatMap((e) =>
          e.registrations
            .map((r) => r.examNumber)
            .filter((n): n is string => n !== null),
        ),
      ).size;
      return {
        year: y,
        eventCount: yEvents.length,
        totalRegistrations: yTotalRegs,
        internalStudents: yInternalStudents,
      };
    }),
  );
  const maxYearRegs = Math.max(...yearTrends.map((t) => t.totalRegistrations), 1);

  // ── 6. Upcoming external exams ────────────────────────────────────────────
  const upcomingEvents = await prisma.examEvent.findMany({
    where: {
      eventType: ExamEventType.EXTERNAL,
      examDate: { gte: now },
      isActive: true,
    },
    orderBy: { examDate: "asc" },
    take: 5,
    include: {
      _count: { select: { registrations: true } },
    },
  });

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "성적 관리" },
          { label: "외부모의고사 관리", href: "/admin/exams/external" },
          { label: "결과 분석" },
        ]}
      />

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-purple-700">
            External Exam Analytics
          </div>
          <h1 className="mt-5 text-3xl font-semibold text-ink">외부시험 결과 분석</h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            외부 공무원 시험 응시 현황, 재원생 추적, 합격 기록 연계 분석을 제공합니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-5 sm:mt-0">
          {/* Year filter */}
          <div className="flex items-center gap-2">
            {availableYears.length === 0 && (
              <span className="text-sm text-slate">{filterYear}년</span>
            )}
            {availableYears.map((y) => (
              <Link
                key={y}
                href={`/admin/exams/external/results?year=${y}`}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  y === filterYear
                    ? "bg-purple-600 text-white"
                    : "border border-ink/10 text-slate hover:bg-ink/5"
                }`}
              >
                {y}년
              </Link>
            ))}
          </div>
          <Link
            href="/admin/exams/external"
            className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold text-slate transition hover:bg-ink/5"
          >
            시험 관리로
          </Link>
          <Link
            href="/admin/graduates"
            className="inline-flex items-center rounded-full border border-forest/30 px-4 py-2 text-sm font-semibold text-forest transition hover:bg-forest/10"
          >
            합격자 기록
          </Link>
        </div>
      </div>

      {/* ── Section 1: KPI ────────────────────────────────────────────────── */}
      <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate">
            시험 건수
          </p>
          <p className="mt-3 text-4xl font-bold text-ink">{totalEvents}</p>
          <p className="mt-1 text-xs text-slate">건 ({filterYear}년)</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate">
            총 응시 등록
          </p>
          <p className="mt-3 text-4xl font-bold text-purple-700">
            {totalRegistrations.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate">건</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate">
            재원생 응시
          </p>
          <p className="mt-3 text-4xl font-bold text-forest">
            {totalInternalStudents.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate">건</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate">
            합격 연계 기록
          </p>
          <p className="mt-3 text-4xl font-bold text-ember">
            {withGradRecord.length}
          </p>
          <p className="mt-1 text-xs text-slate">명</p>
        </div>
      </div>

      <div className="mt-10 space-y-10">
        {/* ── Section 2: Upcoming external exams ───────────────────────── */}
        {upcomingEvents.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-ink">예정된 외부시험</h2>
            <div className="mt-4 overflow-hidden rounded-[28px] border border-ink/10 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink/10 bg-mist/80">
                    <th className="px-5 py-3.5 text-left font-semibold text-ink/60">
                      시험명
                    </th>
                    <th className="px-5 py-3.5 text-left font-semibold text-ink/60">
                      시험일
                    </th>
                    <th className="px-5 py-3.5 text-left font-semibold text-ink/60">
                      장소
                    </th>
                    <th className="px-5 py-3.5 text-right font-semibold text-ink/60">
                      등록 인원
                    </th>
                    <th className="px-5 py-3.5 text-right font-semibold text-ink/60">
                      D-day
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {upcomingEvents.map((e) => {
                    const daysLeft = Math.ceil(
                      (e.examDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
                    );
                    return (
                      <tr key={e.id} className="hover:bg-mist/30">
                        <td className="px-5 py-3.5 font-medium text-ink">
                          {e.title}
                        </td>
                        <td className="px-5 py-3.5 text-slate">
                          {formatDate(e.examDate.toISOString())}
                        </td>
                        <td className="px-5 py-3.5 text-slate">
                          {e.venue ?? "—"}
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono font-semibold text-ink">
                          {e._count.registrations}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                              daysLeft <= 7
                                ? "bg-red-50 text-red-600"
                                : daysLeft <= 30
                                  ? "bg-amber-50 text-amber-700"
                                  : "bg-forest/10 text-forest"
                            }`}
                          >
                            D-{daysLeft}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ── Section 3: Year-over-year trend ──────────────────────────── */}
        {yearTrends.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-ink">연도별 응시 추이</h2>
            <div className="mt-4 overflow-hidden rounded-[28px] border border-ink/10 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink/10 bg-mist/80">
                    <th className="px-5 py-3.5 text-left font-semibold text-ink/60">
                      연도
                    </th>
                    <th className="px-5 py-3.5 text-right font-semibold text-ink/60">
                      시험 건수
                    </th>
                    <th className="px-5 py-3.5 text-right font-semibold text-ink/60">
                      총 등록
                    </th>
                    <th className="px-5 py-3.5 text-right font-semibold text-ink/60">
                      재원생
                    </th>
                    <th className="px-5 py-3.5 text-left font-semibold text-ink/60">
                      비율
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {yearTrends.map((t) => {
                    const barWidth =
                      maxYearRegs > 0
                        ? Math.round((t.totalRegistrations / maxYearRegs) * 100)
                        : 0;
                    const internalPct =
                      t.totalRegistrations > 0
                        ? round1((t.internalStudents / t.totalRegistrations) * 100)
                        : 0;
                    return (
                      <tr
                        key={t.year}
                        className={`hover:bg-mist/30 ${t.year === filterYear ? "bg-purple-50/50" : ""}`}
                      >
                        <td className="px-5 py-3.5 font-semibold text-ink">
                          {t.year}년
                          {t.year === filterYear && (
                            <span className="ml-2 text-xs font-normal text-purple-600">
                              (현재)
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono text-slate">
                          {t.eventCount}건
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono font-semibold text-ink">
                          {t.totalRegistrations.toLocaleString()}
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono text-forest">
                          {t.internalStudents.toLocaleString()}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-32 overflow-hidden rounded-full bg-ink/10">
                              <div
                                className="h-full rounded-full bg-purple-500"
                                style={{ width: `${barWidth}%` }}
                              />
                            </div>
                            <span className="text-xs text-slate">
                              재원생 {internalPct}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {totalEvents === 0 ? (
          <div className="rounded-[28px] border border-dashed border-ink/10 p-12 text-center text-slate">
            {filterYear}년 외부시험 데이터가 없습니다.
          </div>
        ) : (
          <>
            {/* ── Section 4: Per-event breakdown ──────────────────────── */}
            <section>
              <h2 className="text-lg font-semibold text-ink">
                시험별 응시 현황{" "}
                <span className="text-sm font-normal text-slate">
                  ({filterYear}년)
                </span>
              </h2>
              <div className="mt-4 overflow-x-auto rounded-[28px] border border-ink/10">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink/10 bg-mist/80">
                      <th className="px-5 py-3.5 text-left font-semibold text-ink/60">
                        시험명
                      </th>
                      <th className="px-5 py-3.5 text-left font-semibold text-ink/60">
                        시험일
                      </th>
                      <th className="px-5 py-3.5 text-left font-semibold text-ink/60">
                        장소
                      </th>
                      <th className="px-5 py-3.5 text-right font-semibold text-ink/60">
                        공채(남)
                      </th>
                      <th className="px-5 py-3.5 text-right font-semibold text-ink/60">
                        공채(여)
                      </th>
                      <th className="px-5 py-3.5 text-right font-semibold text-ink/60">
                        경채
                      </th>
                      <th className="px-5 py-3.5 text-right font-semibold text-ink/60">
                        재원생
                      </th>
                      <th className="px-5 py-3.5 text-right font-semibold text-ink/60">
                        외부
                      </th>
                      <th className="px-5 py-3.5 text-right font-semibold text-ink/60">
                        합계
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/5">
                    {eventSummaries.map((e) => (
                      <tr key={e.id} className="hover:bg-mist/30">
                        <td className="px-5 py-3.5 font-medium text-ink whitespace-nowrap">
                          {e.title}
                        </td>
                        <td className="px-5 py-3.5 text-slate whitespace-nowrap">
                          {formatDate(e.examDate)}
                        </td>
                        <td className="px-5 py-3.5 text-slate">
                          {e.venue ?? "—"}
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono text-slate">
                          {e.divisionCounts["GONGCHAE_M"] ?? 0}
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono text-slate">
                          {e.divisionCounts["GONGCHAE_F"] ?? 0}
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono text-slate">
                          {e.divisionCounts["GYEONGCHAE"] ?? 0}
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono font-semibold text-forest">
                          {e.internalStudents}
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono text-slate">
                          {e.externalApplicants}
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono font-semibold text-ink">
                          {e.totalRegistrations}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {eventSummaries.length > 1 && (
                    <tfoot>
                      <tr className="border-t border-ink/10 bg-mist/80">
                        <td
                          colSpan={3}
                          className="px-5 py-3.5 text-sm font-semibold text-ink"
                        >
                          합계
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono font-semibold text-ink">
                          {eventSummaries.reduce(
                            (s, e) => s + (e.divisionCounts["GONGCHAE_M"] ?? 0),
                            0,
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono font-semibold text-ink">
                          {eventSummaries.reduce(
                            (s, e) => s + (e.divisionCounts["GONGCHAE_F"] ?? 0),
                            0,
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono font-semibold text-ink">
                          {eventSummaries.reduce(
                            (s, e) => s + (e.divisionCounts["GYEONGCHAE"] ?? 0),
                            0,
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono font-semibold text-forest">
                          {totalInternalStudents}
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono font-semibold text-slate">
                          {totalExternal}
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono font-bold text-ember">
                          {totalRegistrations}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </section>

            {/* ── Section 5: Graduate record correlation ─────────────── */}
            {withGradRecord.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold text-ink">
                  합격 기록 연계 현황{" "}
                  <span className="text-sm font-normal text-slate">
                    (외부시험 응시 재원생 중 합격 기록 보유)
                  </span>
                </h2>
                <div className="mt-4 grid grid-cols-3 gap-3">
                  {(Object.keys(passTypeBreakdown) as PassType[]).map((pt) => (
                    <div
                      key={pt}
                      className="rounded-[28px] border border-ink/10 bg-white p-5 text-center"
                    >
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate">
                        {PASS_TYPE_LABEL[pt]}
                      </p>
                      <p className="mt-2 text-3xl font-bold text-ink">
                        {passTypeBreakdown[pt]}
                      </p>
                      <p className="mt-1 text-xs text-slate">명</p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 overflow-hidden rounded-[28px] border border-ink/10">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-ink/10 bg-mist/80">
                        <th className="px-5 py-3.5 text-left font-semibold text-ink/60">
                          학생
                        </th>
                        <th className="px-5 py-3.5 text-right font-semibold text-ink/60">
                          응시 횟수
                        </th>
                        <th className="px-5 py-3.5 text-left font-semibold text-ink/60">
                          합격 구분
                        </th>
                        <th className="px-5 py-3.5 text-left font-semibold text-ink/60">
                          시험명
                        </th>
                        <th className="px-5 py-3.5 text-left font-semibold text-ink/60">
                          필기합격일
                        </th>
                        <th className="px-5 py-3.5 text-left font-semibold text-ink/60">
                          최종합격일
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink/5">
                      {withGradRecord.map((s) => (
                        <tr key={s.examNumber} className="hover:bg-mist/30">
                          <td className="px-5 py-3.5">
                            <Link
                              href={`/admin/students/${s.examNumber}`}
                              className="font-medium text-ink transition hover:text-ember"
                            >
                              {s.name}
                            </Link>{" "}
                            <span className="text-xs text-slate">
                              {s.examNumber}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-right font-mono text-slate">
                            {s.registeredEvents.length}회
                          </td>
                          <td className="px-5 py-3.5">
                            {s.graduateRecord && (
                              <span
                                className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${PASS_TYPE_COLOR[s.graduateRecord.passType]}`}
                              >
                                {PASS_TYPE_LABEL[s.graduateRecord.passType]}
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-slate">
                            {s.graduateRecord?.examName ?? "—"}
                          </td>
                          <td className="px-5 py-3.5 text-slate">
                            {s.graduateRecord?.writtenPassDate
                              ? formatDate(s.graduateRecord.writtenPassDate)
                              : "—"}
                          </td>
                          <td className="px-5 py-3.5 text-slate">
                            {s.graduateRecord?.finalPassDate
                              ? formatDate(s.graduateRecord.finalPassDate)
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* ── Section 6: All registered students table ───────────── */}
            <section>
              <h2 className="text-lg font-semibold text-ink">
                재원생 응시 내역{" "}
                <span className="text-sm font-normal text-slate">
                  ({filterYear}년, 총 {studentRows.length}명)
                </span>
              </h2>
              {studentRows.length === 0 ? (
                <div className="mt-4 rounded-[28px] border border-dashed border-ink/10 p-8 text-center text-sm text-slate">
                  재원생 응시 기록이 없습니다.
                </div>
              ) : (
                <div className="mt-4 overflow-x-auto rounded-[28px] border border-ink/10">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-ink/10 bg-mist/80">
                        <th className="px-5 py-3.5 text-left font-semibold text-ink/60">
                          학생
                        </th>
                        <th className="px-5 py-3.5 text-right font-semibold text-ink/60">
                          응시 횟수
                        </th>
                        <th className="px-5 py-3.5 text-left font-semibold text-ink/60">
                          응시 시험
                        </th>
                        <th className="px-5 py-3.5 text-left font-semibold text-ink/60">
                          합격 기록
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink/5">
                      {studentRows.map((s) => (
                        <tr key={s.examNumber} className="hover:bg-mist/30 align-top">
                          <td className="px-5 py-3.5">
                            <Link
                              href={`/admin/students/${s.examNumber}`}
                              className="font-medium text-ink transition hover:text-ember"
                            >
                              {s.name}
                            </Link>
                            <br />
                            <span className="text-xs text-slate">
                              {s.examNumber}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-right font-mono font-semibold text-purple-700">
                            {s.registeredEvents.length}회
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex flex-wrap gap-1.5">
                              {s.registeredEvents.map((ev, i) => (
                                <span
                                  key={i}
                                  className="inline-flex items-center gap-1 rounded-full border border-ink/10 bg-ink/5 px-2.5 py-0.5 text-xs text-slate"
                                  title={ev.title}
                                >
                                  <span>
                                    {new Date(ev.examDate).toLocaleDateString(
                                      "ko-KR",
                                      { month: "numeric", day: "numeric" },
                                    )}
                                  </span>
                                  <span className="text-ink/40">·</span>
                                  <span>{DIVISION_LABEL[ev.division] ?? ev.division}</span>
                                  {ev.isPaid && (
                                    <span className="text-forest">✓</span>
                                  )}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-5 py-3.5">
                            {s.graduateRecord ? (
                              <span
                                className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${PASS_TYPE_COLOR[s.graduateRecord.passType]}`}
                              >
                                {PASS_TYPE_LABEL[s.graduateRecord.passType]}
                              </span>
                            ) : (
                              <span className="text-xs text-slate/50">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
