import { AdminRole } from "@prisma/client";
import { notFound } from "next/navigation";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { PrintConfirmationButton } from "./print-button";

export const dynamic = "force-dynamic";

function formatKorDate(date: Date): string {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function formatKorDateRange(start: Date, end: Date | null): string {
  const s = formatKorDate(start);
  if (!end) return `${s} ~ (미정)`;
  return `${s} ~ ${formatKorDate(end)}`;
}

export default async function EnrollmentConfirmationPage({
  params,
}: {
  params: { id: string };
}) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const prisma = getPrisma();
  const enrollment = await prisma.courseEnrollment.findUnique({
    where: { id: params.id },
    include: {
      student: {
        select: {
          name: true,
          phone: true,
          birthDate: true,
          examNumber: true,
        },
      },
      cohort: { select: { name: true } },
      product: { select: { name: true } },
      specialLecture: { select: { name: true } },
    },
  });

  if (!enrollment) notFound();

  const courseName =
    enrollment.cohort?.name ??
    enrollment.specialLecture?.name ??
    enrollment.product?.name ??
    "강좌 미지정";

  const issuedAt = formatKorDate(new Date());
  const certNo = `CONF-${new Date().getFullYear()}-${params.id.slice(-8).toUpperCase()}`;

  return (
    <div
      className="min-h-screen bg-[#F7F4EF]"
      style={{ fontFamily: "'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif" }}
    >
      {/* 인쇄 전용 스타일 */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; margin: 0; padding: 0; }
          @page {
            size: A4 portrait;
            margin: 20mm;
          }
          .doc-wrapper {
            padding: 0 !important;
            background: white !important;
          }
          .doc-paper {
            width: 100% !important;
            max-width: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            border: none !important;
            margin: 0 !important;
            min-height: auto !important;
          }
        }
      `}</style>

      {/* 상단 툴바 — 인쇄 시 숨김 */}
      <div className="no-print flex items-center justify-between gap-4 border-b border-[#111827]/10 bg-white px-6 py-4">
        <a
          href={`/admin/enrollments/${params.id}`}
          className="inline-flex items-center gap-2 rounded-full border border-[#111827]/10 px-4 py-2 text-sm text-[#4B5563] transition hover:border-[#111827]/30"
        >
          ← 수강 상세로
        </a>
        <div className="flex items-center gap-3">
          <span className="text-sm text-[#4B5563]">
            {enrollment.student.name}의 수강확인서
          </span>
          <PrintConfirmationButton />
        </div>
      </div>

      {/* 문서 미리보기 */}
      <div className="doc-wrapper flex justify-center px-8 py-10">
        <div
          className="doc-paper w-full max-w-[680px] rounded-2xl border border-[#111827]/15 bg-white shadow-lg"
          style={{ minHeight: "250mm" }}
        >
          <div className="px-16 py-14">
            {/* 문서번호 */}
            <p className="mb-2 text-right text-xs text-[#4B5563]">
              문서번호: {certNo}
            </p>

            {/* 제목 */}
            <h1
              className="mb-12 text-center text-3xl font-bold text-[#111827]"
              style={{ letterSpacing: "0.5em" }}
            >
              수 강 확 인 서
            </h1>

            {/* 학원 정보 헤드라인 */}
            <div className="mb-8 border-b-2 border-[#1F4D3A] pb-4">
              <p className="text-lg font-bold text-[#1F4D3A]">학원명 미설정</p>
              <p className="mt-0.5 text-sm text-[#4B5563]">
                학원 주소는 관리자 설정을 확인하세요 &nbsp;|&nbsp; 연락처는 관리자 설정을 확인하세요
              </p>
            </div>

            {/* 학생 정보 테이블 */}
            <div className="mb-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#4B5563]">
                학생 정보
              </p>
              <table className="w-full border-collapse border border-[#111827]/20 text-sm">
                <tbody>
                  <tr className="border-b border-[#111827]/10">
                    <th className="w-28 border-r border-[#111827]/10 bg-[#F7F4EF] px-4 py-3 text-left font-semibold text-[#111827]">
                      성&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;명
                    </th>
                    <td className="px-4 py-3 font-medium text-[#111827]">
                      {enrollment.student.name}
                    </td>
                    <th className="w-28 border-l border-r border-[#111827]/10 bg-[#F7F4EF] px-4 py-3 text-left font-semibold text-[#111827]">
                      수 험 번 호
                    </th>
                    <td className="px-4 py-3 font-medium text-[#111827]">
                      {enrollment.examNumber}
                    </td>
                  </tr>
                  <tr className="border-b border-[#111827]/10">
                    <th className="border-r border-[#111827]/10 bg-[#F7F4EF] px-4 py-3 text-left font-semibold text-[#111827]">
                      생 년 월 일
                    </th>
                    <td className="px-4 py-3 text-[#111827]">
                      {enrollment.student.birthDate
                        ? formatKorDate(enrollment.student.birthDate)
                        : "—"}
                    </td>
                    <th className="border-l border-r border-[#111827]/10 bg-[#F7F4EF] px-4 py-3 text-left font-semibold text-[#111827]">
                      연 락 처
                    </th>
                    <td className="px-4 py-3 text-[#111827]">
                      {enrollment.student.phone ?? "—"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 수강 정보 테이블 */}
            <div className="mb-10">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#4B5563]">
                수강 정보
              </p>
              <table className="w-full border-collapse border border-[#111827]/20 text-sm">
                <tbody>
                  <tr className="border-b border-[#111827]/10">
                    <th className="w-28 border-r border-[#111827]/10 bg-[#F7F4EF] px-4 py-3 text-left font-semibold text-[#111827]">
                      강&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;좌
                    </th>
                    <td className="px-4 py-3 font-medium text-[#111827]" colSpan={3}>
                      {courseName}
                    </td>
                  </tr>
                  <tr className="border-b border-[#111827]/10">
                    <th className="border-r border-[#111827]/10 bg-[#F7F4EF] px-4 py-3 text-left font-semibold text-[#111827]">
                      수 강 기 간
                    </th>
                    <td className="px-4 py-3 text-[#111827]" colSpan={3}>
                      {formatKorDateRange(enrollment.startDate, enrollment.endDate)}
                    </td>
                  </tr>
                  <tr>
                    <th className="border-r border-[#111827]/10 bg-[#F7F4EF] px-4 py-3 text-left font-semibold text-[#111827]">
                      수 강 료
                    </th>
                    <td className="px-4 py-3 text-[#111827]" colSpan={3}>
                      <span className="font-semibold">
                        {enrollment.finalFee.toLocaleString("ko-KR")}원
                      </span>
                      {enrollment.discountAmount > 0 && (
                        <span className="ml-2 text-xs text-[#4B5563]">
                          (정가 {enrollment.regularFee.toLocaleString("ko-KR")}원,
                          할인 {enrollment.discountAmount.toLocaleString("ko-KR")}원)
                        </span>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 확인 문구 */}
            <div className="mb-12 border border-[#1F4D3A]/20 bg-[#1F4D3A]/5 px-6 py-5 text-center">
              <p className="text-base leading-relaxed text-[#111827]">
                위 학생은 본 학원에서 수강하였음을 확인합니다.
              </p>
            </div>

            {/* 발급일 */}
            <p className="mb-10 text-center text-base text-[#111827]">{issuedAt}</p>

            {/* 학원 직인 및 서명 */}
            <div className="flex flex-col items-center gap-3">
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <p className="text-base font-bold text-[#111827]">학원명 미설정</p>
                  <p className="mt-1 text-sm font-semibold text-[#111827]">원&nbsp;&nbsp;&nbsp;&nbsp;장</p>
                </div>
                {/* 직인 원형 */}
                <div
                  className="flex h-20 w-20 flex-col items-center justify-center rounded-full border-2 text-center"
                  style={{ borderColor: "#C55A11", color: "#C55A11" }}
                >
                  <span className="text-[11px] font-semibold leading-tight">한국경찰</span>
                  <span className="text-[11px] font-semibold leading-tight">학원</span>
                  <span className="mt-0.5 text-[10px]">(인)</span>
                </div>
              </div>
              <p className="mt-2 text-xs text-[#4B5563]">
                학원 주소는 관리자 설정을 확인하세요
              </p>
              <p className="text-xs text-[#4B5563]">연락처는 관리자 설정을 확인하세요</p>
            </div>
          </div>
        </div>
      </div>

      {/* 안내 문구 — 화면 전용 */}
      <p className="no-print mb-10 mt-2 text-center text-xs text-[#4B5563]/60">
        인쇄 대화상자에서 용지 크기를 A4로 선택하세요. 여백은 20mm 이상을 권장합니다.
      </p>
    </div>
  );
}
