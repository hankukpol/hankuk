import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { notFound } from "next/navigation";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { SettlementClient } from "./settlement-client";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function InstructorSettlementsPage({ params }: PageProps) {
  await requireAdminContext(AdminRole.MANAGER);
  const { id } = await params;

  const instructor = await getPrisma().instructor.findUnique({
    where: { id },
    include: {
      settlements: {
        orderBy: { month: "desc" },
        take: 12,
      },
      lectureSubjects: {
        include: {
          lecture: {
            select: {
              id: true,
              name: true,
              startDate: true,
              endDate: true,
            },
          },
        },
      },
    },
  });

  if (!instructor) notFound();

  // Auto-calculate for current month
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const currentMonthSessions = instructor.lectureSubjects
    .filter((s) => {
      const start = s.lecture.startDate;
      const end = s.lecture.endDate;
      return start <= monthEnd && end >= monthStart;
    })
    .map((s) => ({
      subjectId: s.id,
      subjectName: s.subjectName,
      lectureName: s.lecture.name,
      price: s.price,
      instructorRate: s.instructorRate,
      amount: Math.floor((s.price * s.instructorRate) / 100),
    }));

  const calculatedAmount = currentMonthSessions.reduce((sum, s) => sum + s.amount, 0);

  const rawExisting = instructor.settlements.find((s) => s.month === currentMonth) ?? null;
  const existingCurrentMonth = rawExisting
    ? {
        ...rawExisting,
        paidAt: rawExisting.paidAt ? rawExisting.paidAt.toISOString() : null,
        createdAt: rawExisting.createdAt.toISOString(),
      }
    : null;

  // Stats
  const totalPaid = instructor.settlements
    .filter((s) => s.isPaid)
    .reduce((sum, s) => sum + s.totalAmount, 0);

  const unpaidCount = instructor.settlements.filter((s) => !s.isPaid).length;

  const settlementRows = instructor.settlements.map((s) => ({
    id: s.id,
    month: s.month,
    totalSessions: s.totalSessions,
    totalAmount: s.totalAmount,
    isPaid: s.isPaid,
    paidAt: s.paidAt ? s.paidAt.toISOString() : null,
    note: s.note,
    createdAt: s.createdAt.toISOString(),
  }));

  return (
    <div className="p-8 sm:p-10">
      {/* Back link */}
      <Link
        href={`/admin/settings/instructors/${id}`}
        className="text-sm text-slate hover:text-ink"
      >
        &larr; 강사 상세
      </Link>

      <div className="mt-4 inline-flex rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ink">
        강사 정산
      </div>

      {/* Header */}
      <div className="mt-5 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold">
            {instructor.name}
            <span className="ml-3 text-xl font-normal text-slate">{instructor.subject}</span>
          </h1>
          {(instructor.bankName || instructor.bankAccount) && (
            <p className="mt-2 text-sm text-slate">
              정산 계좌:{" "}
              <span className="font-medium text-ink">
                {instructor.bankName ?? ""}{" "}
                {instructor.bankAccount ?? ""}{" "}
                {instructor.bankHolder ? `(${instructor.bankHolder})` : ""}
              </span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/admin/settings/instructors/${id}/revenue-rates`}
            className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm text-slate transition hover:border-ink/30"
          >
            배분율 관리
          </Link>
        </div>
      </div>

      {/* KPI */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-[24px] border border-ink/10 bg-white p-5 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">누적 지급액</p>
          <p className="mt-2 text-xl font-bold text-ink">
            {totalPaid.toLocaleString()}원
          </p>
        </div>
        <div className="rounded-[24px] border border-ink/10 bg-white p-5 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">미지급 건수</p>
          <p className="mt-2 text-xl font-bold text-ember">{unpaidCount}건</p>
        </div>
        <div className="rounded-[24px] border border-ink/10 bg-white p-5 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">이번달 예상</p>
          <p className="mt-2 text-xl font-bold text-forest">
            {calculatedAmount.toLocaleString()}원
          </p>
        </div>
      </div>

      {/* Client interactive part */}
      <SettlementClient
        instructorId={id}
        instructorName={instructor.name}
        currentMonth={currentMonth}
        calculatedAmount={calculatedAmount}
        calculatedSessions={currentMonthSessions.length}
        currentMonthSessions={currentMonthSessions}
        existingCurrentMonth={existingCurrentMonth}
        settlements={settlementRows}
      />
    </div>
  );
}
