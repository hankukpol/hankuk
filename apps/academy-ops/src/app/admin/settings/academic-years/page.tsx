import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatDate(date: Date): string {
  return date
    .toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" })
    .replace(/\. /g, "-")
    .replace(/\.$/, "");
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default async function AcademicYearsPage() {
  await requireAdminContext(AdminRole.DIRECTOR);

  const prisma = getPrisma();
  const now = new Date();
  const currentYear = now.getFullYear();

  // Derive academic year context from existing Cohort data
  const [activeCohorts, totalCohorts, upcomingCohorts] = await Promise.all([
    prisma.cohort.findMany({
      where: {
        startDate: { lte: now },
        endDate: { gte: now },
      },
      orderBy: { startDate: "asc" },
      select: {
        id: true,
        name: true,
        examCategory: true,
        startDate: true,
        endDate: true,
        targetExamYear: true,
        _count: { select: { enrollments: true } },
      },
    }),
    prisma.cohort.count(),
    prisma.cohort.findMany({
      where: {
        startDate: { gt: now },
      },
      orderBy: { startDate: "asc" },
      take: 5,
      select: {
        id: true,
        name: true,
        examCategory: true,
        startDate: true,
        endDate: true,
      },
    }),
  ]);

  const links: { href: string; label: string; description: string; badge: string; badgeColor: string }[] = [
    {
      href: "/admin/settings/cohorts",
      label: "기수 관리",
      description: "수험유형별 기수 등록·시작일·종료일·정원 설정",
      badge: "수강·강좌",
      badgeColor: "border-ember/20 bg-ember/10 text-ember",
    },
    {
      href: "/admin/settings/cohorts/new",
      label: "새 기수 등록",
      description: "신규 기수를 생성하고 학사일정을 설정합니다",
      badge: "수강·강좌",
      badgeColor: "border-ember/20 bg-ember/10 text-ember",
    },
    {
      href: "/admin/settings/lecture-schedules",
      label: "강의 스케줄",
      description: "기수별 강의 요일·시간·과목·강사 스케줄 설정",
      badge: "학사",
      badgeColor: "border-amber-200 bg-amber-50 text-amber-700",
    },
    {
      href: "/admin/settings/civil-exams",
      label: "공무원 시험 일정",
      description: "공채·경채 시험 일정 등록 및 관리",
      badge: "학사",
      badgeColor: "border-amber-200 bg-amber-50 text-amber-700",
    },
  ];

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        설정 · 학사연도 관리
      </div>
      <h1 className="mt-5 text-3xl font-semibold text-ink">학사연도 관리</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        학원의 학사일정은 <strong>기수(Cohort)</strong>와 <strong>강의 스케줄</strong> 설정으로 관리합니다.
        별도의 학사연도 DB 모델 없이, 기수별 시작·종료일 및 목표시험연도를 통해 연간 계획을 수립하세요.
      </p>

      {/* Info Banner */}
      <div className="mt-8 flex items-start gap-4 rounded-2xl border border-forest/20 bg-forest/5 p-5">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-forest/10">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#1F4D3A"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-semibold text-forest">학사일정 관리 방법</p>
          <p className="mt-1 text-sm text-slate leading-relaxed">
            기수(Cohort) 및 시험기간(Period) 설정에서 학사일정을 관리하세요.
            각 기수에 목표시험연도, 시작일, 종료일을 지정하면 연간 학사일정이 자동으로 구성됩니다.
          </p>
        </div>
      </div>

      {/* Current Year Summary */}
      <div className="mt-10">
        <h2 className="text-lg font-semibold text-ink">{currentYear}년 현황</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-ink/10 bg-white p-6">
            <p className="text-sm font-medium text-slate">현재 운영 기수</p>
            <p className="mt-3 text-4xl font-bold text-ink">
              {activeCohorts.length}
              <span className="ml-1 text-base font-medium text-slate">개</span>
            </p>
          </div>
          <div className="rounded-2xl border border-ink/10 bg-white p-6">
            <p className="text-sm font-medium text-slate">전체 등록 기수</p>
            <p className="mt-3 text-4xl font-bold text-ink">
              {totalCohorts}
              <span className="ml-1 text-base font-medium text-slate">개</span>
            </p>
          </div>
          <div className="rounded-2xl border border-ink/10 bg-white p-6">
            <p className="text-sm font-medium text-slate">예정 기수</p>
            <p className="mt-3 text-4xl font-bold text-ink">
              {upcomingCohorts.length}
              <span className="ml-1 text-base font-medium text-slate">개</span>
            </p>
          </div>
        </div>
      </div>

      {/* Active Cohorts */}
      {activeCohorts.length > 0 && (
        <div className="mt-10">
          <h2 className="text-lg font-semibold text-ink">현재 운영 중인 기수</h2>
          <div className="mt-4 rounded-[28px] border border-ink/10 bg-white overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-ink/10 bg-mist">
                    {["기수명", "수험유형", "목표연도", "시작일", "종료일", "수강생"].map((h) => (
                      <th
                        key={h}
                        className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeCohorts.map((cohort, idx) => {
                    const isAlt = idx % 2 === 1;
                    return (
                      <tr
                        key={cohort.id}
                        className={`border-b border-ink/5 transition-colors hover:bg-forest/5 ${isAlt ? "bg-mist/50" : "bg-white"}`}
                      >
                        <td className="px-5 py-4">
                          <Link
                            href={`/admin/settings/cohorts/${cohort.id}`}
                            className="font-semibold text-ink hover:text-ember hover:underline"
                          >
                            {cohort.name}
                          </Link>
                        </td>
                        <td className="px-5 py-4 text-sm text-slate">{cohort.examCategory}</td>
                        <td className="px-5 py-4 text-sm text-slate">
                          {cohort.targetExamYear ? `${cohort.targetExamYear}년` : "-"}
                        </td>
                        <td className="px-5 py-4 text-sm text-slate">{formatDate(cohort.startDate)}</td>
                        <td className="px-5 py-4 text-sm text-slate">{formatDate(cohort.endDate)}</td>
                        <td className="px-5 py-4">
                          <span className="rounded-full border border-forest/30 bg-forest/10 px-2.5 py-0.5 text-xs font-semibold text-forest">
                            {cohort._count.enrollments}명
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Upcoming Cohorts */}
      {upcomingCohorts.length > 0 && (
        <div className="mt-10">
          <h2 className="text-lg font-semibold text-ink">예정 기수</h2>
          <div className="mt-4 rounded-[28px] border border-ink/10 bg-white overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-ink/10 bg-mist">
                    {["기수명", "수험유형", "시작일", "종료일"].map((h) => (
                      <th
                        key={h}
                        className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {upcomingCohorts.map((cohort, idx) => {
                    const isAlt = idx % 2 === 1;
                    return (
                      <tr
                        key={cohort.id}
                        className={`border-b border-ink/5 transition-colors hover:bg-forest/5 ${isAlt ? "bg-mist/50" : "bg-white"}`}
                      >
                        <td className="px-5 py-4">
                          <Link
                            href={`/admin/settings/cohorts/${cohort.id}`}
                            className="font-semibold text-ink hover:text-ember hover:underline"
                          >
                            {cohort.name}
                          </Link>
                        </td>
                        <td className="px-5 py-4 text-sm text-slate">{cohort.examCategory}</td>
                        <td className="px-5 py-4 text-sm text-slate">{formatDate(cohort.startDate)}</td>
                        <td className="px-5 py-4 text-sm text-slate">{formatDate(cohort.endDate)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Quick Links */}
      <div className="mt-10">
        <h2 className="text-lg font-semibold text-ink">관련 설정 바로가기</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              prefetch={false}
              className="group flex flex-col gap-3 rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm transition hover:border-ember/30 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <span
                  className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${link.badgeColor}`}
                >
                  {link.badge}
                </span>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  className="mt-0.5 shrink-0 text-slate transition group-hover:text-ember"
                  aria-hidden="true"
                >
                  <path
                    d="M3 8h10M9 4l4 4-4 4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-ink transition group-hover:text-ember">
                  {link.label}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate">{link.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Footer nav */}
      <div className="mt-10 flex">
        <Link
          href="/admin/settings"
          className="rounded-xl border border-ink/20 bg-white px-4 py-2.5 text-sm font-semibold text-slate hover:bg-mist transition-colors"
        >
          ← 설정 목록으로
        </Link>
      </div>
    </div>
  );
}
