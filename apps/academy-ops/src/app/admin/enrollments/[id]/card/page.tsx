import { AdminRole } from "@prisma/client";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "대기",
  ACTIVE: "수강 중",
  WAITING: "대기번호",
  SUSPENDED: "휴원",
  COMPLETED: "수료",
  WITHDRAWN: "퇴원",
  CANCELLED: "취소",
};

export default async function EnrollmentCardPage({
  params,
}: {
  params: { id: string };
}) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const enrollment = await getPrisma().courseEnrollment.findUnique({
    where: { id: params.id },
    include: {
      student: { select: { name: true, phone: true } },
      cohort: { select: { name: true, examCategory: true } },
      specialLecture: { select: { name: true } },
      product: { select: { name: true } },
    },
  });

  if (!enrollment) notFound();

  const courseName =
    enrollment.cohort?.name ??
    enrollment.specialLecture?.name ??
    enrollment.product?.name ??
    "강좌 미지정";

  const qrData = `ENR:${params.id}`;
  const qrDataUrl = await QRCode.toDataURL(qrData, {
    width: 200,
    margin: 1,
    errorCorrectionLevel: "M",
  });

  // Short card number: last 8 chars of cuid
  const cardNumber = params.id.slice(-8).toUpperCase();

  const statusLabel = STATUS_LABEL[enrollment.status] ?? enrollment.status;
  const isActive = enrollment.status === "ACTIVE";

  const issuedAt = new Date().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="min-h-screen bg-[#F7F4EF]">
      {/* Print global styles injected via a style tag */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; margin: 0; padding: 0; }
          .print-card {
            width: 85mm !important;
            min-height: 135mm !important;
            border: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            margin: 0 !important;
          }
          .print-card-header {
            border-radius: 0 !important;
          }
          .print-card-footer {
            border-radius: 0 !important;
          }
          .print-wrapper {
            padding: 0 !important;
            display: block !important;
          }
        }
      `}</style>

      {/* Top bar — hidden when printing */}
      <div className="no-print flex items-center justify-between gap-4 border-b border-[#111827]/10 bg-white px-6 py-4">
        <a
          href={`/admin/enrollments`}
          className="inline-flex items-center gap-2 rounded-full border border-[#111827]/10 px-4 py-2 text-sm text-[#4B5563] transition hover:border-[#111827]/30"
        >
          ← 목록으로
        </a>
        <div className="flex items-center gap-3">
          <span className="text-sm text-[#4B5563]">
            {enrollment.student?.name ?? enrollment.examNumber}의 수강증
          </span>
          <PrintButton />
        </div>
      </div>

      {/* Card preview area */}
      <div className="print-wrapper flex justify-center p-8">
        {/* Card — 340px on screen, 85mm when printed */}
        <div
          className="print-card w-[340px] overflow-hidden rounded-[28px] border border-[#111827]/15 bg-white shadow-xl"
          style={{ fontFamily: "'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif" }}
        >
          {/* ── Header ── */}
          <div
            className="print-card-header rounded-t-[28px] px-6 py-5"
            style={{ backgroundColor: "#1F4D3A" }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p
                  className="text-[10px] font-semibold uppercase tracking-[0.22em]"
                  style={{ color: "rgba(255,255,255,0.6)" }}
                >
                  학원명 미설정
                </p>
                <p className="mt-1 text-[22px] font-bold tracking-wide text-white">
                  수 강 증
                </p>
                <p
                  className="mt-1 text-[11px]"
                  style={{ color: "rgba(255,255,255,0.55)" }}
                >
                  ENROLLMENT CARD
                </p>
              </div>
              {/* QR code */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrDataUrl}
                alt="QR 코드"
                width={72}
                height={72}
                className="rounded-xl bg-white p-1.5 shadow-sm"
              />
            </div>
          </div>

          {/* ── Student block ── */}
          <div className="px-6 pt-5">
            <div
              className="rounded-2xl px-4 py-3"
              style={{ backgroundColor: "rgba(247,244,239,0.8)" }}
            >
              <p className="text-2xl font-bold" style={{ color: "#111827" }}>
                {enrollment.student?.name ?? "(이름 없음)"}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <span style={{ color: "#4B5563" }}>
                  수험번호{" "}
                  <strong style={{ color: "#111827" }}>{enrollment.examNumber}</strong>
                </span>
                <span style={{ color: "#4B5563" }}>
                  카드번호{" "}
                  <strong style={{ color: "#111827" }}>#{cardNumber}</strong>
                </span>
              </div>
            </div>
          </div>

          {/* ── Course details ── */}
          <div className="px-6 py-4">
            <div className="space-y-0 divide-y divide-[#111827]/6 text-sm">
              <div className="flex justify-between py-2.5">
                <span style={{ color: "#4B5563" }}>강좌명</span>
                <span
                  className="max-w-[190px] text-right font-medium leading-snug"
                  style={{ color: "#111827" }}
                >
                  {courseName}
                </span>
              </div>
              <div className="flex justify-between py-2.5">
                <span style={{ color: "#4B5563" }}>수강 기간</span>
                <span className="font-medium" style={{ color: "#111827" }}>
                  {formatDate(enrollment.startDate)}
                  {enrollment.endDate
                    ? ` ~ ${formatDate(enrollment.endDate)}`
                    : " ~"}
                </span>
              </div>
              <div className="flex justify-between py-2.5">
                <span style={{ color: "#4B5563" }}>수강 상태</span>
                <span
                  className="font-semibold"
                  style={{ color: isActive ? "#1F4D3A" : "#4B5563" }}
                >
                  {statusLabel}
                </span>
              </div>
            </div>
          </div>

          {/* ── Accent bar ── */}
          <div className="mx-6 h-[3px] rounded-full" style={{ backgroundColor: "#C55A11", opacity: 0.25 }} />

          {/* ── Footer ── */}
          <div
            className="print-card-footer rounded-b-[28px] px-6 py-4"
            style={{ backgroundColor: "rgba(247,244,239,0.5)" }}
          >
            <p className="text-center text-[11px]" style={{ color: "rgba(75,85,99,0.7)" }}>
              본 수강증은 본인만 사용 가능합니다
            </p>
            <p className="mt-0.5 text-center text-[10px]" style={{ color: "rgba(75,85,99,0.5)" }}>
              발급일: {issuedAt}
            </p>
          </div>
        </div>
      </div>

      {/* Helper text — screen only */}
      <p className="no-print mt-2 text-center text-xs text-[#4B5563]/60">
        위 카드 이미지가 실제 인쇄 결과입니다. 인쇄 대화상자에서 용지 크기를 A4 또는 명함으로 선택하세요.
      </p>
    </div>
  );
}
