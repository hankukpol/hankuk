import { AdminRole, ExamType } from "@prisma/client";
import Link from "next/link";
import { NotificationCenter } from "@/components/notifications/notification-center";
import { requireAdminContext } from "@/lib/auth";
import { EXAM_TYPE_LABEL } from "@/lib/constants";
import { listNotificationCenterData } from "@/lib/notifications/service";
import { listPeriods } from "@/lib/periods/service";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

function readParam(searchParams: PageProps["searchParams"], key: string) {
  const value = searchParams?.[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminNotificationsPage({ searchParams }: PageProps) {
  const examType =
    readParam(searchParams, "examType") === ExamType.GYEONGCHAE
      ? ExamType.GYEONGCHAE
      : ExamType.GONGCHAE;
  const search = readParam(searchParams, "search") ?? "";

  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 6);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  const prisma = getPrisma();

  const [, data, periods, recentFailedCount] = await Promise.all([
    requireAdminContext(AdminRole.TEACHER),
    listNotificationCenterData({ examType, search }),
    listPeriods(),
    prisma.notificationLog.count({
      where: {
        sentAt: { gte: sevenDaysAgo, lte: now },
        status: "failed",
      },
    }),
  ]);

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        F-09 Notifications
      </div>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <h1 className="text-3xl font-semibold">알림 발송</h1>
        <Link
          href="/admin/notifications/broadcast"
          className="inline-flex items-center gap-2 rounded-full bg-ember px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-ember/90"
        >
          <span>일괄 발송</span>
        </Link>
      </div>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        Solapi 기반 알림톡과 SMS 발송을 관리하고, 공지 Web Push 전달 이력까지 함께 점검합니다.
        발송 전 대상자를 미리 확인하고, 수신 동의와 발송 이력을 함께 볼 수 있습니다.
      </p>

      {/* Quick navigation cards */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link
          href="/admin/notifications/send"
          className="group relative rounded-[28px] border border-ink/10 bg-white p-6 transition hover:border-ember/30 hover:shadow-md"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-ember/10">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 text-ember">
                <path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.289z" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-ink">수동 발송</p>
              <p className="text-xs text-slate">개별 알림 발송</p>
            </div>
          </div>
        </Link>

        <Link
          href="/admin/notifications/broadcast"
          className="group relative rounded-[28px] border border-ink/10 bg-white p-6 transition hover:border-forest/30 hover:shadow-md"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-forest/10">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 text-forest">
                <path d="M13 4.5a2.5 2.5 0 11.702 1.737L6.97 9.604a2.518 2.518 0 010 .792l6.733 3.367a2.5 2.5 0 11-.671 1.341l-6.733-3.367a2.5 2.5 0 110-3.475l6.733-3.366A2.52 2.52 0 0113 4.5z" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-ink">일괄 발송</p>
              <p className="text-xs text-slate">전체 또는 그룹 발송</p>
            </div>
          </div>
        </Link>

        <Link
          href="/admin/notifications/manual"
          className="group relative rounded-[28px] border border-ink/10 bg-white p-6 transition hover:border-ink/30 hover:shadow-md"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-ink/5">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 text-slate">
                <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-ink">공지 발송</p>
              <p className="text-xs text-slate">직접 입력 메시지</p>
            </div>
          </div>
        </Link>

        {/* 발송 이력 — with failure badge */}
        <Link
          href="/admin/notifications/history"
          className="group relative rounded-[28px] border border-ink/10 bg-white p-6 transition hover:border-ink/30 hover:shadow-md"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-ink/5">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 text-slate">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-ink">발송 이력</p>
                <p className="text-xs text-slate">최근 발송 내역 조회</p>
              </div>
            </div>
            {recentFailedCount > 0 && (
              <span className="inline-flex items-center rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
                {recentFailedCount > 99 ? "99+" : recentFailedCount}
              </span>
            )}
          </div>
        </Link>

        {/* 발송 통계 */}
        <Link
          href="/admin/notifications/stats"
          className="group relative rounded-[28px] border border-amber-200 bg-amber-50/60 p-6 transition hover:border-amber-300 hover:shadow-md"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                <path d="M15.5 2A1.5 1.5 0 0014 3.5v13a1.5 1.5 0 001.5 1.5h1a1.5 1.5 0 001.5-1.5v-13A1.5 1.5 0 0016.5 2h-1zM9.5 6A1.5 1.5 0 008 7.5v9A1.5 1.5 0 009.5 18h1a1.5 1.5 0 001.5-1.5v-9A1.5 1.5 0 0010.5 6h-1zM3.5 10A1.5 1.5 0 002 11.5v5A1.5 1.5 0 003.5 18h1A1.5 1.5 0 006 16.5v-5A1.5 1.5 0 004.5 10h-1z" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-ink">발송 통계</p>
              <p className="text-xs text-slate">월별 발송량·비용·성공률</p>
            </div>
          </div>
        </Link>
      </div>

      <form className="mt-8 grid gap-4 rounded-[28px] border border-ink/10 bg-mist p-6 md:grid-cols-[160px_minmax(0,1fr)_140px]">
        <div>
          <label className="mb-2 block text-sm font-medium">직렬</label>
          <select
            name="examType"
            defaultValue={examType}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
          >
            <option value={ExamType.GONGCHAE}>{EXAM_TYPE_LABEL.GONGCHAE}</option>
            <option value={ExamType.GYEONGCHAE}>{EXAM_TYPE_LABEL.GYEONGCHAE}</option>
          </select>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium">수험번호 / 이름</label>
          <input
            type="text"
            name="search"
            defaultValue={search}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            placeholder="수험번호 또는 이름 검색"
          />
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            className="inline-flex w-full items-center justify-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest"
          >
            조회
          </button>
        </div>
      </form>

      <div className="mt-8">
        <NotificationCenter
          filters={{ examType, search }}
          setup={{
            notificationReady: data.setup.notificationReady,
            missingNotificationKeys: data.setup.missingNotificationKeys,
          }}
          summary={data.summary}
          students={data.students.map((student) => ({
            ...student,
            consentedAt: student.consentedAt ? student.consentedAt.toISOString() : null,
          }))}
          pendingLogs={data.pendingLogs.map((log) => ({
            ...log,
            sentAt: log.sentAt.toISOString(),
          }))}
          historyLogs={data.historyLogs.map((log) => ({
            ...log,
            sentAt: log.sentAt.toISOString(),
          }))}
          periods={periods.map((period) => ({
            id: period.id,
            name: period.name,
            isActive: period.isActive,
            sessions: period.sessions.map((session) => ({
              id: session.id,
              examType: session.examType,
              week: session.week,
              subject: session.subject,
              examDate: session.examDate.toISOString(),
              isCancelled: session.isCancelled,
            })),
          }))}
        />
      </div>
    </div>
  );
}
