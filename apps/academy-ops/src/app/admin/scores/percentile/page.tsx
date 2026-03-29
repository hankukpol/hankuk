import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole, AttendType, Subject } from "@prisma/client";
import { applyAcademyScope, getAdminAcademyScope, resolveVisibleAcademyId } from "@/lib/academy-scope";
import { requireAdminContext } from "@/lib/auth";
import { EXAM_TYPE_LABEL } from "@/lib/constants";
import {
  buildExamSubjectLabelMap,
  buildFallbackExamSubjectCatalog,
  listExamSubjectCatalogForAcademy,
  type ExamSubjectCatalog,
} from "@/lib/exam-subjects/service";
import { getPrisma } from "@/lib/prisma";
import { applyScoreSessionAcademyScope } from "@/lib/scores/session-admin";
import {
  buildScoreSubjectFilterOptions,
  buildScoreSubjectFilterSourceItems,
} from "@/lib/scores/subject-filter";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

type PageProps = {
  searchParams?: SearchParams;
};

function pickFirst(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

type SubjectLabelMap = Record<string, string>;

type SubjectFilterOption = {
  value: string;
  label: string;
};

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  return `${year}.${month}.${day}(${weekdays[date.getDay()]})`;
}

const BUCKET_COUNT = 10;

type PercentileBucket = {
  label: string;
  count: number;
  maxWidth: number;
};

type CutoffScore = {
  label: string;
  score: number | null;
  rank: number | null;
};

type StudentPercentileResult = {
  examNumber: string;
  name: string;
  finalScore: number | null;
  rank: number;
  total: number;
  percentileFromTop: number;
  percentileFromBottom: number;
};

function buildBuckets(): PercentileBucket[] {
  return Array.from({ length: BUCKET_COUNT }, (_, index) => ({
    label: `${index * 10}~${(index + 1) * 10}%`,
    count: 0,
    maxWidth: 0,
  }));
}

function getSessionSubjectLabel(
  session: { subject: Subject; displaySubjectName: string | null },
  subjectLabelMap: SubjectLabelMap,
) {
  return session.displaySubjectName?.trim() || subjectLabelMap[session.subject] || session.subject;
}

function buildSubjectOptions(subjectCatalog: ExamSubjectCatalog): SubjectFilterOption[] {
  return buildScoreSubjectFilterOptions(buildScoreSubjectFilterSourceItems(subjectCatalog), {
    excludeValues: [Subject.CUMULATIVE],
  });
}

export default async function ScorePercentilePage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.TEACHER);

  const db = getPrisma();
  const rawSessionId = pickFirst(searchParams?.["sessionId"]);
  const rawSubject = pickFirst(searchParams?.["subject"]);
  const searchExamNumber = pickFirst(searchParams?.["examNumber"])?.trim() ?? "";

  const selectedSessionId: number | null =
    rawSessionId && /^\d+$/.test(rawSessionId) ? Number.parseInt(rawSessionId, 10) : null;

  const academyScope = await getAdminAcademyScope();
  const academyId = resolveVisibleAcademyId(academyScope);
  const subjectCatalog =
    academyId === null
      ? buildFallbackExamSubjectCatalog()
      : await listExamSubjectCatalogForAcademy(academyId, { includeInactive: true });
  const subjectLabelMap = buildExamSubjectLabelMap(subjectCatalog);
  const subjectOptions = buildSubjectOptions(subjectCatalog);
  const selectedSubject: Subject | null =
    rawSubject && subjectOptions.some((option) => option.value === rawSubject) ? (rawSubject as Subject) : null;

  const recentSessions = await db.examSession.findMany({
    where: applyScoreSessionAcademyScope({ isCancelled: false }, academyId),
    orderBy: [{ examDate: "desc" }, { id: "desc" }],
    take: 20,
    select: {
      id: true,
      examType: true,
      week: true,
      subject: true,
      displaySubjectName: true,
      examDate: true,
      period: { select: { name: true, isActive: true } },
    },
  });

  let targetSessionId: number | null = selectedSessionId;
  if (targetSessionId === null) {
    const sessionsWithScores = await db.examSession.findMany({
      where: applyScoreSessionAcademyScope(
        {
          isCancelled: false,
          scores: { some: {} },
        },
        academyId,
      ),
      orderBy: [{ examDate: "desc" }, { id: "desc" }],
      take: 1,
      select: { id: true },
    });
    targetSessionId = sessionsWithScores[0]?.id ?? recentSessions[0]?.id ?? null;
  }

  const targetSession = targetSessionId
    ? await db.examSession.findFirst({
        where: applyScoreSessionAcademyScope({ id: targetSessionId }, academyId),
        select: {
          id: true,
          examType: true,
          week: true,
          subject: true,
          displaySubjectName: true,
          examDate: true,
          period: { select: { name: true, isActive: true } },
        },
      })
    : null;

  type RawScore = {
    examNumber: string;
    finalScore: number | null;
    attendType: AttendType;
  };

  const rawScores: RawScore[] =
    targetSessionId !== null
      ? await db.score.findMany({
          where: {
            sessionId: targetSessionId,
            attendType: { in: [AttendType.NORMAL, AttendType.LIVE] },
          },
          select: {
            examNumber: true,
            finalScore: true,
            attendType: true,
          },
          orderBy: [{ finalScore: "desc" }, { examNumber: "asc" }],
        })
      : [];

  const validScores = rawScores.filter((score): score is RawScore & { finalScore: number } => score.finalScore !== null);
  const total = validScores.length;
  const sorted = [...validScores].sort((a, b) => b.finalScore - a.finalScore);

  type RankedScore = RawScore & { finalScore: number; rank: number };
  let currentRank = 1;
  const ranked: RankedScore[] = sorted.map((score, index) => {
    if (index > 0 && score.finalScore !== sorted[index - 1].finalScore) {
      currentRank = index + 1;
    }
    return { ...score, rank: currentRank };
  });

  const buckets = buildBuckets();
  for (const score of ranked) {
    const percentileFromBottom = ((total - score.rank + 1) / total) * 100;
    const bucketIndex = Math.min(Math.floor(percentileFromBottom / 10), BUCKET_COUNT - 1);
    buckets[bucketIndex].count += 1;
  }

  const maxBucketCount = Math.max(...buckets.map((bucket) => bucket.count), 1);
  for (const bucket of buckets) {
    bucket.maxWidth = Math.round((bucket.count / maxBucketCount) * 100);
  }

  const cutoffTargets = [10, 25, 50, 75] as const;
  const cutoffs: CutoffScore[] = cutoffTargets.map((pct) => {
    if (total === 0) return { label: `상위 ${pct}%`, score: null, rank: null };
    const targetRank = Math.max(1, Math.ceil((pct / 100) * total));
    const entry = ranked[targetRank - 1];
    return {
      label: `상위 ${pct}%`,
      score: entry?.finalScore ?? null,
      rank: targetRank,
    };
  });

  const allScoreValues = ranked.map((score) => score.finalScore);
  const avgScore =
    total > 0
      ? Math.round((allScoreValues.reduce((sum, value) => sum + value, 0) / total) * 10) / 10
      : null;
  const maxScoreVal = total > 0 ? allScoreValues[0] : null;
  const minScoreVal = total > 0 ? allScoreValues[allScoreValues.length - 1] : null;
  const medianScore =
    total > 0
      ? total % 2 === 1
        ? allScoreValues[Math.floor(total / 2)]
        : (allScoreValues[total / 2 - 1] + allScoreValues[total / 2]) / 2
      : null;

  let studentResult: StudentPercentileResult | null = null;
  let studentNotFound = false;

  if (searchExamNumber && total > 0) {
    const entry = ranked.find((score) => score.examNumber === searchExamNumber);
    if (entry) {
      const studentInfo = await db.student.findFirst({
        where: applyAcademyScope({ examNumber: searchExamNumber }, academyId),
        select: { name: true },
      });

      const percentileFromTop = Math.round((entry.rank / total) * 100 * 10) / 10;
      const percentileFromBottom = Math.round(((total - entry.rank + 1) / total) * 100 * 10) / 10;

      studentResult = {
        examNumber: searchExamNumber,
        name: studentInfo?.name ?? searchExamNumber,
        finalScore: entry.finalScore,
        rank: entry.rank,
        total,
        percentileFromTop,
        percentileFromBottom,
      };
    } else {
      studentNotFound = true;
    }
  }

  const filteredSessions = selectedSubject
    ? recentSessions.filter((session) => session.subject === selectedSubject)
    : recentSessions;

  const sessionSubjectLabel =
    targetSession ? getSessionSubjectLabel(targetSession, subjectLabelMap) : "";

  if (!targetSession && targetSessionId !== null) {
    notFound();
  }

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        성적 백분위
      </div>
      <h1 className="mt-5 text-3xl font-semibold text-ink">백분위 분포 분석</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        현재 지점의 최신 회차 성적 백분위와 구간별 분포를 확인합니다. 과목 필터와 회차 선택으로 비교 대상을 바꿀 수 있습니다.
      </p>

      <div className="mt-4 flex gap-3">
        <Link
          href="/admin/scores"
          className="inline-flex items-center rounded-full border border-ink/10 px-3 py-1.5 text-xs font-semibold text-slate transition hover:border-ink/30"
        >
          성적 허브
        </Link>
        <Link
          href="/admin/scores/leaderboard"
          className="inline-flex items-center rounded-full border border-ink/10 px-3 py-1.5 text-xs font-semibold text-slate transition hover:border-ink/30"
        >
          리더보드
        </Link>
      </div>

      <div className="mt-8 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate">과목 필터</p>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/scores/percentile"
            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition ${
              !selectedSubject
                ? "border-ember/30 bg-ember/10 text-ember"
                : "border-ink/10 bg-white text-slate hover:border-ember/20 hover:text-ember"
            }`}
          >
            전체 과목
          </Link>
          {subjectOptions.map((option) => {
            const isActive = selectedSubject === option.value;
            return (
              <Link
                key={option.value}
                href={`/admin/scores/percentile?subject=${option.value}`}
                className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition ${
                  isActive
                    ? "border-ember/30 bg-ember/10 text-ember"
                    : "border-ink/10 bg-white text-slate hover:border-ember/20 hover:text-ember"
                }`}
              >
                {option.label}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="mt-6">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate">
          최근 회차 선택 (최대 20개)
        </p>
        {filteredSessions.length === 0 ? (
          <p className="text-sm text-slate">
            {selectedSubject
              ? `${subjectLabelMap[selectedSubject] ?? selectedSubject} 과목의 회차가 없습니다.`
              : "등록된 회차가 없습니다."}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {filteredSessions.map((session) => {
              const isActive = targetSessionId === session.id;
              const subjectLabel = getSessionSubjectLabel(session, subjectLabelMap);
              const examTypeLabel =
                EXAM_TYPE_LABEL[session.examType as keyof typeof EXAM_TYPE_LABEL] ?? session.examType;
              const label = `${formatDate(session.examDate)} ${session.period.name} ${examTypeLabel} ${subjectLabel}`;
              const params = new URLSearchParams();
              params.set("sessionId", String(session.id));
              if (selectedSubject) params.set("subject", selectedSubject);

              return (
                <Link
                  key={session.id}
                  href={`/admin/scores/percentile?${params.toString()}`}
                  className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    isActive
                      ? "border-forest/30 bg-forest/10 text-forest"
                      : "border-ink/10 bg-white text-slate hover:border-forest/20 hover:text-forest"
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {targetSession ? (
        <>
          <section className="mt-8">
            <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate">현재 선택 회차</p>
                  <p className="mt-2 text-xl font-semibold text-ink">
                    {targetSession.period.name} ·{" "}
                    {EXAM_TYPE_LABEL[targetSession.examType as keyof typeof EXAM_TYPE_LABEL] ??
                      targetSession.examType}{" "}
                    {sessionSubjectLabel}
                  </p>
                  <p className="mt-1 text-sm text-slate">
                    {formatDate(targetSession.examDate)} · {targetSession.week}주차
                    {targetSession.period.isActive && (
                      <span className="ml-2 rounded-full bg-forest/10 px-1.5 py-0.5 text-[10px] font-semibold text-forest">
                        현재 기수
                      </span>
                    )}
                  </p>
                </div>
                <Link
                  href={`/admin/scores/sessions/${targetSession.id}`}
                  className="inline-flex items-center rounded-full border border-ink/20 px-4 py-2 text-xs font-semibold text-slate transition hover:border-ember/30 hover:text-ember"
                >
                  회차 상세
                </Link>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <div className="rounded-[20px] border border-ink/5 bg-mist p-4">
                  <p className="text-xs text-slate">응시 인원</p>
                  <p className="mt-2 text-2xl font-semibold text-ink">{total}명</p>
                </div>
                <div className="rounded-[20px] border border-ink/5 bg-mist p-4">
                  <p className="text-xs text-slate">평균 점수</p>
                  <p className="mt-2 text-2xl font-semibold text-ink">{avgScore !== null ? `${avgScore}점` : "-"}</p>
                </div>
                <div className="rounded-[20px] border border-ink/5 bg-mist p-4">
                  <p className="text-xs text-slate">중앙값</p>
                  <p className="mt-2 text-2xl font-semibold text-ink">{medianScore !== null ? `${medianScore}점` : "-"}</p>
                </div>
                <div className="rounded-[20px] border border-forest/10 bg-forest/5 p-4">
                  <p className="text-xs text-forest">최고점</p>
                  <p className="mt-2 text-2xl font-semibold text-forest">{maxScoreVal !== null ? `${maxScoreVal}점` : "-"}</p>
                </div>
                <div className="rounded-[20px] border border-ember/10 bg-ember/5 p-4">
                  <p className="text-xs text-ember">최저점</p>
                  <p className="mt-2 text-2xl font-semibold text-ember">{minScoreVal !== null ? `${minScoreVal}점` : "-"}</p>
                </div>
              </div>
            </div>
          </section>

          <section className="mt-8">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-slate">
              구간별 기준 점수
            </h2>
            <div className="grid gap-4 sm:grid-cols-4">
              {cutoffs.map((cutoff) => (
                <div key={cutoff.label} className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate">{cutoff.label}</p>
                  <p className="mt-3 text-3xl font-bold text-ink">{cutoff.score !== null ? `${cutoff.score}점` : "-"}</p>
                  {cutoff.rank !== null && total > 0 && (
                    <p className="mt-1 text-xs text-slate">({cutoff.rank}등 / 전체 {total}명)</p>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="mt-8">
            <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold text-ink">백분위 분포</h2>
                  <p className="mt-1 text-xs text-slate">
                    점수 순위를 기준으로 구간별 백분위 분포를 보여줍니다.
                  </p>
                </div>
                <span className="text-xs text-slate">총 {total}명</span>
              </div>

              {total === 0 ? (
                <div className="mt-6 rounded-[20px] border border-dashed border-ink/10 py-10 text-center text-sm text-slate">
                  아직 입력된 성적 데이터가 없습니다.
                </div>
              ) : (
                <div className="mt-6 space-y-3">
                  {buckets.map((bucket, index) => {
                    const isTop = index >= 7;
                    const isMid = index >= 4 && index < 7;
                    const barColor = isTop ? "bg-forest/60" : isMid ? "bg-amber-400" : "bg-ember/60";

                    return (
                      <div key={bucket.label} className="flex items-center gap-4">
                        <div className="w-16 shrink-0 text-right text-xs font-semibold text-slate">
                          {bucket.label}
                        </div>
                        <div className="flex-1 overflow-hidden rounded-full bg-ink/5">
                          <div
                            className={`h-6 rounded-full transition-all ${barColor}`}
                            style={{ width: `${bucket.maxWidth}%` }}
                          />
                        </div>
                        <div className="w-16 shrink-0 text-xs font-semibold text-ink">
                          {bucket.count}명
                          {total > 0 && <span className="ml-1 text-slate">({Math.round((bucket.count / total) * 100)}%)</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {total > 0 && (
                <div className="mt-6 flex flex-wrap gap-4 border-t border-ink/5 pt-4">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-8 rounded-full bg-ember/60" />
                    <span className="text-xs text-slate">하위 40%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-8 rounded-full bg-amber-400" />
                    <span className="text-xs text-slate">중간 40~70%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-8 rounded-full bg-forest/60" />
                    <span className="text-xs text-slate">상위 30%</span>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="mt-8">
            <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
              <h2 className="text-base font-semibold text-ink">개인 백분위 조회</h2>
              <p className="mt-1 text-xs text-slate">
                학번을 입력하면 해당 학생의 백분위를 바로 확인할 수 있습니다.
              </p>
              <form method="get" className="mt-4 flex gap-3">
                <input type="hidden" name="sessionId" value={targetSession.id} />
                {selectedSubject && <input type="hidden" name="subject" value={selectedSubject} />}
                <input
                  type="text"
                  name="examNumber"
                  defaultValue={searchExamNumber}
                  placeholder="학번 입력 (예: 2024001)"
                  className="flex-1 rounded-2xl border border-ink/20 bg-mist px-4 py-2.5 text-sm text-ink placeholder-slate/50 outline-none focus:border-ember/40 focus:ring-2 focus:ring-ember/10"
                />
                <button
                  type="submit"
                  className="inline-flex items-center rounded-full bg-ember px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-ember/90"
                >
                  조회
                </button>
              </form>

              {searchExamNumber && (
                <div className="mt-6">
                  {studentNotFound ? (
                    <div className="rounded-[20px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-700">
                      학번 <span className="font-semibold">{searchExamNumber}</span>에 해당하는 이번 회차 응시 기록이 없습니다.
                    </div>
                  ) : (
                    studentResult && (
                      <div className="rounded-[20px] border border-forest/20 bg-forest/5 p-5">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div>
                            <Link
                              href={`/admin/students/${studentResult.examNumber}`}
                              className="font-semibold text-ink transition hover:text-ember hover:underline"
                            >
                              {studentResult.name}
                            </Link>
                            <span className="ml-2 font-mono text-xs text-slate">{studentResult.examNumber}</span>
                          </div>
                          <Link
                            href={`/admin/students/${studentResult.examNumber}/score-trend?subject=${targetSession.subject}`}
                            className="inline-flex items-center rounded-full border border-forest/20 px-3 py-1 text-xs font-semibold text-forest transition hover:bg-forest/10"
                          >
                            성적 추이
                          </Link>
                        </div>

                        <div className="mt-4 grid gap-4 sm:grid-cols-4">
                          <div className="rounded-[16px] border border-ink/5 bg-white p-4">
                            <p className="text-xs text-slate">점수</p>
                            <p className="mt-1 text-2xl font-bold text-ink">
                              {studentResult.finalScore !== null ? `${studentResult.finalScore}점` : "-"}
                            </p>
                          </div>
                          <div className="rounded-[16px] border border-ink/5 bg-white p-4">
                            <p className="text-xs text-slate">순위</p>
                            <p className="mt-1 text-2xl font-bold text-ink">
                              {studentResult.rank}등
                              <span className="ml-1 text-sm font-normal text-slate">/ {studentResult.total}명</span>
                            </p>
                          </div>
                          <div className="rounded-[16px] border border-forest/10 bg-white p-4">
                            <p className="text-xs text-forest">상위 백분위</p>
                            <p className="mt-1 text-2xl font-bold text-forest">{studentResult.percentileFromTop}%</p>
                            <p className="mt-0.5 text-[10px] text-slate">값이 낮을수록 상위권입니다.</p>
                          </div>
                          <div className="rounded-[16px] border border-ember/10 bg-white p-4">
                            <p className="text-xs text-ember">하위 백분위</p>
                            <p className="mt-1 text-2xl font-bold text-ember">{studentResult.percentileFromBottom}%</p>
                            <p className="mt-0.5 text-[10px] text-slate">값이 높을수록 상위권입니다.</p>
                          </div>
                        </div>

                        {studentResult.finalScore !== null && total > 0 && (
                          <div className="mt-4">
                            <p className="mb-2 text-xs text-slate">전체 분포에서의 위치</p>
                            <div className="relative h-8 overflow-hidden rounded-full bg-ink/5">
                              <div className="absolute inset-0 flex">
                                <div className="h-full bg-ember/20" style={{ width: "40%" }} />
                                <div className="h-full bg-amber-200/60" style={{ width: "30%" }} />
                                <div className="h-full bg-forest/20" style={{ width: "30%" }} />
                              </div>
                              <div
                                className="absolute top-0 h-full w-1 bg-ink"
                                style={{ left: `${Math.min(99, Math.max(0, 100 - studentResult.percentileFromTop))}%` }}
                              />
                            </div>
                            <div className="mt-1 flex justify-between text-[10px] text-slate">
                              <span>하위권</span>
                              <span>상위권</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          </section>

          {total > 0 && (
            <section className="mt-8">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate">
                  전체 응시자 백분위 목록
                </h2>
                <span className="text-xs text-slate">총 {total}명</span>
              </div>
              <div className="rounded-[28px] border border-ink/10 bg-white shadow-panel">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] text-sm">
                    <thead>
                      <tr className="border-b border-ink/10">
                        <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                          순위
                        </th>
                        <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                          학번
                        </th>
                        <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                          점수
                        </th>
                        <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                          상위 %
                        </th>
                        <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate">
                          분포
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink/5">
                      {ranked.map((score) => {
                        const pctFromTop = Math.round((score.rank / total) * 100 * 10) / 10;
                        const barWidth = Math.round(((total - score.rank + 1) / total) * 100);
                        const barColor =
                          pctFromTop <= 10
                            ? "bg-amber-400"
                            : pctFromTop <= 30
                              ? "bg-forest/60"
                              : pctFromTop <= 60
                                ? "bg-sky-400/60"
                                : "bg-ember/40";

                        return (
                          <tr key={score.examNumber} className="transition hover:bg-mist/50">
                            <td className="px-6 py-3">
                              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-ink/5 text-xs font-semibold text-slate">
                                {score.rank}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-slate">{score.examNumber}</td>
                            <td className="px-4 py-3 text-right font-semibold text-ink">{score.finalScore}점</td>
                            <td className="px-4 py-3 text-right text-xs font-semibold text-slate">{pctFromTop}%</td>
                            <td className="px-4 py-3">
                              <div className="w-full max-w-[120px] overflow-hidden rounded-full bg-ink/5">
                                <div className={`h-3 rounded-full ${barColor}`} style={{ width: `${barWidth}%` }} />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}
        </>
      ) : (
        <section className="mt-10">
          <div className="rounded-[28px] border border-dashed border-ink/10 p-16 text-center">
            <p className="text-sm text-slate">회차를 선택하면 백분위 분포가 표시됩니다.</p>
          </div>
        </section>
      )}
    </div>
  );
}

