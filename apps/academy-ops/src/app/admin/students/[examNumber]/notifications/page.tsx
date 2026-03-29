import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole, NotificationChannel, NotificationType } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ examNumber: string }>;
};

const NOTIFICATION_TYPE_LABEL: Record<NotificationType, string> = {
  WARNING_1: "경고 1차",
  WARNING_2: "경고 2차",
  DROPOUT: "퇴소",
  ABSENCE_NOTE: "결석계",
  POINT: "포인트",
  NOTICE: "공지",
  SCORE_DEADLINE: "성적 마감",
  ENROLLMENT_COMPLETE: "수강 등록 완료",
  PAYMENT_COMPLETE: "수납 완료",
  REFUND_COMPLETE: "환불 완료",
  PAYMENT_OVERDUE: "수납 연체",
};

const NOTIFICATION_TYPE_COLOR: Record<NotificationType, string> = {
  WARNING_1: "border-amber-200 bg-amber-50 text-amber-800",
  WARNING_2: "border-red-200 bg-red-50 text-red-700",
  DROPOUT: "border-red-300 bg-red-100 text-red-800",
  ABSENCE_NOTE: "border-sky-200 bg-sky-50 text-sky-700",
  POINT: "border-amber-200 bg-amber-50 text-amber-700",
  NOTICE: "border-ink/20 bg-ink/5 text-slate",
  SCORE_DEADLINE: "border-purple-200 bg-purple-50 text-purple-700",
  ENROLLMENT_COMPLETE: "border-forest/30 bg-forest/10 text-forest",
  PAYMENT_COMPLETE: "border-forest/30 bg-forest/10 text-forest",
  REFUND_COMPLETE: "border-red-200 bg-red-50 text-red-700",
  PAYMENT_OVERDUE: "border-red-300 bg-red-100 text-red-800",
};

const CHANNEL_LABEL: Record<NotificationChannel, string> = {
  ALIMTALK: "카카오 알림톡",
  SMS: "SMS",
  WEB_PUSH: "앱 푸시",
};

const CHANNEL_COLOR: Record<NotificationChannel, string> = {
  ALIMTALK: "border-yellow-300 bg-yellow-50 text-yellow-800",
  SMS: "border-sky-200 bg-sky-50 text-sky-700",
  WEB_PUSH: "border-purple-200 bg-purple-50 text-purple-700",
};

const STATUS_LABEL: Record<string, string> = {
  sent: "발송 완료",
  failed: "실패",
  pending: "대기",
};

const STATUS_COLOR: Record<string, string> = {
  sent: "border-forest/30 bg-forest/10 text-forest",
  failed: "border-red-200 bg-red-50 text-red-700",
  pending: "border-amber-200 bg-amber-50 text-amber-700",
};

function formatDatetime(date: Date): string {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  return `${y}.${mo}.${day} ${h}:${mi}`;
}

export default async function StudentNotificationsPage({ params }: PageProps) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const { examNumber } = await params;
  const prisma = getPrisma();

  const [student, logs] = await Promise.all([
    prisma.student.findUnique({
      where: { examNumber },
      select: { name: true, examNumber: true, phone: true },
    }),
    prisma.notificationLog.findMany({
      where: { examNumber },
      orderBy: { sentAt: "desc" },
      take: 100,
    }),
  ]);

  if (!student) notFound();

  const sentCount = logs.filter((l) => l.status === "sent").length;
  const failedCount = logs.filter((l) => l.status === "failed").length;

  return (
    <div className="p-8 sm:p-10">
      {/* 브레드크럼 */}
      <nav className="mb-6 flex items-center gap-2 text-xs text-slate">
        <Link
          href="/admin/students"
          className="transition-colors hover:text-forest"
        >
          수강생 목록
        </Link>
        <span>/</span>
        <Link
          href={`/admin/students/${examNumber}`}
          className="transition-colors hover:text-forest"
        >
          {student.name}
        </Link>
        <span>/</span>
        <span className="text-ink">알림 내역</span>
      </nav>

      {/* 헤더 */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-[#C55A11]/20 bg-[#C55A11]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-[#C55A11]">
            알림 내역
          </div>
          <h1 className="mt-4 text-2xl font-semibold text-ink">
            {student.name}
            <span className="ml-2 text-base font-normal text-slate">
              ({student.examNumber})
            </span>
          </h1>
          {student.phone && (
            <p className="mt-1 text-sm text-slate">{student.phone}</p>
          )}
        </div>
      </div>

      {/* KPI 카드 */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-[28px] border border-ink/10 bg-white p-5 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">
            총 발송 건수
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-ink">
            {logs.length}건
          </p>
          <p className="mt-1 text-xs text-slate">최근 100건 표시</p>
        </div>
        <div className="rounded-[28px] border border-forest/20 bg-forest/5 p-5 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-wide text-forest">
            발송 완료
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-forest">
            {sentCount}건
          </p>
        </div>
        <div className="rounded-[28px] border border-red-100 bg-red-50 p-5 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-wide text-red-500">
            발송 실패
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-red-600">
            {failedCount}건
          </p>
        </div>
      </div>

      {/* 목록 */}
      <div className="mt-6">
        {logs.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-ink/10 p-10 text-center text-sm text-slate">
            발송된 알림이 없습니다.
          </div>
        ) : (
          <div className="overflow-hidden rounded-[28px] border border-ink/10 shadow-panel">
            <table className="min-w-full divide-y divide-ink/10 text-sm">
              <thead className="bg-mist/80 text-left">
                <tr>
                  <th className="px-4 py-3 font-semibold">발송일시</th>
                  <th className="px-4 py-3 font-semibold">유형</th>
                  <th className="px-4 py-3 font-semibold">채널</th>
                  <th className="px-4 py-3 font-semibold">내용 요약</th>
                  <th className="px-4 py-3 font-semibold">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10 bg-white">
                {logs.map((log) => {
                  const typeLabel = NOTIFICATION_TYPE_LABEL[log.type] ?? log.type;
                  const typeColor = NOTIFICATION_TYPE_COLOR[log.type] ?? "border-ink/20 bg-ink/5 text-slate";
                  const channelLabel = CHANNEL_LABEL[log.channel] ?? log.channel;
                  const channelColor = CHANNEL_COLOR[log.channel] ?? "border-ink/20 bg-ink/5 text-slate";
                  const statusLabel = STATUS_LABEL[log.status] ?? log.status;
                  const statusColor = STATUS_COLOR[log.status] ?? "border-ink/20 bg-ink/5 text-slate";
                  const excerpt =
                    log.message.length > 100
                      ? log.message.slice(0, 100) + "…"
                      : log.message;

                  return (
                    <tr
                      key={log.id}
                      className={`transition hover:bg-mist/40 ${
                        log.status === "failed" ? "opacity-70" : ""
                      }`}
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate">
                        {formatDatetime(log.sentAt)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${typeColor}`}
                        >
                          {typeLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${channelColor}`}
                        >
                          {channelLabel}
                        </span>
                      </td>
                      <td className="max-w-[360px] px-4 py-3">
                        <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-ink">
                          {excerpt}
                        </p>
                        {log.failReason && (
                          <p className="mt-1 text-xs text-red-500">
                            실패 사유: {log.failReason}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${statusColor}`}
                        >
                          {statusLabel}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 학생 프로필 이동 */}
      <div className="mt-8">
        <Link
          href={`/admin/students/${examNumber}`}
          className="inline-flex items-center gap-1.5 text-sm text-forest transition hover:underline"
        >
          ← 학생 프로필로 이동
        </Link>
      </div>
    </div>
  );
}
