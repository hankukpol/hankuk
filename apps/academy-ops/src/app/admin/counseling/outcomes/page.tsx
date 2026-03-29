import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { OutcomesClient } from "./outcomes-client";
import type { CounselorOutcome, CounselingSessionDetail } from "./outcomes-client";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

function readStringParam(
  sp: Record<string, string | string[] | undefined> | undefined,
  key: string,
): string | undefined {
  const v = sp?.[key];
  return typeof v === "string" ? v : undefined;
}

export default async function CounselingOutcomesPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.MANAGER);

  const daysParam = readStringParam(searchParams, "days");
  const periodDays = daysParam ? parseInt(daysParam, 10) || 90 : 90;

  const now = new Date();
  const since = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);

  const prisma = getPrisma();

  // Fetch all counseling records in period with student info
  const records = await prisma.counselingRecord.findMany({
    where: { counseledAt: { gte: since } },
    include: { student: { select: { examNumber: true, name: true } } },
    orderBy: { counseledAt: "asc" },
  });

  // For each record compute pre/post scores
  // Pre: avg finalScore from 2 weeks before counseledAt
  // Post: avg finalScore from 2 weeks after counseledAt
  const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

  type SessionData = CounselingSessionDetail & { counselorName: string };
  const sessionDataList: SessionData[] = [];

  for (const rec of records) {
    const counseledAt = rec.counseledAt;
    const preStart = new Date(counseledAt.getTime() - TWO_WEEKS_MS);
    const preEnd = counseledAt;
    const postStart = counseledAt;
    const postEnd = new Date(counseledAt.getTime() + TWO_WEEKS_MS);

    const [preScores, postScores] = await Promise.all([
      prisma.score.findMany({
        where: {
          examNumber: rec.examNumber,
          finalScore: { not: null },
          session: {
            examDate: { gte: preStart, lt: preEnd },
          },
        },
        select: { finalScore: true },
      }),
      prisma.score.findMany({
        where: {
          examNumber: rec.examNumber,
          finalScore: { not: null },
          session: {
            examDate: { gt: postStart, lte: postEnd },
          },
        },
        select: { finalScore: true },
      }),
    ]);

    const preAvg =
      preScores.length > 0
        ? preScores.reduce((sum, s) => sum + (s.finalScore ?? 0), 0) / preScores.length
        : null;
    const postAvg =
      postScores.length > 0
        ? postScores.reduce((sum, s) => sum + (s.finalScore ?? 0), 0) / postScores.length
        : null;
    const improvement =
      preAvg !== null && postAvg !== null ? postAvg - preAvg : null;

    sessionDataList.push({
      id: rec.id,
      examNumber: rec.examNumber,
      studentName: rec.student.name,
      counseledAt: rec.counseledAt.toISOString(),
      preAvg,
      postAvg,
      improvement,
      counselorName: rec.counselorName,
    });
  }

  // Group by counselorName
  const counselorMap = new Map<string, SessionData[]>();
  for (const sd of sessionDataList) {
    if (!counselorMap.has(sd.counselorName)) {
      counselorMap.set(sd.counselorName, []);
    }
    counselorMap.get(sd.counselorName)!.push(sd);
  }

  const counselors: CounselorOutcome[] = Array.from(counselorMap.entries())
    .map(([counselorName, sessions]) => {
      const withData = sessions.filter((s) => s.improvement !== null);
      const successCount = withData.filter((s) => (s.improvement ?? 0) > 0).length;
      const successRate =
        withData.length > 0
          ? Math.round((successCount / withData.length) * 1000) / 10
          : 0;
      const improvements = withData
        .map((s) => s.improvement)
        .filter((v): v is number => v !== null);
      const avgImprovement =
        improvements.length > 0
          ? Math.round(
              (improvements.reduce((a, b) => a + b, 0) / improvements.length) * 10,
            ) / 10
          : null;

      return {
        counselorName,
        totalSessions: sessions.length,
        successCount,
        successRate,
        avgImprovement,
        sessions: sessions.map(({ counselorName: _cn, ...rest }) => rest),
      };
    })
    .sort((a, b) => b.successRate - a.successRate);

  // Global KPIs
  const totalSessions = sessionDataList.length;
  const globalSuccessCount = sessionDataList.filter(
    (s) => s.improvement !== null && s.improvement > 0,
  ).length;
  const allImprovements = sessionDataList
    .map((s) => s.improvement)
    .filter((v): v is number => v !== null);
  const avgImprovement =
    allImprovements.length > 0
      ? Math.round(
          (allImprovements.reduce((a, b) => a + b, 0) / allImprovements.length) * 10,
        ) / 10
      : null;
  const topCounselor = counselors.length > 0 ? counselors[0].counselorName : null;

  const PERIOD_OPTIONS = [
    { days: 30, label: "30일" },
    { days: 60, label: "60일" },
    { days: 90, label: "90일" },
    { days: 180, label: "180일" },
  ];

  return (
    <div className="space-y-8 p-8 sm:p-10">
      {/* Header */}
      <div>
        <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
          상담 효과 분석
        </div>
        <h1 className="mt-5 text-3xl font-semibold">상담 효과 분석</h1>
        <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
          상담 전후 성적 변화를 분석하여 상담 효과와 상담사별 성과를 측정합니다.
          상담일 기준 전후 2주 성적 평균을 비교합니다.
        </p>
        <div className="mt-4">
          <Link
            prefetch={false}
            href="/admin/counseling"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate transition hover:text-ember"
          >
            <span>←</span>
            <span>면담 허브로</span>
          </Link>
        </div>
      </div>

      {/* Period filter */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-slate">기간:</span>
        {PERIOD_OPTIONS.map((opt) => (
          <Link
            key={opt.days}
            prefetch={false}
            href={`/admin/counseling/outcomes?days=${opt.days}`}
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition ${
              periodDays === opt.days
                ? "border-ink bg-ink text-white"
                : "border-ink/10 bg-white text-slate hover:border-ink/30 hover:text-ink"
            }`}
          >
            {opt.label}
          </Link>
        ))}
      </div>

      {/* Client component with data */}
      <OutcomesClient
        counselors={counselors}
        totalSessions={totalSessions}
        successCount={globalSuccessCount}
        avgImprovement={avgImprovement}
        topCounselor={topCounselor}
        periodDays={periodDays}
      />
    </div>
  );
}
