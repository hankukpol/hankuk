import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import ComposeForm from "./compose-form";

export const dynamic = "force-dynamic";

export default async function NotificationComposePage() {
  await requireAdminContext(AdminRole.COUNSELOR);

  return (
    <div className="p-8 sm:p-10">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/admin/notifications"
          className="inline-flex items-center gap-1.5 text-sm text-slate hover:text-ink transition"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          알림 발송
        </Link>
        <span className="text-ink/20">/</span>
        <span className="text-sm font-medium text-ink">알림 작성</span>
      </div>

      {/* Header */}
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        알림 작성
      </div>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">알림 작성 및 발송</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate">
            개별 학생, 기수 전체, 또는 전체 재학생에게 알림을 작성하고 발송합니다.
            카카오 알림톡 · SMS · 웹 푸시 채널을 선택할 수 있습니다.
          </p>
        </div>
        <Link
          href="/admin/notifications/history"
          className="inline-flex items-center gap-2 rounded-full border border-ink/15 px-5 py-2.5 text-sm font-medium text-slate transition hover:bg-mist"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          발송 이력 확인
        </Link>
      </div>

      {/* Quick nav */}
      <div className="mt-6 flex flex-wrap gap-2">
        <Link
          href="/admin/notifications/send"
          className="rounded-full border border-ink/15 px-4 py-1.5 text-xs font-medium text-slate transition hover:border-ember/30 hover:text-ember"
        >
          수동 발송
        </Link>
        <Link
          href="/admin/notifications/broadcast"
          className="rounded-full border border-ink/15 px-4 py-1.5 text-xs font-medium text-slate transition hover:border-forest/30 hover:text-forest"
        >
          일괄 발송
        </Link>
        <Link
          href="/admin/notifications/stats"
          className="rounded-full border border-ink/15 px-4 py-1.5 text-xs font-medium text-slate transition hover:border-amber-300 hover:text-amber-700"
        >
          발송 통계
        </Link>
      </div>

      {/* Compose form (client component) */}
      <ComposeForm />
    </div>
  );
}
