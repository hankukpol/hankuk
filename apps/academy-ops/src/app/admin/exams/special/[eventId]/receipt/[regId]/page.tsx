import { notFound } from "next/navigation";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const DIVISION_LABEL: Record<string, string> = {
  GONGCHAE_M: "공채 남자",
  GONGCHAE_F: "공채 여자",
  GYEONGCHAE: "경채",
  ONLINE: "온라인",
};

export default async function SpecialReceiptPage({
  params,
}: {
  params: { eventId: string; regId: string };
}) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const { eventId, regId } = await params;

  const registration = await getPrisma().examRegistration.findFirst({
    where: { id: regId, examEventId: eventId },
    include: {
      examEvent: true,
      student: {
        select: {
          examNumber: true,
          name: true,
          phone: true,
        },
      },
    },
  });

  if (!registration) notFound();

  const event = registration.examEvent;
  const displayName = registration.student?.name ?? registration.externalName ?? "—";
  const displayPhone =
    registration.student?.phone ?? registration.externalPhone ?? "—";
  const examDateStr = event.examDate.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const registeredAtStr = registration.registeredAt.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const receiptNumber = registration.id.slice(-8).toUpperCase();

  return (
    <>
      <style>{`
        @media print {
          body { background: white !important; }
          .no-print { display: none !important; }
          .print-only { display: block !important; }
        }
        @page {
          size: A6;
          margin: 10mm;
        }
      `}</style>

      {/* Print button — hidden when printing */}
      <div className="no-print flex justify-center gap-3 p-6">
        <button
          onClick={() => window.print()}
          className="rounded-full bg-ember px-6 py-2 text-sm font-semibold text-white hover:bg-ember/90"
        >
          인쇄
        </button>
        <button
          onClick={() => window.close()}
          className="rounded-full border border-ink/10 px-6 py-2 text-sm font-semibold text-slate hover:bg-ink/5"
        >
          닫기
        </button>
      </div>

      {/* Receipt card */}
      <div className="mx-auto max-w-sm rounded-[28px] border border-ink/10 bg-white p-8 shadow-sm print:shadow-none print:border-none print:rounded-none">
        {/* Header */}
        <div className="border-b-2 border-[#1F4D3A] pb-4">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#1F4D3A]">
            학원명 미설정
          </p>
          <h1 className="mt-1 text-xl font-bold text-ink">모의고사 접수증</h1>
        </div>

        {/* Exam info */}
        <div className="mt-5 space-y-3">
          <div className="flex gap-4">
            <span className="w-20 flex-shrink-0 text-xs font-semibold text-slate">시험명</span>
            <span className="text-sm font-semibold text-ink">{event.title}</span>
          </div>
          <div className="flex gap-4">
            <span className="w-20 flex-shrink-0 text-xs font-semibold text-slate">시험일</span>
            <span className="text-sm text-ink">{examDateStr}</span>
          </div>
          {event.venue && (
            <div className="flex gap-4">
              <span className="w-20 flex-shrink-0 text-xs font-semibold text-slate">장소</span>
              <span className="text-sm text-ink">{event.venue}</span>
            </div>
          )}
          <div className="flex gap-4">
            <span className="w-20 flex-shrink-0 text-xs font-semibold text-slate">구분</span>
            <span className="text-sm font-semibold text-ink">
              {DIVISION_LABEL[registration.division] ?? registration.division}
            </span>
          </div>
          {registration.seatNumber && (
            <div className="flex gap-4">
              <span className="w-20 flex-shrink-0 text-xs font-semibold text-slate">좌석번호</span>
              <span className="text-sm font-bold text-ember">{registration.seatNumber}</span>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="my-5 border-t border-dashed border-ink/10" />

        {/* Applicant info */}
        <div className="space-y-3">
          <div className="flex gap-4">
            <span className="w-20 flex-shrink-0 text-xs font-semibold text-slate">성명</span>
            <span className="text-sm font-semibold text-ink">{displayName}</span>
          </div>
          {registration.examNumber && (
            <div className="flex gap-4">
              <span className="w-20 flex-shrink-0 text-xs font-semibold text-slate">학번</span>
              <span className="text-sm text-ink">{registration.examNumber}</span>
            </div>
          )}
          <div className="flex gap-4">
            <span className="w-20 flex-shrink-0 text-xs font-semibold text-slate">연락처</span>
            <span className="text-sm text-ink">{displayPhone}</span>
          </div>
        </div>

        {/* Divider */}
        <div className="my-5 border-t border-dashed border-ink/10" />

        {/* Payment info */}
        <div className="space-y-3">
          <div className="flex gap-4">
            <span className="w-20 flex-shrink-0 text-xs font-semibold text-slate">참가비</span>
            <span className="text-sm font-bold text-ink">
              {event.registrationFee > 0
                ? `${event.registrationFee.toLocaleString("ko-KR")}원`
                : "무료"}
            </span>
          </div>
          <div className="flex gap-4">
            <span className="w-20 flex-shrink-0 text-xs font-semibold text-slate">납부금액</span>
            <span
              className={`text-sm font-bold ${
                registration.isPaid ? "text-forest" : "text-amber-600"
              }`}
            >
              {registration.isPaid
                ? `${registration.paidAmount.toLocaleString("ko-KR")}원 (납부완료)`
                : "미납부"}
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 border-t border-ink/10 pt-4">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs text-slate">접수일</p>
              <p className="mt-0.5 text-xs font-medium text-ink">{registeredAtStr}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate">접수번호</p>
              <p className="mt-0.5 font-mono text-xs font-bold text-ink">{receiptNumber}</p>
            </div>
          </div>
          <p className="mt-4 text-center text-[10px] text-slate">
            학원 주소는 관리자 설정을 확인하세요 | 연락처는 관리자 설정을 확인하세요
          </p>
        </div>
      </div>

      {/* Bottom print button */}
      <div className="no-print mt-4 flex justify-center">
        <p className="text-xs text-slate">인쇄 시 A6 용지(엽서 크기)를 권장합니다.</p>
      </div>
    </>
  );
}
