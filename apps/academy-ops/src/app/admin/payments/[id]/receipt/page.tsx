import { AdminRole, PaymentMethod } from '@prisma/client';
import { notFound } from 'next/navigation';
import { requireAdminContext } from '@/lib/auth';
import { getPrisma } from '@/lib/prisma';
import {
  buildScopedEnrollmentWhere,
  buildScopedPaymentWhere,
  getVisiblePaymentAcademyId,
} from '../payment-scope';
import { PrintButton } from './print-button';

export const dynamic = 'force-dynamic';

const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: '현금',
  CARD: '카드',
  TRANSFER: '계좌이체',
  POINT: '포인트',
  MIXED: '혼합',
};

const PAYMENT_CATEGORY_LABEL: Record<string, string> = {
  TUITION: '수강료',
  FACILITY: '시설비',
  TEXTBOOK: '교재',
  MATERIAL: '교구·모의물',
  SINGLE_COURSE: '단과',
  PENALTY: '위약금',
  ETC: '기타',
};

function formatDate(value: Date) {
  const yyyy = value.getFullYear();
  const mm = String(value.getMonth() + 1).padStart(2, '0');
  const dd = String(value.getDate()).padStart(2, '0');
  return `${yyyy}.${mm}.${dd}`;
}

function formatDateTime(value: Date) {
  const hh = String(value.getHours()).padStart(2, '0');
  const mi = String(value.getMinutes()).padStart(2, '0');
  return `${formatDate(value)} ${hh}:${mi}`;
}

function formatKRW(amount: number) {
  return `${amount.toLocaleString('ko-KR')}원`;
}

export default async function PaymentReceiptPage({
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
          include: {
            student: { select: { examNumber: true, name: true, phone: true } },
            processor: { select: { name: true } },
            items: {
              select: {
                id: true,
                itemName: true,
                unitPrice: true,
                quantity: true,
                amount: true,
              },
              orderBy: { id: 'asc' },
            },
            refunds: {
              where: { status: 'COMPLETED' },
              select: {
                id: true,
                amount: true,
                reason: true,
                processedAt: true,
              },
              orderBy: { processedAt: 'asc' },
            },
          },
        })
      : await prisma.payment.findFirst({
          where: buildScopedPaymentWhere(id, academyId),
          include: {
            student: { select: { examNumber: true, name: true, phone: true } },
            processor: { select: { name: true } },
            items: {
              select: {
                id: true,
                itemName: true,
                unitPrice: true,
                quantity: true,
                amount: true,
              },
              orderBy: { id: 'asc' },
            },
            refunds: {
              where: { status: 'COMPLETED' },
              select: {
                id: true,
                amount: true,
                reason: true,
                processedAt: true,
              },
              orderBy: { processedAt: 'asc' },
            },
          },
        });

  if (!payment) notFound();

  let enrollmentLabel: string | null = null;
  if (payment.enrollmentId) {
    const enrollment =
      academyId === null
        ? await prisma.courseEnrollment.findUnique({
            where: { id: payment.enrollmentId },
            include: {
              cohort: { select: { name: true } },
              specialLecture: { select: { name: true } },
              product: { select: { name: true } },
            },
          })
        : await prisma.courseEnrollment.findFirst({
            where: buildScopedEnrollmentWhere(payment.enrollmentId, academyId),
            include: {
              cohort: { select: { name: true } },
              specialLecture: { select: { name: true } },
              product: { select: { name: true } },
            },
          });

    enrollmentLabel =
      enrollment?.cohort?.name ?? enrollment?.specialLecture?.name ?? enrollment?.product?.name ?? null;
  }

  const receiptNo = payment.id.slice(-8).toUpperCase();
  const processedAt = new Date(payment.processedAt);
  const totalRefunded = payment.refunds.reduce((sum, refund) => sum + refund.amount, 0);

  return (
    <div className="min-h-screen bg-[#F7F4EF]">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; margin: 0; padding: 0; }
          @page { size: A4 portrait; margin: 15mm; }
          .receipt-wrapper { padding: 0 !important; background: white !important; display: flex !important; justify-content: center !important; }
          .receipt-paper { width: 100% !important; max-width: none !important; box-shadow: none !important; border-radius: 0 !important; }
        }
      `}</style>

      <div className="no-print flex items-center justify-between gap-4 border-b border-[#111827]/10 bg-white px-6 py-4">
        <a
          href={`/admin/payments/${id}`}
          className="inline-flex items-center gap-2 rounded-full border border-[#111827]/10 px-4 py-2 text-sm text-[#4B5563] transition hover:border-[#111827]/30"
        >
          ← 결제 상세로
        </a>
        <div className="flex items-center gap-3">
          <span className="text-sm text-[#4B5563]">영수증 #{receiptNo}</span>
          <PrintButton />
        </div>
      </div>

      <div className="receipt-wrapper flex justify-center p-8">
        <div
          className="receipt-paper w-full max-w-[620px] overflow-hidden rounded-[16px] border border-[#111827]/15 bg-white shadow-xl"
          style={{ fontFamily: "'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif" }}
        >
          <div className="px-10 pb-6 pt-8" style={{ backgroundColor: '#1F4D3A' }}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/60">ACADEMY OPS</p>
                <p className="mt-1.5 text-3xl font-bold tracking-wide text-white">결제 영수증</p>
                <p className="mt-1 text-xs text-white/50">PAYMENT RECEIPT</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] text-white/60">영수증 번호</p>
                <p className="mt-1 text-lg font-bold tracking-widest text-white">#{receiptNo}</p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 px-10 py-2.5 text-[11px] text-white" style={{ backgroundColor: '#C55A11' }}>
            <span className="font-semibold">학원명 미설정</span>
            <span>학원 주소는 관리자 설정을 확인하세요 · 연락처는 관리자 설정을 확인하세요</span>
          </div>

          <div className="flex justify-between px-10 pt-5 text-sm">
            <div>
              <span className="text-[#4B5563]">결제일시 </span>
              <span className="font-semibold text-[#111827]">{formatDateTime(processedAt)}</span>
            </div>
            <div>
              <span className="text-[#4B5563]">수납 유형 </span>
              <span className="font-semibold text-[#111827]">{PAYMENT_CATEGORY_LABEL[payment.category] ?? payment.category}</span>
            </div>
          </div>

          <div className="mx-10 my-4 border-t border-dashed border-[#111827]/15" />

          <div className="px-10">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#4B5563]">수납자 정보</p>
            <div className="space-y-0 divide-y divide-[#111827]/6 text-sm">
              <div className="flex justify-between py-2.5">
                <span className="text-[#4B5563]">학생명</span>
                <span className="font-medium text-[#111827]">{payment.student?.name ?? '비회원'}</span>
              </div>
              {(payment.student?.examNumber ?? payment.examNumber) ? (
                <div className="flex justify-between py-2.5">
                  <span className="text-[#4B5563]">학번</span>
                  <span className="font-medium tabular-nums text-[#111827]">{payment.student?.examNumber ?? payment.examNumber}</span>
                </div>
              ) : null}
              {payment.student?.phone ? (
                <div className="flex justify-between py-2.5">
                  <span className="text-[#4B5563]">연락처</span>
                  <span className="font-medium tabular-nums text-[#111827]">{payment.student.phone}</span>
                </div>
              ) : null}
              {enrollmentLabel ? (
                <div className="flex justify-between py-2.5">
                  <span className="text-[#4B5563]">연결 수강</span>
                  <span className="max-w-[280px] text-right font-medium leading-snug text-[#111827]">{enrollmentLabel}</span>
                </div>
              ) : null}
            </div>
          </div>

          <div className="mx-10 my-4 border-t border-dashed border-[#111827]/15" />

          <div className="px-10">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#4B5563]">결제 항목</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-[#111827]/10 text-[11px] text-[#4B5563]">
                  <th className="py-2 text-left font-medium">항목</th>
                  <th className="py-2 text-center font-medium">단가</th>
                  <th className="py-2 text-center font-medium">수량</th>
                  <th className="py-2 text-right font-medium">금액</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#111827]/6">
                {payment.items.map((item) => (
                  <tr key={item.id}>
                    <td className="py-2.5 text-[#111827]">{item.itemName}</td>
                    <td className="py-2.5 text-center tabular-nums text-[#4B5563]">{formatKRW(item.unitPrice)}</td>
                    <td className="py-2.5 text-center tabular-nums text-[#4B5563]">{item.quantity}</td>
                    <td className="py-2.5 text-right font-medium tabular-nums text-[#111827]">{formatKRW(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mx-10 mt-3 space-y-0 divide-y divide-[#111827]/6 border-t border-[#111827]/15 text-sm">
            <div className="flex justify-between py-2">
              <span className="text-[#4B5563]">총 청구금액</span>
              <span className="tabular-nums text-[#111827]">{formatKRW(payment.grossAmount)}</span>
            </div>
            {payment.discountAmount > 0 ? (
              <div className="flex justify-between py-2">
                <span className="text-[#4B5563]">할인금액</span>
                <span className="tabular-nums text-red-600">-{formatKRW(payment.discountAmount)}</span>
              </div>
            ) : null}
            {payment.couponAmount > 0 ? (
              <div className="flex justify-between py-2">
                <span className="text-[#4B5563]">쿠폰 할인</span>
                <span className="tabular-nums text-red-600">-{formatKRW(payment.couponAmount)}</span>
              </div>
            ) : null}
            {payment.pointAmount > 0 ? (
              <div className="flex justify-between py-2">
                <span className="text-[#4B5563]">포인트 사용</span>
                <span className="tabular-nums text-red-600">-{formatKRW(payment.pointAmount)}</span>
              </div>
            ) : null}
            <div className="flex justify-between py-3">
              <span className="font-bold text-[#111827]">최종 수납액</span>
              <span className="text-xl font-bold tabular-nums text-[#1F4D3A]">{formatKRW(payment.netAmount)}</span>
            </div>
          </div>

          <div className="mx-10 mt-1 space-y-0 divide-y divide-[#111827]/6 border-t border-[#111827]/10 text-sm">
            <div className="flex justify-between py-2">
              <span className="text-[#4B5563]">결제 수단</span>
              <span className="font-medium text-[#111827]">{PAYMENT_METHOD_LABEL[payment.method] ?? payment.method}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-[#4B5563]">처리 담당</span>
              <span className="font-medium text-[#111827]">{payment.processor?.name ?? '-'}</span>
            </div>
            {payment.cashReceiptNo ? (
              <div className="flex justify-between py-2">
                <span className="text-[#4B5563]">현금영수증 승인번호</span>
                <span className="font-medium text-[#111827]">{payment.cashReceiptNo}</span>
              </div>
            ) : null}
          </div>

          {payment.refunds.length > 0 ? (
            <>
              <div className="mx-10 my-4 border-t border-dashed border-red-200" />
              <div className="px-10">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-red-600">환불 이력</p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-y border-red-100 text-[11px] text-red-500">
                      <th className="py-1.5 text-left font-medium">환불일</th>
                      <th className="py-1.5 text-left font-medium">사유</th>
                      <th className="py-1.5 text-right font-medium">금액</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-red-50">
                    {payment.refunds.map((refund) => (
                      <tr key={refund.id}>
                        <td className="py-2 text-[#4B5563]">{formatDate(new Date(refund.processedAt))}</td>
                        <td className="py-2 text-[#4B5563]">{refund.reason}</td>
                        <td className="py-2 text-right tabular-nums font-semibold text-red-600">-{formatKRW(refund.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex justify-between border-t border-red-100 pt-2 text-sm">
                  <span className="font-bold text-red-700">환불 합계</span>
                  <span className="tabular-nums font-bold text-red-700">-{formatKRW(totalRefunded)}</span>
                </div>
              </div>
            </>
          ) : null}

          <div className="mx-10 mb-8 mt-6">
            <div className="border-t-2 border-[#111827]/20" />
            <p className="mt-5 text-center text-lg font-bold text-[#111827]">상기 금액을 정히 영수합니다.</p>
            <div className="mt-5 flex items-end justify-between">
              <div className="text-sm text-[#4B5563]">
                <p>{formatDate(processedAt)}</p>
                <p className="mt-1 font-semibold text-[#111827]">학원명 미설정</p>
                <p className="text-xs text-[#4B5563]">학원 주소는 관리자 설정을 확인하세요</p>
              </div>
              <div className="flex flex-col items-center gap-1">
                <div className="flex h-20 w-20 flex-col items-center justify-center rounded-full border-[2.5px] border-[#C55A11] text-center text-[#C55A11]">
                  <span className="text-[11px] font-bold leading-tight">한국경찰</span>
                  <span className="text-[11px] font-bold leading-tight">학원</span>
                  <span className="mt-0.5 text-[10px]">(인)</span>
                </div>
                <span className="text-xs text-[#4B5563]">원장</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <p className="no-print mt-2 pb-8 text-center text-xs text-[#4B5563]/60">
        인쇄 시 용지 크기를 A4로 선택하고 여백을 15mm로 설정하세요.
      </p>
    </div>
  );
}
