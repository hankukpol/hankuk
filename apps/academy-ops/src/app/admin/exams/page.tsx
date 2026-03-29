import { AdminRole, ExamEventType } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<ExamEventType, string> = {
  MORNING: "아침모의고사",
  MONTHLY: "월말평가",
  SPECIAL: "특강모의고사",
  EXTERNAL: "외부모의고사",
};

const TYPE_DESCRIPTION: Record<ExamEventType, string> = {
  MORNING: "매일 오전 정기 모의고사 접수 및 성적 관리",
  MONTHLY: "월말평가 시험 등록, 접수, 결과 관리",
  SPECIAL: "특강 수강생 대상 별도 시험 관리",
  EXTERNAL: "경찰청·공단 주관 외부 시험 성적 기록",
};

const TYPE_HREF: Record<ExamEventType, string> = {
  MORNING: "/admin/exams/morning",
  MONTHLY: "/admin/exams/monthly",
  SPECIAL: "/admin/exams/special",
  EXTERNAL: "/admin/exams/external",
};

const TYPE_COLOR: Record<ExamEventType, string> = {
  MORNING: "bg-ember/10 text-ember border-ember/20",
  MONTHLY: "bg-forest/10 text-forest border-forest/20",
  SPECIAL: "bg-blue-500/10 text-blue-600 border-blue-200",
  EXTERNAL: "bg-purple-500/10 text-purple-600 border-purple-200",
};

export default async function ExamsHubPage() {
  await requireAdminContext(AdminRole.VIEWER);

  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  now.setHours(0, 0, 0, 0);

  // Count active events per type + upcoming in next 30 days
  const [eventCounts, upcomingEvents] = await Promise.all([
    getPrisma().examEvent.groupBy({
      by: ["eventType"],
      where: { isActive: true },
      _count: { id: true },
    }),
    getPrisma().examEvent.findMany({
      where: {
        isActive: true,
        examDate: { gte: now, lte: in30Days },
      },
      orderBy: { examDate: "asc" },
      take: 10,
    }),
  ]);

  const countByType: Record<string, number> = {};
  for (const row of eventCounts) {
    countByType[row.eventType] = row._count.id;
  }

  const EXAM_TYPES = [
    ExamEventType.MORNING,
    ExamEventType.MONTHLY,
    ExamEventType.SPECIAL,
    ExamEventType.EXTERNAL,
  ] as const;

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-ink/20 bg-ink/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate">
        시험 관리
      </div>
      <h1 className="mt-5 text-3xl font-semibold">시험 관리 센터</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        아침모의고사·월말평가·특강모의고사·외부시험을 관리합니다.
      </p>

      {/* Type cards */}
      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
        {EXAM_TYPES.map((type) => (
          <Link
            key={type}
            href={TYPE_HREF[type]}
            className="group rounded-[28px] border border-ink/10 bg-white p-8 shadow-panel hover:border-ember/30 hover:shadow-lg transition-all"
          >
            <div className="flex items-start justify-between">
              <div>
                <div
                  className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${TYPE_COLOR[type]}`}
                >
                  {TYPE_LABEL[type]}
                </div>
                <h2 className="mt-4 text-xl font-semibold text-ink">
                  {TYPE_LABEL[type]}
                </h2>
                <p className="mt-2 text-sm text-slate leading-6">
                  {TYPE_DESCRIPTION[type]}
                </p>
              </div>
              <svg
                className="mt-1 h-6 w-6 text-slate group-hover:text-ember transition-colors"
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
            <div className="mt-6 text-xs text-slate">
              활성 {countByType[type] ?? 0}건 →
            </div>
          </Link>
        ))}
      </div>

      {/* Quick links */}
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/admin/exams/monthly-evals"
          className="inline-flex items-center gap-2 rounded-full border border-forest/20 bg-forest/5 px-4 py-2 text-sm font-medium text-forest transition hover:bg-forest/10"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          월말 평가 개요
        </Link>
        <Link
          href="/admin/exams/monthly/results"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-4 py-2 text-sm font-medium text-slate transition hover:border-ember/20 hover:text-ember"
        >
          월말평가 결과 분석
        </Link>
        <Link
          href="/admin/exams/registrations"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-4 py-2 text-sm font-medium text-slate transition hover:border-ember/20 hover:text-ember"
        >
          전체 접수 현황
        </Link>
      </div>

      {/* Upcoming exams */}
      {upcomingEvents.length > 0 && (
        <div className="mt-8 rounded-[28px] border border-ink/10 bg-white shadow-panel overflow-hidden">
          <div className="px-6 py-4 border-b border-ink/5">
            <h2 className="text-sm font-semibold text-ink">
              향후 30일 예정 시험
            </h2>
          </div>
          <div className="divide-y divide-ink/5">
            {upcomingEvents.map((e) => {
              const daysUntil = Math.ceil(
                (e.examDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
              );
              return (
                <Link
                  key={e.id}
                  href={TYPE_HREF[e.eventType]}
                  className="flex items-center justify-between px-6 py-3 hover:bg-mist/50"
                >
                  <div>
                    <p className="text-sm font-medium text-ink">{e.title}</p>
                    <p className="text-xs text-slate">
                      {e.examDate.toLocaleDateString("ko-KR")} ·{" "}
                      {TYPE_LABEL[e.eventType]}
                    </p>
                  </div>
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                      daysUntil <= 3
                        ? "bg-red-50 text-red-600"
                        : daysUntil <= 7
                          ? "bg-amber-50 text-amber-600"
                          : "bg-mist text-slate"
                    }`}
                  >
                    D-{daysUntil}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
