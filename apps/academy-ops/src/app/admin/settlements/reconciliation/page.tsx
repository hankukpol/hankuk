import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function parseMonthParam(param: string | undefined): { year: number; month: number } {
  if (param && /^\d{4}-\d{2}$/.test(param)) {
    const [y, m] = param.split("-").map(Number);
    if (m >= 1 && m <= 12) return { year: y, month: m };
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function formatKRW(n: number): string {
  return n.toLocaleString("ko-KR") + "원";
}

function prevMonth(year: number, month: number): string {
  if (month === 1) return `${year - 1}-12`;
  return `${year}-${String(month - 1).padStart(2, "0")}`;
}

function nextMonth(year: number, month: number): string {
  if (month === 12) return `${year + 1}-01`;
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

export default async function ReconciliationPage({
  searchParams,
}: {
  searchParams: { month?: string };
}) {
  await requireAdminContext(AdminRole.DIRECTOR);

  const { year, month } = parseMonthParam(searchParams.month);
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;

  const startOfMonth = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

  const prisma = getPrisma();

  // 1. Active enrollments that started on or before end of month and are ACTIVE/PENDING/SUSPENDED
  const activeEnrollments = await prisma.courseEnrollment.findMany({
    where: {
      status: { in: ["ACTIVE", "PENDING"] },
      startDate: { lte: endOfMonth },
    },
    include: {
      student: { select: { name: true, examNumber: true, phone: true } },
      product: { select: { name: true } },
      specialLecture: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  // 2. Payments made during the period with TUITION category
  const tuitionPayments = await prisma.payment.findMany({
    where: {
      status: { in: ["APPROVED", "PARTIAL_REFUNDED"] },
      category: "TUITION",
      processedAt: { gte: startOfMonth, lte: endOfMonth },
    },
    select: {
      id: true,
      enrollmentId: true,
      examNumber: true,
      netAmount: true,
      grossAmount: true,
      processedAt: true,
      method: true,
      student: { select: { name: true } },
    },
  });

  // 3. All payments (any category) in period
  const allPayments = await prisma.payment.findMany({
    where: {
      status: { in: ["APPROVED", "PARTIAL_REFUNDED"] },
      processedAt: { gte: startOfMonth, lte: endOfMonth },
    },
    select: {
      id: true,
      enrollmentId: true,
      examNumber: true,
      netAmount: true,
      grossAmount: true,
      category: true,
      processedAt: true,
      method: true,
      student: { select: { name: true } },
    },
  });

  // Refunds processed in period
  const refunds = await prisma.refund.findMany({
    where: {
      status: { in: ["COMPLETED"] },
      processedAt: { gte: startOfMonth, lte: endOfMonth },
    },
    select: { amount: true },
  });

  // --- Compute metrics ---

  // Expected revenue: sum of finalFee for active enrollments
  const expectedRevenue = activeEnrollments.reduce((sum, e) => sum + e.finalFee, 0);

  // Actual received: sum of netAmount for all approved payments in period
  const actualReceived = allPayments.reduce((sum, p) => sum + p.netAmount, 0);
  const refundTotal = refunds.reduce((sum, r) => sum + r.amount, 0);
  const netActual = actualReceived - refundTotal;

  const gap = expectedRevenue - netActual;

  // Build a map of enrollmentId → total paid (tuition only)
  const paidByEnrollment: Record<string, number> = {};
  for (const p of tuitionPayments) {
    if (p.enrollmentId) {
      paidByEnrollment[p.enrollmentId] = (paidByEnrollment[p.enrollmentId] ?? 0) + p.netAmount;
    }
  }

  // Enrollments with unpaid or partially-paid fees (only tuition payments considered)
  type EnrollmentWithGap = (typeof activeEnrollments)[number] & {
    paid: number;
    unpaid: number;
  };
  const unpaidEnrollments: EnrollmentWithGap[] = activeEnrollments
    .map((e) => {
      const paid = paidByEnrollment[e.id] ?? 0;
      const unpaid = e.finalFee - paid;
      return Object.assign(e, { paid, unpaid }) as EnrollmentWithGap;
    })
    .filter((e) => e.unpaid > 0)
    .sort((a, b) => b.unpaid - a.unpaid);

  // Unmatched payments: payments with no enrollmentId
  const unmatchedPayments = allPayments.filter((p) => !p.enrollmentId);

  const CATEGORY_LABEL: Record<string, string> = {
    TUITION: "수강료",
    FACILITY: "시설비",
    TEXTBOOK: "교재",
    MATERIAL: "교구",
    SINGLE_COURSE: "단과",
    PENALTY: "위약금",
    ETC: "기타",
  };

  const METHOD_LABEL: Record<string, string> = {
    CASH: "현금",
    CARD: "카드",
    TRANSFER: "이체",
    POINT: "포인트",
    MIXED: "혼합",
  };

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        수납 정산
      </div>

      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">수납 대사 (Reconciliation)</h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            예정 수입과 실제 수납액의 차이를 분석하고 미납·미연결 수납을 확인합니다.
          </p>
        </div>
        <Link
          prefetch={false}
          href="/admin/settlements/monthly"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-5 py-2.5 text-sm font-semibold text-ink transition hover:border-ember/30 hover:text-ember"
        >
          ← 월계표
        </Link>
      </div>

      {/* Month selector */}
      <nav className="mt-6 flex items-center gap-3">
        <Link
          prefetch={false}
          href={`/admin/settlements/reconciliation?month=${prevMonth(year, month)}`}
          className="rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:border-ink/30"
        >
          ← 이전
        </Link>
        <span className="rounded-full border border-ember/20 bg-ember/10 px-5 py-2 text-sm font-bold text-ember">
          {monthStr}
        </span>
        <Link
          prefetch={false}
          href={`/admin/settlements/reconciliation?month=${nextMonth(year, month)}`}
          className="rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:border-ink/30"
        >
          다음 →
        </Link>
      </nav>

      {/* Summary KPIs */}
      <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-[28px] border border-ink/10 bg-white p-6">
          <p className="text-sm text-slate">예정 수입</p>
          <p className="mt-3 text-2xl font-semibold text-ink">
            {formatKRW(expectedRevenue)}
          </p>
          <p className="mt-2 text-xs text-slate">
            활성 수강 {activeEnrollments.length}건의 확정 수강료 합계
          </p>
        </article>

        <article className="rounded-[28px] border border-forest/20 bg-forest/10 p-6">
          <p className="text-sm text-slate">실제 수납</p>
          <p className="mt-3 text-2xl font-semibold text-forest">
            {formatKRW(netActual)}
          </p>
          <p className="mt-2 text-xs text-slate">
            {monthStr} 수납 {allPayments.length}건 · 환불 {formatKRW(refundTotal)} 차감
          </p>
        </article>

        <article
          className={`rounded-[28px] border p-6 ${
            gap > 0
              ? "border-amber-200 bg-amber-50"
              : gap < 0
              ? "border-sky-200 bg-sky-50"
              : "border-ink/10 bg-white"
          }`}
        >
          <p className="text-sm text-slate">차이 (예정 − 실납)</p>
          <p
            className={`mt-3 text-2xl font-semibold ${
              gap > 0 ? "text-amber-700" : gap < 0 ? "text-sky-700" : "text-ink"
            }`}
          >
            {gap >= 0 ? "+" : ""}
            {formatKRW(gap)}
          </p>
          <p className="mt-2 text-xs text-slate">
            {gap > 0
              ? "미납 수강료가 있습니다"
              : gap < 0
              ? "예정보다 초과 수납"
              : "완전 일치"}
          </p>
        </article>

        <article className="rounded-[28px] border border-ink/10 bg-white p-6">
          <p className="text-sm text-slate">미납 수강생</p>
          <p className="mt-3 text-2xl font-semibold text-ink">
            {unpaidEnrollments.length}
            <span className="ml-1 text-base font-normal text-slate">건</span>
          </p>
          <p className="mt-2 text-xs text-slate">
            미연결 수납 {unmatchedPayments.length}건 포함
          </p>
        </article>
      </section>

      {/* Unpaid / Partial enrollments */}
      <section className="mt-8">
        <h2 className="text-xl font-semibold">미납·부분납 수강 내역</h2>
        <p className="mt-1 text-sm text-slate">
          수강료 대비 이번 달 수납이 부족한 수강 건입니다. 수강료 수납(TUITION) 기준으로 계산합니다.
        </p>

        {unpaidEnrollments.length === 0 ? (
          <div className="mt-4 rounded-[28px] border border-dashed border-forest/20 bg-forest/5 px-6 py-10 text-center text-sm text-slate">
            미납 수강 내역이 없습니다. 모든 활성 수강생의 수납이 완료되었습니다.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-[28px] border border-ink/10 bg-white">
            <table className="min-w-full divide-y divide-ink/10 text-sm">
              <thead className="bg-mist/80 text-left">
                <tr>
                  <th className="px-5 py-4 font-semibold">학생</th>
                  <th className="px-5 py-4 font-semibold">수강 과정</th>
                  <th className="px-5 py-4 font-semibold text-right">확정 수강료</th>
                  <th className="px-5 py-4 font-semibold text-right">수납액</th>
                  <th className="px-5 py-4 font-semibold text-right">미납액</th>
                  <th className="px-5 py-4 font-semibold">등록일</th>
                  <th className="px-5 py-4 font-semibold">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {unpaidEnrollments.map((e) => {
                  const courseName =
                    e.product?.name ?? e.specialLecture?.name ?? "—";
                  return (
                    <tr key={e.id} className="hover:bg-mist/40">
                      <td className="px-5 py-4">
                        <Link
                          prefetch={false}
                          href={`/admin/students/${e.student.examNumber}`}
                          className="font-semibold text-ink hover:text-ember"
                        >
                          {e.student.name}
                        </Link>
                        <p className="text-xs text-slate">{e.student.examNumber}</p>
                        {e.student.phone ? (
                          <p className="text-xs text-slate">{e.student.phone}</p>
                        ) : null}
                      </td>
                      <td className="px-5 py-4">
                        <p>{courseName}</p>
                        <p className="text-xs text-slate">
                          {e.courseType === "COMPREHENSIVE" ? "종합반" : "특강"}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-right">{formatKRW(e.finalFee)}</td>
                      <td className="px-5 py-4 text-right text-forest">{formatKRW(e.paid)}</td>
                      <td className="px-5 py-4 text-right font-semibold text-amber-700">
                        {formatKRW(e.unpaid)}
                      </td>
                      <td className="px-5 py-4 text-xs text-slate">
                        {e.startDate.toLocaleDateString("ko-KR")}
                      </td>
                      <td className="px-5 py-4">
                        <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-700">
                          {e.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Unmatched payments */}
      <section className="mt-8">
        <h2 className="text-xl font-semibold">미연결 수납 내역</h2>
        <p className="mt-1 text-sm text-slate">
          수강 등록 건에 연결되지 않은 수납입니다. 수납 상세에서 수강 건과 연결해 주세요.
        </p>

        {unmatchedPayments.length === 0 ? (
          <div className="mt-4 rounded-[28px] border border-dashed border-forest/20 bg-forest/5 px-6 py-10 text-center text-sm text-slate">
            모든 수납이 수강 등록 건에 연결되었습니다.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-[28px] border border-ink/10 bg-white">
            <table className="min-w-full divide-y divide-ink/10 text-sm">
              <thead className="bg-mist/80 text-left">
                <tr>
                  <th className="px-5 py-4 font-semibold">수납 ID</th>
                  <th className="px-5 py-4 font-semibold">학생</th>
                  <th className="px-5 py-4 font-semibold">분류</th>
                  <th className="px-5 py-4 font-semibold">수단</th>
                  <th className="px-5 py-4 font-semibold text-right">금액</th>
                  <th className="px-5 py-4 font-semibold">수납일</th>
                  <th className="px-5 py-4 font-semibold">바로가기</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {unmatchedPayments.map((p) => (
                  <tr key={p.id} className="hover:bg-mist/40">
                    <td className="px-5 py-4 font-mono text-xs text-slate">
                      {p.id.slice(0, 8)}…
                    </td>
                    <td className="px-5 py-4">
                      {p.student ? (
                        <Link
                          prefetch={false}
                          href={`/admin/students/${p.examNumber}`}
                          className="font-semibold text-ink hover:text-ember"
                        >
                          {p.student.name}
                        </Link>
                      ) : (
                        <span className="text-slate">—</span>
                      )}
                      {p.examNumber ? (
                        <p className="text-xs text-slate">{p.examNumber}</p>
                      ) : null}
                    </td>
                    <td className="px-5 py-4 text-xs">
                      {CATEGORY_LABEL[p.category] ?? p.category}
                    </td>
                    <td className="px-5 py-4 text-xs">
                      {METHOD_LABEL[p.method] ?? p.method}
                    </td>
                    <td className="px-5 py-4 text-right font-semibold">
                      {formatKRW(p.netAmount)}
                    </td>
                    <td className="px-5 py-4 text-xs text-slate">
                      {p.processedAt.toLocaleDateString("ko-KR")}
                    </td>
                    <td className="px-5 py-4">
                      <Link
                        prefetch={false}
                        href={`/admin/payments/${p.id}`}
                        className="rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold text-ember transition hover:bg-ember/20"
                      >
                        수납 상세
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
