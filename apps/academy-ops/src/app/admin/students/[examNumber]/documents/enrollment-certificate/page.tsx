import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { PrintButton } from "./print-button";

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

export default async function EnrollmentCertificatePage({ params }: PageProps) {
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

  // Most recent ACTIVE enrollment, fallback to any enrollment
  const activeEnrollment = await prisma.courseEnrollment.findFirst({
    where: { examNumber, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    include: {
      cohort: { select: { name: true } },
      specialLecture: { select: { name: true } },
      product: { select: { name: true } },
    },
  });

  const fallbackEnrollment = activeEnrollment
    ? null
    : await prisma.courseEnrollment.findFirst({
        where: { examNumber },
        orderBy: { createdAt: "desc" },
        include: {
          cohort: { select: { name: true } },
          specialLecture: { select: { name: true } },
          product: { select: { name: true } },
        },
      });

  const enrollment = activeEnrollment ?? fallbackEnrollment;

  const courseName = enrollment?.cohort?.name
    ?? enrollment?.specialLecture?.name
    ?? enrollment?.product?.name
    ?? "강좌 미지정";

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

      {/* Top bar — hidden on print */}
      <div className="no-print flex flex-wrap items-center justify-between gap-4 border-b border-[#111827]/10 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <Link
            href={`/admin/students/${examNumber}/documents`}
            className="inline-flex items-center gap-2 rounded-full border border-[#111827]/10 px-4 py-2 text-sm text-[#4B5563] transition hover:border-[#111827]/30"
          >
            ← 서류 발급 목록
          </Link>
          <span className="text-lg font-bold text-[#111827]">수강확인서</span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/admin/students/${examNumber}/documents?type=attendance`}
            className="inline-flex items-center gap-2 rounded-full border border-[#111827]/10 bg-white px-4 py-2 text-sm font-medium text-[#4B5563] transition hover:bg-[#F7F4EF]"
          >
            출결확인서 보기
          </Link>
          <Link
            href={`/admin/students/${examNumber}/documents/payment-receipt`}
            className="inline-flex items-center gap-2 rounded-full border border-[#111827]/10 bg-white px-4 py-2 text-sm font-medium text-[#4B5563] transition hover:bg-[#F7F4EF]"
          >
            납부확인서 보기
          </Link>
          <PrintButton />
        </div>
      </div>

      {/* Document preview */}
      <div className="print-area flex justify-center px-8 py-10">
        {!enrollment ? (
          <div className="w-full max-w-[680px] rounded-2xl border border-[#111827]/10 bg-white p-10 text-center">
            <p className="text-[#C55A11] text-lg font-semibold">수강 내역 없음</p>
            <p className="mt-2 text-sm text-[#4B5563]">
              이 학생의 수강 등록 내역이 없어 서류를 발급할 수 없습니다.
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
                수 강 확 인 서
              </h1>

              {/* Intro sentence */}
              <p className="mb-8 text-center text-base leading-relaxed text-[#111827]">
                위 학생은 당 학원에 다음과 같이 수강하고 있음을 확인합니다.
              </p>

              {/* Main info table */}
              <div className="mb-10 border border-[#111827]/20">
                <table className="w-full text-sm">
                  <tbody>
                    <tr className="border-b border-[#111827]/10">
                      <th className="w-32 bg-[#F7F4EF] px-5 py-3.5 text-left font-semibold text-[#111827]">
                        성&nbsp;&nbsp;&nbsp;&nbsp;명
                      </th>
                      <td className="px-5 py-3.5 text-[#111827]">{student.name}</td>
                      <th className="w-32 bg-[#F7F4EF] px-5 py-3.5 text-left font-semibold text-[#111827]">
                        수험번호
                      </th>
                      <td className="px-5 py-3.5 text-[#111827]">{student.examNumber}</td>
                    </tr>
                    <tr className="border-b border-[#111827]/10">
                      <th className="bg-[#F7F4EF] px-5 py-3.5 text-left font-semibold text-[#111827]">
                        생년월일
                      </th>
                      <td className="px-5 py-3.5 text-[#111827]">
                        {student.birthDate ? formatKoreanDate(student.birthDate) : "—"}
                      </td>
                      <th className="bg-[#F7F4EF] px-5 py-3.5 text-left font-semibold text-[#111827]">
                        연락처
                      </th>
                      <td className="px-5 py-3.5 text-[#111827]">
                        {student.phone ?? "—"}
                      </td>
                    </tr>
                    <tr className="border-b border-[#111827]/10">
                      <th className="bg-[#F7F4EF] px-5 py-3.5 text-left font-semibold text-[#111827]">
                        강&nbsp;&nbsp;&nbsp;&nbsp;좌
                      </th>
                      <td className="px-5 py-3.5 font-medium text-[#111827]" colSpan={3}>
                        {courseName}
                      </td>
                    </tr>
                    <tr className="border-b border-[#111827]/10">
                      <th className="bg-[#F7F4EF] px-5 py-3.5 text-left font-semibold text-[#111827]">
                        수강기간
                      </th>
                      <td className="px-5 py-3.5 text-[#111827]" colSpan={3}>
                        {formatKoreanDate(enrollment.startDate)}
                        {enrollment.endDate
                          ? ` ~ ${formatKoreanDate(enrollment.endDate)}`
                          : " ~ (미정)"}
                      </td>
                    </tr>
                    <tr className="border-b border-[#111827]/10">
                      <th className="bg-[#F7F4EF] px-5 py-3.5 text-left font-semibold text-[#111827]">
                        수강료
                      </th>
                      <td className="px-5 py-3.5 text-[#111827]" colSpan={3}>
                        {formatAmount(enrollment.finalFee)}
                        {enrollment.discountAmount > 0 && (
                          <span className="ml-2 text-xs text-[#4B5563]">
                            (정가 {formatAmount(enrollment.regularFee)}, 할인{" "}
                            {formatAmount(enrollment.discountAmount)})
                          </span>
                        )}
                      </td>
                    </tr>
                    <tr>
                      <th className="bg-[#F7F4EF] px-5 py-3.5 text-left font-semibold text-[#111827]">
                        용&nbsp;&nbsp;&nbsp;&nbsp;도
                      </th>
                      <td className="px-5 py-3.5 text-[#111827]" colSpan={3}>
                        <span className="inline-block min-w-[120px] border-b border-[#111827]/20 pb-0.5">
                          &nbsp;
                        </span>
                        &nbsp;제출용
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Spacer */}
              <div className="my-16" />

              {/* Issuance date */}
              <p className="mb-10 text-center text-base text-[#111827]">{issuedAt}</p>

              {/* Stamp & Academy info */}
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
