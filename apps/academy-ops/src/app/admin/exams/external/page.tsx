import Link from "next/link";
import { AdminRole, ExamEventType } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { ExternalExamManager } from "./external-exam-manager";

export const dynamic = "force-dynamic";

export type ExamRegistrantStats = {
  total: number;
  paid: number;
  unpaid: number;
  scored: number;
  internalStudents: number;
  externalApplicants: number;
  totalFees: number;
  divisionCounts: Record<string, number>;
};

export type ExamEventRow = {
  id: string;
  title: string;
  eventType: ExamEventType;
  examDate: string;
  registrationFee: number;
  registrationDeadline: string | null;
  venue: string | null;
  isActive: boolean;
  createdAt: string;
  _count: { registrations: number };
  stats: ExamRegistrantStats;
};

export default async function ExternalExamPage() {
  await requireAdminContext(AdminRole.COUNSELOR);

  const prisma = getPrisma();
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);

  const events = await prisma.examEvent.findMany({
    where: { eventType: ExamEventType.EXTERNAL },
    orderBy: { examDate: "desc" },
    include: {
      _count: { select: { registrations: true } },
      registrations: {
        where: { cancelledAt: null },
        select: {
          examNumber: true,
          isPaid: true,
          paidAmount: true,
          division: true,
          score: { select: { id: true } },
        },
      },
    },
  });

  // 올해 비용 집계
  const yearEvents = await prisma.examEvent.findMany({
    where: {
      eventType: ExamEventType.EXTERNAL,
      examDate: { gte: yearStart, lt: new Date(now.getFullYear() + 1, 0, 1) },
    },
    include: {
      registrations: {
        where: { cancelledAt: null, isPaid: true },
        select: { paidAmount: true },
      },
    },
  });

  const yearTotalFees = yearEvents.reduce(
    (sum, e) => sum + e.registrations.reduce((s, r) => s + r.paidAmount, 0),
    0,
  );

  const rows: ExamEventRow[] = events.map((e) => {
    const regs = e.registrations;
    const paid = regs.filter((r) => r.isPaid);
    const unpaid = regs.filter((r) => !r.isPaid);
    const scored = regs.filter((r) => r.score !== null);
    const internalStudents = regs.filter((r) => r.examNumber !== null);
    const externalApplicants = regs.filter((r) => r.examNumber === null);
    const totalFees = paid.reduce((s, r) => s + r.paidAmount, 0);
    const divisionCounts: Record<string, number> = {};
    for (const r of regs) {
      divisionCounts[r.division] = (divisionCounts[r.division] ?? 0) + 1;
    }

    return {
      id: e.id,
      title: e.title,
      eventType: e.eventType,
      examDate: e.examDate.toISOString(),
      registrationFee: e.registrationFee,
      registrationDeadline: e.registrationDeadline?.toISOString() ?? null,
      venue: e.venue,
      isActive: e.isActive,
      createdAt: e.createdAt.toISOString(),
      _count: e._count,
      stats: {
        total: regs.length,
        paid: paid.length,
        unpaid: unpaid.length,
        scored: scored.length,
        internalStudents: internalStudents.length,
        externalApplicants: externalApplicants.length,
        totalFees,
        divisionCounts,
      },
    };
  });

  const totalRegistrations = rows.reduce((s, e) => s + e.stats.total, 0);
  const totalInternalStudents = rows.reduce((s, e) => s + e.stats.internalStudents, 0);

  return (
    <div className="p-8 sm:p-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-purple-700">
            External Exam
          </div>
          <h1 className="mt-5 text-3xl font-semibold">외부모의고사 관리</h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            경찰청·공단 주관 외부 시험 일정을 등록하고 수강생 응시 결과를 기록합니다.
          </p>
        </div>
        <div className="mt-5 sm:mt-0 flex flex-shrink-0 items-center gap-3">
          <Link
            href="/admin/exams/external/results"
            className="inline-flex items-center gap-2 rounded-full border border-purple-300 px-5 py-2 text-sm font-semibold text-purple-700 transition hover:bg-purple-50"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
            결과 분석
          </Link>
          <Link
            href="/admin/exams/new"
            className="inline-flex items-center gap-2 rounded-full bg-[#C55A11] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#b04e0f]"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            새 시험 등록
          </Link>
        </div>
      </div>

      {/* KPI 요약 */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate">전체 시험</p>
          <p className="mt-3 text-3xl font-bold text-ink">
            {rows.length}
            <span className="ml-1 text-sm font-normal text-slate">건</span>
          </p>
          <p className="mt-1 text-xs text-slate">등록된 외부시험 총수</p>
        </div>
        <div className="rounded-[28px] border border-purple-200 bg-purple-50/60 p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate">총 응시 등록</p>
          <p className="mt-3 text-3xl font-bold text-purple-700">
            {totalRegistrations.toLocaleString()}
            <span className="ml-1 text-sm font-normal text-slate">명</span>
          </p>
          <p className="mt-1 text-xs text-slate">전체 시험 합산</p>
        </div>
        <div className="rounded-[28px] border border-forest/20 bg-forest/5 p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate">재원생 응시</p>
          <p className="mt-3 text-3xl font-bold text-forest">
            {totalInternalStudents.toLocaleString()}
            <span className="ml-1 text-sm font-normal text-slate">명</span>
          </p>
          <p className="mt-1 text-xs text-slate">전체 시험 합산</p>
        </div>
        <div className="rounded-[28px] border border-ember/20 bg-ember/5 p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate">
            올해 납부 비용
          </p>
          <p className="mt-3 text-3xl font-bold text-ember">
            {yearTotalFees > 0
              ? `${Math.round(yearTotalFees / 10000).toLocaleString()}만`
              : "0"}
            <span className="ml-1 text-sm font-normal text-slate">원</span>
          </p>
          <p className="mt-1 text-xs text-slate">{now.getFullYear()}년 실납부 집계</p>
        </div>
      </div>

      <div className="mt-8">
        <ExternalExamManager initialEvents={rows} />
      </div>
    </div>
  );
}
