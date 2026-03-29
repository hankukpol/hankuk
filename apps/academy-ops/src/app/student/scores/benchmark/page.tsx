import Link from "next/link";
import { Subject } from "@prisma/client";
import { StudentLookupForm } from "@/components/student-portal/student-lookup-form";
import { SUBJECT_LABEL } from "@/lib/constants";
import { hasDatabaseConfig } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import { getStudentPortalViewer } from "@/lib/student-portal/service";

export const dynamic = "force-dynamic";

// ─── Helpers ────────────────────────────────────────────────────────────────

function average(arr: number[]): number | null {
  if (arr.length === 0) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdDev(arr: number[], avg: number): number {
  if (arr.length < 2) return 0;
  const variance =
    arr.reduce((sum, x) => sum + Math.pow(x - avg, 2), 0) / arr.length;
  return Math.sqrt(variance);
}

function percentileLabel(percentile: number): { text: string; cls: string } {
  if (percentile >= 90)
    return { text: `상위 ${100 - percentile}%`, cls: "text-[#1F4D3A] bg-green-50 border-green-200" };
  if (percentile >= 70)
    return { text: `상위 ${100 - percentile}%`, cls: "text-amber-700 bg-amber-50 border-amber-200" };
  return { text: `상위 ${100 - percentile}%`, cls: "text-slate-600 bg-mist border-ink/10" };
}

// ─── Distribution Bar Chart ──────────────────────────────────────────────────

function DistributionChart({
  distribution,
  myBucket,
}: {
  distribution: { bucket: number; count: number }[];
  myBucket: number | null;
}) {
  const maxCount = Math.max(...distribution.map((d) => d.count), 1);
  const bucketLabels = ["0", "10", "20", "30", "40", "50", "60", "70", "80", "90+"];

  return (
    <div className="mt-4">
      <div className="flex items-end gap-1.5 h-32">
        {distribution.map((d, i) => {
          const heightPct = (d.count / maxCount) * 100;
          const isMe = d.bucket === myBucket;
          return (
            <div key={d.bucket} className="flex flex-1 flex-col items-center gap-1">
              <div className="relative w-full" style={{ height: "100px" }}>
                <div
                  className="absolute bottom-0 w-full rounded-t transition-all"
                  style={{
                    height: `${heightPct}%`,
                    backgroundColor: isMe ? "#C55A11" : "#E5E7EB",
                  }}
                  title={`${bucketLabels[i]}~${d.bucket + 9}점: ${d.count}명`}
                />
                {isMe && d.count > 0 && (
                  <div
                    className="absolute w-full text-center text-xs font-bold text-[#C55A11]"
                    style={{ bottom: `calc(${heightPct}% + 2px)` }}
                  >
                    나
                  </div>
                )}
              </div>
              <span className="text-[9px] text-slate">{bucketLabels[i]}</span>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-slate">점수 분포 (x축: 점수대, y축: 인원)</p>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function StudentBenchmarkPage() {
  if (!hasDatabaseConfig()) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
              동기 대비 분석
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              DB 연결 후 사용할 수 있습니다.
            </h1>
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
            <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-[#1F4D3A]">
              동기 대비 분석
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              로그인 후 확인할 수 있습니다.
            </h1>
          </section>
          <StudentLookupForm redirectPath="/student/scores/benchmark" />
        </div>
      </main>
    );
  }

  const prisma = getPrisma();

  // Find the active period (or most recent period with scores)
  const period = await prisma.examPeriod.findFirst({
    where: {
      sessions: {
        some: {
          examType: viewer.examType,
          isCancelled: false,
          scores: {
            some: { examNumber: viewer.examNumber },
          },
        },
      },
    },
    orderBy: [{ isActive: "desc" }, { startDate: "desc" }],
  });

  if (!period) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-[#1F4D3A]">
              동기 대비 분석
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              비교 가능한 성적 데이터가 없습니다.
            </h1>
            <div className="mt-6">
              <Link
                href="/student/scores"
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-[#C55A11]"
              >
                성적 카드로 돌아가기
              </Link>
            </div>
          </section>
        </div>
      </main>
    );
  }

  // All scores in this period for this examType
  const allScores = await prisma.score.findMany({
    where: {
      session: {
        periodId: period.id,
        examType: viewer.examType,
        isCancelled: false,
      },
      finalScore: { not: null },
    },
    select: {
      examNumber: true,
      finalScore: true,
      session: { select: { subject: true } },
    },
  });

  // Per-student averages
  const studentAvgMap = new Map<string, number[]>();
  for (const sc of allScores) {
    if (sc.finalScore === null) continue;
    const arr = studentAvgMap.get(sc.examNumber) ?? [];
    arr.push(sc.finalScore);
    studentAvgMap.set(sc.examNumber, arr);
  }

  const studentAvgList: { examNumber: string; avg: number }[] = [];
  for (const [en, arr] of studentAvgMap.entries()) {
    const avg = average(arr);
    if (avg !== null) studentAvgList.push({ examNumber: en, avg });
  }
  studentAvgList.sort((a, b) => b.avg - a.avg);

  const totalStudents = studentAvgList.length;
  const myAvgEntry = studentAvgList.find((s) => s.examNumber === viewer.examNumber);
  const myAvg = myAvgEntry?.avg ?? null;

  const allAvgs = studentAvgList.map((s) => s.avg);
  const classAvg = average(allAvgs);
  const classStdDevVal =
    classAvg !== null && allAvgs.length > 1 ? stdDev(allAvgs, classAvg) : null;

  let myRank: number | null = null;
  let studentsBelow = 0;
  let myPercentile: number | null = null;

  if (myAvg !== null) {
    myRank = studentAvgList.findIndex((s) => s.examNumber === viewer.examNumber) + 1;
    studentsBelow = studentAvgList.filter((s) => s.avg < myAvg).length;
    myPercentile =
      totalStudents > 0 ? Math.round((studentsBelow / totalStudents) * 100) : null;
  }

  // Per-subject analysis
  const subjects = Array.from(
    new Set(allScores.map((s) => s.session.subject))
  ) as Subject[];

  interface SubjectRow {
    subject: Subject;
    label: string;
    myAvg: number | null;
    classAvg: number | null;
    myPercentile: number | null;
    myRank: number | null;
    total: number;
  }

  const subjectRows: SubjectRow[] = subjects.map((subject) => {
    const subjectScores = allScores.filter(
      (s) => s.session.subject === subject && s.finalScore !== null
    );
    const subjectStudentMap = new Map<string, number[]>();
    for (const sc of subjectScores) {
      if (sc.finalScore === null) continue;
      const arr = subjectStudentMap.get(sc.examNumber) ?? [];
      arr.push(sc.finalScore);
      subjectStudentMap.set(sc.examNumber, arr);
    }
    const subjectStudentAvgs: { examNumber: string; avg: number }[] = [];
    for (const [en, arr] of subjectStudentMap.entries()) {
      const avg = average(arr);
      if (avg !== null) subjectStudentAvgs.push({ examNumber: en, avg });
    }
    subjectStudentAvgs.sort((a, b) => b.avg - a.avg);

    const myEntry = subjectStudentAvgs.find((s) => s.examNumber === viewer.examNumber);
    const mySubjectAvg = myEntry?.avg ?? null;
    const subjectClassAvg = average(subjectStudentAvgs.map((s) => s.avg));
    const subjectTotal = subjectStudentAvgs.length;
    let mySubjectPercentile: number | null = null;
    let mySubjectRank: number | null = null;
    if (mySubjectAvg !== null) {
      const below = subjectStudentAvgs.filter((s) => s.avg < mySubjectAvg).length;
      mySubjectPercentile =
        subjectTotal > 0 ? Math.round((below / subjectTotal) * 100) : null;
      mySubjectRank =
        subjectStudentAvgs.findIndex((s) => s.examNumber === viewer.examNumber) + 1;
    }
    return {
      subject,
      label: SUBJECT_LABEL[subject] ?? subject,
      myAvg: mySubjectAvg,
      classAvg: subjectClassAvg,
      myPercentile: mySubjectPercentile,
      myRank: mySubjectRank,
      total: subjectTotal,
    };
  });

  // Score distribution
  const distribution = Array.from({ length: 10 }, (_, i) => ({
    bucket: i * 10,
    count: 0,
  }));
  for (const s of studentAvgList) {
    const idx = Math.min(Math.floor(s.avg / 10), 9);
    distribution[idx]!.count += 1;
  }

  const myDistributionBucket =
    myAvg !== null ? Math.min(Math.floor(myAvg / 10), 9) * 10 : null;

  const pctInfo =
    myPercentile !== null ? percentileLabel(myPercentile) : null;

  return (
    <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Header */}
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-[#1F4D3A]">
                Peer Benchmark
              </div>
              <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
                동기 대비 분석
              </h1>
              <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
                같은 기수 수강생들과 비교한 성적 분석입니다. 조회 기간: {period.name}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/student/scores"
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-[#C55A11]"
              >
                성적 카드로 돌아가기
              </Link>
            </div>
          </div>

          {/* Big percentile badge */}
          {pctInfo && myPercentile !== null && (
            <div className="mt-8 flex justify-center">
              <div
                className={`inline-flex flex-col items-center rounded-[32px] border px-10 py-6 text-center ${pctInfo.cls}`}
              >
                <span className="text-xs font-semibold uppercase tracking-widest opacity-70">
                  내 성적 순위
                </span>
                <span className="mt-2 text-4xl font-bold sm:text-5xl">
                  {pctInfo.text}
                </span>
                {myRank !== null && (
                  <span className="mt-2 text-sm opacity-70">
                    {myRank}위 / {totalStudents}명
                  </span>
                )}
              </div>
            </div>
          )}

          {/* KPI cards */}
          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
              <p className="text-sm text-slate">내 평균</p>
              <p className="mt-3 text-xl font-semibold">
                {myAvg !== null ? `${myAvg.toFixed(1)}점` : "-"}
              </p>
            </article>
            <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
              <p className="text-sm text-slate">반 평균</p>
              <p className="mt-3 text-xl font-semibold">
                {classAvg !== null ? `${classAvg.toFixed(1)}점` : "-"}
              </p>
              {classStdDevVal !== null && (
                <p className="mt-1 text-xs text-slate">
                  표준편차 {classStdDevVal.toFixed(1)}
                </p>
              )}
            </article>
            <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
              <p className="text-sm text-slate">내 순위</p>
              <p className="mt-3 text-xl font-semibold">
                {myRank !== null ? `${myRank}위` : "-"}
              </p>
            </article>
            <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
              <p className="text-sm text-slate">총 수강생</p>
              <p className="mt-3 text-xl font-semibold">{totalStudents}명</p>
              {myAvg !== null && (
                <p className="mt-1 text-xs text-slate">
                  나보다 높음 {totalStudents - myRank! - (totalStudents - studentsBelow - (myRank ?? 1))}명
                  {" "}/ 낮음 {studentsBelow}명
                </p>
              )}
            </article>
          </div>
        </section>

        {/* Score distribution */}
        <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
          <h2 className="mb-1 text-lg font-semibold">점수 분포</h2>
          <p className="mb-2 text-xs text-slate">
            주황색 막대가 내 점수 구간입니다.
          </p>
          <DistributionChart
            distribution={distribution}
            myBucket={myDistributionBucket}
          />
        </section>

        {/* Subject breakdown */}
        {subjectRows.length > 0 && (
          <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
            <h2 className="mb-4 text-lg font-semibold">과목별 비교</h2>
            <div className="overflow-x-auto rounded-[20px] border border-ink/10">
              <table className="min-w-full divide-y divide-ink/10 text-sm">
                <thead className="bg-mist/80 text-left">
                  <tr>
                    <th className="px-4 py-3 font-semibold">과목</th>
                    <th className="px-4 py-3 font-semibold text-slate">내 평균</th>
                    <th className="px-4 py-3 font-semibold text-slate">반 평균</th>
                    <th className="px-4 py-3 font-semibold text-slate">차이</th>
                    <th className="px-4 py-3 font-semibold text-slate">내 석차</th>
                    <th className="px-4 py-3 font-semibold text-slate">퍼센타일</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/10">
                  {subjectRows.map((row) => {
                    const diff =
                      row.myAvg !== null && row.classAvg !== null
                        ? row.myAvg - row.classAvg
                        : null;
                    const pctInfo2 =
                      row.myPercentile !== null
                        ? percentileLabel(row.myPercentile)
                        : null;
                    return (
                      <tr key={row.subject} className="hover:bg-mist/30 transition-colors">
                        <td className="px-4 py-3 font-medium">{row.label}</td>
                        <td className="px-4 py-3 tabular-nums">
                          {row.myAvg !== null ? `${row.myAvg.toFixed(1)}점` : "-"}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-slate">
                          {row.classAvg !== null ? `${row.classAvg.toFixed(1)}점` : "-"}
                        </td>
                        <td className="px-4 py-3 tabular-nums">
                          {diff !== null ? (
                            <span
                              className={
                                diff > 0
                                  ? "text-[#1F4D3A] font-semibold"
                                  : diff < 0
                                  ? "text-red-600 font-semibold"
                                  : "text-slate"
                              }
                            >
                              {diff > 0 ? "+" : ""}
                              {diff.toFixed(1)}
                            </span>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-slate">
                          {row.myRank !== null
                            ? `${row.myRank}위 / ${row.total}명`
                            : "-"}
                        </td>
                        <td className="px-4 py-3">
                          {pctInfo2 && row.myPercentile !== null ? (
                            <span
                              className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${pctInfo2.cls}`}
                            >
                              {pctInfo2.text}
                            </span>
                          ) : (
                            "-"
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

        {/* Privacy note */}
        <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="text-xl">&#128274;</span>
            <div>
              <p className="text-sm font-semibold">개인정보 보호 안내</p>
              <p className="mt-1 text-xs text-slate leading-6">
                다른 수강생의 개인정보는 공개되지 않습니다. 본 분석은 익명화된 통계
                데이터만을 사용하며, 개별 수강생을 식별할 수 있는 정보는 제공하지 않습니다.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
