import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { ManualNotificationForm } from "./manual-notification-form";

export const dynamic = "force-dynamic";

export default async function ManualNotificationPage() {
  await requireAdminContext(AdminRole.COUNSELOR);

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="inline-flex rounded-full border border-ink/20 bg-ink/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate">
        알림·공지
      </div>
      <h1 className="mt-5 text-3xl font-semibold">1회성 개별 알림 발송</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        특정 학생 또는 연락처로 자유 문구 알림을 1회 발송합니다.
        학번으로 조회하거나 연락처를 직접 입력하여 발송할 수 있습니다.
      </p>

      <div className="mt-8">
        <ManualNotificationForm />
      </div>
    </div>
  );
}
