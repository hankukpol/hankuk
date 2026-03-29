import Link from "next/link";
import { StudentLookupForm } from "@/components/student-portal/student-lookup-form";
import { PointsHistoryPanel } from "@/components/student-portal/points-history-panel";
import { formatPoint } from "@/lib/analytics/presentation";
import { hasDatabaseConfig } from "@/lib/env";
import { getStudentPortalViewer } from "@/lib/student-portal/service";
import { getStudentPortalPointsPageData } from "@/student-portal-api-data";

export const dynamic = "force-dynamic";

export default async function StudentPointsPage() {
  if (!hasDatabaseConfig()) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
              Student Points Unavailable
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              포인트 기능은 DB 연결 후 사용할 수 있습니다.
            </h1>
            <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
              현재 환경에서는 학생 포인트 이력을 불러올 데이터베이스가 연결되어 있지 않습니다.
            </p>
          </section>
        </div>
      </main>
    );
  }

  const viewer = await getStudentPortalViewer();

  if (!viewer) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
              Student Points Login
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              학생 포털 로그인 후 확인할 수 있습니다.
            </h1>
            <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
              학생 조회 후 로그인하면 포인트 적립 및 사용 이력을 바로 확인할 수 있습니다.
            </p>
          </section>

          <StudentLookupForm redirectPath="/student/points" />
        </div>
      </main>
    );
  }

  const data = await getStudentPortalPointsPageData({ examNumber: viewer.examNumber });

  if (!data) {
    return null;
  }

  const { summary, monthlyStats, typeStats, pointLogs, student } = data;

  return (
    <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
                Student Points
              </div>
              <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
                {student.name}님의 포인트
              </h1>
              <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
                포인트 적립과 사용 이력을 학생 포털에서 바로 확인할 수 있습니다.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/student"
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                포털 홈으로 돌아가기
              </Link>
            </div>
          </div>

          <div className="mt-8">
            <div className="rounded-[28px] bg-gradient-to-br from-ember/90 to-[#a84d0e] p-6 text-white sm:p-8">
              <p className="text-sm font-medium opacity-80">현재 보유 포인트</p>
              <p className="mt-2 text-5xl font-bold tracking-tight sm:text-6xl">
                {formatPoint(summary.totalPoints)}
              </p>
              <p className="mt-3 text-sm opacity-70">
                이번 달 {summary.currentMonthPoints >= 0 ? "+" : ""}
                {formatPoint(summary.currentMonthPoints)}
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
              <p className="text-sm text-slate">전체 이력</p>
              <p className="mt-3 text-xl font-semibold">{summary.historyCount}건</p>
            </article>
            <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
              <p className="text-sm text-slate">적립 건수</p>
              <p className="mt-3 text-xl font-semibold text-ember">{summary.earnedCount}건</p>
            </article>
            <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
              <p className="text-sm text-slate">사용 건수</p>
              <p className="mt-3 text-xl font-semibold text-red-600">{summary.spentCount}건</p>
            </article>
            <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
              <p className="text-sm text-slate">이번 달 적립</p>
              <p className="mt-3 text-xl font-semibold">{formatPoint(summary.currentMonthPoints)}</p>
            </article>
          </div>
        </section>

        <PointsHistoryPanel
          pointLogs={pointLogs.map((log) => ({
            id: log.id,
            type: log.type,
            amount: log.amount,
            reason: log.reason,
            year: log.year,
            month: log.month,
            grantedAt: log.grantedAt.toISOString(),
            period: log.period ?? null,
          }))}
          monthlyStats={monthlyStats}
          typeStats={typeStats}
          totalPoints={summary.totalPoints}
          earnedCount={summary.earnedCount}
          spentCount={summary.spentCount}
        />
      </div>
    </main>
  );
}
