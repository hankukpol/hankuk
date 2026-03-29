import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";

export const dynamic = "force-dynamic";

function formatKRW(amount: number): string {
  return amount.toLocaleString("ko-KR") + "원";
}

function formatDate(d: Date | string): string {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

export default async function PaymentCompliancePage() {
  await requireAdminContext(AdminRole.DIRECTOR);

  const prisma = getPrisma();

  // ── 1. Duplicate payments: 동일 enrollmentId에 APPROVED/PARTIAL_REFUNDED 상태 결제 2건 이상
  const enrollmentPayments = await prisma.payment.findMany({
    where: {
      enrollmentId: { not: null },
      status: { in: ["APPROVED", "PARTIAL_REFUNDED"] },
    },
    select: {
      id: true,
      enrollmentId: true,
      netAmount: true,
      processedAt: true,
      examNumber: true,
    },
  });

  // Group by enrollmentId
  const enrollmentPaymentMap = new Map<
    string,
    { id: string; enrollmentId: string; netAmount: number; processedAt: Date; examNumber: string | null }[]
  >();
  for (const p of enrollmentPayments) {
    if (!p.enrollmentId) continue;
    const eid = p.enrollmentId;
    if (!enrollmentPaymentMap.has(eid)) {
      enrollmentPaymentMap.set(eid, []);
    }
    enrollmentPaymentMap.get(eid)!.push({
      id: p.id,
      enrollmentId: eid,
      netAmount: p.netAmount,
      processedAt: p.processedAt,
      examNumber: p.examNumber,
    });
  }

  const duplicateGroups = Array.from(enrollmentPaymentMap.entries())
    .filter(([, payments]) => payments.length >= 2)
    .map(([enrollmentId, payments]) => ({
      enrollmentId,
      count: payments.length,
      total: payments.reduce((sum, p) => sum + p.netAmount, 0),
      latestAt: payments.reduce(
        (latest, p) => (p.processedAt > latest ? p.processedAt : latest),
        payments[0].processedAt,
      ),
      examNumber: payments[0].examNumber,
    }));

  // Load enrollment + student info for duplicates
  const duplicateEnrollmentIds = duplicateGroups.map((g) => g.enrollmentId);
  const duplicateEnrollments =
    duplicateEnrollmentIds.length > 0
      ? await prisma.courseEnrollment.findMany({
          where: { id: { in: duplicateEnrollmentIds } },
          include: {
            student: { select: { examNumber: true, name: true } },
            cohort: { select: { name: true } },
            product: { select: { name: true } },
            specialLecture: { select: { name: true } },
          },
        })
      : [];
  const enrollmentInfoMap = new Map(duplicateEnrollments.map((e) => [e.id, e]));

  // ── 2. Overcharge detection: sum of payments > finalFee * 1.1
  // Only for enrollments that have payments
  const overchargeEnrollments =
    duplicateEnrollmentIds.length > 0 || enrollmentPaymentMap.size > 0
      ? await prisma.courseEnrollment.findMany({
          where: {
            id: { in: Array.from(enrollmentPaymentMap.keys()) },
          },
          select: {
            id: true,
            finalFee: true,
            student: { select: { examNumber: true, name: true } },
            cohort: { select: { name: true } },
            product: { select: { name: true } },
          },
        })
      : [];

  const overchargeAlerts = overchargeEnrollments
    .map((e) => {
      const payments = enrollmentPaymentMap.get(e.id) ?? [];
      const totalPaid = payments.reduce((sum, p) => sum + p.netAmount, 0);
      const threshold = Math.floor(e.finalFee * 1.1);
      const excess = totalPaid - threshold;
      return { enrollment: e, totalPaid, threshold, excess, finalFee: e.finalFee };
    })
    .filter((item) => item.excess > 0);

  // ── 3. Unusual large payments (> 2,000,000원)
  const largePayments = await prisma.payment.findMany({
    where: {
      netAmount: { gt: 2000000 },
      status: { in: ["APPROVED", "PARTIAL_REFUNDED"] },
    },
    include: {
      student: { select: { examNumber: true, name: true } },
      processor: { select: { name: true } },
    },
    orderBy: { processedAt: "desc" },
    take: 50,
  });

  // ── 4. Recent 30-day refunds
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const recentRefunds = await prisma.refund.findMany({
    where: {
      status: "COMPLETED",
      processedAt: { gte: thirtyDaysAgo },
    },
    select: { id: true, amount: true, processedAt: true, reason: true },
    orderBy: { processedAt: "desc" },
  });

  const refundTotal = recentRefunds.reduce((sum, r) => sum + r.amount, 0);
  const refundCount = recentRefunds.length;

  // ── Summary counts for alert cards
  const hasDuplicates = duplicateGroups.length > 0;
  const hasOvercharge = overchargeAlerts.length > 0;
  const hasLargePayments = largePayments.length > 0;
  const allClean = !hasDuplicates && !hasOvercharge;

  return (
    <div className="min-h-screen bg-[#F7F4EF] p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "수납 관리", href: "/admin/payments" },
          { label: "결제 컴플라이언스 대시보드" },
        ]}
      />

      {/* Header */}
      <div className="mb-8">
        <div className="inline-flex rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-red-700">
          컴플라이언스 모니터링
        </div>
        <h1 className="mt-3 text-3xl font-semibold text-[#111827]">결제 컴플라이언스 대시보드</h1>
        <p className="mt-1 text-sm text-[#4B5563]">
          중복 결제, 초과 납부, 고액 결제 등 이상 징후를 탐지합니다.
        </p>
      </div>

      {/* Alert Cards */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div
          className={`rounded-[28px] border p-6 shadow-sm ${
            hasDuplicates
              ? "border-red-200 bg-red-50"
              : "border-[#1F4D3A]/20 bg-[#1F4D3A]/5"
          }`}
        >
          <p className="text-xs font-semibold uppercase tracking-widest text-[#4B5563]">
            중복 결제
          </p>
          <p
            className={`mt-2 text-2xl font-bold ${hasDuplicates ? "text-red-700" : "text-[#1F4D3A]"}`}
          >
            {duplicateGroups.length}
            <span className="ml-1 text-base font-normal text-[#4B5563]">건</span>
          </p>
          <p className={`mt-0.5 text-xs ${hasDuplicates ? "text-red-600" : "text-[#4B5563]"}`}>
            {hasDuplicates ? "즉시 확인 필요" : "정상"}
          </p>
        </div>

        <div
          className={`rounded-[28px] border p-6 shadow-sm ${
            hasOvercharge
              ? "border-red-200 bg-red-50"
              : "border-[#1F4D3A]/20 bg-[#1F4D3A]/5"
          }`}
        >
          <p className="text-xs font-semibold uppercase tracking-widest text-[#4B5563]">
            초과 납부
          </p>
          <p
            className={`mt-2 text-2xl font-bold ${hasOvercharge ? "text-red-700" : "text-[#1F4D3A]"}`}
          >
            {overchargeAlerts.length}
            <span className="ml-1 text-base font-normal text-[#4B5563]">건</span>
          </p>
          <p
            className={`mt-0.5 text-xs ${hasOvercharge ? "text-red-600" : "text-[#4B5563]"}`}
          >
            {hasOvercharge ? "수강료 10% 초과" : "정상"}
          </p>
        </div>

        <div
          className={`rounded-[28px] border p-6 shadow-sm ${
            hasLargePayments
              ? "border-amber-200 bg-amber-50"
              : "border-[#1F4D3A]/20 bg-[#1F4D3A]/5"
          }`}
        >
          <p className="text-xs font-semibold uppercase tracking-widest text-[#4B5563]">
            고액 결제 (200만원↑)
          </p>
          <p
            className={`mt-2 text-2xl font-bold ${hasLargePayments ? "text-amber-700" : "text-[#1F4D3A]"}`}
          >
            {largePayments.length}
            <span className="ml-1 text-base font-normal text-[#4B5563]">건</span>
          </p>
          <p className="mt-0.5 text-xs text-[#4B5563]">검토 권장</p>
        </div>

        <div className="rounded-[28px] border border-[#111827]/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#4B5563]">
            최근 30일 환불
          </p>
          <p className="mt-2 text-2xl font-bold text-[#111827]">
            {refundCount}
            <span className="ml-1 text-base font-normal text-[#4B5563]">건</span>
          </p>
          <p className="mt-0.5 text-xs text-[#4B5563]">{formatKRW(refundTotal)}</p>
        </div>
      </div>

      {/* All Clean Banner */}
      {allClean && (
        <div className="mb-8 rounded-[28px] border border-[#1F4D3A]/20 bg-[#1F4D3A]/5 p-6 text-center">
          <p className="text-lg font-semibold text-[#1F4D3A]">모두 정상</p>
          <p className="mt-1 text-sm text-[#4B5563]">
            중복 결제 및 초과 납부 이상 징후가 감지되지 않았습니다.
          </p>
        </div>
      )}

      <div className="space-y-8">
        {/* ── Duplicate Payments Table */}
        {hasDuplicates && (
          <section className="rounded-[28px] border border-red-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-bold text-red-700">
                경고
              </span>
              <h2 className="text-lg font-semibold text-[#111827]">
                중복 결제 탐지 ({duplicateGroups.length}건)
              </h2>
            </div>
            <p className="mb-5 text-sm text-[#4B5563]">
              동일 수강 등록에 대해 2건 이상의 승인 결제가 존재합니다.
            </p>
            <div className="overflow-hidden rounded-[20px] border border-red-100">
              <table className="min-w-full divide-y divide-red-100 text-sm">
                <thead className="bg-red-50 text-left">
                  <tr>
                    <th className="px-5 py-3.5 font-semibold text-[#111827]">학생명</th>
                    <th className="px-5 py-3.5 font-semibold text-[#111827]">학번</th>
                    <th className="px-5 py-3.5 font-semibold text-[#111827]">수강 등록</th>
                    <th className="px-5 py-3.5 font-semibold text-[#111827]">결제 건수</th>
                    <th className="px-5 py-3.5 font-semibold text-[#111827]">납부 합계</th>
                    <th className="px-5 py-3.5 font-semibold text-[#111827]">수강료</th>
                    <th className="px-5 py-3.5 font-semibold text-[#111827]">초과액</th>
                    <th className="px-5 py-3.5 font-semibold text-[#111827]">최근 결제일</th>
                    <th className="px-5 py-3.5 font-semibold text-[#111827]">조치</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-red-50 bg-white">
                  {duplicateGroups.map((group) => {
                    const enrollmentInfo = enrollmentInfoMap.get(group.enrollmentId);
                    const courseName =
                      enrollmentInfo?.cohort?.name ??
                      enrollmentInfo?.product?.name ??
                      enrollmentInfo?.specialLecture?.name ??
                      "-";
                    const studentName = enrollmentInfo?.student?.name ?? "-";
                    const studentExamNumber = enrollmentInfo?.student?.examNumber ?? group.examNumber ?? "-";
                    const finalFee = enrollmentInfo?.finalFee ?? 0;
                    const excess = group.total - finalFee;

                    return (
                      <tr key={group.enrollmentId} className="hover:bg-red-50/30 transition-colors">
                        <td className="px-5 py-3.5 font-medium text-[#111827]">
                          {enrollmentInfo ? (
                            <Link
                              href={`/admin/students/${enrollmentInfo.student.examNumber}`}
                              className="hover:text-[#C55A11] transition-colors"
                            >
                              {studentName}
                            </Link>
                          ) : (
                            studentName
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-[#4B5563]">{studentExamNumber}</td>
                        <td className="px-5 py-3.5 text-[#4B5563]">{courseName}</td>
                        <td className="px-5 py-3.5">
                          <span className="inline-flex rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-700">
                            {group.count}건
                          </span>
                        </td>
                        <td className="px-5 py-3.5 font-medium text-[#111827]">
                          {formatKRW(group.total)}
                        </td>
                        <td className="px-5 py-3.5 text-[#4B5563]">{formatKRW(finalFee)}</td>
                        <td className="px-5 py-3.5 font-semibold text-red-600">
                          {excess > 0 ? `+${formatKRW(excess)}` : "-"}
                        </td>
                        <td className="px-5 py-3.5 text-[#4B5563]">
                          {formatDate(group.latestAt)}
                        </td>
                        <td className="px-5 py-3.5">
                          <Link
                            href={`/admin/enrollments/${group.enrollmentId}`}
                            className="text-xs font-semibold text-[#C55A11] hover:underline"
                          >
                            수강 상세 →
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ── Overcharge Alerts Table */}
        {hasOvercharge && (
          <section className="rounded-[28px] border border-red-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-bold text-red-700">
                경고
              </span>
              <h2 className="text-lg font-semibold text-[#111827]">
                초과 납부 탐지 ({overchargeAlerts.length}건)
              </h2>
            </div>
            <p className="mb-5 text-sm text-[#4B5563]">
              납부 합계가 수강료의 110%를 초과하는 수강 등록입니다.
            </p>
            <div className="overflow-hidden rounded-[20px] border border-red-100">
              <table className="min-w-full divide-y divide-red-100 text-sm">
                <thead className="bg-red-50 text-left">
                  <tr>
                    <th className="px-5 py-3.5 font-semibold text-[#111827]">학생명</th>
                    <th className="px-5 py-3.5 font-semibold text-[#111827]">학번</th>
                    <th className="px-5 py-3.5 font-semibold text-[#111827]">수강 등록</th>
                    <th className="px-5 py-3.5 font-semibold text-[#111827]">수강료</th>
                    <th className="px-5 py-3.5 font-semibold text-[#111827]">납부 합계</th>
                    <th className="px-5 py-3.5 font-semibold text-[#111827]">초과액</th>
                    <th className="px-5 py-3.5 font-semibold text-[#111827]">조치</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-red-50 bg-white">
                  {overchargeAlerts.map((alert) => {
                    const courseName =
                      alert.enrollment.cohort?.name ??
                      alert.enrollment.product?.name ??
                      "-";

                    return (
                      <tr
                        key={alert.enrollment.id}
                        className="hover:bg-red-50/30 transition-colors"
                      >
                        <td className="px-5 py-3.5 font-medium text-[#111827]">
                          <Link
                            href={`/admin/students/${alert.enrollment.student.examNumber}`}
                            className="hover:text-[#C55A11] transition-colors"
                          >
                            {alert.enrollment.student.name}
                          </Link>
                        </td>
                        <td className="px-5 py-3.5 text-[#4B5563]">
                          {alert.enrollment.student.examNumber}
                        </td>
                        <td className="px-5 py-3.5 text-[#4B5563]">{courseName}</td>
                        <td className="px-5 py-3.5 text-[#4B5563]">
                          {formatKRW(alert.finalFee)}
                        </td>
                        <td className="px-5 py-3.5 font-medium text-[#111827]">
                          {formatKRW(alert.totalPaid)}
                        </td>
                        <td className="px-5 py-3.5 font-semibold text-red-600">
                          +{formatKRW(alert.excess)}
                        </td>
                        <td className="px-5 py-3.5">
                          <Link
                            href={`/admin/enrollments/${alert.enrollment.id}`}
                            className="text-xs font-semibold text-[#C55A11] hover:underline"
                          >
                            수강 상세 →
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ── Large Payment Flags */}
        <section className="rounded-[28px] border border-[#111827]/10 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            {hasLargePayments && (
              <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-700">
                검토
              </span>
            )}
            <h2 className="text-lg font-semibold text-[#111827]">
              고액 결제 플래그 ({largePayments.length}건)
            </h2>
          </div>
          <p className="mb-5 text-sm text-[#4B5563]">200만원 초과 결제 목록입니다.</p>

          {largePayments.length === 0 ? (
            <div className="rounded-[20px] border border-dashed border-[#111827]/10 py-8 text-center text-sm text-[#4B5563]">
              고액 결제가 없습니다.
            </div>
          ) : (
            <div className="overflow-hidden rounded-[20px] border border-[#111827]/10">
              <table className="min-w-full divide-y divide-[#111827]/10 text-sm">
                <thead className="bg-[#F7F4EF]/80 text-left">
                  <tr>
                    <th className="px-5 py-3.5 font-semibold text-[#111827]">날짜</th>
                    <th className="px-5 py-3.5 font-semibold text-[#111827]">학생명</th>
                    <th className="px-5 py-3.5 font-semibold text-[#111827]">학번</th>
                    <th className="px-5 py-3.5 font-semibold text-[#111827]">금액</th>
                    <th className="px-5 py-3.5 font-semibold text-[#111827]">담당 직원</th>
                    <th className="px-5 py-3.5 font-semibold text-[#111827]">결제 ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#111827]/10 bg-white">
                  {largePayments.map((payment) => (
                    <tr key={payment.id} className="hover:bg-[#F7F4EF]/40 transition-colors">
                      <td className="px-5 py-3.5 text-[#4B5563]">
                        {formatDate(payment.processedAt)}
                      </td>
                      <td className="px-5 py-3.5 font-medium text-[#111827]">
                        {payment.student ? (
                          <Link
                            href={`/admin/students/${payment.student.examNumber}`}
                            className="hover:text-[#C55A11] transition-colors"
                          >
                            {payment.student.name}
                          </Link>
                        ) : (
                          <span className="text-[#4B5563]/50">-</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-[#4B5563]">
                        {payment.student?.examNumber ?? "-"}
                      </td>
                      <td className="px-5 py-3.5 font-semibold text-amber-700">
                        {formatKRW(payment.netAmount)}
                      </td>
                      <td className="px-5 py-3.5 text-[#4B5563]">
                        {payment.processor.name}
                      </td>
                      <td className="px-5 py-3.5 font-mono text-xs text-[#4B5563]">
                        {payment.id.slice(0, 12)}…
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── Recent Refunds Summary */}
        <section className="rounded-[28px] border border-[#111827]/10 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-[#111827]">
            최근 30일 환불 현황
          </h2>
          <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-2">
            <div className="rounded-[20px] border border-[#111827]/10 bg-[#F7F4EF] p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-[#4B5563]">
                환불 건수
              </p>
              <p className="mt-1.5 text-2xl font-bold text-[#111827]">
                {refundCount}
                <span className="ml-1 text-base font-normal text-[#4B5563]">건</span>
              </p>
            </div>
            <div className="rounded-[20px] border border-[#111827]/10 bg-[#F7F4EF] p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-[#4B5563]">
                환불 합계
              </p>
              <p className="mt-1.5 text-2xl font-bold text-[#111827]">
                {formatKRW(refundTotal)}
              </p>
            </div>
          </div>
          {recentRefunds.length > 0 ? (
            <div className="overflow-hidden rounded-[20px] border border-[#111827]/10">
              <table className="min-w-full divide-y divide-[#111827]/10 text-sm">
                <thead className="bg-[#F7F4EF]/80 text-left">
                  <tr>
                    <th className="px-5 py-3.5 font-semibold text-[#111827]">환불일</th>
                    <th className="px-5 py-3.5 font-semibold text-[#111827]">금액</th>
                    <th className="px-5 py-3.5 font-semibold text-[#111827]">사유</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#111827]/10 bg-white">
                  {recentRefunds.slice(0, 10).map((refund) => (
                    <tr key={refund.id} className="hover:bg-[#F7F4EF]/40 transition-colors">
                      <td className="px-5 py-3.5 text-[#4B5563]">
                        {formatDate(refund.processedAt)}
                      </td>
                      <td className="px-5 py-3.5 font-medium text-[#111827]">
                        {formatKRW(refund.amount)}
                      </td>
                      <td className="px-5 py-3.5 text-[#4B5563]">
                        {refund.reason.length > 50
                          ? refund.reason.slice(0, 50) + "…"
                          : refund.reason}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-[20px] border border-dashed border-[#111827]/10 py-8 text-center text-sm text-[#4B5563]">
              최근 30일간 완료된 환불이 없습니다.
            </div>
          )}
          {recentRefunds.length > 10 && (
            <p className="mt-3 text-right text-xs text-[#4B5563]">
              최근 10건만 표시됩니다. 전체 환불 내역은{" "}
              <Link href="/admin/payments/refunds" className="text-[#C55A11] hover:underline">
                환불 관리
              </Link>
              에서 확인하세요.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
