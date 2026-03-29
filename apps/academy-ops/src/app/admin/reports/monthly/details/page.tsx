import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

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

function prevMonthStr(year: number, month: number): string {
  const d = new Date(year, month - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function nextMonthStr(year: number, month: number): string {
  const d = new Date(year, month, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function fmtKRW(n: number): string {
  return n.toLocaleString("ko-KR") + "원";
}

function fmtNum(n: number): string {
  return n.toLocaleString("ko-KR");
}

// ─── Labels ───────────────────────────────────────────────────────────────────

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  CASH: "현금",
  CARD: "카드",
  TRANSFER: "계좌이체",
  POINT: "포인트",
  MIXED: "혼합결제",
};

const PAYMENT_CATEGORY_LABEL: Record<string, string> = {
  TUITION: "종합반",
  SINGLE_COURSE: "단과",
  FACILITY: "사물함/시설",
  TEXTBOOK: "교재",
  MATERIAL: "교구",
  PENALTY: "위약금",
  ETC: "기타",
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

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-4 text-base font-semibold text-ink">{title}</h2>
      <div className="rounded-[28px] border border-ink/10 bg-white overflow-hidden">
        {children}
      </div>
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function MonthlyReportDetailsPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.DIRECTOR);

  const sp = searchParams ? await searchParams : {};
  const monthParam = Array.isArray(sp.month) ? sp.month[0] : sp.month;

  const { year, month } = parseMonthParam(monthParam);
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  const korMonth = `${year}년 ${month}월`;

  const monthStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);
  const daysInMonth = new Date(year, month, 0).getDate();

  const isCurrentMonth = year === new Date().getFullYear() && month === new Date().getMonth() + 1;
  const isFutureMonth = new Date(year, month - 1, 1) > new Date();

  const prisma = getPrisma();

  // ── 수납 원시 데이터 ──────────────────────────────────────────────────────
  let allPayments: Array<{
    method: string;
    category: string;
    netAmount: number;
    grossAmount: number;
    processedAt: Date;
    processedBy: string;
  }> = [];
  try {
    allPayments = await prisma.payment.findMany({
      where: {
        status: { in: ["APPROVED", "PARTIAL_REFUNDED"] },
        processedAt: { gte: monthStart, lte: monthEnd },
      },
      select: {
        method: true,
        category: true,
        netAmount: true,
        grossAmount: true,
        processedAt: true,
        processedBy: true,
      },
    });
  } catch { /* 기본값 유지 */ }

  // ── 환불 ─────────────────────────────────────────────────────────────────
  let allRefunds: Array<{ amount: number; processedAt: Date }> = [];
  try {
    allRefunds = await prisma.refund.findMany({
      where: {
        status: "COMPLETED",
        processedAt: { gte: monthStart, lte: monthEnd },
      },
      select: { amount: true, processedAt: true },
    });
  } catch { /* 기본값 유지 */ }

  // ── 수납 집계: 결제 수단별 ─────────────────────────────────────────────
  const methodMap: Record<string, { count: number; amount: number }> = {};
  for (const p of allPayments) {
    if (!methodMap[p.method]) methodMap[p.method] = { count: 0, amount: 0 };
    methodMap[p.method].count += 1;
    methodMap[p.method].amount += p.netAmount;
  }

  // ── 수납 집계: 항목별 ──────────────────────────────────────────────────
  const categoryMap: Record<string, { count: number; amount: number }> = {};
  for (const p of allPayments) {
    if (!categoryMap[p.category]) categoryMap[p.category] = { count: 0, amount: 0 };
    categoryMap[p.category].count += 1;
    categoryMap[p.category].amount += p.netAmount;
  }

  // ── 일별 수납 추이 ─────────────────────────────────────────────────────
  type DayEntry = { day: number; amount: number; count: number };
  const dailyData: DayEntry[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dayStart = new Date(year, month - 1, d, 0, 0, 0, 0).getTime();
    const dayEnd = new Date(year, month - 1, d, 23, 59, 59, 999).getTime();
    const dayPayments = allPayments.filter((p) => {
      const t = new Date(p.processedAt).getTime();
      return t >= dayStart && t <= dayEnd;
    });
    dailyData.push({
      day: d,
      amount: dayPayments.reduce((s, p) => s + p.netAmount, 0),
      count: dayPayments.length,
    });
  }
  const maxDayAmount = Math.max(...dailyData.map((d) => d.amount), 1);

  // ── 수강 등록 ──────────────────────────────────────────────────────────
  type EnrollmentByCohort = {
    cohortId: string;
    cohortName: string;
    examCategory: string;
    count: number;
  };
  let enrollmentsByCohort: EnrollmentByCohort[] = [];
  let newEnrollmentTotal = 0;
  try {
    const newEnrollments = await prisma.courseEnrollment.findMany({
      where: {
        status: "ACTIVE",
        createdAt: { gte: monthStart, lte: monthEnd },
      },
      select: {
        cohort: { select: { id: true, name: true, examCategory: true } },
      },
    });
    newEnrollmentTotal = newEnrollments.length;
    const cohortCount: Record<string, EnrollmentByCohort> = {};
    for (const e of newEnrollments) {
      if (!e.cohort) continue;
      const cid = e.cohort.id;
      if (!cohortCount[cid]) {
        cohortCount[cid] = {
          cohortId: cid,
          cohortName: e.cohort.name,
          examCategory: e.cohort.examCategory,
          count: 0,
        };
      }
      cohortCount[cid].count += 1;
    }
    enrollmentsByCohort = Object.values(cohortCount).sort((a, b) => b.count - a.count);
  } catch { /* 기본값 유지 */ }

  // ── 상담 현황 ──────────────────────────────────────────────────────────
  type ProspectStageStat = { stage: string; count: number };
  let prospectStats: ProspectStageStat[] = [];
  let prospectTotal = 0;
  let prospectRegistered = 0;
  try {
    const prospects = await prisma.consultationProspect.findMany({
      where: { createdAt: { gte: monthStart, lte: monthEnd } },
      select: { stage: true },
    });
    prospectTotal = prospects.length;
    const stageCount: Record<string, number> = {};
    for (const p of prospects) {
      stageCount[p.stage] = (stageCount[p.stage] ?? 0) + 1;
    }
    prospectRegistered = stageCount["REGISTERED"] ?? 0;
    prospectStats = Object.entries(stageCount)
      .map(([stage, count]) => ({ stage, count }))
      .sort((a, b) => b.count - a.count);
  } catch { /* 기본값 유지 */ }

  // ── 직원별 수납 ────────────────────────────────────────────────────────
  type StaffPaymentStat = {
    staffId: string;
    staffName: string;
    count: number;
    amount: number;
  };
  let staffStats: StaffPaymentStat[] = [];
  try {
    const staffIds = [...new Set(allPayments.map((p) => p.processedBy))];
    if (staffIds.length > 0) {
      const admins = await prisma.adminUser.findMany({
        where: { id: { in: staffIds } },
        select: { id: true, name: true },
      });
      const adminMap = new Map(admins.map((a) => [a.id, a.name]));
      const staffMap: Record<string, StaffPaymentStat> = {};
      for (const p of allPayments) {
        const sid = p.processedBy;
        if (!staffMap[sid]) {
          staffMap[sid] = {
            staffId: sid,
            staffName: adminMap.get(sid) ?? sid,
            count: 0,
            amount: 0,
          };
        }
        staffMap[sid].count += 1;
        staffMap[sid].amount += p.netAmount;
      }
      staffStats = Object.values(staffMap).sort((a, b) => b.amount - a.amount);
    }
  } catch { /* 기본값 유지 */ }

  // ── 집계 요약 ──────────────────────────────────────────────────────────
  const totalPaymentAmount = allPayments.reduce((s, p) => s + p.netAmount, 0);
  const totalPaymentCount = allPayments.length;
  const totalRefundAmount = allRefunds.reduce((s, r) => s + r.amount, 0);
  const totalRefundCount = allRefunds.length;
  const netAmount = totalPaymentAmount - totalRefundAmount;

  const EXAM_CATEGORY_LABEL: Record<string, string> = {
    GONGCHAE: "공채",
    GYEONGCHAE: "경채",
    SOGANG: "소강",
    CUSTOM: "기타",
  };

  return (
    <div className="space-y-8 p-8 sm:p-10">
      {/* ── 헤더 ── */}
      <div>
        <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
          수납 분석
        </div>
        <h1 className="mt-4 text-3xl font-semibold text-ink">{korMonth} 월간 상세 보고서</h1>
        <p className="mt-2 text-sm text-slate">
          수납 현황·환불·수강·상담·직원별 수납을 항목별로 상세 분석합니다.
        </p>
      </div>

      {/* ── 월 네비게이션 ── */}
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={`/admin/reports/monthly/details?month=${prevMonthStr(year, month)}`}
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
            href={`/admin/reports/monthly/details?month=${nextMonthStr(year, month)}`}
            className="rounded-xl border border-ink/15 bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-mist transition-colors"
          >
            다음 달 →
          </Link>
        )}
        <div className="ml-auto flex gap-2">
          <Link
            href={`/admin/reports/monthly?month=${monthStr}`}
            className="rounded-xl border border-ink/15 bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-mist transition-colors"
          >
            월간 운영 보고서
          </Link>
          <Link
            href={`/admin/settlements/monthly?month=${monthStr}`}
            className="rounded-xl bg-ember px-4 py-2 text-sm font-medium text-white hover:bg-ember/90 transition-colors"
          >
            월계표 →
          </Link>
        </div>
      </div>

      {/* ── KPI 요약 ── */}
      <section>
        <h2 className="mb-4 text-base font-semibold text-ink">이달 핵심 지표</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <KpiCard
            title="총 수납액"
            value={fmtKRW(totalPaymentAmount)}
            sub={`${fmtNum(totalPaymentCount)}건`}
            highlight
          />
          <KpiCard
            title="환불 총액"
            value={fmtKRW(totalRefundAmount)}
            sub={`${fmtNum(totalRefundCount)}건`}
            warn={totalRefundAmount > 0}
          />
          <KpiCard
            title="순수입"
            value={fmtKRW(netAmount)}
            sub="수납 - 환불"
            highlight
          />
          <KpiCard
            title="신규 수강 등록"
            value={`${fmtNum(newEnrollmentTotal)}건`}
            sub="이번 달 신규"
          />
          <KpiCard
            title="상담 전환율"
            value={
              prospectTotal > 0
                ? `${Math.round((prospectRegistered / prospectTotal) * 100)}%`
                : "-"
            }
            sub={`총 ${fmtNum(prospectTotal)}건 상담`}
          />
        </div>
      </section>

      {/* ── 수납 현황: 결제 수단별 ── */}
      <section>
        <h2 className="mb-4 text-base font-semibold text-ink">수납 현황 — 결제 수단별</h2>
        {Object.keys(methodMap).length === 0 ? (
          <div className="rounded-[28px] border border-ink/10 bg-white p-8 text-center text-sm text-slate">
            이달 수납 내역이 없습니다.
          </div>
        ) : (
          <div className="rounded-[28px] border border-ink/10 bg-white overflow-hidden">
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
                {Object.entries(methodMap)
                  .sort((a, b) => b[1].amount - a[1].amount)
                  .map(([method, stat]) => {
                    const pct =
                      totalPaymentAmount > 0
                        ? Math.round((stat.amount / totalPaymentAmount) * 100)
                        : 0;
                    return (
                      <tr key={method} className="hover:bg-mist/50 transition-colors">
                        <td className="px-5 py-3 font-medium text-ink">
                          {PAYMENT_METHOD_LABEL[method] ?? method}
                        </td>
                        <td className="px-5 py-3 text-right text-slate">{fmtNum(stat.count)}건</td>
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
                <tr className="border-t-2 border-ink/10 bg-mist font-semibold">
                  <td className="px-5 py-3 font-bold text-ink">합계</td>
                  <td className="px-5 py-3 text-right text-slate">{fmtNum(totalPaymentCount)}건</td>
                  <td className="px-5 py-3 text-right font-bold text-ember">
                    {fmtKRW(totalPaymentAmount)}
                  </td>
                  <td className="px-5 py-3 text-right text-slate">100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* ── 수납 현황: 항목별 ── */}
      <section>
        <h2 className="mb-4 text-base font-semibold text-ink">수납 현황 — 항목별</h2>
        {Object.keys(categoryMap).length === 0 ? (
          <div className="rounded-[28px] border border-ink/10 bg-white p-8 text-center text-sm text-slate">
            이달 수납 내역이 없습니다.
          </div>
        ) : (
          <div className="rounded-[28px] border border-ink/10 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-mist">
                  <th className="px-5 py-3 text-left font-semibold text-ink">항목</th>
                  <th className="px-5 py-3 text-right font-semibold text-ink">건수</th>
                  <th className="px-5 py-3 text-right font-semibold text-ink">금액</th>
                  <th className="w-48 px-5 py-3 text-left font-semibold text-ink">비중</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {Object.entries(categoryMap)
                  .sort((a, b) => b[1].amount - a[1].amount)
                  .map(([category, stat]) => {
                    const pct =
                      totalPaymentAmount > 0
                        ? Math.round((stat.amount / totalPaymentAmount) * 100)
                        : 0;
                    return (
                      <tr key={category} className="hover:bg-mist/50 transition-colors">
                        <td className="px-5 py-3 font-medium text-ink">
                          {PAYMENT_CATEGORY_LABEL[category] ?? category}
                        </td>
                        <td className="px-5 py-3 text-right text-slate">{fmtNum(stat.count)}건</td>
                        <td className="px-5 py-3 text-right font-semibold text-ink">
                          {fmtKRW(stat.amount)}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink/10">
                              <div
                                className="h-full rounded-full bg-ember transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="w-10 text-right text-xs font-semibold text-ember">
                              {pct}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-ink/10 bg-mist font-semibold">
                  <td className="px-5 py-3 font-bold text-ink">합계</td>
                  <td className="px-5 py-3 text-right text-slate">{fmtNum(totalPaymentCount)}건</td>
                  <td className="px-5 py-3 text-right font-bold text-ember">
                    {fmtKRW(totalPaymentAmount)}
                  </td>
                  <td className="px-5 py-3" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* ── 환불 현황 ── */}
      <section>
        <h2 className="mb-4 text-base font-semibold text-ink">환불 현황</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="rounded-[24px] border border-ink/10 bg-white p-5">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate">환불 건수</p>
            <p
              className={`mt-3 text-2xl font-bold ${totalRefundCount > 0 ? "text-red-600" : "text-ink"}`}
            >
              {fmtNum(totalRefundCount)}건
            </p>
            <p className="mt-1 text-xs text-slate">이번 달 완료된 환불</p>
          </div>
          <div className="rounded-[24px] border border-ink/10 bg-white p-5">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate">환불 총액</p>
            <p
              className={`mt-3 text-2xl font-bold ${totalRefundAmount > 0 ? "text-red-600" : "text-ink"}`}
            >
              {fmtKRW(totalRefundAmount)}
            </p>
            <p className="mt-1 text-xs text-slate">COMPLETED 상태 기준</p>
          </div>
          <div className="rounded-[24px] border border-ink/10 bg-white p-5">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate">환불률</p>
            <p
              className={`mt-3 text-2xl font-bold ${
                totalPaymentAmount > 0 && totalRefundAmount / totalPaymentAmount > 0.1
                  ? "text-red-600"
                  : "text-ink"
              }`}
            >
              {totalPaymentAmount > 0
                ? `${Math.round((totalRefundAmount / totalPaymentAmount) * 1000) / 10}%`
                : "-"}
            </p>
            <p className="mt-1 text-xs text-slate">수납 대비 환불 비율</p>
          </div>
        </div>
      </section>

      {/* ── 수강 현황 ── */}
      <section>
        <h2 className="mb-4 text-base font-semibold text-ink">수강 현황 — 이달 신규 등록</h2>
        {enrollmentsByCohort.length === 0 ? (
          <div className="rounded-[28px] border border-ink/10 bg-white p-8 text-center text-sm text-slate">
            이달 신규 수강 등록이 없습니다.
          </div>
        ) : (
          <div className="rounded-[28px] border border-ink/10 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-mist">
                  <th className="px-5 py-3 text-left font-semibold text-ink">기수명</th>
                  <th className="px-5 py-3 text-center font-semibold text-ink">시험 구분</th>
                  <th className="px-5 py-3 text-right font-semibold text-ink">신규 등록</th>
                  <th className="w-48 px-5 py-3 text-left font-semibold text-ink">비중</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {enrollmentsByCohort.map((e) => {
                  const pct =
                    newEnrollmentTotal > 0
                      ? Math.round((e.count / newEnrollmentTotal) * 100)
                      : 0;
                  return (
                    <tr key={e.cohortId} className="hover:bg-mist/50 transition-colors">
                      <td className="px-5 py-3 font-medium text-ink">
                        <Link
                          href={`/admin/cohorts/${e.cohortId}`}
                          className="hover:underline hover:text-ember transition-colors"
                        >
                          {e.cohortName}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-center">
                        <span className="rounded-full bg-forest/10 px-2 py-0.5 text-xs font-medium text-forest">
                          {EXAM_CATEGORY_LABEL[e.examCategory] ?? e.examCategory}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right font-semibold text-ink">
                        {fmtNum(e.count)}명
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink/10">
                            <div
                              className="h-full rounded-full bg-forest transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="w-10 text-right text-xs font-semibold text-forest">
                            {pct}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-ink/10 bg-mist font-semibold">
                  <td className="px-5 py-3 font-bold text-ink" colSpan={2}>
                    합계
                  </td>
                  <td className="px-5 py-3 text-right font-bold text-forest">
                    {fmtNum(newEnrollmentTotal)}명
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* ── 일별 수납 추이 (CSS-only bar chart) ── */}
      <section>
        <h2 className="mb-4 text-base font-semibold text-ink">일별 수납 추이</h2>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 sm:p-8">
          {totalPaymentCount === 0 ? (
            <p className="py-8 text-center text-sm text-slate">이달 수납 내역이 없습니다.</p>
          ) : (
            <>
              <div className="flex items-end gap-1 overflow-x-auto pb-2" style={{ minHeight: "120px" }}>
                {dailyData.map((d) => {
                  const heightPct = maxDayAmount > 0 ? (d.amount / maxDayAmount) * 100 : 0;
                  const hasData = d.amount > 0;
                  return (
                    <div
                      key={d.day}
                      className="group relative flex flex-1 flex-col items-center gap-1"
                      style={{ minWidth: "20px" }}
                    >
                      {/* Tooltip */}
                      {hasData && (
                        <div className="invisible absolute bottom-full mb-1 left-1/2 -translate-x-1/2 z-10 whitespace-nowrap rounded-xl bg-ink px-3 py-2 text-xs text-white shadow-lg group-hover:visible pointer-events-none">
                          <p className="font-semibold">{month}월 {d.day}일</p>
                          <p>{fmtKRW(d.amount)}</p>
                          <p className="text-white/70">{d.count}건</p>
                        </div>
                      )}
                      {/* Bar */}
                      <div className="flex w-full flex-col justify-end" style={{ height: "100px" }}>
                        <div
                          className={`w-full rounded-t-sm transition-all ${
                            hasData
                              ? "bg-ember hover:bg-ember/80"
                              : "bg-ink/5"
                          }`}
                          style={{ height: hasData ? `${Math.max(heightPct, 2)}%` : "4px" }}
                        />
                      </div>
                      {/* Day label */}
                      <p className={`text-[10px] font-medium ${hasData ? "text-slate" : "text-slate/40"}`}>
                        {d.day}
                      </p>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-slate/60">
                각 막대는 해당 일의 순수납액을 나타냅니다. 최고: {fmtKRW(maxDayAmount)}
              </p>
            </>
          )}
        </div>
      </section>

      {/* ── 상담 현황 ── */}
      <section>
        <h2 className="mb-4 text-base font-semibold text-ink">상담 현황</h2>
        {prospectStats.length === 0 ? (
          <div className="rounded-[28px] border border-ink/10 bg-white p-8 text-center text-sm text-slate">
            이달 상담 기록이 없습니다.
          </div>
        ) : (
          <div className="rounded-[28px] border border-ink/10 bg-white overflow-hidden">
            <div className="grid grid-cols-2 divide-x divide-ink/5 sm:grid-cols-5">
              {(["INQUIRY", "VISITING", "DECIDING", "REGISTERED", "DROPPED"] as const).map(
                (stage) => {
                  const stat = prospectStats.find((s) => s.stage === stage);
                  const count = stat?.count ?? 0;
                  const isRegistered = stage === "REGISTERED";
                  const isDropped = stage === "DROPPED";
                  return (
                    <div key={stage} className="p-5 text-center">
                      <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate">
                        {PROSPECT_STAGE_LABEL[stage]}
                      </p>
                      <p
                        className={`mt-3 text-2xl font-bold ${
                          isRegistered
                            ? "text-forest"
                            : isDropped
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
                }
              )}
            </div>
            <div className="border-t border-ink/10 bg-mist px-5 py-3">
              <p className="text-sm text-slate">
                총 <strong className="text-ink">{fmtNum(prospectTotal)}건</strong> 상담 중{" "}
                <strong className="text-forest">{fmtNum(prospectRegistered)}명</strong> 등록 완료
                {prospectTotal > 0 && (
                  <span className="ml-2 text-xs">
                    (전환율 {Math.round((prospectRegistered / prospectTotal) * 100)}%)
                  </span>
                )}
              </p>
            </div>
          </div>
        )}
      </section>

      {/* ── 직원별 수납 ── */}
      <section>
        <h2 className="mb-4 text-base font-semibold text-ink">직원별 수납</h2>
        {staffStats.length === 0 ? (
          <div className="rounded-[28px] border border-ink/10 bg-white p-8 text-center text-sm text-slate">
            이달 수납 내역이 없습니다.
          </div>
        ) : (
          <div className="rounded-[28px] border border-ink/10 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-mist">
                  <th className="px-5 py-3 text-left font-semibold text-ink">직원명</th>
                  <th className="px-5 py-3 text-right font-semibold text-ink">처리 건수</th>
                  <th className="px-5 py-3 text-right font-semibold text-ink">수납 금액</th>
                  <th className="w-48 px-5 py-3 text-left font-semibold text-ink">비중</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {staffStats.map((s) => {
                  const pct =
                    totalPaymentAmount > 0
                      ? Math.round((s.amount / totalPaymentAmount) * 100)
                      : 0;
                  return (
                    <tr key={s.staffId} className="hover:bg-mist/50 transition-colors">
                      <td className="px-5 py-3 font-medium text-ink">{s.staffName}</td>
                      <td className="px-5 py-3 text-right text-slate">{fmtNum(s.count)}건</td>
                      <td className="px-5 py-3 text-right font-semibold text-ember">
                        {fmtKRW(s.amount)}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink/10">
                            <div
                              className="h-full rounded-full bg-ember transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="w-10 text-right text-xs font-semibold text-ember">
                            {pct}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-ink/10 bg-mist font-semibold">
                  <td className="px-5 py-3 font-bold text-ink">합계</td>
                  <td className="px-5 py-3 text-right text-slate">{fmtNum(totalPaymentCount)}건</td>
                  <td className="px-5 py-3 text-right font-bold text-ember">
                    {fmtKRW(totalPaymentAmount)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* ── 월계표 바로가기 ── */}
      <section className="rounded-[28px] border border-ink/10 bg-mist p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-ink">월계표 (수납 집계표)</p>
            <p className="mt-1 text-xs text-slate">
              {korMonth} 수납 일별 내역·항목별 집계를 보시려면 월계표를 확인하세요.
            </p>
          </div>
          <Link
            href={`/admin/settlements/monthly?month=${monthStr}`}
            className="inline-flex items-center rounded-full bg-ember px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-ember/90"
          >
            {korMonth} 월계표 →
          </Link>
        </div>
      </section>
    </div>
  );
}
