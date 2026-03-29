import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole, PaymentCategory, PaymentStatus } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { PrintButton } from "../enrollment-certificate/print-button";
import {
  PAYMENT_CATEGORY_LABEL,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
} from "@/lib/constants";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ examNumber: string }>;
};

function formatKoreanDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function formatAmount(amount: number): string {
  return amount.toLocaleString("ko-KR") + "원";
}

const CATEGORY_ORDER: PaymentCategory[] = [
  "TUITION",
  "SINGLE_COURSE",
  "TEXTBOOK",
  "MATERIAL",
  "FACILITY",
  "PENALTY",
  "ETC",
];

export default async function PaymentReceiptPage({ params }: PageProps) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const { examNumber } = await params;
  const prisma = getPrisma();

  const student = await prisma.student.findUnique({
    where: { examNumber },
    select: {
      examNumber: true,
      name: true,
      phone: true,
      birthDate: true,
    },
  });

  if (!student) notFound();

  const payments = await prisma.payment.findMany({
    where: {
      examNumber,
      status: { not: PaymentStatus.CANCELLED },
    },
    orderBy: { processedAt: "asc" },
    include: {
      items: true,
      refunds: {
        where: { status: "COMPLETED" },
        select: { amount: true },
      },
    },
  });

  // Group payments by category
  const grouped = new Map<PaymentCategory, typeof payments>();
  for (const cat of CATEGORY_ORDER) {
    grouped.set(cat, []);
  }
  for (const p of payments) {
    const arr = grouped.get(p.category) ?? [];
    arr.push(p);
    grouped.set(p.category, arr);
  }

  const grandTotal = payments.reduce((sum, p) => sum + p.netAmount, 0);
  const totalRefunded = payments.reduce(
    (sum, p) => sum + p.refunds.reduce((s, r) => s + r.amount, 0),
    0,
  );
  const netTotal = grandTotal - totalRefunded;

  const issuedAt = formatKoreanDate(new Date());

  return (
    <div
      className="min-h-screen bg-[#F7F4EF]"
      style={{ fontFamily: "'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif" }}
    >
      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; margin: 0; padding: 0; }
          .print-area {
            padding: 20mm 20mm !important;
            margin: 0 !important;
          }
          @page {
            size: A4 portrait;
            margin: 0;
          }
        }
      `}</style>

      {/* Top bar */}
      <div className="no-print flex flex-wrap items-center justify-between gap-4 border-b border-[#111827]/10 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <Link
            href={`/admin/students/${examNumber}/documents`}
            className="inline-flex items-center gap-2 rounded-full border border-[#111827]/10 px-4 py-2 text-sm text-[#4B5563] transition hover:border-[#111827]/30"
          >
            ← 서류 발급 목록
          </Link>
          <span className="text-lg font-bold text-[#111827]">납부확인서</span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/admin/students/${examNumber}/documents/enrollment-certificate`}
            className="inline-flex items-center gap-2 rounded-full border border-[#111827]/10 bg-white px-4 py-2 text-sm font-medium text-[#4B5563] transition hover:bg-[#F7F4EF]"
          >
            수강확인서 보기
          </Link>
          <PrintButton />
        </div>
      </div>

      {/* Document */}
      <div className="print-area flex justify-center px-8 py-10">
        {payments.length === 0 ? (
          <div className="w-full max-w-[680px] rounded-2xl border border-[#111827]/10 bg-white p-10 text-center">
            <p className="text-[#C55A11] text-lg font-semibold">납부 내역 없음</p>
            <p className="mt-2 text-sm text-[#4B5563]">
              이 학생의 납부 내역이 없어 서류를 발급할 수 없습니다.
            </p>
          </div>
        ) : (
          <div
            className="w-full max-w-[680px] rounded-2xl border border-[#111827]/15 bg-white shadow-lg"
            style={{ minHeight: "297mm" }}
          >
            <div className="px-16 py-16">
              {/* Academy header */}
              <div className="mb-10 text-center">
                <p className="text-xs font-semibold tracking-widest text-[#1F4D3A] uppercase">
                  학원명 미설정
                </p>
                <p className="mt-0.5 text-[10px] text-[#4B5563]">
                  학원 주소는 관리자 설정을 확인하세요 · 연락처는 관리자 설정을 확인하세요
                </p>
              </div>

              {/* Title */}
              <h1
                className="mb-10 text-center text-3xl font-bold text-[#111827]"
                style={{ letterSpacing: "0.5em" }}
              >
                납 부 확 인 서
              </h1>

              <p className="mb-8 text-center text-base leading-relaxed text-[#111827]">
                위 학생의 납부 내역을 다음과 같이 확인합니다.
              </p>

              {/* Student info */}
              <div className="mb-8 border border-[#111827]/20">
                <table className="w-full text-sm">
                  <tbody>
                    <tr className="border-b border-[#111827]/10">
                      <th className="w-32 bg-[#F7F4EF] px-5 py-3 text-left font-semibold text-[#111827]">
                        성&nbsp;&nbsp;&nbsp;&nbsp;명
                      </th>
                      <td className="px-5 py-3 text-[#111827]">{student.name}</td>
                      <th className="w-32 bg-[#F7F4EF] px-5 py-3 text-left font-semibold text-[#111827]">
                        수험번호
                      </th>
                      <td className="px-5 py-3 text-[#111827]">{student.examNumber}</td>
                    </tr>
                    <tr>
                      <th className="bg-[#F7F4EF] px-5 py-3 text-left font-semibold text-[#111827]">
                        생년월일
                      </th>
                      <td className="px-5 py-3 text-[#111827]">
                        {student.birthDate ? formatKoreanDate(student.birthDate) : "—"}
                      </td>
                      <th className="bg-[#F7F4EF] px-5 py-3 text-left font-semibold text-[#111827]">
                        연락처
                      </th>
                      <td className="px-5 py-3 text-[#111827]">{student.phone ?? "—"}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Payment groups */}
              {CATEGORY_ORDER.map((cat) => {
                const catPayments = grouped.get(cat) ?? [];
                if (catPayments.length === 0) return null;
                const catTotal = catPayments.reduce((s, p) => s + p.netAmount, 0);
                const catRefunded = catPayments.reduce(
                  (s, p) => s + p.refunds.reduce((rs, r) => rs + r.amount, 0),
                  0,
                );
                return (
                  <div key={cat} className="mb-5">
                    <div className="flex items-center justify-between bg-[#F7F4EF] px-4 py-2 text-sm font-semibold text-[#111827]">
                      <span>{PAYMENT_CATEGORY_LABEL[cat]}</span>
                      <span className="text-[#1F4D3A]">{formatAmount(catTotal - catRefunded)}</span>
                    </div>
                    <table className="w-full border border-t-0 border-[#111827]/20 text-xs">
                      <thead>
                        <tr className="border-b border-[#111827]/10 bg-white text-[#4B5563]">
                          <th className="px-4 py-2 text-left font-medium">날짜</th>
                          <th className="px-4 py-2 text-left font-medium">결제수단</th>
                          <th className="px-4 py-2 text-left font-medium">상태</th>
                          <th className="px-4 py-2 text-right font-medium">금액</th>
                          {catRefunded > 0 && (
                            <th className="px-4 py-2 text-right font-medium">환불</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {catPayments.map((p) => {
                          const refundAmt = p.refunds.reduce((s, r) => s + r.amount, 0);
                          return (
                            <tr
                              key={p.id}
                              className="border-b border-[#111827]/10 last:border-0"
                            >
                              <td className="px-4 py-2 text-[#111827]">
                                {formatKoreanDate(p.processedAt)}
                              </td>
                              <td className="px-4 py-2 text-[#111827]">
                                {PAYMENT_METHOD_LABEL[p.method]}
                              </td>
                              <td className="px-4 py-2 text-[#4B5563]">
                                {PAYMENT_STATUS_LABEL[p.status]}
                              </td>
                              <td className="px-4 py-2 text-right font-medium text-[#111827]">
                                {formatAmount(p.netAmount)}
                              </td>
                              {catRefunded > 0 && (
                                <td className="px-4 py-2 text-right text-[#C55A11]">
                                  {refundAmt > 0 ? `−${formatAmount(refundAmt)}` : "—"}
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })}

              {/* Grand total */}
              <div className="mb-10 border border-[#111827]/20 bg-[#F7F4EF]">
                <table className="w-full text-sm">
                  <tbody>
                    <tr className="border-b border-[#111827]/10">
                      <th className="px-5 py-3 text-left font-semibold text-[#111827]">
                        납부 합계
                      </th>
                      <td className="px-5 py-3 text-right font-bold text-[#111827]">
                        {formatAmount(grandTotal)}
                      </td>
                    </tr>
                    {totalRefunded > 0 && (
                      <tr className="border-b border-[#111827]/10">
                        <th className="px-5 py-3 text-left font-semibold text-[#C55A11]">
                          환불 합계
                        </th>
                        <td className="px-5 py-3 text-right font-bold text-[#C55A11]">
                          −{formatAmount(totalRefunded)}
                        </td>
                      </tr>
                    )}
                    <tr>
                      <th className="px-5 py-3 text-left font-semibold text-[#1F4D3A]">
                        실납부액
                      </th>
                      <td className="px-5 py-3 text-right text-xl font-bold text-[#1F4D3A]">
                        {formatAmount(netTotal)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="my-12" />

              <p className="mb-10 text-center text-base text-[#111827]">{issuedAt}</p>

              <div className="flex flex-col items-center gap-3">
                <div className="flex items-center gap-4">
                  <p className="text-base font-semibold text-[#111827]">학원장</p>
                  <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-[#C55A11] text-[10px] font-semibold text-[#C55A11]">
                    (인)
                  </div>
                </div>
                <p className="text-sm text-[#4B5563]">
                  학원 주소는 관리자 설정을 확인하세요
                </p>
                <p className="text-sm text-[#4B5563]">연락처는 관리자 설정을 확인하세요</p>
              </div>
            </div>
          </div>
        )}
      </div>

      <p className="no-print mt-2 pb-8 text-center text-xs text-[#4B5563]/60">
        인쇄 버튼을 누른 후 용지 크기를 A4로 선택하세요. PDF로 저장도 가능합니다.
      </p>
    </div>
  );
}
