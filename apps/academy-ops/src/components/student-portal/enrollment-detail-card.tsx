"use client";

import { useState } from "react";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type EnrollmentDetail = {
  id: string;
  courseType: string;
  courseTypeLabel: string;
  productName: string | null;
  specialLectureName: string | null;
  cohortName: string | null;
  cohortStartDate: string | null;
  cohortEndDate: string | null;
  status: string;
  statusLabel: string;
  statusColor: string;
  startDate: string | null;
  endDate: string | null;
  regularFee: number;
  discountAmount: number;
  finalFee: number;
  createdAt: string;
  isPrimary: boolean;
  // Payment summary
  totalPaid: number;
  outstandingAmount: number;
  lastPaymentAt: string | null;
  // Installments (unpaid only, abbreviated)
  unpaidInstallments: Array<{
    id: string;
    seq: number;
    amount: number;
    dueDate: string | null;
  }>;
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatAmount(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function calcRemainingDays(endDate: string | null): number | null {
  if (!endDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  return Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function EnrollmentDetailCard({ enrollment }: { enrollment: EnrollmentDetail }) {
  const [expanded, setExpanded] = useState(enrollment.isPrimary);

  const remainingDays = calcRemainingDays(enrollment.cohortEndDate ?? enrollment.endDate);
  const effectiveEnd = enrollment.cohortEndDate ?? enrollment.endDate;
  const effectiveStart = enrollment.cohortStartDate ?? enrollment.startDate;

  const courseName =
    enrollment.productName ??
    enrollment.specialLectureName ??
    enrollment.courseTypeLabel;

  return (
    <article
      className={`overflow-hidden rounded-[28px] border transition-all ${
        enrollment.isPrimary
          ? "border-forest/30 bg-white shadow-panel"
          : "border-ink/10 bg-white"
      }`}
    >
      {/* ── Card header (always visible) ── */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left transition hover:bg-mist/40"
        aria-expanded={expanded}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${enrollment.statusColor}`}
            >
              {enrollment.statusLabel}
            </span>
            {enrollment.isPrimary && (
              <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-2.5 py-0.5 text-xs font-semibold text-forest">
                현재 과정
              </span>
            )}
            {remainingDays !== null && remainingDays >= 0 && (
              <span
                className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                  remainingDays <= 7
                    ? "border-red-200 bg-red-50 text-red-700"
                    : remainingDays <= 14
                    ? "border-amber-200 bg-amber-50 text-amber-700"
                    : "border-sky-200 bg-sky-50 text-sky-700"
                }`}
              >
                D-{remainingDays}
              </span>
            )}
            {remainingDays !== null && remainingDays < 0 && (
              <span className="inline-flex rounded-full border border-ink/10 bg-mist px-2.5 py-0.5 text-xs font-semibold text-slate">
                종료
              </span>
            )}
          </div>

          <p className="mt-2 text-base font-semibold text-ink">
            {enrollment.courseTypeLabel}
            {courseName !== enrollment.courseTypeLabel ? ` · ${courseName}` : ""}
          </p>

          {enrollment.cohortName && (
            <p className="mt-0.5 text-sm text-slate">{enrollment.cohortName}</p>
          )}

          {effectiveStart && (
            <p className="mt-1 text-xs text-slate">
              {formatDate(effectiveStart)}
              {effectiveEnd ? ` ~ ${formatDate(effectiveEnd)}` : ""}
            </p>
          )}
        </div>

        <div className="flex flex-shrink-0 flex-col items-end gap-1 pt-0.5">
          <p className="text-base font-bold text-forest">{formatAmount(enrollment.finalFee)}</p>
          {enrollment.discountAmount > 0 && (
            <p className="text-xs text-ember">- {formatAmount(enrollment.discountAmount)}</p>
          )}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className={`mt-1 h-4 w-4 text-slate transition-transform ${expanded ? "rotate-180" : ""}`}
          >
            <path
              fillRule="evenodd"
              d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      </button>

      {/* ── Expanded detail ── */}
      {expanded && (
        <div className="border-t border-ink/10 px-5 pb-5 pt-4">
          {/* Cohort period */}
          {(effectiveStart || effectiveEnd) && (
            <section className="mb-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate">
                수강 기간
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-[20px] border border-ink/10 bg-mist px-4 py-3">
                  <p className="text-xs text-slate">시작일</p>
                  <p className="mt-1.5 text-sm font-semibold">{formatDate(effectiveStart)}</p>
                </div>
                <div className="rounded-[20px] border border-ink/10 bg-mist px-4 py-3">
                  <p className="text-xs text-slate">종료일</p>
                  <p className="mt-1.5 text-sm font-semibold">{formatDate(effectiveEnd)}</p>
                </div>
                <div
                  className={`rounded-[20px] border px-4 py-3 ${
                    remainingDays === null
                      ? "border-ink/10 bg-mist"
                      : remainingDays < 0
                      ? "border-ink/10 bg-mist"
                      : remainingDays <= 7
                      ? "border-red-200 bg-red-50"
                      : remainingDays <= 14
                      ? "border-amber-200 bg-amber-50"
                      : "border-sky-200 bg-sky-50"
                  }`}
                >
                  <p className="text-xs text-slate">남은 일수</p>
                  <p
                    className={`mt-1.5 text-sm font-semibold ${
                      remainingDays === null || remainingDays < 0
                        ? "text-slate"
                        : remainingDays <= 7
                        ? "text-red-700"
                        : remainingDays <= 14
                        ? "text-amber-700"
                        : "text-sky-700"
                    }`}
                  >
                    {remainingDays === null
                      ? "—"
                      : remainingDays < 0
                      ? "종료됨"
                      : `${remainingDays}일`}
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* Payment summary */}
          <section className="mb-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate">
              수납 요약
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[20px] border border-ink/10 bg-mist px-4 py-3">
                <p className="text-xs text-slate">수강료</p>
                <p className="mt-1.5 text-sm font-semibold">{formatAmount(enrollment.regularFee)}</p>
                {enrollment.discountAmount > 0 && (
                  <p className="mt-0.5 text-xs text-ember">
                    할인 - {formatAmount(enrollment.discountAmount)}
                  </p>
                )}
              </div>
              <div className="rounded-[20px] border border-forest/20 bg-forest/5 px-4 py-3">
                <p className="text-xs text-slate">총 납부금액</p>
                <p className="mt-1.5 text-sm font-bold text-forest">
                  {formatAmount(enrollment.totalPaid)}
                </p>
                {enrollment.lastPaymentAt && (
                  <p className="mt-0.5 text-xs text-slate">
                    최근: {formatDate(enrollment.lastPaymentAt)}
                  </p>
                )}
              </div>
              <div
                className={`rounded-[20px] border px-4 py-3 ${
                  enrollment.outstandingAmount > 0
                    ? "border-amber-200 bg-amber-50"
                    : "border-ink/10 bg-mist"
                }`}
              >
                <p className="text-xs text-slate">잔여 납부 예정</p>
                <p
                  className={`mt-1.5 text-sm font-semibold ${
                    enrollment.outstandingAmount > 0 ? "text-amber-700" : "text-forest"
                  }`}
                >
                  {formatAmount(enrollment.outstandingAmount)}
                </p>
                {enrollment.outstandingAmount === 0 && (
                  <p className="mt-0.5 text-xs text-forest">납부 완료</p>
                )}
              </div>
            </div>
          </section>

          {/* Unpaid installments */}
          {enrollment.unpaidInstallments.length > 0 && (
            <section className="mb-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate">
                미납 분할납부 일정
              </p>
              <div className="overflow-hidden rounded-[20px] border border-amber-200 bg-amber-50/60">
                <table className="min-w-full divide-y divide-amber-200/70 text-sm">
                  <thead>
                    <tr className="bg-amber-50">
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-amber-700">
                        회차
                      </th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-amber-700">
                        납부 예정일
                      </th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-amber-700">
                        금액
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-200/50">
                    {enrollment.unpaidInstallments.map((inst) => {
                      const daysLeft = calcRemainingDays(inst.dueDate);
                      const isOverdue = daysLeft !== null && daysLeft < 0;
                      return (
                        <tr key={inst.id}>
                          <td className="px-4 py-2.5 font-medium text-ink">
                            {inst.seq}회차
                          </td>
                          <td className="px-4 py-2.5">
                            <span className={isOverdue ? "font-semibold text-red-700" : "text-ink"}>
                              {formatDate(inst.dueDate)}
                            </span>
                            {isOverdue && (
                              <span className="ml-1.5 text-xs text-red-500">
                                ({Math.abs(daysLeft!)}일 경과)
                              </span>
                            )}
                            {daysLeft !== null && daysLeft >= 0 && daysLeft <= 7 && (
                              <span className="ml-1.5 text-xs text-amber-600">
                                (D-{daysLeft})
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right font-semibold text-ink">
                            {formatAmount(inst.amount)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Refund contact info */}
          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate">
              환불 안내
            </p>
            <div className="rounded-[20px] border border-ink/10 bg-mist px-4 py-3 text-sm text-slate">
              <p>
                환불 신청은 학원 창구를 통해 접수할 수 있습니다. 방문 또는 전화로 문의해 주세요.
              </p>
              <p className="mt-1 font-medium text-ink">
                운영 문의는 학원 창구로 연락해 주세요.
              </p>
            </div>
          </section>
        </div>
      )}
    </article>
  );
}
