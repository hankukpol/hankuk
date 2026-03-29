import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole, PaymentCategory } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

type PageProps = {
  params: { examNumber: string };
  searchParams?: Record<string, string | string[] | undefined>;
};

function formatKoreanDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  return phone;
}

function formatAmount(amount: number): string {
  return amount.toLocaleString("ko-KR") + "원";
}

function formatDateShort(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

const PAYMENT_CATEGORY_LABEL_KO: Record<PaymentCategory, string> = {
  TUITION: "수강료",
  FACILITY: "시설비",
  TEXTBOOK: "교재비",
  MATERIAL: "교구·소모품",
  SINGLE_COURSE: "단과 수강료",
  PENALTY: "위약금",
  ETC: "기타",
};

export default async function TaxCertificatePage({ params, searchParams }: PageProps) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const { examNumber } = params;

  // Determine target year
  const currentYear = new Date().getFullYear();
  const rawYear =
    typeof searchParams?.year === "string" ? parseInt(searchParams.year, 10) : NaN;
  const targetYear = !isNaN(rawYear) && rawYear > 2000 && rawYear < 2100 ? rawYear : currentYear;

  const yearStart = new Date(`${targetYear}-01-01T00:00:00.000Z`);
  const yearEnd = new Date(`${targetYear + 1}-01-01T00:00:00.000Z`);

  const prisma = getPrisma();

  // Fetch student
  const student = await prisma.student.findUnique({
    where: { examNumber },
    select: {
      examNumber: true,
      name: true,
      phone: true,
      registeredAt: true,
    },
  });

  if (!student) notFound();

  // Fetch course enrollments active in the target year
  const enrollments = await prisma.courseEnrollment.findMany({
    where: {
      examNumber,
      OR: [
        {
          startDate: {
            gte: yearStart,
            lt: yearEnd,
          },
        },
        {
          endDate: {
            gte: yearStart,
            lt: yearEnd,
          },
        },
      ],
    },
    orderBy: { startDate: "asc" },
    select: {
      id: true,
      courseType: true,
      startDate: true,
      endDate: true,
      finalFee: true,
      status: true,
      cohort: { select: { name: true } },
      specialLecture: { select: { name: true } },
      product: { select: { name: true } },
    },
  });

  // Fetch payments for this student in the target year with APPROVED status
  const payments = await prisma.payment.findMany({
    where: {
      examNumber,
      status: "APPROVED",
      createdAt: {
        gte: yearStart,
        lt: yearEnd,
      },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      category: true,
      method: true,
      grossAmount: true,
      discountAmount: true,
      netAmount: true,
      note: true,
      createdAt: true,
    },
  });

  const totalAmount = payments.reduce((sum, p) => sum + p.netAmount, 0);

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
            padding: 15mm 20mm !important;
            margin: 0 !important;
          }
          @page {
            size: B5 portrait;
            margin: 0;
          }
        }
      `}</style>

      {/* Top bar — hidden when printing */}
      <div className="no-print flex flex-wrap items-center justify-between gap-4 border-b border-[#111827]/10 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <Link
            href={`/admin/students/${examNumber}`}
            className="inline-flex items-center gap-2 rounded-full border border-[#111827]/10 px-4 py-2 text-sm text-[#4B5563] transition hover:border-[#111827]/30"
          >
            ← {student.name}
          </Link>
          <span className="text-lg font-bold text-[#111827]">교육비납입확인서</span>
        </div>

        <div className="flex items-center gap-3">
          {/* Year navigation */}
          <div className="flex items-center gap-1">
            <Link
              href={`/admin/students/${examNumber}/tax-certificate?year=${targetYear - 1}`}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#111827]/10 text-sm text-[#4B5563] transition hover:border-[#111827]/30"
            >
              ‹
            </Link>
            <span className="min-w-[80px] text-center text-sm font-semibold text-[#111827]">
              {targetYear}년도
            </span>
            <Link
              href={`/admin/students/${examNumber}/tax-certificate?year=${targetYear + 1}`}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#111827]/10 text-sm text-[#4B5563] transition hover:border-[#111827]/30"
            >
              ›
            </Link>
          </div>
          <PrintButton />
        </div>
      </div>

      {/* Document preview area */}
      <div className="print-area flex justify-center px-8 py-10">
        <div
          className="w-full max-w-2xl rounded-[28px] border border-[#111827]/15 bg-white shadow-lg"
          style={{ minHeight: "257mm" }}
        >
          <div className="px-14 py-14">
            {/* Title */}
            <h1
              className="mb-2 text-center text-2xl font-bold text-[#111827]"
              style={{ letterSpacing: "0.4em" }}
            >
              교육비납입확인서
            </h1>
            <p className="mb-8 text-center text-xs text-[#4B5563]">
              Education Fee Payment Certificate
            </p>

            {/* Year indicator */}
            <div className="mb-6 rounded-xl border border-[#1F4D3A]/20 bg-[#1F4D3A]/5 px-5 py-3 text-center">
              <span className="text-base font-semibold text-[#1F4D3A]">
                {targetYear}년도 교육비 납입 내역
              </span>
            </div>

            {/* Student info box */}
            <div className="mb-6 border border-[#111827]/20">
              <div className="bg-[#F7F4EF] px-5 py-3 text-sm font-semibold text-[#111827]">
                학생 정보
              </div>
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-t border-[#111827]/10">
                    <th className="w-28 bg-[#F7F4EF]/50 px-5 py-3 text-left font-medium text-[#111827]">
                      성&nbsp;&nbsp;&nbsp;&nbsp;명
                    </th>
                    <td className="px-5 py-3 font-semibold text-[#111827]">{student.name}</td>
                    <th className="w-28 bg-[#F7F4EF]/50 px-5 py-3 text-left font-medium text-[#111827]">
                      학&nbsp;&nbsp;&nbsp;&nbsp;번
                    </th>
                    <td className="px-5 py-3 text-[#111827]">{student.examNumber}</td>
                  </tr>
                  <tr className="border-t border-[#111827]/10">
                    <th className="bg-[#F7F4EF]/50 px-5 py-3 text-left font-medium text-[#111827]">
                      연락처
                    </th>
                    <td className="px-5 py-3 text-[#111827]">{formatPhone(student.phone)}</td>
                    <th className="bg-[#F7F4EF]/50 px-5 py-3 text-left font-medium text-[#111827]">
                      등록일
                    </th>
                    <td className="px-5 py-3 text-[#111827]">
                      {formatKoreanDate(student.registeredAt)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Enrollment summary */}
            {enrollments.length > 0 && (
              <div className="mb-6 border border-[#111827]/20">
                <div className="bg-[#F7F4EF] px-5 py-3 text-sm font-semibold text-[#111827]">
                  수강 내역 ({targetYear}년도)
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-t border-[#111827]/10 bg-[#F7F4EF]/30">
                      <th className="px-4 py-2.5 text-left font-medium text-[#4B5563]">강좌</th>
                      <th className="px-4 py-2.5 text-left font-medium text-[#4B5563]">수강기간</th>
                      <th className="px-4 py-2.5 text-right font-medium text-[#4B5563]">수강료</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enrollments.map((enr) => {
                      const courseName =
                        enr.cohort?.name ??
                        enr.specialLecture?.name ??
                        enr.product?.name ??
                        "강좌 미지정";
                      return (
                        <tr key={enr.id} className="border-t border-[#111827]/10">
                          <td className="px-4 py-2.5 text-[#111827]">{courseName}</td>
                          <td className="px-4 py-2.5 text-[#4B5563]">
                            {formatDateShort(enr.startDate)}
                            {enr.endDate ? ` ~ ${formatDateShort(enr.endDate)}` : " ~"}
                          </td>
                          <td className="px-4 py-2.5 text-right text-[#111827]">
                            {formatAmount(enr.finalFee)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Payment table */}
            <div className="mb-6 border border-[#111827]/20">
              <div className="bg-[#F7F4EF] px-5 py-3 text-sm font-semibold text-[#111827]">
                수납 내역
              </div>
              {payments.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-[#4B5563]">
                  {targetYear}년도 수납 내역이 없습니다.
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-t border-[#111827]/10 bg-[#F7F4EF]/30">
                      <th className="px-4 py-2.5 text-left font-medium text-[#4B5563]">날짜</th>
                      <th className="px-4 py-2.5 text-left font-medium text-[#4B5563]">구분</th>
                      <th className="px-4 py-2.5 text-left font-medium text-[#4B5563]">내용</th>
                      <th className="px-4 py-2.5 text-right font-medium text-[#4B5563]">금액</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id} className="border-t border-[#111827]/10">
                        <td className="px-4 py-2.5 text-[#4B5563]">
                          {formatDateShort(p.createdAt)}
                        </td>
                        <td className="px-4 py-2.5 text-[#111827]">
                          {PAYMENT_CATEGORY_LABEL_KO[p.category]}
                        </td>
                        <td className="max-w-[160px] truncate px-4 py-2.5 text-[#4B5563]">
                          {p.note ?? "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium text-[#111827]">
                          {formatAmount(p.netAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {/* Total row */}
                  <tfoot>
                    <tr className="border-t-2 border-[#111827]/20 bg-[#1F4D3A]/5">
                      <td
                        className="px-4 py-3 text-sm font-bold text-[#111827]"
                        colSpan={3}
                      >
                        합&nbsp;&nbsp;&nbsp;&nbsp;계
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-[#1F4D3A]">
                        {formatAmount(totalAmount)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>

            {/* Spacer */}
            <div className="my-10" />

            {/* Footer note */}
            <p className="mb-8 text-center text-sm leading-relaxed text-[#111827]">
              위 금액을 정히 영수함을 확인합니다.
            </p>

            {/* Issuance date */}
            <p className="mb-8 text-center text-sm text-[#111827]">{issuedAt}</p>

            {/* Academy seal area */}
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
      </div>

      {/* Helper text — screen only */}
      <p className="no-print mt-2 pb-8 text-center text-xs text-[#4B5563]/60">
        인쇄 버튼을 누른 후 용지 크기를 B5로 선택하세요. PDF로 저장도 가능합니다.
      </p>
    </div>
  );
}
