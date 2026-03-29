import { AdminRole } from "@prisma/client";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { PrintQRButton } from "./print-qr-button";

export const dynamic = "force-dynamic";

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function formatSessionDate(date: Date): string {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const dow = DAY_LABELS[date.getDay()];
  return `${y}년 ${m}월 ${d}일 (${dow})`;
}

export default async function QrPrintPage({
  params,
}: {
  params: { sessionId: string };
}) {
  await requireAdminContext(AdminRole.TEACHER);

  const { sessionId } = params;

  const session = await getPrisma().lectureSession.findUnique({
    where: { id: sessionId },
    include: {
      schedule: {
        include: {
          cohort: { select: { id: true, name: true, examCategory: true } },
        },
      },
    },
  });

  if (!session) notFound();

  if (session.isCancelled) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-mist p-8">
        <div className="rounded-[28px] border border-red-200 bg-white p-10 text-center shadow-sm">
          <p className="text-lg font-semibold text-red-600">취소된 강의 세션입니다.</p>
          <p className="mt-2 text-sm text-slate">QR 코드를 생성할 수 없습니다.</p>
        </div>
      </div>
    );
  }

  // QR 토큰 생성 (유효: 2시간)
  const exp = Date.now() + 2 * 60 * 60 * 1000;
  const payload = JSON.stringify({ sessionId, exp });
  const token = Buffer.from(payload).toString("base64url");

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const checkInUrl = `${baseUrl}/student/check-in?token=${token}`;

  const qrDataUrl = await QRCode.toDataURL(checkInUrl, {
    width: 400,
    margin: 2,
    errorCorrectionLevel: "M",
    color: {
      dark: "#111827",
      light: "#ffffff",
    },
  });

  const expiresAt = new Date(exp);
  const expiresStr = `${expiresAt.getHours().toString().padStart(2, "0")}:${expiresAt.getMinutes().toString().padStart(2, "0")}`;

  const sessionDateFormatted = formatSessionDate(session.sessionDate);

  const examCategoryLabel: Record<string, string> = {
    GONGCHAE: "공채",
    GYEONGCHAE: "경채",
    SOGANG: "소방",
    CUSTOM: "기타",
  };

  return (
    <div className="min-h-screen bg-[#F7F4EF]">
      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; margin: 0; padding: 0; }
          .print-page {
            min-height: 100vh !important;
            width: 100% !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            padding: 20mm !important;
            box-sizing: border-box !important;
          }
          .qr-card {
            border: 2px solid #1F4D3A !important;
            box-shadow: none !important;
          }
        }
      `}</style>

      {/* Top bar (screen only) */}
      <div className="no-print flex items-center justify-between gap-4 border-b border-ink/10 bg-white px-6 py-4">
        <a
          href={`/admin/attendance/lecture/${sessionId}`}
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-4 py-2 text-sm text-slate transition hover:border-ink/30"
        >
          ← 세션으로 돌아가기
        </a>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate">
            {session.schedule.subjectName} — QR 출석 코드
          </span>
          <PrintQRButton />
        </div>
      </div>

      {/* Print area */}
      <div className="print-page flex min-h-[calc(100vh-65px)] flex-col items-center justify-center p-8 sm:p-12">

        {/* QR Card */}
        <div className="qr-card w-full max-w-lg rounded-[28px] border-2 border-forest bg-white shadow-xl">

          {/* Card Header */}
          <div className="rounded-t-[26px] bg-forest px-8 py-6 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/60">
              학원명 미설정
            </p>
            <h1 className="mt-2 text-2xl font-bold text-white">
              강의 출결 QR 코드
            </h1>
            <p className="mt-1 text-sm text-white/70">
              QR 코드를 스캔하여 출석을 확인하세요
            </p>
          </div>

          {/* QR Code */}
          <div className="flex flex-col items-center px-8 py-8">
            <div className="rounded-[20px] bg-white p-3 shadow-md ring-1 ring-ink/8">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrDataUrl}
                alt="출결 체크인 QR 코드"
                width={320}
                height={320}
                className="block"
              />
            </div>

            {/* Session Info */}
            <div className="mt-6 w-full space-y-3">
              <div className="flex items-start justify-between rounded-2xl bg-mist px-5 py-3">
                <span className="text-sm text-slate">강의</span>
                <span className="text-right text-sm font-semibold text-ink">
                  {session.schedule.subjectName}
                  {session.schedule.instructorName
                    ? ` — ${session.schedule.instructorName}`
                    : ""}
                </span>
              </div>

              <div className="flex items-start justify-between rounded-2xl bg-mist px-5 py-3">
                <span className="text-sm text-slate">기수</span>
                <span className="text-right text-sm font-semibold text-ink">
                  {session.schedule.cohort.name}
                  <span className="ml-1.5 text-xs font-normal text-slate">
                    ({examCategoryLabel[session.schedule.cohort.examCategory] ?? session.schedule.cohort.examCategory})
                  </span>
                </span>
              </div>

              <div className="flex items-start justify-between rounded-2xl bg-mist px-5 py-3">
                <span className="text-sm text-slate">날짜</span>
                <span className="text-sm font-semibold text-ink">
                  {sessionDateFormatted}
                </span>
              </div>

              <div className="flex items-start justify-between rounded-2xl bg-mist px-5 py-3">
                <span className="text-sm text-slate">시간</span>
                <span className="text-sm font-semibold text-ink">
                  {session.startTime} ~ {session.endTime}
                </span>
              </div>

              <div className="flex items-start justify-between rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3">
                <span className="text-sm text-amber-700">QR 유효 시간</span>
                <span className="text-sm font-semibold text-amber-800">
                  {expiresStr}까지 (2시간)
                </span>
              </div>
            </div>

            {/* Grace note */}
            <p className="mt-5 text-center text-xs text-slate">
              강의 시작 5분 이내 체크인 → 출석 / 이후 체크인 → 지각 처리
            </p>
          </div>

          {/* Footer */}
          <div className="rounded-b-[26px] border-t border-ink/8 bg-mist/60 px-8 py-4">
            <p className="text-center text-xs text-slate/70">
              본 QR 코드는 해당 강의 출결 확인용입니다 · 타인에게 공유 금지
            </p>
          </div>
        </div>

        {/* Screen-only hint */}
        <p className="no-print mt-6 text-center text-xs text-slate/60">
          위 QR 코드를 인쇄하여 강의실에 게시하세요.
          학생들이 스마트폰으로 스캔하면 자동으로 출결 처리됩니다.
        </p>
      </div>
    </div>
  );
}
