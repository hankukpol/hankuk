import Link from "next/link";
import { AdminRole, AttendType } from "@prisma/client";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { requireAdminContext } from "@/lib/auth";
import { buildExamSubjectLabelMap, buildFallbackExamSubjectCatalog, listExamSubjectCatalogForAcademy } from "@/lib/exam-subjects/service";
import { getPrisma } from "@/lib/prisma";
import { listPeriods } from "@/lib/periods/service";
import { applyScoreSessionAcademyScope, resolveVisibleScoreSessionAcademyId } from "@/lib/scores/session-admin";
import {
  buildScoreSubjectFilterSourceItems,
  buildScoreSubjectOrderMap,
  getScoreSubjectLabel,
  type ScoreSubjectLabelMap,
} from "@/lib/scores/subject-filter";

export const dynamic = "force-dynamic";

type SubjectAvg = {
  subject: string;
  label: string;
  avg: number | null;
  sessionCount: number;
  displayOrder: number;
};

type PeriodStats = {
  periodId: number;
  periodName: string;
  startDate: string;
  endDate: string;
  sessionCount: number;
  totalParticipants: number;
  participationRate: number | null;
  avgScore: number | null;
  topScore: number | null;
  subjectAvgs: SubjectAvg[];
};

type ImprovementRow = {
  examNumber: string;
  name: string;
  period1Avg: number | null;
  period2Avg: number | null;
  delta: number | null;
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function getFirst(searchParams: Record<string, string | string[] | undefined>, key: string) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function formatDateLabel(iso: string) {
  const date = new Date(iso);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}

async function buildPeriodStats(
  periodId: number,
  academyId: number | null,
  subjectLabelMap: ScoreSubjectLabelMap,
  subjectOrderMap: Map<string, number>,
): Promise<PeriodStats> {
  const prisma = getPrisma();
  const period = await prisma.examPeriod.findFirst({
    where: academyId === null ? { id: periodId } : { id: periodId, academyId },
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
    },
  });

  if (!period) {
    return {
      periodId,
      periodName: `기간 #${periodId}`,
      startDate: "",
      endDate: "",
      sessionCount: 0,
      totalParticipants: 0,
      participationRate: null,
      avgScore: null,
      topScore: null,
      subjectAvgs: [],
    };
  }

  const sessions = await prisma.examSession.findMany({
    where: applyScoreSessionAcademyScope({ periodId, isCancelled: false }, academyId),
    select: {
      id: true,
      subject: true,
      displaySubjectName: true,
      scores: {
        select: {
          finalScore: true,
          attendType: true,
        },
      },
    },
  });

  const allScores: number[] = [];
  let totalPresent = 0;
  let totalRecords = 0;
  const subjectBuckets = new Map<string, { label: string; displayOrder: number; sum: number; count: number; sessionCount: number }>();

  for (const session of sessions) {
    const present = session.scores.filter(
      (score) => score.attendType === AttendType.NORMAL || score.attendType === AttendType.LIVE,
    );
    const absent = session.scores.filter(
      (score) => score.attendType === AttendType.ABSENT || score.attendType === AttendType.EXCUSED,
    );

    totalPresent += present.length;
    totalRecords += present.length + absent.length;

    const subjectLabel = getScoreSubjectLabel(session.subject, session.displaySubjectName, subjectLabelMap);
    const bucket = subjectBuckets.get(session.subject) ?? {
      label: subjectLabel,
      displayOrder: subjectOrderMap.get(session.subject) ?? Number.MAX_SAFE_INTEGER,
      sum: 0,
      count: 0,
      sessionCount: 0,
    };
    bucket.sessionCount += 1;

    for (const score of present) {
      if (score.finalScore !== null) {
        allScores.push(score.finalScore);
        bucket.sum += score.finalScore;
        bucket.count += 1;
      }
    }

    subjectBuckets.set(session.subject, bucket);
  }

  return {
    periodId: period.id,
    periodName: period.name,
    startDate: period.startDate.toISOString(),
    endDate: period.endDate.toISOString(),
    sessionCount: sessions.length,
    totalParticipants: totalPresent,
    participationRate: totalRecords > 0 ? Math.round((totalPresent / totalRecords) * 100) : null,
    avgScore: allScores.length > 0 ? round1(allScores.reduce((sum, value) => sum + value, 0) / allScores.length) : null,
    topScore: allScores.length > 0 ? Math.max(...allScores) : null,
    subjectAvgs: Array.from(subjectBuckets.entries())
      .map(([subject, bucket]) => ({
        subject,
        label: bucket.label,
        avg: bucket.count > 0 ? round1(bucket.sum / bucket.count) : null,
        sessionCount: bucket.sessionCount,
        displayOrder: bucket.displayOrder,
      }))
      .sort(
        (left, right) =>
          left.displayOrder - right.displayOrder || left.label.localeCompare(right.label, "ko-KR"),
      ),
  };
}

async function getImprovementRows(
  period1Id: number,
  period2Id: number,
  deltaThreshold: number,
  academyId: number | null,
): Promise<{ improved: ImprovementRow[]; declined: ImprovementRow[] }> {
  const prisma = getPrisma();

  const scoreWhere1 = {
    session: applyScoreSessionAcademyScope({ periodId: period1Id, isCancelled: false }, academyId),
    attendType: { in: [AttendType.NORMAL, AttendType.LIVE] },
    finalScore: { not: null },
  };

  const scoreWhere2 = {
    session: applyScoreSessionAcademyScope({ periodId: period2Id, isCancelled: false }, academyId),
    attendType: { in: [AttendType.NORMAL, AttendType.LIVE] },
    finalScore: { not: null },
  };

  const [scores1, scores2] = await Promise.all([
    prisma.score.findMany({
      where: scoreWhere1,
      select: {
        examNumber: true,
        finalScore: true,
        student: { select: { name: true } },
      },
    }),
    prisma.score.findMany({
      where: scoreWhere2,
      select: {
        examNumber: true,
        finalScore: true,
        student: { select: { name: true } },
      },
    }),
  ]);

  type StudentBucket = { name: string; sum: number; count: number };
  const map1 = new Map<string, StudentBucket>();
  const map2 = new Map<string, StudentBucket>();

  for (const score of scores1) {
    if (score.finalScore === null) continue;
    const current = map1.get(score.examNumber);
    if (current) {
      current.sum += score.finalScore;
      current.count += 1;
    } else {
      map1.set(score.examNumber, { name: score.student.name, sum: score.finalScore, count: 1 });
    }
  }

  for (const score of scores2) {
    if (score.finalScore === null) continue;
    const current = map2.get(score.examNumber);
    if (current) {
      current.sum += score.finalScore;
      current.count += 1;
    } else {
      map2.set(score.examNumber, { name: score.student.name, sum: score.finalScore, count: 1 });
    }
  }

  const rows: ImprovementRow[] = [];
  for (const [examNumber, period1] of map1.entries()) {
    const period2 = map2.get(examNumber);
    if (!period2) continue;

    const period1Avg = round1(period1.sum / period1.count);
    const period2Avg = round1(period2.sum / period2.count);
    const delta = round1(period2Avg - period1Avg);

    rows.push({
      examNumber,
      name: period1.name,
      period1Avg,
      period2Avg,
      delta,
    });
  }

  return {
    improved: rows
      .filter((row) => row.delta !== null && row.delta >= deltaThreshold)
      .sort((left, right) => (right.delta ?? 0) - (left.delta ?? 0))
      .slice(0, 10),
    declined: rows
      .filter((row) => row.delta !== null && row.delta <= -deltaThreshold)
      .sort((left, right) => (left.delta ?? 0) - (right.delta ?? 0))
      .slice(0, 10),
  };
}

export default async function MorningExamComparePage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.TEACHER);

  const academyId = await resolveVisibleScoreSessionAcademyId();
  const resolvedSearchParams = await searchParams;
  const [allPeriods, subjectCatalog] = await Promise.all([
    listPeriods(),
    academyId === null
      ? Promise.resolve(buildFallbackExamSubjectCatalog())
      : listExamSubjectCatalogForAcademy(academyId, { includeInactive: true }),
  ]);
  const subjectLabelMap = buildExamSubjectLabelMap(subjectCatalog);
  const subjectSourceItems = buildScoreSubjectFilterSourceItems(subjectCatalog);
  const subjectOrderMap = buildScoreSubjectOrderMap(subjectSourceItems);

  const completedPeriods = allPeriods.filter((period) => !period.isActive);
  const defaultPeriod1 = completedPeriods[1]?.id ?? allPeriods[1]?.id ?? allPeriods[0]?.id;
  const defaultPeriod2 = completedPeriods[0]?.id ?? allPeriods[0]?.id;

  const rawPeriod1 = getFirst(resolvedSearchParams, "period1");
  const rawPeriod2 = getFirst(resolvedSearchParams, "period2");
  const period1Id = rawPeriod1 ? Number.parseInt(rawPeriod1, 10) : (defaultPeriod1 ?? 0);
  const period2Id = rawPeriod2 ? Number.parseInt(rawPeriod2, 10) : (defaultPeriod2 ?? 0);

  if (!period1Id || !period2Id || period1Id === period2Id) {
    return (
      <div className="p-8 sm:p-10">
        <Breadcrumbs
          items={[
            { label: "성적 관리" },
            { label: "아침 모의고사", href: "/admin/exams/morning" },
            { label: "성적 개요", href: "/admin/exams/morning/overview" },
            { label: "기간 비교" },
          ]}
        />
        <h1 className="mt-8 text-3xl font-semibold text-ink">기간별 성적 비교</h1>
        <div className="mt-8 rounded-[28px] border border-dashed border-ink/10 p-12 text-center text-slate">
          비교할 기간이 충분하지 않습니다. 최소 2개의 시험 기간이 필요합니다.
        </div>
        <div className="mt-4">
          <Link href="/admin/exams/morning/overview" className="text-sm font-semibold text-forest transition hover:underline">
            성적 개요로 이동
          </Link>
        </div>
      </div>
    );
  }

  const [stats1, stats2, improvement] = await Promise.all([
    buildPeriodStats(period1Id, academyId, subjectLabelMap, subjectOrderMap),
    buildPeriodStats(period2Id, academyId, subjectLabelMap, subjectOrderMap),
    getImprovementRows(period1Id, period2Id, 10, academyId),
  ]);

  const subjectCodes = Array.from(
    new Set([...stats1.subjectAvgs.map((item) => item.subject), ...stats2.subjectAvgs.map((item) => item.subject)]),
  ).sort(
    (left, right) =>
      (subjectOrderMap.get(left) ?? Number.MAX_SAFE_INTEGER) -
        (subjectOrderMap.get(right) ?? Number.MAX_SAFE_INTEGER) ||
      (subjectLabelMap[left] ?? left).localeCompare(subjectLabelMap[right] ?? right, "ko-KR"),
  );
  const getSubjectAvg = (stats: PeriodStats, subject: string) =>
    stats.subjectAvgs.find((item) => item.subject === subject)?.avg ?? null;
  const getSubjectLabel = (subject: string) =>
    stats1.subjectAvgs.find((item) => item.subject === subject)?.label ??
    stats2.subjectAvgs.find((item) => item.subject === subject)?.label ??
    subjectLabelMap[subject] ??
    subject;

  return (
    <div className="p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "성적 관리" },
          { label: "아침 모의고사", href: "/admin/exams/morning" },
          { label: "성적 개요", href: "/admin/exams/morning/overview" },
          { label: "기간 비교" },
        ]}
      />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
            아침 모의고사
          </div>
          <h1 className="mt-5 text-3xl font-semibold text-ink">기간별 성적 비교</h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            현재 지점의 두 시험 기간을 비교해 평균 점수, 과목별 평균, 성적 상승자와 하락자를 함께 확인합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/exams/morning/overview" className="inline-flex items-center rounded-full border border-forest/30 px-4 py-2 text-sm font-semibold text-forest transition hover:bg-forest/10">
            성적 개요
          </Link>
          <Link href="/admin/exams/morning" className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember">
            수강 현황
          </Link>
        </div>
      </div>

      <form method="get" className="mt-8 flex flex-wrap items-end gap-4 rounded-[28px] border border-ink/10 bg-mist p-6">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate">기준 기간</label>
          <select name="period1" defaultValue={String(period1Id)} className="rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm">
            {allPeriods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.name}
                {period.isActive ? " (진행 중)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="pb-3 text-2xl font-bold text-slate">vs</div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate">비교 기간</label>
          <select name="period2" defaultValue={String(period2Id)} className="rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm">
            {allPeriods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.name}
                {period.isActive ? " (진행 중)" : ""}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="inline-flex items-center rounded-full bg-ink px-6 py-3 text-sm font-semibold text-white transition hover:bg-forest">
          비교
        </button>
      </form>

      <div className="mt-10 space-y-10">
        <section>
          <h2 className="text-lg font-semibold text-ink">핵심 지표 비교</h2>
          <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
            {[stats1, stats2].map((stats, index) => (
              <div key={stats.periodId} className={index === 0 ? "rounded-[28px] border border-ink/10 bg-white p-6" : "rounded-[28px] border border-ember/20 bg-ember/5 p-6"}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className={index === 0 ? "inline-flex rounded-full bg-ink/10 px-2.5 py-0.5 text-xs font-semibold text-ink" : "inline-flex rounded-full bg-ember/10 px-2.5 py-0.5 text-xs font-semibold text-ember"}>
                      기간 {index + 1}
                    </span>
                    <h3 className="mt-2 text-xl font-bold text-ink">{stats.periodName}</h3>
                  </div>
                  <p className="text-xs text-slate">
                    {stats.startDate ? formatDateLabel(stats.startDate) : ""}
                    {stats.endDate ? ` ~ ${formatDateLabel(stats.endDate)}` : ""}
                  </p>
                </div>
                <div className="mt-6 grid grid-cols-2 gap-4">
                  <Stat label="평균 점수" value={stats.avgScore !== null ? `${stats.avgScore}점` : "-"} />
                  <Stat label="최고 점수" value={stats.topScore !== null ? `${stats.topScore}점` : "-"} />
                  <Stat label="총 응시 인원" value={`${stats.totalParticipants}명`} />
                  <Stat label="참여율" value={stats.participationRate !== null ? `${stats.participationRate}%` : "-"} />
                  <Stat label="시험 회차" value={`${stats.sessionCount}회`} />
                </div>
              </div>
            ))}
          </div>

          {stats1.avgScore !== null && stats2.avgScore !== null && (() => {
            const delta = round1(stats2.avgScore - stats1.avgScore);
            const isPositive = delta > 0;
            const tone = isPositive ? "text-forest" : delta < 0 ? "text-ember" : "text-slate";
            const label = isPositive ? "성적 상승" : delta < 0 ? "성적 하락" : "동일";

            return (
              <div className="mt-6 rounded-[24px] border border-ink/10 bg-mist p-5">
                <p className="text-sm font-semibold text-ink">비교 기간 평균 점수 변화</p>
                <p className={`mt-2 text-4xl font-bold ${tone}`}>
                  {isPositive ? "+" : ""}
                  {delta}점
                  <span className="ml-3 text-base font-normal text-slate">{label}</span>
                </p>
              </div>
            );
          })()}
        </section>

        {subjectCodes.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-ink">과목별 평균 비교</h2>
            <div className="mt-4 overflow-x-auto rounded-[28px] border border-ink/10">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink/10 bg-mist/80">
                    <th className="px-5 py-3.5 text-left font-semibold text-ink/60">과목</th>
                    <th className="px-5 py-3.5 text-right font-semibold text-ink/60">기준 기간</th>
                    <th className="px-5 py-3.5 text-right font-semibold text-ink/60">비교 기간</th>
                    <th className="px-5 py-3.5 text-right font-semibold text-ink/60">변화</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {subjectCodes.map((subject) => {
                    const avg1 = getSubjectAvg(stats1, subject);
                    const avg2 = getSubjectAvg(stats2, subject);
                    const delta = avg1 !== null && avg2 !== null ? round1(avg2 - avg1) : null;
                    const label = getSubjectLabel(subject);
                    return (
                      <tr key={subject} className="hover:bg-mist/30">
                        <td className="px-5 py-3.5 font-medium text-ink">{label}</td>
                        <td className="px-5 py-3.5 text-right font-mono">{avg1 !== null ? `${avg1}점` : <span className="text-ink/25">-</span>}</td>
                        <td className="px-5 py-3.5 text-right font-mono">{avg2 !== null ? `${avg2}점` : <span className="text-ink/25">-</span>}</td>
                        <td className="px-5 py-3.5 text-right font-mono font-semibold">
                          {delta !== null ? (
                            <span className={delta > 0 ? "text-forest" : delta < 0 ? "text-ember" : "text-slate"}>
                              {delta > 0 ? "+" : ""}
                              {delta}
                            </span>
                          ) : (
                            <span className="text-ink/25">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section>
          <h2 className="text-lg font-semibold text-ink">
            성적 상승 학생 TOP 10 <span className="text-sm font-normal text-slate">(기간 평균 점수 차이 +10점 이상)</span>
          </h2>
          {improvement.improved.length === 0 ? (
            <div className="mt-4 rounded-[28px] border border-dashed border-ink/10 p-8 text-center text-sm text-slate">
              +10점 이상 상승한 학생이 없습니다.
            </div>
          ) : (
            <div className="mt-4 overflow-hidden rounded-[28px] border border-ink/10">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink/10 bg-mist/80">
                    <th className="w-10 px-5 py-3.5 text-center font-semibold text-ink/60">#</th>
                    <th className="px-5 py-3.5 text-left font-semibold text-ink/60">학생</th>
                    <th className="px-5 py-3.5 text-right font-semibold text-ink/60">기준 기간 평균</th>
                    <th className="px-5 py-3.5 text-right font-semibold text-ink/60">비교 기간 평균</th>
                    <th className="px-5 py-3.5 text-right font-semibold text-ink/60">변화</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {improvement.improved.map((row, index) => (
                    <tr key={row.examNumber} className="hover:bg-mist/30">
                      <td className="px-5 py-3.5 text-center text-slate">{index + 1}</td>
                      <td className="px-5 py-3.5">
                        <Link href={`/admin/students/${row.examNumber}`} className="font-medium text-ink transition hover:text-ember">
                          {row.name}
                        </Link>{" "}
                        <span className="text-xs text-slate">{row.examNumber}</span>
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono text-slate">{row.period1Avg !== null ? `${row.period1Avg}점` : "-"}</td>
                      <td className="px-5 py-3.5 text-right font-mono font-semibold text-ink">{row.period2Avg !== null ? `${row.period2Avg}점` : "-"}</td>
                      <td className="px-5 py-3.5 text-right font-mono font-bold text-forest">+{row.delta}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section>
          <h2 className="text-lg font-semibold text-ink">
            성적 하락 학생 TOP 10 <span className="text-sm font-normal text-slate">(기간 평균 점수 차이 -10점 이하)</span>
          </h2>
          {improvement.declined.length === 0 ? (
            <div className="mt-4 rounded-[28px] border border-dashed border-ink/10 p-8 text-center text-sm text-slate">
              -10점 이하 하락한 학생이 없습니다.
            </div>
          ) : (
            <div className="mt-4 overflow-hidden rounded-[28px] border border-ink/10">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink/10 bg-mist/80">
                    <th className="w-10 px-5 py-3.5 text-center font-semibold text-ink/60">#</th>
                    <th className="px-5 py-3.5 text-left font-semibold text-ink/60">학생</th>
                    <th className="px-5 py-3.5 text-right font-semibold text-ink/60">기준 기간 평균</th>
                    <th className="px-5 py-3.5 text-right font-semibold text-ink/60">비교 기간 평균</th>
                    <th className="px-5 py-3.5 text-right font-semibold text-ink/60">변화</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {improvement.declined.map((row, index) => (
                    <tr key={row.examNumber} className="hover:bg-mist/30">
                      <td className="px-5 py-3.5 text-center text-slate">{index + 1}</td>
                      <td className="px-5 py-3.5">
                        <Link href={`/admin/students/${row.examNumber}`} className="font-medium text-ink transition hover:text-ember">
                          {row.name}
                        </Link>{" "}
                        <span className="text-xs text-slate">{row.examNumber}</span>
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono text-slate">{row.period1Avg !== null ? `${row.period1Avg}점` : "-"}</td>
                      <td className="px-5 py-3.5 text-right font-mono font-semibold text-ink">{row.period2Avg !== null ? `${row.period2Avg}점` : "-"}</td>
                      <td className="px-5 py-3.5 text-right font-mono font-bold text-ember">{row.delta}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-ink/10 bg-mist p-3">
      <p className="text-xs text-slate">{label}</p>
      <p className="mt-1 text-lg font-bold text-ink">{value}</p>
    </div>
  );
}


