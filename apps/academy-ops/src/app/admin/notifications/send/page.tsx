import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { NotificationSendForm } from "./notification-send-form";

export const dynamic = "force-dynamic";

export default async function NotificationSendPage() {
  await requireAdminContext(AdminRole.COUNSELOR);

  const prisma = getPrisma();

  const cohorts = await prisma.cohort.findMany({
    where: { isActive: true },
    orderBy: [{ startDate: "desc" }],
    select: {
      id: true,
      name: true,
      examCategory: true,
      startDate: true,
      endDate: true,
    },
  });

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="inline-flex rounded-full border border-ink/20 bg-ink/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate">
        알림·공지
      </div>
      <h1 className="mt-5 text-3xl font-semibold">알림 수동 발송</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        개별 학생, 기수 전체, 또는 재원생 전체에게 카카오 알림톡을 수동으로 발송합니다.
        발송 전 미리보기로 내용을 확인하세요.
      </p>

      <div className="mt-8">
        <NotificationSendForm
          cohorts={cohorts.map((c) => ({
            id: c.id,
            name: c.name,
            examCategory: c.examCategory,
            startDate: c.startDate.toISOString(),
            endDate: c.endDate.toISOString(),
          }))}
        />
      </div>
    </div>
  );
}
