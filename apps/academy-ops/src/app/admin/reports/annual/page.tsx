import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { PrintButton } from "@/components/ui/print-button";
import { AnnualReportClient } from "./annual-report-client";

export const dynamic = "force-dynamic";

function parseYearParam(param: string | undefined): number {
  if (param && /^\d{4}$/.test(param)) {
    const y = parseInt(param, 10);
    if (y >= 2020 && y <= 2099) return y;
  }
  return new Date().getFullYear();
}

type MonthData = {
  month: string;
  monthLabel: string;
  paymentNet: number;
  paymentGross: number;
  paymentCount: number;
  refundTotal: number;
  refundCount: number;
  newEnrollments: number;
  cancelledEnrollments: number;
  writtenPass: number;
  finalPass: number;
};

export default async function AnnualReportPage({
  searchParams,
}: {
  searchParams: { year?: string };
}) {
  await requireAdminContext(AdminRole.MANAGER);

  const year = parseYearParam(searchParams.year);
  const prisma = getPrisma();

  const months: MonthData[] = [];

  for (let m = 1; m <= 12; m++) {
    const monthStart = new Date(year, m - 1, 1, 0, 0, 0, 0);
    const monthEnd = new Date(year, m, 0, 23, 59, 59, 999);

    let paymentNet = 0;
    let paymentGross = 0;
    let paymentCount = 0;
    let refundTotal = 0;
    let refundCount = 0;
    let newEnrollments = 0;
    let cancelledEnrollments = 0;
    let writtenPass = 0;
    let finalPass = 0;

    try {
      const [payAgg, refAgg, newEnroll, cancelledEnroll] = await Promise.all([
        prisma.payment.aggregate({
          where: {
            status: { in: ["APPROVED", "PARTIAL_REFUNDED"] },
            processedAt: { gte: monthStart, lte: monthEnd },
          },
          _sum: { netAmount: true, grossAmount: true },
          _count: { id: true },
        }),
        prisma.refund.aggregate({
          where: {
            status: "COMPLETED",
            processedAt: { gte: monthStart, lte: monthEnd },
          },
          _sum: { amount: true },
          _count: { id: true },
        }),
        prisma.courseEnrollment.count({
          where: { status: "ACTIVE", createdAt: { gte: monthStart, lte: monthEnd } },
        }),
        prisma.courseEnrollment.count({
          where: {
            status: { in: ["CANCELLED", "WITHDRAWN"] },
            updatedAt: { gte: monthStart, lte: monthEnd },
          },
        }),
      ]);
      paymentNet = payAgg._sum.netAmount ?? 0;
      paymentGross = payAgg._sum.grossAmount ?? 0;
      paymentCount = payAgg._count.id ?? 0;
      refundTotal = refAgg._sum.amount ?? 0;
      refundCount = refAgg._count.id ?? 0;
      newEnrollments = newEnroll;
      cancelledEnrollments = cancelledEnroll;
    } catch { /* 기본값 유지 */ }

    try {
      const [written, final] = await Promise.all([
        prisma.graduateRecord.count({
          where: {
            passType: "WRITTEN_PASS",
            writtenPassDate: { gte: monthStart, lte: monthEnd },
          },
        }),
        prisma.graduateRecord.count({
          where: {
            passType: "FINAL_PASS",
            finalPassDate: { gte: monthStart, lte: monthEnd },
          },
        }),
      ]);
      writtenPass = written;
      finalPass = final;
    } catch { /* 합격자 데이터 없음 */ }

    months.push({
      month: `${year}-${String(m).padStart(2, "0")}`,
      monthLabel: `${m}월`,
      paymentNet,
      paymentGross,
      paymentCount,
      refundTotal,
      refundCount,
      newEnrollments,
      cancelledEnrollments,
      writtenPass,
      finalPass,
    });
  }

  // 연간 합계
  const annual = {
    paymentNet: months.reduce((s, m) => s + m.paymentNet, 0),
    paymentGross: months.reduce((s, m) => s + m.paymentGross, 0),
    paymentCount: months.reduce((s, m) => s + m.paymentCount, 0),
    refundTotal: months.reduce((s, m) => s + m.refundTotal, 0),
    refundCount: months.reduce((s, m) => s + m.refundCount, 0),
    newEnrollments: months.reduce((s, m) => s + m.newEnrollments, 0),
    cancelledEnrollments: months.reduce((s, m) => s + m.cancelledEnrollments, 0),
    writtenPass: months.reduce((s, m) => s + m.writtenPass, 0),
    finalPass: months.reduce((s, m) => s + m.finalPass, 0),
  };

  let currentActiveEnrollments = 0;
  try {
    currentActiveEnrollments = await prisma.courseEnrollment.count({
      where: { status: "ACTIVE" },
    });
  } catch { /* 기본값 유지 */ }

  const isCurrentYear = year === new Date().getFullYear();
  const prevYear = year - 1;
  const nextYear = year + 1;
  const isFutureYear = nextYear > new Date().getFullYear();

  return (
    <div className="space-y-8 p-8 sm:p-10">
      {/* ── 헤더 ── */}
      <div>
        <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
          보고서
        </div>
        <h1 className="mt-4 text-3xl font-semibold text-ink">
          {year}년 연간 통계
        </h1>
        <p className="mt-2 text-sm text-slate">
          {year}년 1~12월 수납·수강 등록·합격자 통계를 한눈에 확인합니다.
        </p>
      </div>

      {/* ── 연도 네비게이션 + 액션 버튼 ── */}
      <div className="no-print flex flex-wrap items-center gap-3">
        <Link
          href={`/admin/reports/annual?year=${prevYear}`}
          className="rounded-xl border border-ink/15 bg-white px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-mist"
        >
          ← {prevYear}년
        </Link>
        <span className="rounded-xl bg-forest/10 px-4 py-2 text-sm font-semibold text-forest">
          {year}년
          {isCurrentYear && (
            <span className="ml-2 rounded-full bg-ember/20 px-2 py-0.5 text-xs text-ember">올해</span>
          )}
        </span>
        {!isFutureYear && (
          <Link
            href={`/admin/reports/annual?year=${nextYear}`}
            className="rounded-xl border border-ink/15 bg-white px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-mist"
          >
            {nextYear}년 →
          </Link>
        )}
        <div className="ml-auto flex gap-2">
          <Link
            href={`/admin/reports/monthly?month=${year}-${String(new Date().getMonth() + 1).padStart(2, "0")}`}
            className="no-print rounded-xl border border-ink/15 bg-white px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-mist"
          >
            월간 보고서
          </Link>
          <PrintButton
            label="인쇄"
            className="no-print rounded-xl border border-ink/15 bg-white px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-mist"
          />
          <a
            href={`/api/reports/annual/export?year=${year}`}
            className="no-print rounded-xl bg-forest px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-forest/90"
          >
            Excel 내보내기
          </a>
        </div>
      </div>

      {/* ── 클라이언트 컴포넌트 (차트 + 테이블) ── */}
      <AnnualReportClient
        year={year}
        months={months}
        annual={annual}
        currentActiveEnrollments={currentActiveEnrollments}
      />
    </div>
  );
}
