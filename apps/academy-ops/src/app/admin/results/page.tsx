import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ResultsPage() {
  await requireAdminContext(AdminRole.TEACHER);

  const [latestPeriod, studentCount] = await Promise.all([
    getPrisma()
      .examPeriod.findFirst({
        where: { isActive: true },
        orderBy: { startDate: "desc" },
        select: { id: true, name: true, startDate: true, endDate: true },
      })
      .catch(() => null),
    getPrisma().student.count({ where: { isActive: true } }).catch(() => 0),
  ]);

  const cards = [
    {
      href: "/admin/results/weekly",
      badge: "주간",
      badgeColor: "bg-ember/10 text-ember",
      hoverBorder: "hover:border-ember/30",
      hoverArrow: "group-hover:text-ember",
      title: "주간 결과표",
      description: "주별 성적 결과 시트, 인쇄 가능",
      hint: "주간 성적 조회 →",
    },
    {
      href: "/admin/results/monthly",
      badge: "월간",
      badgeColor: "bg-forest/10 text-forest",
      hoverBorder: "hover:border-forest/30",
      hoverArrow: "group-hover:text-forest",
      title: "월간 결과표",
      description: "월별 성적 현황 요약 및 인쇄",
      hint: "월간 성적 조회 →",
    },
    {
      href: "/admin/results/cohort",
      badge: "기수별",
      badgeColor: "bg-sky-500/10 text-sky-600",
      hoverBorder: "hover:border-sky-400/30",
      hoverArrow: "group-hover:text-sky-500",
      title: "기수별 통계",
      description: "기수 단위 평균·분포 통계",
      hint: "기수 선택 후 조회 →",
    },
    {
      href: "/admin/results/comparison",
      badge: "비교",
      badgeColor: "bg-ember/10 text-ember",
      hoverBorder: "hover:border-ember/30",
      hoverArrow: "group-hover:text-ember",
      title: "비교 분석",
      description: "두 학생 또는 두 기간 성적 비교",
      hint: "학생·기간 비교 →",
    },
    {
      href: "/admin/results/distribution",
      badge: "분포",
      badgeColor: "bg-forest/10 text-forest",
      hoverBorder: "hover:border-forest/30",
      hoverArrow: "group-hover:text-forest",
      title: "점수 분포",
      description: "점수대별 학생 분포 히스토그램",
      hint: "분포 차트 보기 →",
    },
    {
      href: "/admin/results/integrated",
      badge: "통합",
      badgeColor: "bg-sky-500/10 text-sky-600",
      hoverBorder: "hover:border-sky-400/30",
      hoverArrow: "group-hover:text-sky-500",
      title: "통합 결과표",
      description: "전체 기간 통합 성적 시트",
      hint: "전체 기간 조회 →",
    },
  ] as const;

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        성적 결과
      </div>
      <h1 className="mt-5 text-3xl font-semibold">성적 결과 센터</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        주간·월간 성적 결과표와 기수별·비교·분포 분석을 제공합니다.
      </p>

      {/* Quick KPI */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">
            현재 시험 기간
          </p>
          <p className="mt-2 text-2xl font-bold text-ink">
            {latestPeriod ? latestPeriod.name : "—"}
          </p>
          <p className="mt-1 text-xs text-slate">
            {latestPeriod ? "진행 중" : "활성 기간 없음"}
          </p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">
            재적 학생 수
          </p>
          <p className="mt-2 text-2xl font-bold text-ink">
            {studentCount.toLocaleString()}명
          </p>
          <p className="mt-1 text-xs text-slate">재학 중 (ACTIVE)</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">
            시험 기간 범위
          </p>
          <p className="mt-2 text-2xl font-bold text-ink">
            {latestPeriod
              ? new Date(latestPeriod.startDate).toLocaleDateString("ko-KR", {
                  month: "short",
                  day: "numeric",
                })
              : "—"}
          </p>
          <p className="mt-1 text-xs text-slate">
            {latestPeriod
              ? `~ ${new Date(latestPeriod.endDate).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}`
              : "기간 미설정"}
          </p>
        </div>
      </div>

      {/* Sub-page Cards */}
      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className={`group rounded-[28px] border border-ink/10 bg-white p-8 shadow-panel ${card.hoverBorder} hover:shadow-lg transition-all`}
          >
            <div className="flex items-start justify-between">
              <div>
                <div
                  className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${card.badgeColor}`}
                >
                  {card.badge}
                </div>
                <h2 className="mt-4 text-xl font-semibold text-ink">
                  {card.title}
                </h2>
                <p className="mt-2 text-sm text-slate leading-6">
                  {card.description}
                </p>
              </div>
              <svg
                className={`mt-1 h-6 w-6 text-slate ${card.hoverArrow} transition-colors`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </div>
            <div className="mt-6 text-xs text-slate">{card.hint}</div>
          </Link>
        ))}
      </div>

      {/* Quick Navigation */}
      <div className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
        <h2 className="text-sm font-semibold text-ink">관련 페이지</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/admin/scores/input"
            className="inline-flex items-center gap-1.5 rounded-lg border border-ink/10 px-3 py-1.5 text-sm text-slate hover:bg-mist"
          >
            성적 입력
          </Link>
          <Link
            href="/admin/students/analyze"
            className="inline-flex items-center gap-1.5 rounded-lg border border-ink/10 px-3 py-1.5 text-sm text-slate hover:bg-mist"
          >
            학생 분석
          </Link>
          <Link
            href="/admin/attendance/calendar"
            className="inline-flex items-center gap-1.5 rounded-lg border border-ink/10 px-3 py-1.5 text-sm text-slate hover:bg-mist"
          >
            출결 현황
          </Link>
        </div>
      </div>
    </div>
  );
}
