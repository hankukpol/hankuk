import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { RefundStatus, RefundType } from "@prisma/client";
import { getAcademyRuntimeBranding } from "@/lib/academy-branding";
import { hasDatabaseConfig } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import { getStudentPortalViewer } from "@/lib/student-portal/service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "환불 현황",
};

// ─── Label maps ────────────────────────────────────────────────────────────────

const REFUND_STATUS_LABEL: Record<RefundStatus, string> = {
  PENDING: "검토 중",
  APPROVED: "승인됨",
  REJECTED: "거절됨",
  COMPLETED: "환불 완료",
  CANCELLED: "취소됨",
};

const REFUND_TYPE_LABEL: Record<RefundType, string> = {
  CARD_CANCEL: "카드 당일 취소",
  CASH: "현금 환불",
  TRANSFER: "계좌이체 환불",
  PARTIAL: "부분 환불",
};

// ─── Timeline step config ──────────────────────────────────────────────────────

type TimelineStep = {
  status: RefundStatus;
  label: string;
  description: string;
};

const TIMELINE_STEPS: TimelineStep[] = [
  {
    status: RefundStatus.PENDING,
    label: "환불 신청",
    description: "환불 요청이 접수되어 검토 중입니다.",
  },
  {
    status: RefundStatus.APPROVED,
    label: "승인",
    description: "담당자가 환불을 승인하였습니다.",
  },
  {
    status: RefundStatus.COMPLETED,
    label: "환불 완료",
    description: "환불이 처리 완료되었습니다.",
  },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(date: Date): string {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function formatDateTime(date: Date): string {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${formatDate(date)} ${h}:${m}`;
}

function getStatusColor(status: RefundStatus): string {
  switch (status) {
    case RefundStatus.COMPLETED:
      return "border-forest/20 bg-forest/10 text-forest";
    case RefundStatus.APPROVED:
      return "border-blue-200 bg-blue-50 text-blue-700";
    case RefundStatus.PENDING:
      return "border-amber-200 bg-amber-50 text-amber-700";
    case RefundStatus.REJECTED:
      return "border-red-200 bg-red-50 text-red-700";
    case RefundStatus.CANCELLED:
      return "border-ink/10 bg-mist text-slate";
    default:
      return "border-ink/10 bg-mist text-slate";
  }
}

// Returns index in TIMELINE_STEPS that is "reached" for a given status
// REJECTED and CANCELLED are terminal but not on the main happy path
function getTimelineProgress(status: RefundStatus): number {
  switch (status) {
    case RefundStatus.PENDING:
      return 0;
    case RefundStatus.APPROVED:
      return 1;
    case RefundStatus.COMPLETED:
      return 2;
    case RefundStatus.REJECTED:
    case RefundStatus.CANCELLED:
      return -1; // terminal failure path
    default:
      return 0;
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function RefundStatusPage({
  params,
}: {
  params: Promise<{ paymentId: string }>;
}) {
  if (!hasDatabaseConfig()) {
    redirect("/student/login");
  }

  const viewer = await getStudentPortalViewer();
  if (!viewer) {
    redirect("/student/login");
  }

  const branding = await getAcademyRuntimeBranding(viewer.academyId ?? undefined);
  const { paymentId } = await params;

  // Fetch the payment (ownership check)
  const payment = await getPrisma().payment.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      examNumber: true,
      netAmount: true,
      processedAt: true,
      refunds: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          refundType: true,
          status: true,
          amount: true,
          reason: true,
          rejectionReason: true,
          approvedAt: true,
          rejectedAt: true,
          processedAt: true,
          createdAt: true,
          bankName: true,
          accountNo: true,
          accountHolder: true,
          cardCancelNo: true,
        },
      },
    },
  });

  if (!payment) notFound();
  if (payment.examNumber !== viewer.examNumber) notFound();

  const refunds = payment.refunds;

  return (
    <main className="space-y-6 px-0 py-6">
      {/* Back + header */}
      <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
        <div className="flex items-center gap-3">
          <Link
            href={`/student/payments/${paymentId}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 px-4 py-2 text-sm text-slate transition hover:border-ink/30 hover:text-ink"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            수납 영수증
          </Link>
        </div>

        <div className="mt-6">
          <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
            환불 현황
          </div>
          <h1 className="mt-4 text-2xl font-semibold text-ink sm:text-3xl">환불 신청 현황</h1>
          <p className="mt-2 text-sm text-slate">
            수납일: {formatDate(new Date(payment.processedAt))} &nbsp;|&nbsp; 수납액:{" "}
            {payment.netAmount.toLocaleString("ko-KR")}원
          </p>
        </div>
      </section>

      {/* No refunds case */}
      {refunds.length === 0 && (
        <section className="rounded-[32px] border border-ink/10 bg-white p-8 text-center shadow-panel">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-mist">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-8 w-8 text-slate"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <p className="text-base font-medium text-ink">환불 내역이 없습니다.</p>
          <p className="mt-1 text-sm text-slate">이 수납 건에 대한 환불 신청이 없습니다.</p>
        </section>
      )}

      {/* Refund cards */}
      {refunds.map((refund, idx) => {
        const progress = getTimelineProgress(refund.status);
        const isTerminalFailure =
          refund.status === RefundStatus.REJECTED ||
          refund.status === RefundStatus.CANCELLED;

        return (
          <section
            key={refund.id}
            className="overflow-hidden rounded-[32px] border border-ink/10 bg-white shadow-panel"
          >
            {/* Card header */}
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink/10 bg-mist/50 px-6 py-5 sm:px-8">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">
                  환불 #{idx + 1}
                </p>
                <p className="mt-1 text-lg font-semibold text-ink">
                  {refund.amount.toLocaleString("ko-KR")}원
                </p>
                <p className="mt-0.5 text-sm text-slate">
                  {REFUND_TYPE_LABEL[refund.refundType]}
                </p>
              </div>
              <span
                className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getStatusColor(refund.status)}`}
              >
                {REFUND_STATUS_LABEL[refund.status]}
              </span>
            </div>

            <div className="px-6 py-6 sm:px-8">
              {/* Timeline */}
              {!isTerminalFailure ? (
                <div className="mb-8">
                  <h2 className="mb-5 text-sm font-semibold text-ink">처리 단계</h2>
                  <div className="relative">
                    {/* Connecting line */}
                    <div
                      className="absolute left-4 top-4 h-[calc(100%-2rem)] w-0.5 bg-ink/10"
                      aria-hidden="true"
                    />

                    <ol className="space-y-6">
                      {TIMELINE_STEPS.map((step, stepIdx) => {
                        const reached = stepIdx <= progress;
                        const current = stepIdx === progress;

                        return (
                          <li key={step.status} className="relative flex items-start gap-5">
                            {/* Step dot */}
                            <div
                              className={`relative z-10 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border-2 ${
                                reached
                                  ? current
                                    ? "border-ember bg-ember"
                                    : "border-forest bg-forest"
                                  : "border-ink/15 bg-white"
                              }`}
                            >
                              {reached && !current ? (
                                // Checkmark for completed steps
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  className="h-4 w-4 text-white"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  strokeWidth={2.5}
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M5 13l4 4L19 7"
                                  />
                                </svg>
                              ) : current ? (
                                // Pulse dot for current
                                <span className="h-2.5 w-2.5 rounded-full bg-white" />
                              ) : (
                                // Upcoming
                                <span className="h-2 w-2 rounded-full bg-ink/20" />
                              )}
                            </div>

                            {/* Step text */}
                            <div className="pt-0.5">
                              <p
                                className={`text-sm font-semibold ${
                                  reached ? "text-ink" : "text-slate/50"
                                }`}
                              >
                                {step.label}
                                {current && (
                                  <span className="ml-2 inline-flex rounded-full bg-ember/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ember">
                                    현재
                                  </span>
                                )}
                              </p>
                              <p
                                className={`mt-0.5 text-xs ${
                                  reached ? "text-slate" : "text-slate/40"
                                }`}
                              >
                                {step.description}
                              </p>
                              {/* Show timestamp for reached steps */}
                              {reached && (
                                <p className="mt-1 text-[11px] text-slate/60">
                                  {step.status === RefundStatus.PENDING &&
                                    refund.createdAt &&
                                    formatDateTime(new Date(refund.createdAt))}
                                  {step.status === RefundStatus.APPROVED &&
                                    refund.approvedAt &&
                                    formatDateTime(new Date(refund.approvedAt))}
                                  {step.status === RefundStatus.COMPLETED &&
                                    refund.processedAt &&
                                    formatDateTime(new Date(refund.processedAt))}
                                </p>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                </div>
              ) : (
                /* Rejected / Cancelled banner */
                <div
                  className={`mb-6 rounded-[20px] border p-4 ${
                    refund.status === RefundStatus.REJECTED
                      ? "border-red-200 bg-red-50"
                      : "border-ink/10 bg-mist"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className={`mt-0.5 h-5 w-5 flex-shrink-0 ${
                        refund.status === RefundStatus.REJECTED
                          ? "text-red-500"
                          : "text-slate"
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                      />
                    </svg>
                    <div>
                      <p
                        className={`text-sm font-semibold ${
                          refund.status === RefundStatus.REJECTED
                            ? "text-red-700"
                            : "text-slate"
                        }`}
                      >
                        {refund.status === RefundStatus.REJECTED
                          ? "환불이 거절되었습니다."
                          : "환불 신청이 취소되었습니다."}
                      </p>
                      {refund.rejectionReason && (
                        <p className="mt-1 text-sm text-red-600">{refund.rejectionReason}</p>
                      )}
                      {refund.rejectedAt && (
                        <p className="mt-1 text-xs text-red-500/70">
                          {formatDateTime(new Date(refund.rejectedAt))}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Detail info */}
              <div className="space-y-0 divide-y divide-ink/6 rounded-[20px] border border-ink/10 text-sm">
                <div className="flex justify-between px-5 py-3">
                  <span className="text-slate">환불 사유</span>
                  <span className="max-w-[60%] text-right font-medium text-ink">
                    {refund.reason || "-"}
                  </span>
                </div>
                <div className="flex justify-between px-5 py-3">
                  <span className="text-slate">환불 유형</span>
                  <span className="font-medium text-ink">
                    {REFUND_TYPE_LABEL[refund.refundType]}
                  </span>
                </div>
                <div className="flex justify-between px-5 py-3">
                  <span className="text-slate">환불 금액</span>
                  <span className="font-semibold tabular-nums text-ember">
                    {refund.amount.toLocaleString("ko-KR")}원
                  </span>
                </div>
                <div className="flex justify-between px-5 py-3">
                  <span className="text-slate">신청일</span>
                  <span className="tabular-nums text-ink">
                    {formatDate(new Date(refund.createdAt))}
                  </span>
                </div>
                {refund.processedAt &&
                  refund.status === RefundStatus.COMPLETED && (
                    <div className="flex justify-between px-5 py-3">
                      <span className="text-slate">환불 완료일</span>
                      <span className="tabular-nums text-forest">
                        {formatDate(new Date(refund.processedAt))}
                      </span>
                    </div>
                  )}
                {/* Bank account info (when applicable) */}
                {(refund.bankName ?? refund.accountNo ?? refund.accountHolder) && (
                  <div className="flex justify-between px-5 py-3">
                    <span className="text-slate">환불 계좌</span>
                    <span className="text-right font-medium text-ink">
                      {[refund.bankName, refund.accountNo, refund.accountHolder]
                        .filter(Boolean)
                        .join(" / ")}
                    </span>
                  </div>
                )}
                {/* Card cancel number */}
                {refund.cardCancelNo && (
                  <div className="flex justify-between px-5 py-3">
                    <span className="text-slate">카드 취소 번호</span>
                    <span className="tabular-nums font-medium text-ink">
                      {refund.cardCancelNo}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </section>
        );
      })}

      {/* Summary total */}
      {refunds.length > 1 && (
        <section className="rounded-[32px] border border-ink/10 bg-white px-6 py-5 shadow-panel sm:px-8">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-ink">총 환불 신청액</span>
            <span className="text-lg font-bold tabular-nums text-ember">
              {refunds
                .reduce((s, r) => s + r.amount, 0)
                .toLocaleString("ko-KR")}
              원
            </span>
          </div>
          {(() => {
            const completed = refunds
              .filter((r) => r.status === RefundStatus.COMPLETED)
              .reduce((s, r) => s + r.amount, 0);
            if (completed > 0) {
              return (
                <div className="mt-2 flex items-center justify-between border-t border-ink/6 pt-2">
                  <span className="text-sm text-slate">환불 완료액</span>
                  <span className="text-base font-bold tabular-nums text-forest">
                    {completed.toLocaleString("ko-KR")}원
                  </span>
                </div>
              );
            }
            return null;
          })()}
        </section>
      )}

      {/* Help note */}
      <section className="rounded-[28px] border border-amber-200 bg-amber-50 px-5 py-4">
        <div className="flex items-start gap-3">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div>
            <p className="text-sm font-semibold text-amber-800">안내</p>
            <p className="mt-0.5 text-xs leading-relaxed text-amber-700">
              환불 처리 관련 문의는 {branding.academyName} 행정실
              {branding.phone ? `(${branding.phone})` : ""}로 연락해 주세요.
              영업시간: 평일 09:00~21:00 / 주말 09:00~18:00
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
