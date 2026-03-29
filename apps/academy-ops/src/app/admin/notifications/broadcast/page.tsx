import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { BroadcastForm } from "./broadcast-form";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{
    recipientGroup?: string;
    cohortId?: string;
  }>;
};

export default async function NotificationBroadcastPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.MANAGER);

  const prisma = getPrisma();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;

  const [templates, cohorts] = await Promise.all([
    prisma.notificationTemplate.findMany({
      orderBy: [{ type: "asc" }],
      select: {
        id: true,
        type: true,
        channel: true,
        description: true,
        content: true,
      },
    }),
    prisma.cohort.findMany({
      where: { isActive: true },
      orderBy: [{ startDate: "desc" }],
      select: {
        id: true,
        name: true,
        examCategory: true,
        startDate: true,
        endDate: true,
      },
    }),
  ]);

  const requestedCohortId = resolvedSearchParams?.cohortId;
  const initialCohortId =
    requestedCohortId && cohorts.some((cohort) => cohort.id === requestedCohortId)
      ? requestedCohortId
      : "";
  const initialRecipientGroup =
    resolvedSearchParams?.recipientGroup === "cohort" && initialCohortId
      ? "cohort"
      : "all_active";

  return (
    <div className="p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "알림 발송", href: "/admin/notifications" },
          { label: "일괄 발송" },
        ]}
      />

      {/* Badge */}
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        알림 일괄 발송
      </div>

      {/* Header */}
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">알림 일괄 발송</h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            등록된 알림 템플릿을 선택하고, 수신 대상 그룹을 지정하여 카카오 알림톡을 일괄
            발송합니다. 수신 동의하지 않은 학생은 자동으로 제외됩니다.
          </p>
        </div>
        <Link
          href="/admin/notifications"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-5 py-2.5 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink"
        >
          ← 알림 목록
        </Link>
      </div>

      <div className="mt-8">
        <BroadcastForm
          initialRecipientGroup={initialRecipientGroup}
          initialCohortId={initialCohortId}
          templates={templates.map((t) => ({
            id: t.id,
            type: t.type,
            channel: t.channel,
            description: t.description,
            content: t.content,
          }))}
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
