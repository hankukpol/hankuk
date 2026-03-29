import { AdminRole, RefundType } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getActiveAcademySettings } from "@/lib/academy-settings";
import { getPrisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/format";
import { ApprovalActions, StudyRoomBookingActions, type PendingRefundRow, type PendingBookingRow } from "./approval-actions";
import { TabNav, type ApprovalTab } from "./tab-nav";

export const dynamic = "force-dynamic";

const REFUND_TYPE_LABEL: Record<RefundType, string> = {
  CARD_CANCEL: "카드취소",
  CASH: "현금환불",
  TRANSFER: "계좌이체",
  PARTIAL: "부분환불",
};

const APPROVAL_THRESHOLD_DEFAULTS = {
  refundApprovalThreshold: 200000,
  discountApprovalThreshold: 50000,
  cashApprovalThreshold: 100000,
};

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default async function ApprovalsPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.MANAGER);

  const rawTab = typeof searchParams?.tab === "string" ? searchParams.tab : "refund";
  const activeTab: ApprovalTab =
    rawTab === "discount"
      ? "discount"
      : rawTab === "cash"
        ? "cash"
        : rawTab === "studyroom"
          ? "studyroom"
          : "refund";

  // ── Settings (thresholds) ─────────────────────────────────────────────────
  const settings = await getActiveAcademySettings();
  const refundThreshold =
    settings?.refundApprovalThreshold ?? APPROVAL_THRESHOLD_DEFAULTS.refundApprovalThreshold;
  const discountThreshold =
    settings?.discountApprovalThreshold ??
    APPROVAL_THRESHOLD_DEFAULTS.discountApprovalThreshold;
  const cashThreshold =
    settings?.cashApprovalThreshold ?? APPROVAL_THRESHOLD_DEFAULTS.cashApprovalThreshold;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // ── Tab 1: Pending refunds ─────────────────────────────────────────────────
  const refunds = await getPrisma().refund.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    include: {
      payment: {
        select: {
          examNumber: true,
          student: { select: { name: true } },
          grossAmount: true,
          netAmount: true,
          note: true,
        },
      },
    },
  });

  const adminIds = [...new Set(refunds.map((r) => r.processedBy))];
  const admins =
    adminIds.length > 0
      ? await getPrisma().adminUser.findMany({
          where: { id: { in: adminIds } },
          select: { id: true, name: true },
        })
      : [];
  const adminMap = Object.fromEntries(admins.map((a) => [a.id, a.name]));

  const refundRows: PendingRefundRow[] = refunds.map((r) => ({
    id: r.id,
    paymentId: r.paymentId,
    refundType: r.refundType,
    amount: r.amount,
    reason: r.reason,
    createdAt: r.createdAt.toISOString(),
    requestedByName: adminMap[r.processedBy] ?? null,
    payment: {
      examNumber: r.payment.examNumber,
      student: r.payment.student ?? null,
      grossAmount: r.payment.grossAmount,
      netAmount: r.payment.netAmount,
      note: r.payment.note,
    },
  }));

  // ── Tab 2: Discount enrollments needing review ────────────────────────────
  const discountEnrollments = await getPrisma().courseEnrollment.findMany({
    where: {
      discountAmount: { gt: discountThreshold },
      createdAt: { gte: thirtyDaysAgo },
    },
    orderBy: { createdAt: "desc" },
    include: {
      student: { select: { name: true, phone: true } },
      staff: { select: { name: true } },
      cohort: { select: { name: true } },
    },
  });

  // ── Tab 3: Large cash payments ─────────────────────────────────────────────
  const cashPayments = await getPrisma().payment.findMany({
    where: {
      method: "CASH",
      netAmount: { gt: cashThreshold },
      processedAt: { gte: thirtyDaysAgo },
    },
    orderBy: { processedAt: "desc" },
    include: {
      student: { select: { name: true } },
      processor: { select: { name: true } },
    },
  });

  // ── Tab 4: Pending study room bookings ────────────────────────────────────
  const pendingBookings = await getPrisma().studyRoomBooking.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    include: {
      room: { select: { name: true } },
      student: { select: { name: true } },
    },
  });

  const bookingRows: PendingBookingRow[] = pendingBookings.map((b) => ({
    id: b.id,
    examNumber: b.examNumber,
    studentName: b.student?.name ?? null,
    roomId: b.roomId,
    roomName: b.room.name,
    bookingDate: b.bookingDate.toISOString(),
    startTime: b.startTime,
    endTime: b.endTime,
    note: b.note,
    createdAt: b.createdAt.toISOString(),
  }));

  const totalCount = refundRows.length + discountEnrollments.length + cashPayments.length + bookingRows.length;

  return (
    <div className="p-8 sm:p-10">
      {/* Badge */}
      <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-800">
        결재 관리
      </div>

      {/* Header */}
      <div className="mt-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-ink">결재 대기함</h1>
          <p className="mt-1 text-sm text-slate">
            승인이 필요한 환불·할인·현금 수납 내역을 검토합니다.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="/admin/approvals/bulk-absence"
            className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800 transition hover:bg-amber-100"
          >
            결석계 일괄 처리 →
          </a>
          <span
            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${
              totalCount > 0
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : "border-forest/30 bg-forest/10 text-forest"
            }`}
          >
            전체 {totalCount}건
          </span>
        </div>
      </div>

      {/* Tab navigation */}
      <TabNav
        activeTab={activeTab}
        refundCount={refundRows.length}
        discountCount={discountEnrollments.length}
        cashCount={cashPayments.length}
        studyroomCount={bookingRows.length}
      />

      {/* ── Tab panels ───────────────────────────────────────────────────── */}
      <div className="mt-6">
        {/* Tab 1: 환불 대기 */}
        {activeTab === "refund" ? (
          <>
            {/* Threshold info */}
            <div className="mb-4 flex items-center gap-2 rounded-2xl border border-ink/5 bg-mist/60 px-5 py-3 text-xs text-slate">
              <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 font-bold">
                !
              </span>
              환불 승인 기준:{" "}
              <strong className="text-ink">{refundThreshold.toLocaleString()}원 이상</strong>은
              원장(DIRECTOR) 이상 승인 필요
            </div>

            {refundRows.length === 0 ? (
              <div className="rounded-[28px] border border-ink/10 bg-white p-12 text-center">
                <p className="text-sm text-slate">대기 중인 환불 요청이 없습니다.</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-[28px] border border-ink/10 bg-white">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-ink/10 text-sm">
                    <thead>
                      <tr>
                        {[
                          "학번",
                          "이름",
                          "환불 금액",
                          "환불 유형",
                          "요청 사유",
                          "요청일",
                          "요청자",
                          "처리",
                        ].map((h) => (
                          <th
                            key={h}
                            className="whitespace-nowrap bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase text-slate"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink/10">
                      {refundRows.map((row) => (
                        <tr key={row.id} className="transition-colors hover:bg-mist/30">
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-slate">
                            {row.payment.examNumber ? (
                              <a
                                href={`/admin/students/${row.payment.examNumber}`}
                                className="font-medium text-ink transition-colors hover:text-ember"
                              >
                                {row.payment.examNumber}
                              </a>
                            ) : (
                              <span className="text-slate/60">—</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            {row.payment.student ? (
                              <a
                                href={`/admin/students/${row.payment.examNumber}`}
                                className="font-medium text-ink transition-colors hover:text-ember"
                              >
                                {row.payment.student.name}
                              </a>
                            ) : (
                              <span className="text-xs text-slate">비회원</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 font-semibold tabular-nums text-red-600">
                            -{row.amount.toLocaleString()}원
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                              {REFUND_TYPE_LABEL[row.refundType]}
                            </span>
                          </td>
                          <td className="max-w-[200px] truncate px-4 py-3 text-slate">
                            {row.reason}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-slate">
                            {formatDateTime(row.createdAt)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-slate">
                            {row.requestedByName ?? "—"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <ApprovalActions refund={row} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        ) : null}

        {/* Tab 2: 할인 승인 대기 */}
        {activeTab === "discount" ? (
          <>
            <div className="mb-4 flex items-center gap-2 rounded-2xl border border-amber-100 bg-amber-50/60 px-5 py-3 text-xs text-amber-800">
              <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-200 font-bold">
                !
              </span>
              최근 30일 이내 할인 기준 금액(
              <strong>{discountThreshold.toLocaleString()}원</strong>) 초과 수강 등록 목록입니다.
              해당 건들은 교무(ACADEMIC_ADMIN) 이상의 검토가 필요합니다.
            </div>

            {discountEnrollments.length === 0 ? (
              <div className="rounded-[28px] border border-ink/10 bg-white p-12 text-center">
                <p className="text-sm text-slate">
                  검토 대상 할인 적용 수강이 없습니다.
                  <span className="ml-1 text-slate/60">
                    (기준: {discountThreshold.toLocaleString()}원 초과)
                  </span>
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-[28px] border border-ink/10 bg-white">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-ink/10 text-sm">
                    <thead>
                      <tr>
                        {[
                          "학번",
                          "이름",
                          "연락처",
                          "반/기수",
                          "정상 수강료",
                          "할인 금액",
                          "최종 수강료",
                          "등록일",
                          "등록 직원",
                          "수강 내역",
                        ].map((h) => (
                          <th
                            key={h}
                            className="whitespace-nowrap bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase text-slate"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink/10">
                      {discountEnrollments.map((enroll) => (
                        <tr key={enroll.id} className="transition-colors hover:bg-mist/30">
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-slate">
                            <a
                              href={`/admin/students/${enroll.examNumber}`}
                              className="font-medium text-ink transition-colors hover:text-ember"
                            >
                              {enroll.examNumber}
                            </a>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <a
                              href={`/admin/students/${enroll.examNumber}`}
                              className="font-medium text-ink transition-colors hover:text-ember"
                            >
                              {enroll.student.name}
                            </a>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-slate tabular-nums">
                            {enroll.student.phone ?? "—"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-slate">
                            {enroll.cohort?.name ?? "—"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate">
                            {enroll.regularFee.toLocaleString()}원
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 font-semibold tabular-nums text-[#C55A11]">
                            -{enroll.discountAmount.toLocaleString()}원
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 font-semibold tabular-nums text-ink">
                            {enroll.finalFee.toLocaleString()}원
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-slate">
                            {formatDateTime(enroll.createdAt.toISOString())}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-slate">
                            {enroll.staff.name}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <a
                              href={`/admin/enrollments/${enroll.id}`}
                              className="inline-flex rounded-full border border-ink/10 bg-white px-3 py-1 text-xs font-medium text-slate transition hover:border-ink/30 hover:text-ink"
                            >
                              상세 보기
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Footer note */}
                <div className="border-t border-ink/5 bg-mist/40 px-6 py-3">
                  <p className="text-xs text-slate">
                    이 목록은 정보 표시 전용입니다. 할인 취소 또는 재승인은 수강 상세에서
                    처리하세요.
                  </p>
                </div>
              </div>
            )}
          </>
        ) : null}

        {/* Tab 3: 고액 현금 수납 */}
        {activeTab === "cash" ? (
          <>
            <div className="mb-4 flex items-center gap-2 rounded-2xl border border-ink/5 bg-mist/60 px-5 py-3 text-xs text-slate">
              <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 font-bold">
                !
              </span>
              최근 30일 이내 현금 수납 기준 금액(
              <strong className="text-ink">{cashThreshold.toLocaleString()}원</strong>) 초과
              내역입니다. 원장(DIRECTOR) 이상의 확인을 권장합니다.
            </div>

            {cashPayments.length === 0 ? (
              <div className="rounded-[28px] border border-ink/10 bg-white p-12 text-center">
                <p className="text-sm text-slate">
                  검토 대상 고액 현금 수납이 없습니다.
                  <span className="ml-1 text-slate/60">
                    (기준: {cashThreshold.toLocaleString()}원 초과)
                  </span>
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-[28px] border border-ink/10 bg-white">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-ink/10 text-sm">
                    <thead>
                      <tr>
                        {[
                          "학번",
                          "이름",
                          "수납 금액",
                          "할인 금액",
                          "실수납액",
                          "수납 구분",
                          "수납일시",
                          "처리 직원",
                          "수납 상세",
                        ].map((h) => (
                          <th
                            key={h}
                            className="whitespace-nowrap bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase text-slate"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink/10">
                      {cashPayments.map((pay) => (
                        <tr key={pay.id} className="transition-colors hover:bg-mist/30">
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-slate">
                            {pay.examNumber ? (
                              <a
                                href={`/admin/students/${pay.examNumber}`}
                                className="font-medium text-ink transition-colors hover:text-ember"
                              >
                                {pay.examNumber}
                              </a>
                            ) : (
                              <span className="text-slate/60">—</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            {pay.student ? (
                              <a
                                href={`/admin/students/${pay.examNumber}`}
                                className="font-medium text-ink transition-colors hover:text-ember"
                              >
                                {pay.student.name}
                              </a>
                            ) : (
                              <span className="text-xs text-slate">비회원</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate">
                            {pay.grossAmount.toLocaleString()}원
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 tabular-nums text-[#C55A11]">
                            {pay.discountAmount > 0
                              ? `-${pay.discountAmount.toLocaleString()}원`
                              : "—"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 font-semibold tabular-nums text-ink">
                            {pay.netAmount.toLocaleString()}원
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <span className="inline-flex rounded-full border border-ink/10 bg-white px-2 py-0.5 text-xs font-semibold text-ink">
                              현금
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-slate">
                            {formatDateTime(pay.processedAt.toISOString())}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-slate">
                            {pay.processor.name}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <a
                              href={`/admin/payments/${pay.id}`}
                              className="inline-flex rounded-full border border-ink/10 bg-white px-3 py-1 text-xs font-medium text-slate transition hover:border-ink/30 hover:text-ink"
                            >
                              상세 보기
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Footer note */}
                <div className="border-t border-ink/5 bg-mist/40 px-6 py-3">
                  <p className="text-xs text-slate">
                    이 목록은 정보 표시 전용입니다. 영수증 발행 여부는 수납 상세에서 확인하세요.
                  </p>
                </div>
              </div>
            )}
          </>
        ) : null}
        {/* Tab 4: 스터디룸 신청 */}
        {activeTab === "studyroom" ? (
          <>
            <div className="mb-4 flex items-center gap-2 rounded-2xl border border-amber-100 bg-amber-50/60 px-5 py-3 text-xs text-amber-800">
              <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-200 font-bold">
                !
              </span>
              학생 포털에서 신청한 스터디룸 예약 요청입니다. 승인하면 &quot;확정&quot;, 거절하면 &quot;취소&quot; 상태로 변경됩니다.
            </div>

            {bookingRows.length === 0 ? (
              <div className="rounded-[28px] border border-ink/10 bg-white p-12 text-center">
                <p className="text-sm text-slate">대기 중인 스터디룸 예약 신청이 없습니다.</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-[28px] border border-ink/10 bg-white">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-ink/10 text-sm">
                    <thead>
                      <tr>
                        {["학번", "이름", "스터디룸", "날짜", "시간", "메모", "신청일", "처리"].map((h) => (
                          <th
                            key={h}
                            className="whitespace-nowrap bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase text-slate"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink/10">
                      {bookingRows.map((row) => (
                        <tr key={row.id} className="transition-colors hover:bg-mist/30">
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-slate">
                            <a
                              href={`/admin/students/${row.examNumber}`}
                              className="font-medium text-ink transition-colors hover:text-ember"
                            >
                              {row.examNumber}
                            </a>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <a
                              href={`/admin/students/${row.examNumber}`}
                              className="font-medium text-ink transition-colors hover:text-ember"
                            >
                              {row.studentName ?? "—"}
                            </a>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <span className="inline-flex rounded-full border border-forest/20 bg-forest/5 px-2 py-0.5 text-xs font-semibold text-forest">
                              {row.roomName}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-slate">
                            {new Date(row.bookingDate).toLocaleDateString("ko-KR")}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-xs font-semibold text-ink tabular-nums">
                            {row.startTime} ~ {row.endTime}
                          </td>
                          <td className="max-w-[160px] truncate px-4 py-3 text-xs text-slate">
                            {row.note ?? "—"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-slate">
                            {formatDateTime(row.createdAt)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <StudyRoomBookingActions booking={row} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>

      {/* Back link */}
      <div className="mt-6">
        <a
          href="/admin/payments"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-5 py-2.5 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink"
        >
          ← 수납 이력으로
        </a>
      </div>
    </div>
  );
}
