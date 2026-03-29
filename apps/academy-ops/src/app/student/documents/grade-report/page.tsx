import type { Metadata } from "next";
import Link from "next/link";
import { AttendType, Subject } from "@prisma/client";
import { StudentLookupForm } from "@/components/student-portal/student-lookup-form";
import { getAcademyRuntimeBranding } from "@/lib/academy-branding";
import { SUBJECT_LABEL } from "@/lib/constants";
import { hasDatabaseConfig } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import { getStudentPortalViewer } from "@/lib/student-portal/service";
import { GradeReportPrintButton } from "./print-button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "성적 확인서",
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatKoreanDate(date: Date): string {
  return `${date.getFullYear()}년 ${String(date.getMonth() + 1).padStart(2, "0")}월 ${String(date.getDate()).padStart(2, "0")}일`;
}

function formatShortDate(date: Date): string {
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function avg(arr: number[]): number | null {
  if (arr.length === 0) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

// Score color class for table cells
function scoreColorClass(score: number | null): string {
  if (score === null) return "text-slate";
  if (score >= 80) return "text-forest font-semibold";
  if (score >= 60) return "text-amber-700 font-semibold";
  return "text-red-600 font-semibold";
}

// ─── Page ────────────────────────────────────────────────────────────────────

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default async function GradeReportPage({ searchParams }: PageProps) {
  if (!hasDatabaseConfig()) {
    return (
      <main className="space-y-6 px-0 py-6">
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
            Unavailable
          </div>
          <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
            DB 연결 후 사용할 수 있습니다.
          </h1>
        </section>
      </main>
    );
  }

  const viewer = await getStudentPortalViewer();

  if (!viewer) {
    return (
      <main className="space-y-6 px-0 py-6">
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            성적 확인서 Login
          </div>
          <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
            로그인 후 확인할 수 있습니다.
          </h1>
        </section>
        <StudentLookupForm redirectPath="/student/documents/grade-report" />
      </main>
    );
  }

  const prisma = getPrisma();
  const branding = await getAcademyRuntimeBranding(viewer.academyId ?? undefined);

  // Parse date range from searchParams
  const rawFrom = Array.isArray(searchParams?.from) ? searchParams?.from[0] : searchParams?.from;
  const rawTo = Array.isArray(searchParams?.to) ? searchParams?.to[0] : searchParams?.to;

  const fromDate = rawFrom ? new Date(rawFrom) : undefined;
  const toDate = rawTo ? new Date(rawTo + "T23:59:59") : undefined;

  // Build date filter
  const dateFilter = fromDate || toDate
    ? {
        gte: fromDate,
        lte: toDate,
      }
    : undefined;

  // Fetch scores for the student
  const scores = await prisma.score.findMany({
    where: {
      examNumber: viewer.examNumber,
      finalScore: { not: null },
      attendType: { in: [AttendType.NORMAL, AttendType.LIVE] },
      session: {
        isCancelled: false,
        ...(dateFilter ? { examDate: dateFilter } : {}),
      },
    },
    select: {
      id: true,
      finalScore: true,
      session: {
        select: {
          id: true,
          subject: true,
          examDate: true,
          week: true,
          periodId: true,
          period: {
            select: { name: true },
          },
        },
      },
    },
    orderBy: [
      { session: { examDate: "asc" } },
      { session: { subject: "asc" } },
    ],
    take: 500,
  });

  // Compute rank per session (how many students scored lower/equal per session)
  // Fetch all scores per session for sessions in the result
  const sessionIds = [...new Set(scores.map((s) => s.session.id))];
  type RankInfo = { rank: number; total: number };
  const rankMap = new Map<number, RankInfo>();

  if (sessionIds.length > 0) {
    const allSessionScores = await prisma.score.findMany({
      where: {
        sessionId: { in: sessionIds },
        finalScore: { not: null },
        attendType: { in: [AttendType.NORMAL, AttendType.LIVE] },
      },
      select: { sessionId: true, finalScore: true, examNumber: true },
    });

    // Group by sessionId
    const sessionScoreMap = new Map<number, number[]>();
    for (const s of allSessionScores) {
      if (s.finalScore === null) continue;
      const arr = sessionScoreMap.get(s.sessionId) ?? [];
      arr.push(s.finalScore);
      sessionScoreMap.set(s.sessionId, arr);
    }

    // Compute rank for my score in each session
    for (const myScore of scores) {
      if (myScore.finalScore === null) continue;
      const allScores = sessionScoreMap.get(myScore.session.id) ?? [];
      const sorted = [...allScores].sort((a, b) => b - a);
      const rank = sorted.findIndex((s) => s <= myScore.finalScore!) + 1;
      rankMap.set(myScore.session.id, { rank: Math.max(1, rank), total: sorted.length });
    }
  }

  // Summary stats
  const allFinals = scores.map((s) => s.finalScore!).filter((s): s is number => s !== null);
  const overallAvg = avg(allFinals);
  const totalSessions = [...new Set(scores.map((s) => s.session.id))].length;
  const today = new Date();

  // Group by session (date + subject rows)
  type ScoreRow = {
    sessionId: number;
    subject: Subject;
    examDate: Date;
    week: number;
    periodName: string;
    finalScore: number | null;
    rank: RankInfo | null;
    sessionSeq: number;
  };

  // Build sequential session numbering per date
  const dateSessionMap = new Map<string, number>();
  const rows: ScoreRow[] = [];
  let seq = 0;

  for (const s of scores) {
    const dateKey = formatShortDate(s.session.examDate);
    if (!dateSessionMap.has(dateKey)) {
      seq++;
      dateSessionMap.set(dateKey, seq);
    }
    rows.push({
      sessionId: s.session.id,
      subject: s.session.subject,
      examDate: s.session.examDate,
      week: s.session.week,
      periodName: s.session.period.name,
      finalScore: s.finalScore,
      rank: rankMap.get(s.session.id) ?? null,
      sessionSeq: dateSessionMap.get(dateKey)!,
    });
  }

  return (
    <>
      {/* Print styles injected via style tag */}
      <style>{`
        @media print {
          .print\\:hidden { display: none !important; }
          .no-print { display: none !important; }
          body { background: white !important; }
          .printable-grade-report {
            display: block !important;
            padding: 0 !important;
            margin: 0 !important;
          }
        }
        @page {
          size: A4;
          margin: 20mm;
        }
      `}</style>

      <main className="space-y-6 px-0 py-6">
        {/* Navigation — hidden on print */}
        <div className="print:hidden no-print">
          <Link
            href="/student/documents"
            className="inline-flex items-center gap-1 text-sm text-slate transition hover:text-ember"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
            </svg>
            증명서 발급
          </Link>
        </div>

        {/* Control panel — hidden on print */}
        <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6 print:hidden no-print">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
                Grade Report
              </div>
              <h1 className="mt-4 text-2xl font-semibold">성적 확인서 발급</h1>
              <p className="mt-2 text-sm text-slate">
                조회 기간을 선택한 후 인쇄하기를 누르세요.
              </p>
            </div>
            <GradeReportPrintButton />
          </div>

          {/* Period filter form */}
          <form method="GET" className="mt-5 flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="from" className="mb-1.5 block text-xs font-medium text-slate">
                시작일
              </label>
              <input
                id="from"
                type="date"
                name="from"
                defaultValue={rawFrom ?? ""}
                className="rounded-2xl border border-ink/10 bg-white px-4 py-2.5 text-sm focus:border-ember/40 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="to" className="mb-1.5 block text-xs font-medium text-slate">
                종료일
              </label>
              <input
                id="to"
                type="date"
                name="to"
                defaultValue={rawTo ?? ""}
                className="rounded-2xl border border-ink/10 bg-white px-4 py-2.5 text-sm focus:border-ember/40 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-forest"
            >
              기간 적용
            </button>
            {(rawFrom || rawTo) && (
              <Link
                href="/student/documents/grade-report"
                className="inline-flex items-center justify-center rounded-full border border-ink/10 px-5 py-2.5 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                전체 기간
              </Link>
            )}
          </form>
        </section>

        {/* Printable grade report */}
        <div className="printable-grade-report rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">

          {/* Academy header */}
          <div className="border-b-2 border-ink pb-6 text-center">
            <div className="flex items-center justify-center gap-3">
              {/* Simple shield/star logo placeholder */}
              <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-[#1F4D3A] bg-[#1F4D3A]/10">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#1F4D3A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <div className="text-left">
                <p className="text-xs font-semibold text-slate">성장과 합격을 위한 학습 운영</p>
                <p className="text-xl font-bold text-[#1F4D3A]">{branding.academyName}</p>
              </div>
            </div>
            <h2 className="mt-5 text-3xl font-bold tracking-tight text-ink">성 적 확 인 서</h2>
            <p className="mt-1 text-sm text-slate">GRADE REPORT</p>
          </div>

          {/* Student info */}
          <div className="mt-6 grid grid-cols-2 gap-4 border-b border-ink/10 pb-6 sm:grid-cols-4">
            <div>
              <p className="text-xs font-semibold text-slate">성명</p>
              <p className="mt-1 text-base font-bold text-ink">{viewer.name}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate">학번</p>
              <p className="mt-1 text-base font-bold text-ink">{viewer.examNumber}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate">수강반</p>
              <p className="mt-1 text-sm font-semibold text-ink">
                {viewer.className ?? "-"}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate">기수</p>
              <p className="mt-1 text-sm font-semibold text-ink">
                {viewer.generation ? `${viewer.generation}기` : "-"}
              </p>
            </div>
          </div>

          {/* Period info */}
          <div className="mt-4 border-b border-ink/10 pb-4">
            <p className="text-xs text-slate">
              조회 기간:{" "}
              <span className="font-semibold text-ink">
                {fromDate ? formatKoreanDate(fromDate) : "전체 기간"}
                {toDate ? ` ~ ${formatKoreanDate(toDate)}` : ""}
              </span>
            </p>
          </div>

          {/* Scores table */}
          <div className="mt-6">
            {rows.length === 0 ? (
              <div className="rounded-[20px] border border-dashed border-ink/10 px-5 py-10 text-center">
                <p className="text-sm text-slate">해당 기간에 성적 데이터가 없습니다.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-ink/10 text-sm">
                  <thead>
                    <tr className="bg-[#1F4D3A]/5 text-left">
                      <th className="px-3 py-3 text-xs font-semibold text-slate">회차</th>
                      <th className="px-3 py-3 text-xs font-semibold text-slate">일자</th>
                      <th className="px-3 py-3 text-xs font-semibold text-slate">주차</th>
                      <th className="px-3 py-3 text-xs font-semibold text-slate">과목</th>
                      <th className="px-3 py-3 text-center text-xs font-semibold text-slate">점수</th>
                      <th className="px-3 py-3 text-center text-xs font-semibold text-slate">석차 / 응시자</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/10">
                    {rows.map((row, idx) => (
                      <tr
                        key={`${row.sessionId}-${idx}`}
                        className={idx % 2 === 0 ? "bg-white" : "bg-mist/30"}
                      >
                        <td className="px-3 py-2.5 font-mono text-xs text-slate">{row.sessionSeq}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate">
                          {formatShortDate(row.examDate)}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-slate">{row.week}주</td>
                        <td className="px-3 py-2.5 text-sm font-medium text-ink">
                          {SUBJECT_LABEL[row.subject]}
                        </td>
                        <td className={`px-3 py-2.5 text-center text-sm ${scoreColorClass(row.finalScore)}`}>
                          {row.finalScore !== null ? `${row.finalScore}점` : "-"}
                        </td>
                        <td className="px-3 py-2.5 text-center text-xs text-slate">
                          {row.rank
                            ? `${row.rank.rank}위 / ${row.rank.total}명`
                            : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>

                  {/* Summary row */}
                  {rows.length > 0 && (
                    <tfoot>
                      <tr className="border-t-2 border-ink/20 bg-[#1F4D3A]/5">
                        <td colSpan={4} className="px-3 py-3 text-sm font-bold text-ink">
                          요약 · 총 {totalSessions}회 응시
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className={`text-sm font-bold ${overallAvg !== null && overallAvg >= 80 ? "text-forest" : overallAvg !== null && overallAvg >= 60 ? "text-amber-700" : "text-red-600"}`}>
                            {overallAvg !== null ? `평균 ${round1(overallAvg)}점` : "-"}
                          </span>
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </div>

          {/* Issue section */}
          <div className="mt-10 flex flex-wrap items-end justify-between gap-6 border-t border-ink/10 pt-6">
            <div>
              <p className="text-sm text-slate">
                발급일: <span className="font-semibold text-ink">{formatKoreanDate(today)}</span>
              </p>
              <p className="mt-2 text-xs leading-6 text-slate">
                위 성적이 사실임을 확인합니다.
              </p>
            </div>

            {/* Seal / stamp area */}
            <div className="text-right">
              <p className="text-base font-bold text-ink">{branding.academyName}</p>
              {branding.address ? (
                <p className="mt-0.5 text-xs text-slate">{branding.address}</p>
              ) : null}
              {branding.phone ? (
                <p className="mt-0.5 text-xs text-slate">Tel. {branding.phone}</p>
              ) : null}
              {/* Stamp placeholder */}
              <div className="ml-auto mt-3 flex h-16 w-16 items-center justify-center rounded-full border-2 border-[#1F4D3A] text-[10px] font-bold text-[#1F4D3A]">
                원장인
              </div>
            </div>
          </div>

          {/* Print notice — hidden on print */}
          <p className="mt-6 text-center text-xs text-slate/60 print:hidden no-print">
            이 문서는 공식 성적 확인서입니다. 인쇄 후 직인이 찍힌 서면 확인서를 요청할 수 있습니다.
          </p>
        </div>

        {/* Bottom action bar — hidden on print */}
        <div className="flex justify-center print:hidden no-print">
          <GradeReportPrintButton />
        </div>
      </main>
    </>
  );
}
