import { AdminRole } from "@prisma/client";
import { notFound } from "next/navigation";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { PrintCertificateButton } from "./print-certificate-button";

export const dynamic = "force-dynamic";

const COURSE_TYPE_LABEL: Record<string, string> = {
  COMPREHENSIVE: "종합반",
  SPECIAL_LECTURE: "특강·단과",
};

const ENROLLMENT_STATUS_LABEL: Record<string, string> = {
  PENDING: "대기",
  ACTIVE: "수강 중",
  WAITING: "대기번호",
  SUSPENDED: "휴원",
  COMPLETED: "수료",
  WITHDRAWN: "퇴원",
  CANCELLED: "취소",
};

function formatCertDate(date: Date): string {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function formatKorDate(isoString: string): string {
  const d = new Date(isoString);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default async function EnrollmentCertificatePage({
  params,
}: {
  params: { id: string };
}) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const prisma = getPrisma();
  const enrollment = await prisma.courseEnrollment.findUnique({
    where: { id: params.id },
    include: {
      student: { select: { name: true, phone: true } },
      cohort: { select: { name: true } },
      product: { select: { name: true } },
      specialLecture: { select: { name: true } },
    },
  });

  if (!enrollment) notFound();

  // 관련 수납 내역 조회
  const payments = await prisma.payment.findMany({
    where: { enrollmentId: params.id, status: { in: ["APPROVED", "PARTIAL_REFUNDED"] } },
    orderBy: { processedAt: "asc" },
    include: { items: true },
    take: 10,
  });

  const totalPaid = payments.reduce((sum, p) => sum + p.netAmount, 0);
  const latestPaymentMethod =
    payments.length > 0
      ? {
          CASH: "현금",
          CARD: "카드",
          TRANSFER: "계좌이체",
          POINT: "포인트",
          MIXED: "혼합 결제",
        }[payments[payments.length - 1].method] ?? payments[payments.length - 1].method
      : "-";

  const courseName =
    enrollment.cohort?.name ??
    enrollment.specialLecture?.name ??
    enrollment.product?.name ??
    "강좌 미지정";

  const courseTypeLabel =
    COURSE_TYPE_LABEL[enrollment.courseType] ?? enrollment.courseType;
  const statusLabel =
    ENROLLMENT_STATUS_LABEL[enrollment.status] ?? enrollment.status;

  const certNo = `ENR-${new Date().getFullYear()}-${params.id.slice(-6).toUpperCase()}`;
  const issuedAt = formatCertDate(new Date());

  return (
    <div className="min-h-screen bg-[#F7F4EF]">
      {/* 인쇄 전용 스타일 */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; margin: 0; padding: 0; }
          @page {
            size: A4 portrait;
            margin: 15mm;
          }
          .cert-wrapper {
            padding: 0 !important;
            background: white !important;
            display: flex !important;
            justify-content: center !important;
          }
          .cert-paper {
            width: 100% !important;
            max-width: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            margin: 0 !important;
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
            {enrollment.student?.name ?? enrollment.examNumber}의 수강 등록 확인서
          </span>
          <PrintCertificateButton />
        </div>
      </div>

      {/* 확인서 미리보기 */}
      <div className="cert-wrapper flex justify-center p-8">
        <div
          className="cert-paper w-full max-w-[600px] overflow-hidden rounded-[16px] border border-[#111827]/15 bg-white shadow-xl"
          style={{ fontFamily: "'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif" }}
        >
          {/* ── 헤더 ── */}
          <div
            className="px-10 pb-6 pt-8 text-center"
            style={{ backgroundColor: "#1F4D3A" }}
          >
            <p
              className="text-[10px] font-semibold uppercase tracking-[0.3em]"
              style={{ color: "rgba(255,255,255,0.6)" }}
            >
              ACADEMY OPS
            </p>
            <p className="mt-2 text-[28px] font-bold tracking-[0.2em] text-white">
              수 강 등 록 확 인 서
            </p>
            <p
              className="mt-1 text-xs tracking-widest"
              style={{ color: "rgba(255,255,255,0.5)" }}
            >
              ENROLLMENT CERTIFICATE
            </p>
          </div>

          {/* ── 발급 정보 밴드 ── */}
          <div
            className="flex items-center justify-between px-10 py-2 text-[11px]"
            style={{ backgroundColor: "#C55A11", color: "white" }}
          >
            <span>발급번호: {certNo}</span>
            <span>발급일: {issuedAt}</span>
          </div>

          {/* ── 본문 ── */}
          <div className="px-10 py-8">
            {/* 학생 정보 섹션 */}
            <div className="mb-6">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#4B5563]">
                학생 정보
              </p>
              <table className="w-full border-collapse text-sm">
                <tbody>
                  <tr className="border-y border-[#111827]/10">
                    <th className="w-28 bg-[#F7F4EF] py-3 pl-4 text-left text-xs font-semibold text-[#4B5563]">
                      성&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;명
                    </th>
                    <td className="py-3 pl-4 font-medium text-[#111827]">
                      {enrollment.student?.name ?? "-"}
                    </td>
                    <th className="w-28 bg-[#F7F4EF] py-3 pl-4 text-left text-xs font-semibold text-[#4B5563]">
                      학&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;번
                    </th>
                    <td className="py-3 pl-4 font-medium text-[#111827]">
                      {enrollment.examNumber}
                    </td>
                  </tr>
                  <tr className="border-b border-[#111827]/10">
                    <th className="bg-[#F7F4EF] py-3 pl-4 text-left text-xs font-semibold text-[#4B5563]">
                      연 락 처
                    </th>
                    <td colSpan={3} className="py-3 pl-4 font-medium text-[#111827]">
                      {enrollment.student?.phone ?? "-"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 수강 정보 섹션 */}
            <div className="mb-6">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#4B5563]">
                수강 정보
              </p>
              <table className="w-full border-collapse text-sm">
                <tbody>
                  <tr className="border-y border-[#111827]/10">
                    <th className="w-28 bg-[#F7F4EF] py-3 pl-4 text-left text-xs font-semibold text-[#4B5563]">
                      강&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;좌
                    </th>
                    <td className="py-3 pl-4 font-medium text-[#111827]" colSpan={3}>
                      {courseName}
                      <span className="ml-2 text-xs text-[#4B5563]">({courseTypeLabel})</span>
                    </td>
                  </tr>
                  <tr className="border-b border-[#111827]/10">
                    <th className="bg-[#F7F4EF] py-3 pl-4 text-left text-xs font-semibold text-[#4B5563]">
                      수강기간
                    </th>
                    <td className="py-3 pl-4 font-medium text-[#111827]" colSpan={3}>
                      {formatKorDate(enrollment.startDate.toISOString())}
                      {enrollment.endDate
                        ? ` ~ ${formatKorDate(enrollment.endDate.toISOString())}`
                        : " ~ (미정)"}
                    </td>
                  </tr>
                  <tr className="border-b border-[#111827]/10">
                    <th className="bg-[#F7F4EF] py-3 pl-4 text-left text-xs font-semibold text-[#4B5563]">
                      수강상태
                    </th>
                    <td className="py-3 pl-4 font-medium text-[#111827]">
                      {statusLabel}
                    </td>
                    <th className="bg-[#F7F4EF] py-3 pl-4 text-left text-xs font-semibold text-[#4B5563]">
                      등록구분
                    </th>
                    <td className="py-3 pl-4 font-medium text-[#111827]">
                      {enrollment.isRe ? "재수강" : "신규"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 수납 정보 섹션 */}
            <div className="mb-8">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#4B5563]">
                수납 정보
              </p>
              <table className="w-full border-collapse text-sm">
                <tbody>
                  <tr className="border-y border-[#111827]/10">
                    <th className="w-28 bg-[#F7F4EF] py-3 pl-4 text-left text-xs font-semibold text-[#4B5563]">
                      수 강 료
                    </th>
                    <td className="py-3 pl-4 font-medium text-[#111827]">
                      {enrollment.regularFee.toLocaleString("ko-KR")}원
                      {enrollment.discountAmount > 0 && (
                        <span className="ml-2 text-xs text-red-600">
                          (할인 -{enrollment.discountAmount.toLocaleString("ko-KR")}원)
                        </span>
                      )}
                    </td>
                    <th className="w-28 bg-[#F7F4EF] py-3 pl-4 text-left text-xs font-semibold text-[#4B5563]">
                      최종수강료
                    </th>
                    <td className="py-3 pl-4 font-bold text-[#1F4D3A]">
                      {enrollment.finalFee.toLocaleString("ko-KR")}원
                    </td>
                  </tr>
                  <tr className="border-b border-[#111827]/10">
                    <th className="bg-[#F7F4EF] py-3 pl-4 text-left text-xs font-semibold text-[#4B5563]">
                      납부금액
                    </th>
                    <td className="py-3 pl-4 font-bold text-[#C55A11]">
                      {totalPaid.toLocaleString("ko-KR")}원
                    </td>
                    <th className="bg-[#F7F4EF] py-3 pl-4 text-left text-xs font-semibold text-[#4B5563]">
                      결제방법
                    </th>
                    <td className="py-3 pl-4 font-medium text-[#111827]">
                      {latestPaymentMethod}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 확인 문구 */}
            <div className="mt-2 rounded-[12px] border border-[#1F4D3A]/20 bg-[#1F4D3A]/5 px-6 py-5 text-center">
              <p className="text-base font-semibold text-[#111827]">
                위 사실을 확인합니다.
              </p>
              <p className="mt-3 text-sm text-[#4B5563]">{issuedAt}</p>
            </div>

            {/* 학원 정보 + 직인 */}
            <div className="mt-6 flex items-end justify-between">
              <div className="text-sm text-[#4B5563]">
                <p className="font-semibold text-[#111827]">학원명 미설정</p>
                <p className="mt-1 text-xs">학원 주소는 관리자 설정을 확인하세요</p>
                <p className="mt-0.5 text-xs">대표전화: 연락처는 관리자 설정을 확인하세요</p>
              </div>
              <div className="flex flex-col items-center gap-1">
                <p className="text-sm text-[#4B5563]">학원장</p>
                <div
                  className="flex h-16 w-16 flex-col items-center justify-center rounded-full border-2 text-center"
                  style={{ borderColor: "#C55A11", color: "#C55A11" }}
                >
                  <span className="text-[10px] font-semibold leading-tight">한국경찰</span>
                  <span className="text-[10px] font-semibold leading-tight">학원</span>
                  <span className="mt-0.5 text-[9px]">(인)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 안내 문구 — 화면 전용 */}
      <p className="no-print mt-2 text-center text-xs text-[#4B5563]/60">
        인쇄 대화상자에서 용지 크기를 A4로 선택하세요. 여백은 15mm 이상을 권장합니다.
      </p>
    </div>
  );
}
