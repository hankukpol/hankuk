import Link from "next/link";
import { AdminRole, ExamEventType } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ── Types ──────────────────────────────────────────────────────────────────────

type EvalRow = {
  id: string;
  title: string;
  examDate: string;
  venue: string | null;
  registrationFee: number;
  isActive: boolean;
  totalRegistrations: number;
  paidCount: number;
  scoredCount: number;
  avgScore: number | null;
  topScore: number | null;
  lowestScore: number | null;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function round1(v: number) {
  return Math.round(v * 10) / 10;
}

function formatKRDate(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// ── Server Component ───────────────────────────────────────────────────────────

export default async function MonthlyEvalsPage() {
  await requireAdminContext(AdminRole.TEACHER);

  const prisma = getPrisma();
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfYear = new Date(now.getFullYear(), 0, 1);

  // Fetch all MONTHLY exam events with registrations and their scores
  const events = await prisma.examEvent.findMany({
    where: { eventType: ExamEventType.MONTHLY },
    orderBy: { examDate: "desc" },
    include: {
      registrations: {
        select: {
          id: true,
          isPaid: true,
          cancelledAt: true,
          score: {
            select: {
              score: true,
            },
          },
        },
      },
    },
  });

  // Build row data
  const rows: EvalRow[] = events.map((e) => {
    const activeRegs = e.registrations.filter((r) => !r.cancelledAt);
    const paidCount = activeRegs.filter((r) => r.isPaid).length;

    // Collect scores from registrations (ExamRegistration 1:1 ExamScore)
    const allScores: number[] = activeRegs
      .filter((r) => r.score !== null)
      .map((r) => r.score!.score);

    const avgScore =
      allScores.length > 0
        ? round1(allScores.reduce((a, b) => a + b, 0) / allScores.length)
        : null;
    const topScore = allScores.length > 0 ? Math.max(...allScores) : null;
    const lowestScore = allScores.length > 0 ? Math.min(...allScores) : null;

    return {
      id: e.id,
      title: e.title,
      examDate: e.examDate.toISOString(),
      venue: e.venue,
      registrationFee: e.registrationFee,
      isActive: e.isActive,
      totalRegistrations: activeRegs.length,
      paidCount,
      scoredCount: allScores.length,
      avgScore,
      topScore,
      lowestScore,
    };
  });

  // ── KPI ─────────────────────────────────────────────────────────────────────
  const thisMonthCount = events.filter(
    (e) => e.examDate >= startOfMonth,
  ).length;
  const thisYearEvents = events.filter((e) => e.examDate >= startOfYear);

  const allScoresThisYear: number[] = thisYearEvents.flatMap((e) =>
    e.registrations
      .filter((r) => !r.cancelledAt && r.score !== null)
      .map((r) => r.score!.score),
  );

  const yearAvgScore =
    allScoresThisYear.length > 0
      ? round1(
          allScoresThisYear.reduce((a, b) => a + b, 0) /
            allScoresThisYear.length,
        )
      : null;

  const kpi = {
    thisMonthCount,
    totalThisYear: thisYearEvents.length,
    yearAvgScore,
    totalParticipants: allScoresThisYear.length,
  };

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            월말 평가
          </div>
          <h1 className="mt-5 text-3xl font-semibold text-ink">
            월말 평가 모의고사
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            월말평가 시험 목록과 회차별 접수 현황, 성적 통계를 확인합니다.
            접수 관리 및 성적 입력은 각 시험 상세 페이지에서 처리합니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/admin/exams/monthly"
            className="inline-flex items-center gap-2 rounded-full border border-forest/30 bg-forest/10 px-5 py-2 text-sm font-semibold text-forest transition hover:bg-forest/20"
          >
            접수 관리
          </Link>
          <Link
            href="/admin/exams/monthly/results"
            className="inline-flex items-center gap-2 rounded-full border border-ember/30 px-5 py-2 text-sm font-semibold text-ember transition hover:bg-ember/10"
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
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
            결과 분석
          </Link>
          <Link
            href="/admin/exams/new?type=MONTHLY"
            className="inline-flex items-center gap-2 rounded-full bg-ember px-5 py-2 text-sm font-semibold text-white transition hover:bg-ember/90"
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
            새 월말 평가 등록
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate">
            이번 달 평가
          </p>
          <p className="mt-3 text-3xl font-bold text-ink">
            {kpi.thisMonthCount}
          </p>
          <p className="mt-1 text-xs text-slate">회</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate">
            올해 총 평가
          </p>
          <p className="mt-3 text-3xl font-bold text-ink">
            {kpi.totalThisYear}
          </p>
          <p className="mt-1 text-xs text-slate">회</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate">
            올해 전체 평균
          </p>
          <p className="mt-3 text-3xl font-bold text-ember">
            {kpi.yearAvgScore !== null ? `${kpi.yearAvgScore}점` : "—"}
          </p>
          <p className="mt-1 text-xs text-slate">성적 입력 기준</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate">
            올해 참여 인원
          </p>
          <p className="mt-3 text-3xl font-bold text-forest">
            {kpi.totalParticipants}
          </p>
          <p className="mt-1 text-xs text-slate">명 (성적 입력 기준)</p>
        </div>
      </div>

      {/* Table */}
      {rows.length === 0 ? (
        <div className="mt-8 rounded-[28px] border border-dashed border-ink/10 p-12 text-center">
          <p className="text-sm text-slate">등록된 월말평가 시험이 없습니다.</p>
          <Link
            href="/admin/exams/new?type=MONTHLY"
            className="mt-4 inline-flex items-center rounded-full bg-ember px-5 py-2 text-sm font-semibold text-white transition hover:bg-ember/90"
          >
            첫 번째 월말 평가 등록하기
          </Link>
        </div>
      ) : (
        <div className="mt-8 overflow-hidden rounded-[28px] border border-ink/10 bg-white shadow-panel">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-ink/10 text-sm">
              <thead className="bg-mist/80">
                <tr>
                  <th className="px-5 py-3.5 text-left font-semibold text-ink">
                    시험명
                  </th>
                  <th className="px-5 py-3.5 text-left font-semibold text-ink">
                    시험일
                  </th>
                  <th className="px-5 py-3.5 text-right font-semibold text-ink">
                    접수
                  </th>
                  <th className="px-5 py-3.5 text-right font-semibold text-ink">
                    납부
                  </th>
                  <th className="px-5 py-3.5 text-right font-semibold text-ink">
                    성적 입력
                  </th>
                  <th className="px-5 py-3.5 text-right font-semibold text-ink">
                    평균
                  </th>
                  <th className="px-5 py-3.5 text-right font-semibold text-ink">
                    최고
                  </th>
                  <th className="px-5 py-3.5 text-right font-semibold text-ink">
                    최저
                  </th>
                  <th className="px-5 py-3.5 text-center font-semibold text-ink">
                    상태
                  </th>
                  <th className="px-5 py-3.5 text-right font-semibold text-ink">
                    관리
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {rows.map((row) => {
                  const examDateObj = new Date(row.examDate);
                  const isPast = examDateObj < now;
                  const daysUntil = Math.ceil(
                    (examDateObj.getTime() - now.getTime()) /
                      (1000 * 60 * 60 * 24),
                  );
                  const isUpcoming = !isPast && daysUntil <= 7;

                  return (
                    <tr
                      key={row.id}
                      className="transition-colors hover:bg-mist/40"
                    >
                      <td className="px-5 py-4">
                        <Link
                          href={`/admin/exams/monthly/${row.id}`}
                          className="font-medium text-ink transition hover:text-ember"
                        >
                          {row.title}
                        </Link>
                        {row.venue && (
                          <p className="mt-0.5 text-xs text-slate">
                            {row.venue}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-4 text-slate">
                        <span
                          className={
                            isUpcoming ? "font-semibold text-forest" : ""
                          }
                        >
                          {formatKRDate(row.examDate)}
                        </span>
                        {isUpcoming && (
                          <span className="ml-2 inline-flex rounded-full border border-forest/20 bg-forest/10 px-2 py-0.5 text-xs font-semibold text-forest">
                            D-{daysUntil}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right font-mono text-ink">
                        {row.totalRegistrations}명
                      </td>
                      <td className="px-5 py-4 text-right font-mono">
                        <span
                          className={
                            row.paidCount < row.totalRegistrations &&
                            row.totalRegistrations > 0
                              ? "text-amber-600"
                              : "text-forest"
                          }
                        >
                          {row.paidCount}
                        </span>
                        <span className="text-slate">
                          /{row.totalRegistrations}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right font-mono">
                        {row.scoredCount > 0 ? (
                          <span className="text-forest">
                            {row.scoredCount}명
                          </span>
                        ) : (
                          <span className="text-ink/25">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right font-mono font-semibold">
                        {row.avgScore !== null ? (
                          <span
                            className={
                              row.avgScore >= 80
                                ? "text-forest"
                                : row.avgScore >= 60
                                  ? "text-ink"
                                  : "text-red-500"
                            }
                          >
                            {row.avgScore}점
                          </span>
                        ) : (
                          <span className="text-ink/25">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right font-mono text-ember">
                        {row.topScore !== null ? (
                          `${row.topScore}점`
                        ) : (
                          <span className="text-ink/25">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right font-mono text-slate">
                        {row.lowestScore !== null ? (
                          `${row.lowestScore}점`
                        ) : (
                          <span className="text-ink/25">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-center">
                        {row.isActive ? (
                          <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-2.5 py-0.5 text-xs font-semibold text-forest">
                            활성
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full border border-ink/10 bg-ink/5 px-2.5 py-0.5 text-xs font-semibold text-slate">
                            비활성
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="inline-flex items-center gap-3">
                          <Link
                            href={`/admin/exams/monthly/${row.id}`}
                            className="text-xs font-semibold text-slate transition hover:text-ink"
                          >
                            접수 관리
                          </Link>
                          {row.scoredCount > 0 && (
                            <Link
                              href={`/admin/exams/monthly/${row.id}/scores`}
                              className="text-xs font-semibold text-forest transition hover:underline"
                            >
                              성적 보기
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Navigation back */}
      <div className="mt-6">
        <Link
          href="/admin/exams"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate transition hover:text-ink"
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
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          시험 관리 센터로
        </Link>
      </div>
    </div>
  );
}
