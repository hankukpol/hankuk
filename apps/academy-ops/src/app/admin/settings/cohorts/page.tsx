import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { CohortManager } from "@/components/cohorts/cohort-manager";

export const dynamic = "force-dynamic";

export default async function CohortsSettingsPage() {
  await requireAdminContext(AdminRole.MANAGER);

  const rawCohorts = await getPrisma().cohort.findMany({
    orderBy: [{ startDate: "desc" }],
    include: {
      enrollments: {
        select: { status: true },
      },
    },
  });

  const cohorts = rawCohorts.map(({ enrollments, ...cohort }) => {
    const activeCount = enrollments.filter(
      (e) => e.status === "PENDING" || e.status === "ACTIVE",
    ).length;
    const waitlistCount = enrollments.filter((e) => e.status === "WAITING").length;
    return { ...cohort, activeCount, waitlistCount };
  });

  return (
    <div className="p-8 sm:p-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            설정 · 기수 관리
          </div>
          <h1 className="mt-5 text-3xl font-semibold">기수 관리</h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            수험유형별 기수(期數)를 등록하고 관리합니다. 기수명, 시작일·종료일, 목표시험연도를
            설정할 수 있습니다.
          </p>
        </div>
        <div className="mt-5 sm:mt-0 flex flex-shrink-0 items-start">
          <Link
            href="/admin/settings/cohorts/new"
            className="inline-flex items-center gap-2 rounded-full bg-[#C55A11] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#b04e0f]"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            새 기수 등록
          </Link>
        </div>
      </div>
      <div className="mt-8">
        <CohortManager initialCohorts={cohorts as any} />
      </div>
    </div>
  );
}
