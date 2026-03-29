import { AdminRole, RefundStatus, RefundType } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { formatDate, formatDateTime } from "@/lib/format";
import { RefundActionButtons } from "./refund-action-buttons";

export const dynamic = "force-dynamic";

const REFUND_STATUS_LABEL: Record<RefundStatus, string> = {
  PENDING: "승인 대기",
  APPROVED: "승인됨",
  REJECTED: "거절됨",
  COMPLETED: "처리 완료",
  CANCELLED: "취소",
};

const REFUND_STATUS_COLOR: Record<RefundStatus, string> = {
  PENDING: "border-amber-200 bg-amber-50 text-amber-800",
  APPROVED: "border-forest/30 bg-forest/10 text-forest",
  REJECTED: "border-red-200 bg-red-50 text-red-700",
  COMPLETED: "border-forest/30 bg-forest/10 text-forest",
  CANCELLED: "border-ink/20 bg-ink/5 text-slate",
};

const REFUND_TYPE_LABEL: Record<RefundType, string> = {
  CARD_CANCEL: "카드취소",
  CASH: "현금환불",
  TRANSFER: "계좌이체",
  PARTIAL: "부분환불",
};

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  CASH: "현금",
  CARD: "카드",
  TRANSFER: "계좌이체",
  POINT: "포인트",
  MIXED: "혼합",
};

export default async function RefundDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminContext(AdminRole.MANAGER);

  const { id } = await params;

  const refund = await getPrisma().refund.findUnique({
    where: { id },
    include: {
      payment: {
        include: {
          student: { select: { name: true, phone: true } },
          processor: { select: { name: true } },
          items: { orderBy: { id: "asc" } },
        },
      },
    },
  });

  if (!refund) notFound();

  const fieldClass = "flex justify-between py-2.5 border-b border-ink/5 last:border-0";
  const keyClass = "text-sm text-slate";
  const valClass = "text-sm font-medium text-ink text-right";

  // Build timeline steps
  const timelineSteps = [
    {
      key: "requested",
      label: "환불 신청",
      time: refund.processedAt.toISOString(),
      done: true,
      active: refund.status === "PENDING",
    },
    {
      key: "approved",
      label: "승인",
      time: refund.approvedAt?.toISOString() ?? null,
      done: ["APPROVED", "COMPLETED"].includes(refund.status),
      active: refund.status === "APPROVED",
      skipped: refund.status === "REJECTED" || refund.status === "CANCELLED",
    },
    {
      key: "completed",
      label: "처리 완료",
      time: null,
      done: refund.status === "COMPLETED",
      active: false,
      skipped: refund.status === "REJECTED" || refund.status === "CANCELLED",
    },
  ];

  const isRejected = refund.status === "REJECTED";

  return (
    <div className="p-8 sm:p-10">
      {/* breadcrumb-style label */}
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        환불 상세
      </div>

      {/* Header */}
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-semibold text-ink">
              {refund.payment.student?.name ?? "비회원"}
            </h1>
            <span
              className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${REFUND_STATUS_COLOR[refund.status]}`}
            >
              {REFUND_STATUS_LABEL[refund.status]}
            </span>
          </div>
          {refund.payment.examNumber ? (
            <p className="mt-1 text-sm text-slate">
              학번:{" "}
              <Link
                href={`/admin/students/${refund.payment.examNumber}`}
                className="font-medium text-forest hover:underline"
              >
                {refund.payment.examNumber}
              </Link>
            </p>
          ) : null}
        </div>
        <Link
          href="/admin/payments/refunds"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-5 py-2.5 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink"
        >
          ← 목록으로
        </Link>
      </div>

      {/* Timeline */}
      <div className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="mb-5 text-base font-semibold text-ink">처리 타임라인</h2>
        <div className="flex items-start gap-0">
          {timelineSteps.map((step, idx) => (
            <div key={step.key} className="flex flex-1 items-start">
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors ${
                    step.skipped
                      ? "border-ink/10 bg-ink/5 text-slate/50"
                      : step.done
                        ? "border-forest bg-forest text-white"
                        : step.active
                          ? "border-amber-400 bg-amber-50 text-amber-700"
                          : "border-ink/20 bg-white text-slate"
                  }`}
                >
                  {step.done && !step.skipped ? (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path
                        d="M2.5 7L5.5 10L11.5 4"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    <span>{idx + 1}</span>
                  )}
                </div>
                <p
                  className={`mt-2 text-center text-xs font-medium ${
                    step.skipped
                      ? "text-slate/40"
                      : step.done
                        ? "text-forest"
                        : step.active
                          ? "text-amber-700"
                          : "text-slate"
                  }`}
                >
                  {step.label}
                </p>
                {step.time ? (
                  <p className="mt-0.5 text-center text-xs text-slate/70">
                    {formatDateTime(step.time)}
                  </p>
                ) : null}
              </div>
              {idx < timelineSteps.length - 1 ? (
                <div
                  className={`mt-4 flex-1 border-t-2 ${
                    step.done && !step.skipped ? "border-forest" : "border-ink/10"
                  }`}
                />
              ) : null}
            </div>
          ))}
          {/* Rejection branch */}
          {isRejected ? (
            <div className="ml-4 flex flex-col items-center">
              <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-red-400 bg-red-50 text-red-700">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path
                    d="M3 3l8 8M11 3l-8 8"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              <p className="mt-2 text-center text-xs font-medium text-red-700">거절됨</p>
              {refund.rejectedAt ? (
                <p className="mt-0.5 text-center text-xs text-slate/70">
                  {formatDateTime(refund.rejectedAt.toISOString())}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
        {isRejected && refund.rejectionReason ? (
          <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3">
            <p className="text-xs font-medium text-red-700">거절 사유</p>
            <p className="mt-1 text-sm text-red-600">{refund.rejectionReason}</p>
          </div>
        ) : null}
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        {/* Refund Details */}
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <h2 className="mb-4 text-base font-semibold text-ink">환불 정보</h2>
          <div>
            <div className={fieldClass}>
              <span className={keyClass}>환불 금액</span>
              <span className="text-right text-sm font-bold text-red-600">
                -{refund.amount.toLocaleString()}원
              </span>
            </div>
            <div className={fieldClass}>
              <span className={keyClass}>환불 유형</span>
              <span className={valClass}>
                <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                  {REFUND_TYPE_LABEL[refund.refundType]}
                </span>
              </span>
            </div>
            <div className={fieldClass}>
              <span className={keyClass}>환불 사유</span>
              <span className={`${valClass} max-w-[220px] break-words`}>{refund.reason}</span>
            </div>
            <div className={fieldClass}>
              <span className={keyClass}>신청일시</span>
              <span className={valClass}>{formatDateTime(refund.processedAt.toISOString())}</span>
            </div>
            {refund.approvedAt ? (
              <div className={fieldClass}>
                <span className={keyClass}>승인일시</span>
                <span className={valClass}>
                  {formatDateTime(refund.approvedAt.toISOString())}
                </span>
              </div>
            ) : null}
            {refund.rejectedAt ? (
              <div className={fieldClass}>
                <span className={keyClass}>거절일시</span>
                <span className="text-right text-sm font-medium text-red-600">
                  {formatDateTime(refund.rejectedAt.toISOString())}
                </span>
              </div>
            ) : null}
            <div className={fieldClass}>
              <span className={keyClass}>상태</span>
              <span className={valClass}>
                <span
                  className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${REFUND_STATUS_COLOR[refund.status]}`}
                >
                  {REFUND_STATUS_LABEL[refund.status]}
                </span>
              </span>
            </div>
          </div>
        </div>

        {/* Original Payment Context */}
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <h2 className="mb-4 text-base font-semibold text-ink">원 수납 내역</h2>
          <div>
            <div className={fieldClass}>
              <span className={keyClass}>수납일시</span>
              <span className={valClass}>
                {formatDateTime(refund.payment.processedAt.toISOString())}
              </span>
            </div>
            <div className={fieldClass}>
              <span className={keyClass}>결제 수단</span>
              <span className={valClass}>
                {PAYMENT_METHOD_LABEL[refund.payment.method] ?? refund.payment.method}
              </span>
            </div>
            <div className={fieldClass}>
              <span className={keyClass}>수납 금액</span>
              <span className={valClass}>{refund.payment.grossAmount.toLocaleString()}원</span>
            </div>
            <div className={fieldClass}>
              <span className={keyClass}>실수납액</span>
              <span className="text-right text-sm font-bold text-forest">
                {refund.payment.netAmount.toLocaleString()}원
              </span>
            </div>
            <div className={fieldClass}>
              <span className={keyClass}>처리 직원</span>
              <span className={valClass}>{refund.payment.processor.name}</span>
            </div>
            {refund.payment.note ? (
              <div className={fieldClass}>
                <span className={keyClass}>비고</span>
                <span className={`${valClass} max-w-[180px] break-words`}>
                  {refund.payment.note}
                </span>
              </div>
            ) : null}
          </div>

          {refund.payment.items.length > 0 ? (
            <div className="mt-4">
              <p className="mb-2 text-xs font-medium text-slate">항목</p>
              <div className="space-y-1">
                {refund.payment.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-xl bg-mist/50 px-3 py-2"
                  >
                    <span className="text-xs text-ink">{item.itemName}</span>
                    <span className="text-xs font-semibold tabular-nums text-ink">
                      {item.amount.toLocaleString()}원
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-4">
            <Link
              href={`/admin/payments/${refund.paymentId}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 px-4 py-2 text-xs font-medium text-slate transition hover:border-ink/30 hover:text-ink"
            >
              원 수납 상세 보기 →
            </Link>
          </div>
        </div>

        {/* Bank Account / Card Info */}
        {(refund.bankName || refund.accountNo || refund.cardCancelNo) ? (
          <div className="rounded-[28px] border border-ink/10 bg-white p-6">
            <h2 className="mb-4 text-base font-semibold text-ink">
              {refund.cardCancelNo ? "카드 취소 정보" : "환불 계좌 정보"}
            </h2>
            <div>
              {refund.bankName ? (
                <div className={fieldClass}>
                  <span className={keyClass}>은행</span>
                  <span className={valClass}>{refund.bankName}</span>
                </div>
              ) : null}
              {refund.accountNo ? (
                <div className={fieldClass}>
                  <span className={keyClass}>계좌번호</span>
                  <span className={valClass}>{refund.accountNo}</span>
                </div>
              ) : null}
              {refund.accountHolder ? (
                <div className={fieldClass}>
                  <span className={keyClass}>예금주</span>
                  <span className={valClass}>{refund.accountHolder}</span>
                </div>
              ) : null}
              {refund.cardCancelNo ? (
                <div className={fieldClass}>
                  <span className={keyClass}>카드 취소번호</span>
                  <span className={valClass}>{refund.cardCancelNo}</span>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Student Info */}
        {refund.payment.student ? (
          <div className="rounded-[28px] border border-ink/10 bg-white p-6">
            <h2 className="mb-4 text-base font-semibold text-ink">학생 정보</h2>
            <div>
              <div className={fieldClass}>
                <span className={keyClass}>이름</span>
                <span className={valClass}>
                  {refund.payment.examNumber ? (
                    <Link
                      href={`/admin/students/${refund.payment.examNumber}`}
                      className="font-semibold text-forest hover:underline"
                    >
                      {refund.payment.student.name}
                    </Link>
                  ) : (
                    refund.payment.student.name
                  )}
                </span>
              </div>
              {refund.payment.examNumber ? (
                <div className={fieldClass}>
                  <span className={keyClass}>학번</span>
                  <span className={valClass}>{refund.payment.examNumber}</span>
                </div>
              ) : null}
              {refund.payment.student.phone ? (
                <div className={fieldClass}>
                  <span className={keyClass}>연락처</span>
                  <span className={valClass}>{refund.payment.student.phone}</span>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {/* Action Buttons */}
      <div className="mt-6">
        <RefundActionButtons
          refundId={id}
          paymentId={refund.paymentId}
          status={refund.status}
        />
      </div>

      <div className="mt-6">
        <Link
          href="/admin/payments/refunds"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-5 py-2.5 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink"
        >
          ← 환불 목록으로
        </Link>
      </div>

      {/* Print style */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
        }
      `}</style>
    </div>
  );
}
