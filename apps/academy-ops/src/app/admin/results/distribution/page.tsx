import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import DistributionClient from "./distribution-client";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

function readParam(
  searchParams: Record<string, string | string[] | undefined> | undefined,
  key: string,
): string | null {
  const val = searchParams?.[key];
  if (!val) return null;
  return Array.isArray(val) ? (val[0] ?? null) : val;
}

export default async function DistributionPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.TEACHER);

  const prisma = getPrisma();

  const periodIdStr = readParam(searchParams, "periodId");
  const sessionIdStr = readParam(searchParams, "sessionId");
  const examType = readParam(searchParams, "examType");

  const periodId = periodIdStr ? parseInt(periodIdStr) : null;
  const sessionId = sessionIdStr ? parseInt(sessionIdStr) : null;

  // Load periods for dropdown
  const periods = await prisma.examPeriod.findMany({
    orderBy: { startDate: "desc" },
    select: { id: true, name: true, isActive: true },
  });

  // Load sessions for dropdown (if period selected)
  const sessions =
    periodId !== null
      ? await prisma.examSession.findMany({
          where: {
            periodId,
            isCancelled: false,
            ...(examType ? { examType: examType as "GONGCHAE" | "GYEONGCHAE" } : {}),
          },
          orderBy: [{ week: "asc" }, { examDate: "asc" }],
          select: {
            id: true,
            week: true,
            subject: true,
            examDate: true,
            examType: true,
            displaySubjectName: true,
          },
        })
      : [];

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        결과 분석
      </div>
      <h1 className="mt-5 text-3xl font-semibold">성적 분포 분석</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        기간과 회차를 선택하면 점수 구간별 분포, 통계 지표(평균·중앙값·표준편차), 과목별 평균을
        확인할 수 있습니다.
      </p>

      <DistributionClient
        periods={periods}
        initialSessions={sessions}
        initialPeriodId={periodId}
        initialSessionId={sessionId}
        initialExamType={examType}
      />
    </div>
  );
}
