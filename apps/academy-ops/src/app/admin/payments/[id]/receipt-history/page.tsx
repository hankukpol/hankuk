import { AdminRole, PaymentStatus } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import {
  PAYMENT_CATEGORY_LABEL,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_COLOR,
  PAYMENT_STATUS_LABEL,
} from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { buildScopedPaymentWhere, getVisiblePaymentAcademyId } from "../payment-scope";
import { ReceiptResendButton } from "../receipt-resend-button";

export const dynamic = "force-dynamic";

const REFUND_STATUS_LABEL: Record<string, string> = {
  PENDING: "대기",
  APPROVED: "승인",
  REJECTED: "거절",
  COMPLETED: "완료",
  CANCELLED: "취소",
};

const REFUND_TYPE_LABEL: Record<string, string> = {
  CARD_CANCEL: "카드 취소",
  CASH: "현금 환불",
  TRANSFER: "계좌이체",
  PARTIAL: "부분 환불",
};

const AUDIT_ACTION_LABEL: Record<string, string> = {
  CREATE_PAYMENT: "수납 등록",
  UPDATE_PAYMENT: "수납 수정",
  CREATE_REFUND: "환불 등록",
  APPROVE_REFUND: "환불 승인",
  REJECT_REFUND: "환불 거절",
  RESEND_PAYMENT_RECEIPT: "영수증 재발송",
};

const AUDIT_FIELD_LABEL: Record<string, string> = {
  status: "상태",
  method: "수납 방식",
  netAmount: "실수납액",
  grossAmount: "청구금액",
  discountAmount: "할인금액",
  couponAmount: "쿠폰 할인",
  pointAmount: "포인트 사용",
  note: "메모",
  reason: "사유",
  refundType: "환불 유형",
  amount: "금액",
};

type TimelineEvent = {
  id: string;
  type: "payment_created" | "refund" | "audit";
  timestamp: Date;
  title: string;
  description: string;
  amount?: number;
  amountIsNegative?: boolean;
  badge?: string;
  badgeColor?: string;
  actor?: string;
};

function formatKRW(amount: number) {
  return `${amount.toLocaleString("ko-KR")}원`;
}

function normalizeValue(key: string, value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  if (key === "status" && typeof value === "string") {
    return PAYMENT_STATUS_LABEL[value as PaymentStatus] ?? value;
  }

  if (key === "method" && typeof value === "string") {
    return PAYMENT_METHOD_LABEL[value as keyof typeof PAYMENT_METHOD_LABEL] ?? value;
  }

  if (
    ["netAmount", "grossAmount", "discountAmount", "couponAmount", "pointAmount", "amount"].includes(key) &&
    typeof value === "number"
  ) {
    return formatKRW(value);
  }

  return String(value);
}

function buildReceiptResendDescription(after: Record<string, unknown> | null) {
  if (!after) return "";

  const receiptNo = typeof after.receiptNo === "string" && after.receiptNo.trim()
    ? `영수증 #${after.receiptNo}`
    : "영수증";
  const status = typeof after.deliveryStatus === "string" ? after.deliveryStatus : null;
  const channel = typeof after.deliveryChannelLabel === "string"
    ? after.deliveryChannelLabel
    : typeof after.deliveryChannel === "string"
      ? after.deliveryChannel
      : null;
  const statusLabel =
    status === "sent"
      ? "발송 완료"
      : status === "failed"
        ? "발송 실패"
        : status === "skipped"
          ? "발송 제외"
          : status;
  const failReason = typeof after.failReason === "string" && after.failReason.trim() ? after.failReason : null;

  return [receiptNo, statusLabel, channel].filter(Boolean).join(" · ") + (failReason ? ` (${failReason})` : "");
}
function buildAuditDescription(action: string, before: Record<string, unknown> | null, after: Record<string, unknown> | null) {
  if (action === "RESEND_PAYMENT_RECEIPT") {
    return buildReceiptResendDescription(after);
  }

  if (before && after) {
    const changes = Object.keys(after)
      .filter((key) => before[key] !== after[key])
      .map((key) => {
        const label = AUDIT_FIELD_LABEL[key] ?? key;
        const prev = normalizeValue(key, before[key]);
        const next = normalizeValue(key, after[key]);
        return `${label}: ${prev} -> ${next}`;
      });

    return changes.join(", ");
  }

  if (after) {
    const relevantKeys = ["refundType", "amount", "status", "reason"];
    return relevantKeys
      .filter((key) => after[key] !== undefined)
      .map((key) => `${AUDIT_FIELD_LABEL[key] ?? key}: ${normalizeValue(key, after[key])}`)
      .join(", ");
  }

  return "";
}

export default async function PaymentReceiptHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const { id } = await params;
  const academyId = await getVisiblePaymentAcademyId();
  const prisma = getPrisma();

  const payment =
    academyId === null
      ? await prisma.payment.findUnique({
          where: { id },
          select: {
            id: true,
            examNumber: true,
            enrollmentId: true,
            category: true,
            method: true,
            status: true,
            grossAmount: true,
            discountAmount: true,
            couponAmount: true,
            pointAmount: true,
            netAmount: true,
            note: true,
            processedAt: true,
            createdAt: true,
            updatedAt: true,
            student: { select: { name: true, examNumber: true } },
            processor: { select: { name: true } },
            items: {
              orderBy: { id: "asc" },
              select: { id: true, itemName: true, amount: true, itemType: true },
            },
            refunds: {
              orderBy: { processedAt: "asc" },
              select: {
                id: true,
                refundType: true,
                status: true,
                amount: true,
                reason: true,
                rejectionReason: true,
                processedAt: true,
                processedBy: true,
              },
            },
          },
        })
      : await prisma.payment.findFirst({
          where: buildScopedPaymentWhere(id, academyId),
          select: {
            id: true,
            examNumber: true,
            enrollmentId: true,
            category: true,
            method: true,
            status: true,
            grossAmount: true,
            discountAmount: true,
            couponAmount: true,
            pointAmount: true,
            netAmount: true,
            note: true,
            processedAt: true,
            createdAt: true,
            updatedAt: true,
            student: { select: { name: true, examNumber: true } },
            processor: { select: { name: true } },
            items: {
              orderBy: { id: "asc" },
              select: { id: true, itemName: true, amount: true, itemType: true },
            },
            refunds: {
              orderBy: { processedAt: "asc" },
              select: {
                id: true,
                refundType: true,
                status: true,
                amount: true,
                reason: true,
                rejectionReason: true,
                processedAt: true,
                processedBy: true,
              },
            },
          },
        });

  if (!payment) {
    notFound();
  }

  const auditLogs = await prisma.auditLog.findMany({
    where: { targetType: "payment", targetId: id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      action: true,
      before: true,
      after: true,
      createdAt: true,
      admin: { select: { name: true } },
    },
  });

  const events: TimelineEvent[] = [
    {
      id: `payment-created-${payment.id}`,
      type: "payment_created",
      timestamp: payment.processedAt,
      title: "수납 등록",
      description: `${PAYMENT_CATEGORY_LABEL[payment.category] ?? payment.category} · ${
        PAYMENT_METHOD_LABEL[payment.method] ?? payment.method
      }`,
      amount: payment.netAmount,
      amountIsNegative: false,
      badge: "등록",
      badgeColor: "border-forest/30 bg-forest/10 text-forest",
      actor: payment.processor?.name ?? undefined,
    },
  ];

  for (const refund of payment.refunds) {
    const statusLabel = REFUND_STATUS_LABEL[refund.status] ?? refund.status;
    const typeLabel = REFUND_TYPE_LABEL[refund.refundType] ?? refund.refundType;
    const isRejected = refund.status === "REJECTED";
    const title =
      refund.status === "PENDING"
        ? `환불 요청: ${typeLabel}`
        : refund.status === "REJECTED"
          ? `환불 거절: ${typeLabel}`
          : `환불 처리: ${typeLabel}`;

    events.push({
      id: `refund-${refund.id}`,
      type: "refund",
      timestamp: refund.processedAt,
      title,
      description: refund.reason + (refund.rejectionReason ? ` (거절 사유: ${refund.rejectionReason})` : ""),
      amount: refund.amount,
      amountIsNegative: true,
      badge: statusLabel,
      badgeColor: isRejected
        ? "border-red-200 bg-red-50 text-red-700"
        : refund.status === "COMPLETED" || refund.status === "APPROVED"
          ? "border-forest/30 bg-forest/10 text-forest"
          : "border-amber-200 bg-amber-50 text-amber-800",
      actor: refund.processedBy ?? undefined,
    });
  }

  for (const log of auditLogs) {
    if (log.action === "CREATE_PAYMENT") {
      continue;
    }

    events.push({
      id: `audit-${log.id}`,
      type: "audit",
      timestamp: log.createdAt,
      title: AUDIT_ACTION_LABEL[log.action] ?? log.action,
      description:
        buildAuditDescription(
          log.action,
          
          (log.before as Record<string, unknown> | null) ?? null,
          (log.after as Record<string, unknown> | null) ?? null,
        ) || log.action,
      badge: "감사",
      badgeColor: "border-sky-200 bg-sky-50 text-sky-700",
      actor: log.admin?.name ?? undefined,
    });
  }

  events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  const totalRefunded = payment.refunds
    .filter((refund) => refund.status === "COMPLETED" || refund.status === "APPROVED")
    .reduce((sum, refund) => sum + refund.amount, 0);
  const netAfterRefund = payment.netAmount - totalRefunded;
  const studentName = payment.student?.name ?? "비회원";
  const examNumber = payment.student?.examNumber ?? payment.examNumber;

  return (
    <div className="p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "결제 관리", href: "/admin/payments" },
          { label: `#${id.slice(-6)}`, href: `/admin/payments/${id}` },
          { label: "영수증 이력" },
        ]}
      />

      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        영수증 이력
      </div>

      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-ink">
            {studentName}
            {examNumber ? (
              <span className="ml-2 text-lg font-normal text-slate">({examNumber})</span>
            ) : null}
          </h1>
          <p className="mt-1 text-sm text-slate">
            수납 #{id.slice(-8).toUpperCase()} · {PAYMENT_CATEGORY_LABEL[payment.category] ?? payment.category} ·{" "}
            {PAYMENT_METHOD_LABEL[payment.method] ?? payment.method}
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-3">
          {examNumber ? (
            <ReceiptResendButton paymentId={id} />
          ) : null}
          <Link
            href={`/admin/payments/${id}/receipt`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-forest/20 px-5 py-2.5 text-sm font-semibold text-forest transition hover:border-forest/50"
          >
            영수증 출력
          </Link>
          <Link
            href={`/admin/payments/${id}`}
            className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-5 py-2.5 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink"
          >
            결제 상세
          </Link>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[24px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-medium text-slate">수납 금액</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-ink">{formatKRW(payment.netAmount)}</p>
          <p className="mt-1 text-xs text-slate">최초 수납 기준</p>
        </div>
        <div className="rounded-[24px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-medium text-slate">환불 합계</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-red-600">
            {totalRefunded > 0 ? `-${formatKRW(totalRefunded)}` : formatKRW(0)}
          </p>
          <p className="mt-1 text-xs text-slate">승인·완료 환불 기준</p>
        </div>
        <div className="rounded-[24px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-medium text-slate">실수납액</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-forest">{formatKRW(netAfterRefund)}</p>
          <p className="mt-1 text-xs text-slate">환불 반영 후 금액</p>
        </div>
        <div className="rounded-[24px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-medium text-slate">현재 상태</p>
          <div className="mt-2">
            <span
              className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${PAYMENT_STATUS_COLOR[payment.status]}`}
            >
              {PAYMENT_STATUS_LABEL[payment.status]}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_340px]">
        <div>
          <h2 className="mb-6 text-base font-semibold text-ink">변경 이력 타임라인</h2>

          {events.length === 0 ? (
            <div className="rounded-[24px] border border-ink/10 bg-white px-6 py-12 text-center text-sm text-slate">
              표시할 이력이 없습니다.
            </div>
          ) : (
            <ol className="relative space-y-0 border-l-2 border-ink/10 pl-6">
              {events.map((event, index) => (
                <li key={event.id} className="relative pb-8 last:pb-0">
                  <span
                    className={`absolute -left-[25px] flex h-4 w-4 items-center justify-center rounded-full border-2 border-white ${
                      event.type === "payment_created"
                        ? "bg-forest"
                        : event.type === "refund"
                          ? "bg-red-500"
                          : "bg-sky-500"
                    }`}
                  />

                  <div className="rounded-[20px] border border-ink/10 bg-white p-5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-ink">{event.title}</span>
                        {event.badge ? (
                          <span
                            className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${event.badgeColor}`}
                          >
                            {event.badge}
                          </span>
                        ) : null}
                      </div>
                      <time className="whitespace-nowrap text-xs text-slate">
                        {formatDateTime(event.timestamp)}
                      </time>
                    </div>

                    {event.description ? (
                      <p className="mt-1.5 text-sm leading-6 text-slate">{event.description}</p>
                    ) : null}

                    <div className="mt-2 flex flex-wrap items-center gap-4">
                      {event.amount !== undefined ? (
                        <span
                          className={`text-sm font-bold tabular-nums ${
                            event.amountIsNegative ? "text-red-600" : "text-forest"
                          }`}
                        >
                          {event.amountIsNegative ? "-" : "+"}
                          {formatKRW(event.amount)}
                        </span>
                      ) : null}
                      {event.actor ? <span className="text-xs text-slate">처리자: {event.actor}</span> : null}
                    </div>
                  </div>

                  {index < events.length - 1 ? (
                    <div className="absolute -left-[17px] top-8 h-full w-0.5 bg-transparent" />
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </div>

        <aside>
          <h2 className="mb-4 text-base font-semibold text-ink">영수증 요약</h2>
          <div
            className="rounded-[24px] border border-ink/10 bg-white p-6"
            style={{ fontFamily: "'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif" }}
          >
            <div className="rounded-xl px-4 py-3" style={{ backgroundColor: "#1F4D3A" }}>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-white/60">
                ACADEMY OPS
              </p>
              <p className="mt-1 text-lg font-bold text-white">결제 영수증</p>
              <p className="text-[10px] text-white/50">#{id.slice(-8).toUpperCase()}</p>
            </div>

            <div
              className="rounded-b-none px-4 py-1.5 text-[10px] font-semibold text-white"
              style={{ backgroundColor: "#C55A11" }}
            >
              학원명 미설정 · 연락처는 관리자 설정을 확인하세요
            </div>

            <div className="mt-4 space-y-0 divide-y divide-ink/5 text-sm">
              <div className="flex justify-between py-2">
                <span className="text-slate">학생</span>
                <span className="font-medium text-ink">{studentName}</span>
              </div>
              {examNumber ? (
                <div className="flex justify-between py-2">
                  <span className="text-slate">학번</span>
                  <span className="tabular-nums text-ink">{examNumber}</span>
                </div>
              ) : null}
              <div className="flex justify-between py-2">
                <span className="text-slate">수납 일시</span>
                <span className="text-xs tabular-nums text-ink">{formatDateTime(payment.processedAt)}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-slate">수납 유형</span>
                <span className="text-ink">{PAYMENT_CATEGORY_LABEL[payment.category] ?? payment.category}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-slate">수납 방식</span>
                <span className="text-ink">{PAYMENT_METHOD_LABEL[payment.method] ?? payment.method}</span>
              </div>
            </div>

            {payment.items.length > 0 ? (
              <div className="mt-3 rounded-xl bg-mist/50 p-3">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate">
                  수납 항목
                </p>
                {payment.items.map((item) => (
                  <div key={item.id} className="flex justify-between text-xs">
                    <span className="text-slate">{item.itemName}</span>
                    <span className="tabular-nums font-medium text-ink">{formatKRW(item.amount)}</span>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="mt-3 space-y-1 border-t border-ink/10 pt-3 text-sm">
              {payment.discountAmount > 0 ? (
                <div className="flex justify-between">
                  <span className="text-slate">할인</span>
                  <span className="tabular-nums text-red-600">-{formatKRW(payment.discountAmount)}</span>
                </div>
              ) : null}
              {payment.couponAmount > 0 ? (
                <div className="flex justify-between">
                  <span className="text-slate">쿠폰 할인</span>
                  <span className="tabular-nums text-red-600">-{formatKRW(payment.couponAmount)}</span>
                </div>
              ) : null}
              {payment.pointAmount > 0 ? (
                <div className="flex justify-between">
                  <span className="text-slate">포인트 사용</span>
                  <span className="tabular-nums text-red-600">-{formatKRW(payment.pointAmount)}</span>
                </div>
              ) : null}
              <div className="flex justify-between font-bold">
                <span className="text-ink">실수납액</span>
                <span className="tabular-nums text-forest">{formatKRW(payment.netAmount)}</span>
              </div>
              {totalRefunded > 0 ? (
                <div className="flex justify-between text-xs">
                  <span className="text-red-600">환불 합계</span>
                  <span className="tabular-nums font-semibold text-red-600">-{formatKRW(totalRefunded)}</span>
                </div>
              ) : null}
            </div>

            <div className="mt-4 border-t border-ink/10 pt-3 text-center text-xs text-slate">
              <p>처리자: {payment.processor?.name ?? "-"}</p>
              <p className="mt-0.5">상기 금액을 정히 영수합니다.</p>
            </div>
          </div>

          <Link
            href={`/admin/payments/${id}/receipt`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-forest/20 bg-forest/5 py-2.5 text-sm font-semibold text-forest transition hover:bg-forest/10"
          >
            영수증 인쇄
          </Link>
        </aside>
      </div>
    </div>
  );
}
