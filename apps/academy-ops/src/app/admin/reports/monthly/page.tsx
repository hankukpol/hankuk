import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { PrintReportButton } from "./print-report-button";

export const dynamic = "force-dynamic";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseMonthParam(param: string | undefined): { year: number; month: number } {
  if (param && /^\d{4}-\d{2}$/.test(param)) {
    const [y, m] = param.split("-").map(Number);
    if (m >= 1 && m <= 12) return { year: y, month: m };
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function prevMonth(year: number, month: number): string {
  const d = new Date(year, month - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function nextMonth(year: number, month: number): string {
  const d = new Date(year, month, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function fmtKRW(n: number): string {
  return n.toLocaleString("ko-KR") + "원";
}

function fmtNum(n: number): string {
  return n.toLocaleString("ko-KR");
}

const EXAM_CATEGORY_LABEL: Record<string, string> = {
  GONGCHAE: "공채",
  GYEONGCHAE: "경채",
  SOGANG: "소강",
  CUSTOM: "기타",
};

const SETTLEMENT_STATUS_LABEL: Record<string, string> = {
  PENDING: "미지급",
  PAID: "지급완료",
  CANCELLED: "취소",
};

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  CASH: "현금",
  CARD: "카드",
  TRANSFER: "계좌이체",
  POINT: "포인트",
  MIXED: "혼합결제",
};

const PROSPECT_STAGE_LABEL: Record<string, string> = {
  INQUIRY: "문의",
  VISITING: "내방 상담",
  DECIDING: "검토 중",
  REGISTERED: "등록 완료",
  DROPPED: "이탈",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({
  title,
  value,
  sub,
  highlight,
  warn,
}: {
  title: string;
  value: string;
  sub?: string;
  highlight?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="rounded-[24px] border border-ink/10 bg-white p-5">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate">{title}</p>
      <p
        className={`mt-3 text-2xl font-bold ${
          warn ? "text-red-600" : highlight ? "text-ember" : "text-ink"
        }`}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-slate">{sub}</p>}
    </div>
  );
}

function ProgressBar({ value, max }: { value: number; max: number | null }) {
  if (!max || max === 0) return null;
  const pct = Math.min(100, Math.round((value / max) * 100));
  const color = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-forest";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-ink/10">
      <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function MonthlyReportPage({
  searchParams,
}: {
  searchParams: { month?: string };
}) {
  await requireAdminContext(AdminRole.MANAGER);

  const { year, month } = parseMonthParam(searchParams.month);
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  const korMonth = `${year}년 ${month}월`;
  const printDate = new Date().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const monthStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);

  // Previous month boundaries (for comparison)
  const prevMonthStart = new Date(year, month - 2, 1, 0, 0, 0, 0);
  const prevMonthEnd = new Date(year, month - 1, 0, 23, 59, 59, 999);

  const prisma = getPrisma();

  // ── Section 1: 수강생 현황 ─────────────────────────────────────────────────
  let newEnrollments = 0;
  let cancelledEnrollments = 0;
  let activeEnrollmentsNow = 0;
  let waitingEnrollments = 0;
  let activeEnrollmentsAtMonthStart = 0;
  try {
    [
      newEnrollments,
      cancelledEnrollments,
      activeEnrollmentsNow,
      waitingEnrollments,
      activeEnrollmentsAtMonthStart,
    ] = await Promise.all([
      prisma.courseEnrollment.count({
        where: { status: "ACTIVE", createdAt: { gte: monthStart, lte: monthEnd } },
      }),
      prisma.courseEnrollment.count({
        where: {
          status: { in: ["CANCELLED", "WITHDRAWN"] },
          updatedAt: { gte: monthStart, lte: monthEnd },
        },
      }),
      prisma.courseEnrollment.count({ where: { status: "ACTIVE" } }),
      prisma.courseEnrollment.count({ where: { status: "WAITING" } }),
      // Approximate month-start count: current active minus new ones added this month plus cancelled ones
      prisma.courseEnrollment.count({
        where: { status: "ACTIVE", createdAt: { lt: monthStart } },
      }),
    ]);
  } catch { /* 기본값 유지 */ }

  const netEnrollmentChange = newEnrollments - cancelledEnrollments;

  // ── Section 2: 수납 현황 ──────────────────────────────────────────────────
  let paymentGross = 0;
  let paymentNet = 0;
  let paymentCount = 0;
  let paymentByMethod: Record<string, { count: number; amount: number }> = {};
  try {
    const payments = await prisma.payment.findMany({
      where: {
        status: { in: ["APPROVED", "PARTIAL_REFUNDED"] },
        processedAt: { gte: monthStart, lte: monthEnd },
      },
      select: { method: true, netAmount: true, grossAmount: true },
    });
    paymentCount = payments.length;
    for (const p of payments) {
      paymentGross += p.grossAmount;
      paymentNet += p.netAmount;
      if (!paymentByMethod[p.method]) paymentByMethod[p.method] = { count: 0, amount: 0 };
      paymentByMethod[p.method].count += 1;
      paymentByMethod[p.method].amount += p.netAmount;
    }
  } catch { /* 기본값 유지 */ }

  let refundTotal = 0;
  let refundCount = 0;
  try {
    const refunds = await prisma.refund.aggregate({
      where: { status: "COMPLETED", processedAt: { gte: monthStart, lte: monthEnd } },
      _sum: { amount: true },
      _count: { id: true },
    });
    refundTotal = refunds._sum.amount ?? 0;
    refundCount = refunds._count.id ?? 0;
  } catch { /* 기본값 유지 */ }

  let unpaidAmount = 0;
  let unpaidCount = 0;
  try {
    const unpaid = await prisma.installment.aggregate({
      where: { paidAt: null, dueDate: { lte: monthEnd } },
      _sum: { amount: true },
      _count: { id: true },
    });
    unpaidAmount = unpaid._sum.amount ?? 0;
    unpaidCount = unpaid._count.id ?? 0;
  } catch { /* 기본값 유지 */ }

  const netRevenue = paymentNet - refundTotal;

  // Previous month net revenue (for comparison)
  let prevMonthNet = 0;
  try {
    const prevPayments = await prisma.payment.aggregate({
      where: {
        status: { in: ["APPROVED", "PARTIAL_REFUNDED"] },
        processedAt: { gte: prevMonthStart, lte: prevMonthEnd },
      },
      _sum: { netAmount: true },
    });
    const prevRefunds = await prisma.refund.aggregate({
      where: { status: "COMPLETED", processedAt: { gte: prevMonthStart, lte: prevMonthEnd } },
      _sum: { amount: true },
    });
    prevMonthNet = (prevPayments._sum.netAmount ?? 0) - (prevRefunds._sum.amount ?? 0);
  } catch { /* 기본값 유지 */ }

  const revenueChange = prevMonthNet > 0
    ? Math.round(((netRevenue - prevMonthNet) / prevMonthNet) * 100)
    : null;

  // ── 기수별 수강 현황 ──────────────────────────────────────────────────────
  type CohortOccupancy = {
    id: string;
    name: string;
    examCategory: string;
    maxCapacity: number | null;
    enrolled: number;
    waiting: number;
  };
  let cohorts: CohortOccupancy[] = [];
  try {
    const cohortRows = await prisma.cohort.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        examCategory: true,
        maxCapacity: true,
        _count: { select: { enrollments: { where: { status: "ACTIVE" } } } },
      },
      orderBy: { startDate: "desc" },
    });
    const waitingCounts = await prisma.courseEnrollment.groupBy({
      by: ["cohortId"],
      where: { cohortId: { in: cohortRows.map((c) => c.id) }, status: "WAITING" },
      _count: { id: true },
    });
    const waitingMap = new Map(waitingCounts.map((w) => [w.cohortId, w._count.id]));
    cohorts = cohortRows.map((c) => ({
      id: c.id,
      name: c.name,
      examCategory: c.examCategory,
      maxCapacity: c.maxCapacity,
      enrolled: c._count.enrollments,
      waiting: waitingMap.get(c.id) ?? 0,
    }));
  } catch { /* 기본값 유지 */ }

  // ── Section 3: 출결 현황 ──────────────────────────────────────────────────
  let warningCount = 0;
  let warning2Count = 0;
  let dropoutCount = 0;
  let attendanceTotal = 0;
  let attendanceAbsent = 0;
  try {
    const [absentScores, warning1Snaps, warning2Snaps, dropoutSnaps, totalScores] = await Promise.all([
      prisma.score.count({
        where: { attendType: "ABSENT", session: { examDate: { gte: monthStart, lte: monthEnd } } },
      }),
      prisma.weeklyStatusSnapshot.count({
        where: { status: "WARNING_1", weekStartDate: { gte: monthStart, lte: monthEnd } },
      }),
      prisma.weeklyStatusSnapshot.count({
        where: { status: "WARNING_2", weekStartDate: { gte: monthStart, lte: monthEnd } },
      }),
      prisma.weeklyStatusSnapshot.count({
        where: { status: "DROPOUT", weekStartDate: { gte: monthStart, lte: monthEnd } },
      }),
      prisma.score.count({
        where: { session: { examDate: { gte: monthStart, lte: monthEnd } } },
      }),
    ]);
    attendanceAbsent = absentScores;
    warningCount = warning1Snaps;
    warning2Count = warning2Snaps;
    dropoutCount = dropoutSnaps;
    attendanceTotal = totalScores;
  } catch { /* 기본값 유지 */ }

  const attendanceRate =
    attendanceTotal > 0
      ? Math.round(((attendanceTotal - attendanceAbsent) / attendanceTotal) * 1000) / 10
      : null;

  // ── Section 4: 상담/영업 현황 ─────────────────────────────────────────────
  let prospectTotal = 0;
  let prospectRegistered = 0;
  let prospectByStage: Record<string, number> = {};
  let prevProspectTotal = 0;
  let prevProspectRegistered = 0;

  try {
    const prospects = await prisma.consultationProspect.findMany({
      where: { createdAt: { gte: monthStart, lte: monthEnd } },
      select: { stage: true },
    });
    prospectTotal = prospects.length;
    for (const p of prospects) {
      prospectByStage[p.stage] = (prospectByStage[p.stage] ?? 0) + 1;
    }
    prospectRegistered = prospectByStage["REGISTERED"] ?? 0;
  } catch { /* 기본값 유지 */ }

  try {
    const prev = await prisma.consultationProspect.findMany({
      where: { createdAt: { gte: prevMonthStart, lte: prevMonthEnd } },
      select: { stage: true },
    });
    prevProspectTotal = prev.length;
    prevProspectRegistered = prev.filter((p) => p.stage === "REGISTERED").length;
  } catch { /* 기본값 유지 */ }

  const conversionRate =
    prospectTotal > 0 ? Math.round((prospectRegistered / prospectTotal) * 100) : null;
  const prevConversionRate =
    prevProspectTotal > 0 ? Math.round((prevProspectRegistered / prevProspectTotal) * 100) : null;

  // ── Section 5: 교재 판매 ──────────────────────────────────────────────────
  let tbSalesCount = 0;
  let tbSalesTotal = 0;
  let bestSellerName: string | null = null;
  let bestSellerQty = 0;
  try {
    const tbSales = await prisma.textbookSale.aggregate({
      where: { soldAt: { gte: monthStart, lte: monthEnd } },
      _sum: { totalPrice: true, quantity: true },
      _count: { id: true },
    });
    tbSalesCount = tbSales._count.id ?? 0;
    tbSalesTotal = tbSales._sum.totalPrice ?? 0;

    // Best-seller: group by textbookId
    if (tbSalesCount > 0) {
      const grouped = await prisma.textbookSale.groupBy({
        by: ["textbookId"],
        where: { soldAt: { gte: monthStart, lte: monthEnd } },
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: "desc" } },
        take: 1,
      });
      if (grouped.length > 0) {
        const topId = grouped[0].textbookId;
        bestSellerQty = grouped[0]._sum.quantity ?? 0;
        const tb = await prisma.textbook.findUnique({
          where: { id: topId },
          select: { title: true },
        });
        bestSellerName = tb?.title ?? null;
      }
    }
  } catch { /* 기본값 유지 */ }

  // ── 강사 정산 요약 ─────────────────────────────────────────────────────────
  type SettlementRow = {
    id: string;
    instructorName: string;
    amount: number;
    status: string;
  };
  let settlements: SettlementRow[] = [];
  try {
    const rows = await prisma.specialLectureSettlement.findMany({
      where: { settlementMonth: monthStr },
      orderBy: { instructorAmount: "desc" },
    });
    const instructorIds = [...new Set(rows.map((r) => r.instructorId))];
    const instructors = await prisma.instructor.findMany({
      where: { id: { in: instructorIds } },
      select: { id: true, name: true },
    });
    const instructorMap = new Map(instructors.map((i) => [i.id, i.name]));
    settlements = rows.map((r) => ({
      id: r.id,
      instructorName: instructorMap.get(r.instructorId) ?? r.instructorId,
      amount: r.instructorAmount,
      status: r.status,
    }));
  } catch { /* 기본값 유지 */ }

  const isCurrentMonth =
    year === new Date().getFullYear() && month === new Date().getMonth() + 1;
  const isFutureMonth = new Date(year, month - 1, 1) > new Date();

  return (
    <div className="space-y-8 p-8 sm:p-10 print:p-6 print:space-y-6">
      {/* ── 인쇄용 헤더 (화면에서는 숨김) ── */}
      <div className="hidden print:block print:border-b print:border-ink/20 print:pb-4 print:mb-6">
        <p className="text-xs text-slate">학원명 미설정 | 학원 주소는 관리자 설정을 확인하세요</p>
        <h1 className="mt-2 text-2xl font-bold text-ink">{korMonth} 월간 운영 보고서</h1>
        <p className="mt-1 text-xs text-slate">출력일: {printDate}</p>
      </div>

      {/* ── 화면용 헤더 ── */}
      <div className="print:hidden">
        <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
          수강 관리
        </div>
        <h1 className="mt-4 text-3xl font-semibold text-ink">{korMonth} 월간 운영 보고서</h1>
        <p className="mt-2 text-sm text-slate">
          수강생 현황, 수납·환불, 출결, 상담·영업, 강사 정산 및 교재 판매를 한눈에 확인합니다.
        </p>
      </div>

      {/* ── 월 네비게이션 + 액션 버튼 ── */}
      <div className="print:hidden flex flex-wrap items-center gap-3">
        <Link
          href={`/admin/reports/monthly?month=${prevMonth(year, month)}`}
          className="rounded-xl border border-ink/15 bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-mist transition-colors"
        >
          ← 이전 달
        </Link>
        <span className="rounded-xl bg-forest/10 px-4 py-2 text-sm font-semibold text-forest">
          {korMonth}
          {isCurrentMonth && (
            <span className="ml-2 rounded-full bg-ember/20 px-2 py-0.5 text-xs text-ember">
              이번 달
            </span>
          )}
        </span>
        {!isFutureMonth && (
          <Link
            href={`/admin/reports/monthly?month=${nextMonth(year, month)}`}
            className="rounded-xl border border-ink/15 bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-mist transition-colors"
          >
            다음 달 →
          </Link>
        )}
        <div className="ml-auto flex gap-2">
          <PrintReportButton label="인쇄 / PDF" />
          <Link
            href={`/admin/reports/monthly/details?month=${monthStr}`}
            className="rounded-xl border border-forest/20 bg-forest/10 px-4 py-2 text-sm font-medium text-forest hover:bg-forest/20 transition-colors"
          >
            상세 분석 →
          </Link>
          <a
            href={`/api/reports/monthly/export?month=${monthStr}`}
            className="rounded-xl bg-forest px-4 py-2 text-sm font-medium text-white hover:bg-forest/90 transition-colors"
          >
            Excel 내보내기
          </a>
        </div>
      </div>

      {/* ── Section 1: 수강생 현황 ── */}
      <section>
        <h2 className="mb-4 text-base font-semibold text-ink border-b border-ink/10 pb-2">
          1. 수강생 현황
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <KpiCard
            title="현재 수강생"
            value={`${fmtNum(activeEnrollmentsNow)}명`}
            sub={`대기 ${fmtNum(waitingEnrollments)}명`}
          />
          <KpiCard
            title="월초 수강생"
            value={`${fmtNum(activeEnrollmentsAtMonthStart)}명`}
            sub="이달 이전 등록 활성"
          />
          <KpiCard
            title="신규 등록"
            value={`${fmtNum(newEnrollments)}명`}
            sub="이달 신규"
            highlight={newEnrollments > 0}
          />
          <KpiCard
            title="퇴원·취소"
            value={`${fmtNum(cancelledEnrollments)}명`}
            sub="이달 취소/퇴원"
            warn={cancelledEnrollments > 0}
          />
          <KpiCard
            title="순 증감"
            value={`${netEnrollmentChange >= 0 ? "+" : ""}${fmtNum(netEnrollmentChange)}명`}
            sub="신규 - 퇴원"
            highlight={netEnrollmentChange > 0}
            warn={netEnrollmentChange < 0}
          />
        </div>

        {/* 기수별 수강 현황 */}
        {cohorts.length > 0 && (
          <div className="mt-4 rounded-[28px] border border-ink/10 bg-white overflow-hidden print:rounded-xl">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-mist">
                  <th className="px-5 py-3 text-left font-semibold text-ink">기수명</th>
                  <th className="px-4 py-3 text-center font-semibold text-ink">분류</th>
                  <th className="px-4 py-3 text-right font-semibold text-ink">수강인원</th>
                  <th className="px-4 py-3 text-right font-semibold text-ink">정원</th>
                  <th className="px-4 py-3 text-right font-semibold text-ink">대기</th>
                  <th className="w-40 px-4 py-3 text-left font-semibold text-ink print:hidden">
                    충원율
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {cohorts.map((c) => {
                  const pct =
                    c.maxCapacity && c.maxCapacity > 0
                      ? Math.round((c.enrolled / c.maxCapacity) * 100)
                      : null;
                  return (
                    <tr key={c.id} className="hover:bg-mist/50 transition-colors">
                      <td className="px-5 py-3 font-medium text-ink">{c.name}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="rounded-full bg-forest/10 px-2 py-0.5 text-xs font-medium text-forest">
                          {EXAM_CATEGORY_LABEL[c.examCategory] ?? c.examCategory}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-ink">
                        {fmtNum(c.enrolled)}명
                      </td>
                      <td className="px-4 py-3 text-right text-slate">
                        {c.maxCapacity ? `${fmtNum(c.maxCapacity)}명` : "무제한"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {c.waiting > 0 ? (
                          <span className="font-medium text-amber-600">{fmtNum(c.waiting)}명</span>
                        ) : (
                          <span className="text-slate">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 print:hidden">
                        {pct !== null ? (
                          <div className="flex items-center gap-2">
                            <ProgressBar value={c.enrolled} max={c.maxCapacity} />
                            <span
                              className={`w-10 text-right text-xs font-semibold ${
                                pct >= 90
                                  ? "text-red-600"
                                  : pct >= 70
                                    ? "text-amber-600"
                                    : "text-forest"
                              }`}
                            >
                              {pct}%
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Section 2: 수납 현황 ── */}
      <section>
        <h2 className="mb-4 text-base font-semibold text-ink border-b border-ink/10 pb-2">
          2. 수납 현황
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <KpiCard
            title="총 수납액 (총액)"
            value={fmtKRW(paymentGross)}
            sub={`순수입 ${fmtKRW(paymentNet)}`}
            highlight
          />
          <KpiCard
            title="환불 총액"
            value={fmtKRW(refundTotal)}
            sub={`${fmtNum(refundCount)}건 환불`}
            warn={refundTotal > 0}
          />
          <KpiCard
            title="순 매출"
            value={fmtKRW(netRevenue)}
            sub={
              revenueChange !== null
                ? `전월 대비 ${revenueChange >= 0 ? "+" : ""}${revenueChange}%`
                : "수납 - 환불"
            }
            highlight={netRevenue > 0}
            warn={netRevenue < 0}
          />
          <KpiCard
            title="미수금 잔액"
            value={fmtKRW(unpaidAmount)}
            sub={`납부 기한 도래 ${fmtNum(unpaidCount)}건`}
            warn={unpaidAmount > 0}
          />
        </div>

        {/* 결제 수단별 수납 */}
        {Object.keys(paymentByMethod).length > 0 && (
          <div className="mt-4 rounded-[28px] border border-ink/10 bg-white overflow-hidden print:rounded-xl">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-mist">
                  <th className="px-5 py-3 text-left font-semibold text-ink">결제 수단</th>
                  <th className="px-5 py-3 text-right font-semibold text-ink">건수</th>
                  <th className="px-5 py-3 text-right font-semibold text-ink">금액</th>
                  <th className="px-5 py-3 text-right font-semibold text-ink">비중</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {Object.entries(paymentByMethod)
                  .sort((a, b) => b[1].amount - a[1].amount)
                  .map(([method, stat]) => {
                    const pct =
                      paymentNet > 0 ? Math.round((stat.amount / paymentNet) * 100) : 0;
                    return (
                      <tr key={method} className="hover:bg-mist/50 transition-colors">
                        <td className="px-5 py-3 font-medium text-ink">
                          {PAYMENT_METHOD_LABEL[method] ?? method}
                        </td>
                        <td className="px-5 py-3 text-right text-slate">
                          {fmtNum(stat.count)}건
                        </td>
                        <td className="px-5 py-3 text-right font-semibold text-ink">
                          {fmtKRW(stat.amount)}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <span className="rounded-full bg-ember/10 px-2 py-0.5 text-xs font-medium text-ember">
                            {pct}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-ink/10 bg-mist">
                  <td className="px-5 py-3 font-bold text-ink">합계</td>
                  <td className="px-5 py-3 text-right text-slate">
                    {fmtNum(paymentCount)}건
                  </td>
                  <td className="px-5 py-3 text-right font-bold text-ember">
                    {fmtKRW(paymentNet)}
                  </td>
                  <td className="px-5 py-3 text-right text-slate">100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* ── Section 3: 출결 현황 ── */}
      <section>
        <h2 className="mb-4 text-base font-semibold text-ink border-b border-ink/10 pb-2">
          3. 출결 현황
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-5">
          <div className="rounded-[24px] border border-ink/10 bg-white p-5">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate">출석률</p>
            <p className="mt-3 text-2xl font-bold text-forest">
              {attendanceRate !== null ? `${attendanceRate}%` : "-"}
            </p>
            <p className="mt-1 text-xs text-slate">전체 {fmtNum(attendanceTotal)}회 기준</p>
          </div>
          <div className="rounded-[24px] border border-ink/10 bg-white p-5">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate">결시 횟수</p>
            <p
              className={`mt-3 text-2xl font-bold ${attendanceAbsent > 0 ? "text-amber-600" : "text-ink"}`}
            >
              {fmtNum(attendanceAbsent)}회
            </p>
            <p className="mt-1 text-xs text-slate">이번 달 무단 결시</p>
          </div>
          <div className="rounded-[24px] border border-ink/10 bg-white p-5">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate">1차 경고</p>
            <p
              className={`mt-3 text-2xl font-bold ${warningCount > 0 ? "text-amber-600" : "text-ink"}`}
            >
              {fmtNum(warningCount)}건
            </p>
            <p className="mt-1 text-xs text-slate">WARNING_1 발생</p>
          </div>
          <div className="rounded-[24px] border border-ink/10 bg-white p-5">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate">2차 경고</p>
            <p
              className={`mt-3 text-2xl font-bold ${warning2Count > 0 ? "text-red-500" : "text-ink"}`}
            >
              {fmtNum(warning2Count)}건
            </p>
            <p className="mt-1 text-xs text-slate">WARNING_2 발생</p>
          </div>
          <div className="rounded-[24px] border border-ink/10 bg-white p-5">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate">탈락 발생</p>
            <p
              className={`mt-3 text-2xl font-bold ${dropoutCount > 0 ? "text-red-600" : "text-ink"}`}
            >
              {fmtNum(dropoutCount)}건
            </p>
            <p className="mt-1 text-xs text-slate">탈락 판정</p>
          </div>
        </div>
      </section>

      {/* ── Section 4: 상담/영업 현황 ── */}
      <section>
        <h2 className="mb-4 text-base font-semibold text-ink border-b border-ink/10 pb-2">
          4. 상담·영업 현황
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <KpiCard
            title="신규 상담"
            value={`${fmtNum(prospectTotal)}건`}
            sub="이달 신규 접수"
            highlight={prospectTotal > 0}
          />
          <KpiCard
            title="등록 전환"
            value={`${fmtNum(prospectRegistered)}명`}
            sub="REGISTERED 전환"
            highlight={prospectRegistered > 0}
          />
          <KpiCard
            title="전환율"
            value={conversionRate !== null ? `${conversionRate}%` : "-"}
            sub={
              prevConversionRate !== null
                ? `전월 ${prevConversionRate}%`
                : "등록 / 총 상담"
            }
            highlight={conversionRate !== null && conversionRate >= 50}
          />
          <KpiCard
            title="전월 대비 상담"
            value={
              prevProspectTotal > 0
                ? `${prospectTotal >= prevProspectTotal ? "+" : ""}${fmtNum(prospectTotal - prevProspectTotal)}건`
                : `${fmtNum(prospectTotal)}건`
            }
            sub={`전월 ${fmtNum(prevProspectTotal)}건`}
            highlight={prospectTotal > prevProspectTotal}
            warn={prospectTotal < prevProspectTotal && prevProspectTotal > 0}
          />
        </div>

        {/* 단계별 분포 */}
        {prospectTotal > 0 && (
          <div className="mt-4 rounded-[28px] border border-ink/10 bg-white overflow-hidden print:rounded-xl">
            <div className="grid grid-cols-2 divide-x divide-ink/5 sm:grid-cols-5">
              {(["INQUIRY", "VISITING", "DECIDING", "REGISTERED", "DROPPED"] as const).map(
                (stage) => {
                  const count = prospectByStage[stage] ?? 0;
                  return (
                    <div key={stage} className="p-5 text-center">
                      <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate">
                        {PROSPECT_STAGE_LABEL[stage]}
                      </p>
                      <p
                        className={`mt-3 text-2xl font-bold ${
                          stage === "REGISTERED"
                            ? "text-forest"
                            : stage === "DROPPED"
                              ? "text-red-500"
                              : "text-ink"
                        }`}
                      >
                        {fmtNum(count)}명
                      </p>
                      <p className="mt-1 text-xs text-slate">
                        {prospectTotal > 0
                          ? `${Math.round((count / prospectTotal) * 100)}%`
                          : "-"}
                      </p>
                    </div>
                  );
                },
              )}
            </div>
            <div className="border-t border-ink/10 bg-mist px-5 py-3">
              <p className="text-sm text-slate">
                총{" "}
                <strong className="text-ink">{fmtNum(prospectTotal)}건</strong> 상담 중{" "}
                <strong className="text-forest">{fmtNum(prospectRegistered)}명</strong> 등록 완료
                {conversionRate !== null && (
                  <span className="ml-2 text-xs">(전환율 {conversionRate}%)</span>
                )}
              </p>
            </div>
          </div>
        )}

        {prospectTotal === 0 && (
          <div className="mt-4 rounded-[28px] border border-ink/10 bg-white p-8 text-center text-sm text-slate">
            이달 상담 기록이 없습니다.
          </div>
        )}
      </section>

      {/* ── Section 5: 교재 판매 ── */}
      <section>
        <h2 className="mb-4 text-base font-semibold text-ink border-b border-ink/10 pb-2">
          5. 교재 판매
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="rounded-[24px] border border-ink/10 bg-white p-5">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate">판매 건수</p>
            <p className="mt-3 text-2xl font-bold text-ink">{fmtNum(tbSalesCount)}건</p>
            <p className="mt-1 text-xs text-slate">이번 달 교재 거래</p>
          </div>
          <div className="rounded-[24px] border border-ink/10 bg-white p-5">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate">판매 총액</p>
            <p className="mt-3 text-2xl font-bold text-ember">{fmtKRW(tbSalesTotal)}</p>
            <p className="mt-1 text-xs text-slate">이번 달 교재 매출</p>
          </div>
          <div className="rounded-[24px] border border-ink/10 bg-white p-5">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate">베스트셀러</p>
            {bestSellerName ? (
              <>
                <p className="mt-3 text-lg font-bold text-ink leading-tight line-clamp-2">
                  {bestSellerName}
                </p>
                <p className="mt-1 text-xs text-slate">{fmtNum(bestSellerQty)}권 판매</p>
              </>
            ) : (
              <p className="mt-3 text-2xl font-bold text-ink">-</p>
            )}
          </div>
        </div>
      </section>

      {/* ── 강사 정산 요약 ── */}
      {settlements.length > 0 && (
        <section>
          <h2 className="mb-4 text-base font-semibold text-ink border-b border-ink/10 pb-2">
            강사 정산 요약
          </h2>
          <div className="rounded-[28px] border border-ink/10 bg-white overflow-hidden print:rounded-xl">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-mist">
                  <th className="px-5 py-3 text-left font-semibold text-ink">강사명</th>
                  <th className="px-5 py-3 text-right font-semibold text-ink">정산 금액</th>
                  <th className="px-5 py-3 text-center font-semibold text-ink">지급 상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {settlements.map((s) => (
                  <tr key={s.id} className="hover:bg-mist/50 transition-colors">
                    <td className="px-5 py-3 font-medium text-ink">{s.instructorName}</td>
                    <td className="px-5 py-3 text-right font-semibold text-ember">
                      {fmtKRW(s.amount)}
                    </td>
                    <td className="px-5 py-3 text-center">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          s.status === "PAID"
                            ? "bg-forest/10 text-forest"
                            : s.status === "CANCELLED"
                              ? "bg-red-50 text-red-600"
                              : "bg-amber-50 text-amber-600"
                        }`}
                      >
                        {SETTLEMENT_STATUS_LABEL[s.status] ?? s.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-ink/10 bg-forest text-white">
                  <td className="px-5 py-3 font-bold">합 계</td>
                  <td className="px-5 py-3 text-right font-bold">
                    {fmtKRW(settlements.reduce((s, r) => s + r.amount, 0))}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}

      {/* ── 인쇄용 스타일 ── */}
      {/* eslint-disable-next-line react/no-danger */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
@media print {
  .print\\:hidden { display: none !important; }
  .no-print { display: none !important; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  @page { size: A4 portrait; margin: 15mm; }
  section { break-inside: avoid; }
}
          `.trim(),
        }}
      />
    </div>
  );
}
