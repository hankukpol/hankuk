import { notFound } from "next/navigation";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { SUBJECT_LABEL } from "@/lib/constants";
import type { Subject } from "@prisma/client";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ examNumber: string }>;
};

function formatDate(d: Date) {
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function formatPhone(p: string | null | undefined) {
  if (!p) return "-";
  return p.replace(/(\d{3})(\d{3,4})(\d{4})/, "$1-$2-$3");
}

export default async function PerformanceBriefPage({ params }: PageProps) {
  await requireAdminContext(AdminRole.COUNSELOR);
  const { examNumber } = await params;

  const student = await getPrisma().student.findUnique({
    where: { examNumber },
    include: {
      scores: {
        include: {
          session: {
            select: {
              id: true,
              subject: true,
              examDate: true,
              week: true,
              isCancelled: true,
            },
          },
        },
        orderBy: { session: { examDate: "desc" } },
      },
      counselingRecords: {
        select: { id: true },
      },
    },
  });

  if (!student) notFound();

  // Current enrollment
  const enrollment = await getPrisma().courseEnrollment.findFirst({
    where: { examNumber, status: { in: ["ACTIVE", "SUSPENDED"] } },
    include: {
      cohort: { select: { name: true } },
      product: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Last 12 sessions with scores (non-absent)
  const last12 = student.scores
    .filter((s) => !s.session.isCancelled)
    .slice(0, 12)
    .reverse(); // oldest first for trend table

  // Attendance counts (all scores)
  const allScores = student.scores.filter((s) => !s.session.isCancelled);
  const attendCount = allScores.filter((s) => s.attendType !== "ABSENT").length;
  const absentCount = allScores.filter((s) => s.attendType === "ABSENT").length;
  const totalSessions = allScores.length;
  const attendanceRate = totalSessions > 0 ? Math.round((attendCount / totalSessions) * 100) : 0;

  // Overall average (non-absent scores with finalScore)
  const scoredRows = allScores.filter(
    (s) => s.attendType !== "ABSENT" && s.finalScore !== null
  );
  const overallAvg =
    scoredRows.length > 0
      ? Math.round((scoredRows.reduce((sum, s) => sum + (s.finalScore ?? 0), 0) / scoredRows.length) * 10) / 10
      : null;

  // Subject-wise stats
  const subjectMap = new Map<string, number[]>();
  for (const s of scoredRows) {
    const subj = s.session.subject as Subject;
    const label = SUBJECT_LABEL[subj] ?? subj;
    const arr = subjectMap.get(label) ?? [];
    arr.push(s.finalScore!);
    subjectMap.set(label, arr);
  }

  type SubjectStat = {
    subject: string;
    avg: number;
    best: number;
    worst: number;
    trend: "up" | "down" | "flat";
  };

  const subjectStats: SubjectStat[] = Array.from(subjectMap.entries()).map(([subject, scores]) => {
    const avg = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
    const best = Math.max(...scores);
    const worst = Math.min(...scores);
    // Trend: compare first half vs second half average
    const half = Math.floor(scores.length / 2);
    let trend: "up" | "down" | "flat" = "flat";
    if (scores.length >= 2) {
      const firstHalf = scores.slice(0, half || 1);
      const secondHalf = scores.slice(half || 1);
      const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
      if (secondAvg - firstAvg > 1) trend = "up";
      else if (firstAvg - secondAvg > 1) trend = "down";
    }
    return { subject, avg, best, worst, trend };
  });

  // Target scores from student.targetScores JSON
  type TargetScores = Record<string, number>;
  const targetScores: TargetScores | null =
    student.targetScores && typeof student.targetScores === "object" && !Array.isArray(student.targetScores)
      ? (student.targetScores as TargetScores)
      : null;

  const cohortName =
    enrollment?.cohort?.name ?? enrollment?.product?.name ?? null;
  const counselingCount = student.counselingRecords.length;
  const today = new Date();

  return (
    <div className="min-h-screen bg-white">
      {/* Print button — hidden on print */}
      <div className="print:hidden sticky top-0 z-10 flex items-center justify-between border-b border-ink/10 bg-white px-8 py-4">
        <div className="flex items-center gap-3">
          <a
            href={`/admin/students/${examNumber}`}
            className="text-sm text-slate hover:text-ink"
          >
            &larr; 학생 상세로
          </a>
          <span className="text-slate/40">/</span>
          <span className="text-sm font-medium text-ink">성과 브리핑</span>
        </div>
        <button
          onClick={() => {
            if (typeof window !== "undefined") window.print();
          }}
          className="inline-flex items-center gap-2 rounded-[20px] bg-[#C55A11] px-5 py-2 text-sm font-semibold text-white shadow transition hover:bg-[#a84a0d]"
          suppressHydrationWarning
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="6 9 6 2 18 2 18 9" />
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
            <rect x="6" y="14" width="12" height="8" />
          </svg>
          인쇄
        </button>
      </div>

      {/* A4 printable content */}
      <div className="mx-auto max-w-[794px] p-10 print:p-8 print:max-w-none">
        {/* Header */}
        <div className="mb-8 border-b-2 border-[#1F4D3A] pb-6 print:mb-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#C55A11]">
                학원명 미설정
              </p>
              <h1 className="mt-1 text-2xl font-bold text-[#111827]">학생 성과 브리핑</h1>
              <p className="mt-1 text-sm text-[#4B5563]">상담용 · 비공개</p>
            </div>
            <div className="text-right text-sm text-[#4B5563]">
              <p>출력일: {formatDate(today)}</p>
              {cohortName && <p className="mt-0.5">기수: {cohortName}</p>}
            </div>
          </div>
        </div>

        {/* Student Info Card */}
        <div className="mb-8 rounded-2xl border border-ink/10 bg-[#F7F4EF] p-6 print:mb-6 print:rounded-lg">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs text-[#4B5563]">이름</p>
              <p className="mt-0.5 text-lg font-bold text-[#111827]">{student.name}</p>
            </div>
            <div>
              <p className="text-xs text-[#4B5563]">학번</p>
              <p className="mt-0.5 font-mono text-base font-semibold text-[#111827]">
                {student.examNumber}
              </p>
            </div>
            <div>
              <p className="text-xs text-[#4B5563]">연락처</p>
              <p className="mt-0.5 text-sm text-[#111827]">{formatPhone(student.phone)}</p>
            </div>
            <div>
              <p className="text-xs text-[#4B5563]">수험유형</p>
              <p className="mt-0.5 text-sm font-medium text-[#111827]">
                {student.examType === "GONGCHAE" ? "공채" : "경채"}
              </p>
            </div>
          </div>
        </div>

        {/* 3 KPI Metrics */}
        <div className="mb-8 grid grid-cols-3 gap-4 print:mb-6">
          {/* 종합 평균 */}
          <div className="rounded-2xl border border-[#C55A11]/20 bg-[#C55A11]/5 p-5 text-center print:rounded-lg">
            <p className="text-xs font-medium text-[#C55A11]">종합 평균</p>
            <p className="mt-2 text-3xl font-bold text-[#111827]">
              {overallAvg !== null ? overallAvg.toFixed(1) : "-"}
            </p>
            <p className="mt-1 text-xs text-[#4B5563]">점 / {scoredRows.length}회 응시</p>
          </div>
          {/* 출결율 */}
          <div className="rounded-2xl border border-[#1F4D3A]/20 bg-[#1F4D3A]/5 p-5 text-center print:rounded-lg">
            <p className="text-xs font-medium text-[#1F4D3A]">출결율</p>
            <p className="mt-2 text-3xl font-bold text-[#111827]">{attendanceRate}%</p>
            <p className="mt-1 text-xs text-[#4B5563]">
              {attendCount}출석 / {absentCount}결석 (총 {totalSessions}회)
            </p>
          </div>
          {/* 면담 횟수 */}
          <div className="rounded-2xl border border-sky-200 bg-sky-50 p-5 text-center print:rounded-lg">
            <p className="text-xs font-medium text-sky-700">면담 횟수</p>
            <p className="mt-2 text-3xl font-bold text-[#111827]">{counselingCount}</p>
            <p className="mt-1 text-xs text-[#4B5563]">회</p>
          </div>
        </div>

        {/* Score Trend Table (last 8 non-absent sessions) */}
        <div className="mb-8 print:mb-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-[#4B5563]">
            최근 성적 추이 (최근 8회)
          </h2>
          <div className="overflow-hidden rounded-2xl border border-ink/10 print:rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-[#F7F4EF]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#4B5563]">날짜</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[#4B5563]">과목</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[#4B5563]">점수</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[#4B5563]">출결</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {last12.slice(-8).map((s) => {
                  const subj = s.session.subject as Subject;
                  const subjectLabel = SUBJECT_LABEL[subj] ?? subj;
                  const attendLabel =
                    s.attendType === "ABSENT"
                      ? "결석"
                      : s.attendType === "EXCUSED"
                      ? "인정"
                      : s.attendType === "LIVE"
                      ? "라이브"
                      : "출석";
                  return (
                    <tr key={s.id} className="hover:bg-[#F7F4EF]/50">
                      <td className="px-4 py-2.5 text-xs text-[#4B5563]">
                        {formatDate(s.session.examDate)}
                      </td>
                      <td className="px-4 py-2.5 text-sm text-[#111827]">{subjectLabel}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold text-[#111827]">
                        {s.finalScore !== null ? s.finalScore.toFixed(1) : s.attendType === "ABSENT" ? "-" : "-"}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                            s.attendType === "ABSENT"
                              ? "bg-red-50 text-red-600"
                              : s.attendType === "EXCUSED"
                              ? "bg-amber-50 text-amber-700"
                              : "bg-[#1F4D3A]/10 text-[#1F4D3A]"
                          }`}
                        >
                          {attendLabel}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {last12.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-xs text-[#4B5563]">
                      성적 데이터 없음
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Subject Summary Table */}
        {subjectStats.length > 0 && (
          <div className="mb-8 print:mb-6">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-[#4B5563]">
              과목별 성적 요약
            </h2>
            <div className="overflow-hidden rounded-2xl border border-ink/10 print:rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-[#F7F4EF]">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[#4B5563]">과목</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-[#4B5563]">평균</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-[#4B5563]">최고</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-[#4B5563]">최저</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-[#4B5563]">추세</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {subjectStats.map((stat) => (
                    <tr key={stat.subject} className="hover:bg-[#F7F4EF]/50">
                      <td className="px-4 py-2.5 font-medium text-[#111827]">{stat.subject}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold text-[#111827]">
                        {stat.avg.toFixed(1)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-[#1F4D3A]">
                        {stat.best.toFixed(1)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-red-600">
                        {stat.worst.toFixed(1)}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {stat.trend === "up" ? (
                          <span className="font-bold text-[#1F4D3A]">▲</span>
                        ) : stat.trend === "down" ? (
                          <span className="font-bold text-red-600">▼</span>
                        ) : (
                          <span className="text-[#4B5563]">―</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Target vs Actual Progress Bars */}
        {targetScores && Object.keys(targetScores).length > 0 && (
          <div className="mb-8 print:mb-6">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-[#4B5563]">
              목표 점수 대비 현황
            </h2>
            <div className="space-y-3">
              {Object.entries(targetScores).map(([subjectKey, target]) => {
                const stat = subjectStats.find((s) => s.subject === subjectKey);
                const actual = stat?.avg ?? null;
                const pct = actual !== null && target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : 0;
                return (
                  <div key={subjectKey} className="rounded-xl border border-ink/10 bg-[#F7F4EF] p-4 print:rounded-lg">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-medium text-[#111827]">{subjectKey}</span>
                      <span className="text-xs text-[#4B5563]">
                        {actual !== null ? `${actual.toFixed(1)}점` : "미응시"} / 목표 {target}점
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-ink/10">
                      <div
                        className="h-full rounded-full bg-[#C55A11] transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="mt-1 text-right text-xs text-[#4B5563]">{pct}%</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Counselor Signature Line */}
        <div className="mb-8 mt-10 grid grid-cols-2 gap-8 border-t border-ink/10 pt-8 print:mb-6 print:mt-6 print:pt-6">
          <div>
            <p className="text-xs text-[#4B5563]">상담자 서명</p>
            <div className="mt-4 h-10 border-b border-[#111827]" />
            <p className="mt-1 text-xs text-[#4B5563]">서명: _________________________</p>
          </div>
          <div>
            <p className="text-xs text-[#4B5563]">상담 날짜</p>
            <div className="mt-4 h-10 border-b border-[#111827]" />
            <p className="mt-1 text-xs text-[#4B5563]">날짜: _____ 년 _____ 월 _____ 일</p>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-ink/10 pt-4 text-center">
          <p className="text-xs text-[#4B5563]">
            학원 정보는 관리자 설정을 확인하세요
          </p>
          <p className="mt-0.5 text-xs text-[#4B5563]/60">
            이 문서는 상담용 내부 자료입니다.
          </p>
        </div>
      </div>

      {/* Print-specific styles */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              @page { size: A4; margin: 15mm; }
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
          `,
        }}
      />
    </div>
  );
}
