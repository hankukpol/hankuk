import type { Metadata } from "next";
import Link from "next/link";
import { NotificationType } from "@prisma/client";
import { StudentLookupForm } from "@/components/student-portal/student-lookup-form";
import { hasDatabaseConfig } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import { getStudentPortalViewer } from "@/lib/student-portal/service";
import { NotificationReadAllButton } from "./notification-read-all-button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "알림 내역",
};

const NOTIFICATION_TYPE_LABEL: Record<NotificationType, string> = {
  WARNING_1: "경고",
  WARNING_2: "2차 경고",
  DROPOUT: "퇴원",
  ABSENCE_NOTE: "결석 사유서",
  POINT: "포인트",
  NOTICE: "공지",
  SCORE_DEADLINE: "성적 마감",
  ENROLLMENT_COMPLETE: "수강 등록",
  PAYMENT_COMPLETE: "수납",
  REFUND_COMPLETE: "환불",
  PAYMENT_OVERDUE: "미납 독촉",
};

const NOTIFICATION_TYPE_COLOR: Record<NotificationType, string> = {
  WARNING_1: "border-amber-200 bg-amber-50 text-amber-700",
  WARNING_2: "border-red-200 bg-red-50 text-red-700",
  DROPOUT: "border-red-300 bg-red-100 text-red-800",
  ABSENCE_NOTE: "border-slate/20 bg-slate/10 text-slate",
  POINT: "border-ember/30 bg-ember/10 text-ember",
  NOTICE: "border-forest/20 bg-forest/10 text-forest",
  SCORE_DEADLINE: "border-amber-200 bg-amber-50 text-amber-700",
  ENROLLMENT_COMPLETE: "border-forest/20 bg-forest/10 text-forest",
  PAYMENT_COMPLETE: "border-blue-200 bg-blue-50 text-blue-700",
  REFUND_COMPLETE: "border-purple-200 bg-purple-50 text-purple-700",
  PAYMENT_OVERDUE: "border-red-200 bg-red-50 text-red-700",
};

function formatDateTime(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${y}.${m}.${d} ${h}:${min}`;
}

async function getNotifications(examNumber: string) {
  return getPrisma().notificationLog.findMany({
    where: {
      examNumber,
    },
    orderBy: { sentAt: "desc" },
    take: 50,
    select: {
      id: true,
      type: true,
      channel: true,
      message: true,
      status: true,
      isRead: true,
      sentAt: true,
    },
  });
}

export default async function StudentNotificationsPage() {
  if (!hasDatabaseConfig()) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink">
        <div className="space-y-6">
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
              Notifications Unavailable
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight">
              알림 내역은 DB 연결 후 사용할 수 있습니다.
            </h1>
          </section>
        </div>
      </main>
    );
  }

  const viewer = await getStudentPortalViewer();

  if (!viewer) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink">
        <div className="space-y-6">
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
              Student Notifications Login
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight">
              알림 내역은 로그인 후 확인할 수 있습니다.
            </h1>
            <p className="mt-5 text-sm leading-8 text-slate">
              학생 포털에 로그인하면 수납, 수강, 성적 등 학원에서 발송된 알림을 확인할 수 있습니다.
            </p>
          </section>

          <StudentLookupForm redirectPath="/student/notifications" />
        </div>
      </main>
    );
  }

  const notifications = await getNotifications(viewer.examNumber);
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <main className="min-h-screen bg-mist px-4 py-6 text-ink">
      <div className="space-y-6">
        {/* 헤더 */}
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
                Student Notifications
              </div>
              <h1 className="mt-5 text-3xl font-semibold leading-tight">
                알림 내역
              </h1>
              <p className="mt-5 text-sm leading-8 text-slate">
                수납, 수강, 성적 등 학원에서 발송된 알림 내역입니다.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/student/notifications/settings"
                className="inline-flex items-center rounded-full border border-ember/20 bg-ember/5 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                ?? ??
              </Link>
              <Link
                href="/student"
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                포털로 돌아가기
              </Link>
            </div>
          </div>

          <div className="mt-6 flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-[20px] border border-ink/10 bg-mist px-4 py-2">
              <span className="text-sm text-slate">전체</span>
              <span className="text-sm font-semibold">{notifications.length}건</span>
            </div>
            {unreadCount > 0 && (
              <div className="flex items-center gap-2 rounded-[20px] border border-ember/30 bg-ember/10 px-4 py-2">
                <span className="inline-block h-2 w-2 rounded-full bg-ember" />
                <span className="text-sm text-ember font-semibold">읽지 않음 {unreadCount}건</span>
              </div>
            )}
          </div>
        </section>

        {/* 알림 목록 */}
        <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">전체 알림</h2>
            {unreadCount > 0 && (
              <NotificationReadAllButton />
            )}
          </div>

          {notifications.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-ink/10 p-10 text-center text-sm text-slate">
              발송된 알림이 없습니다.
            </div>
          ) : (
            <ul className="space-y-3">
              {notifications.map((notification) => {
                const typeLabel = NOTIFICATION_TYPE_LABEL[notification.type] ?? notification.type;
                const typeColor =
                  NOTIFICATION_TYPE_COLOR[notification.type] ??
                  "border-slate/20 bg-slate/10 text-slate";

                return (
                  <li
                    key={notification.id}
                    className={`rounded-[20px] border p-4 transition ${
                      notification.isRead
                        ? "border-ink/8 bg-white"
                        : "border-ember/20 bg-ember/5"
                    }`}
                  >
                    <div className="flex flex-wrap items-start gap-3">
                      <div className="flex flex-1 flex-col gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${typeColor}`}
                          >
                            {typeLabel}
                          </span>
                          {!notification.isRead && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-ember/30 bg-ember/10 px-2 py-0.5 text-xs font-semibold text-ember">
                              <span className="inline-block h-1.5 w-1.5 rounded-full bg-ember" />
                              새 알림
                            </span>
                          )}
                          <span className="text-xs text-slate">
                            {formatDateTime(new Date(notification.sentAt))}
                          </span>
                        </div>
                        <p className="text-sm leading-6 text-ink">{notification.message}</p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
