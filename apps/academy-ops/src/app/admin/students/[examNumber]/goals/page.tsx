import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole, Subject } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import {
  SUBJECT_LABEL,
  EXAM_TYPE_LABEL,
  EXAM_TYPE_SUBJECTS,
} from "@/lib/constants";

export const dynamic = "force-dynamic";

// Police exam passing cutoffs (standard reference)
const POLICE_EXAM_CUTOFF: Record<Subject, number> = {
  POLICE_SCIENCE: 60,
  CONSTITUTIONAL_LAW: 60,
  CRIMINAL_LAW: 60,
  CRIMINAL_PROCEDURE: 60,
  CRIMINOLOGY: 60,
  CUMULATIVE: 240, // 4 subjects × 60
};

const SUB_NAV = [
  { href: "enrollments", label: "수업" },
  { href: "payments", label: "수납" },
  { href: "scores", label: "성적" },
  { href: "attendance", label: "출결" },
] as const;

type PageProps = {
  params: Promise<{ examNumber: string }>;
};

type SubjectTarget = {
  subject: Subject;
  label: string;
  target: number | null;
  avg: number | null;
  latest: number | null;
  count: number;
  cutoff: number;
};

export default async function StudentGoalsPage({ params }: PageProps) {
  await requireAdminContext(AdminRole.TEACHER);
  const { examNumber } = await params;

  const prisma = getPrisma();

  const student = await prisma.student.findUnique({
    where: { examNumber },
    select: {
      examNumber: true,
      name: true,
      examType: true,
      className: true,
      generation: true,
      isActive: true,
      targetScores: true,
    },
  });

  if (!student) notFound();

  // Fetch all scores with session info
  const scores = await prisma.score.findMany({
    where: { examNumber },
    include: {
      session: {
        select: {
          subject: true,
          examDate: true,
        },
      },
    },
    orderBy: { session: { examDate: "desc" } },
  });

  // Parse targetScores from JSON field
  // Expected shape: { [Subject]: number } e.g. { POLICE_SCIENCE: 80, ... }
  let targetScoresMap: Partial<Record<Subject, number>> = {};
  if (student.targetScores && typeof student.targetScores === "object") {
    targetScoresMap = student.targetScores as Partial<Record<Subject, number>>;
  }

  const examSubjects = EXAM_TYPE_SUBJECTS[student.examType];

  // Build per-subject stats
  const subjectStats: SubjectTarget[] = examSubjects.map((subject) => {
    const subjectScores = scores.filter(
      (s) =>
        s.session.subject === subject &&
        s.attendType !== "ABSENT" &&
        s.finalScore !== null,
    );

    const avg =
      subjectScores.length > 0
        ? Math.round(
            (subjectScores.reduce((sum, s) => sum + (s.finalScore ?? 0), 0) /
              subjectScores.length) *
              10,
          ) / 10
        : null;

    const latest =
      subjectScores.length > 0 ? (subjectScores[0].finalScore ?? null) : null;

    return {
      subject,
      label: SUBJECT_LABEL[subject],
      target: targetScoresMap[subject] ?? null,
      avg,
      latest,
      count: subjectScores.length,
      cutoff: POLICE_EXAM_CUTOFF[subject],
    };
  });

  // Filter non-CUMULATIVE subjects for individual stats
  const individualSubjects = subjectStats.filter(
    (s) => s.subject !== Subject.CUMULATIVE,
  );
  const cumulativeSubject = subjectStats.find(
    (s) => s.subject === Subject.CUMULATIVE,
  );

  // Overall progress stats
  const subjectsWithData = individualSubjects.filter((s) => s.avg !== null);
  const subjectsAboveCutoff = subjectsWithData.filter(
    (s) => s.avg !== null && s.avg >= s.cutoff,
  );
  const subjectsAboveTarget = individualSubjects.filter(
    (s) =>
      s.target !== null && s.avg !== null && s.avg >= s.target,
  );
  const totalTargetSet = individualSubjects.filter(
    (s) => s.target !== null,
  ).length;

  // Recent 10 attended scores for trend
  const recentScores = scores
    .filter((s) => s.attendType !== "ABSENT" && s.finalScore !== null)
    .slice(0, 10);
  const recentAvg =
    recentScores.length > 0
      ? Math.round(
          (recentScores.reduce((sum, s) => sum + (s.finalScore ?? 0), 0) /
            recentScores.length) *
            10,
        ) / 10
      : null;

  function getProgressColor(pct: number): string {
    if (pct >= 100) return "bg-forest";
    if (pct >= 75) return "bg-amber-400";
    return "bg-red-400";
  }

  function getScoreColor(score: number, cutoff: number): string {
    if (score >= cutoff + 20) return "text-forest";
    if (score >= cutoff) return "text-amber-600";
    return "text-red-600";
  }

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href={`/admin/students/${examNumber}`}
            className="text-sm text-slate transition hover:text-ember"
          >
            ← {student.name} ({examNumber})
          </Link>
          <h1 className="mt-3 text-3xl font-semibold text-ink">
            {student.name}
            <span className="ml-3 text-xl font-normal text-slate">
              {examNumber}
            </span>
          </h1>
          <p className="mt-1 text-sm text-slate">
            {EXAM_TYPE_LABEL[student.examType]}
            {student.className ? ` · ${student.className}반` : ""}
            {student.generation ? ` · ${student.generation}기` : ""}
            {!student.isActive && (
              <span className="ml-2 rounded-full border border-ink/10 bg-mist px-2 py-0.5 text-xs font-semibold">
                비활성
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Sub nav */}
      <div className="mt-6 flex gap-1 border-b border-ink/10">
        {SUB_NAV.map((item) => (
          <Link
            key={item.href}
            href={`/admin/students/${examNumber}/${item.href}`}
            className="rounded-t-2xl px-5 py-2.5 text-sm font-semibold text-slate transition hover:text-ink"
          >
            {item.label}
          </Link>
        ))}
      </div>

      {/* Notice about targetScores */}
      {totalTargetSet === 0 && (
        <div className="mt-6 rounded-[20px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
          <strong>목표 점수 미설정</strong> — 학생 프로필에서 목표 점수를 설정하면
          달성률을 확인할 수 있습니다. 현재는 합격선(60점) 기준으로 진행 상황을
          표시합니다.
          <Link
            href={`/admin/students/${examNumber}/edit`}
            className="ml-2 underline underline-offset-2 font-medium hover:text-amber-900"
          >
            목표 설정 →
          </Link>
        </div>
      )}

      {/* KPI summary */}
      <div className="mt-8 grid gap-4 sm:grid-cols-4">
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">
            합격선 달성 과목
          </p>
          <p className="mt-3 text-3xl font-bold text-ink">
            {subjectsAboveCutoff.length}
            <span className="ml-1 text-base font-normal text-slate">
              / {subjectsWithData.length}
            </span>
          </p>
          <p className="mt-1 text-xs text-slate">평균 60점 이상</p>
        </div>

        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">
            목표 달성 과목
          </p>
          <p className="mt-3 text-3xl font-bold text-forest">
            {subjectsAboveTarget.length}
            <span className="ml-1 text-base font-normal text-slate">
              / {totalTargetSet}
            </span>
          </p>
          <p className="mt-1 text-xs text-slate">개인 목표 기준</p>
        </div>

        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">
            최근 10회 평균
          </p>
          <p
            className={`mt-3 text-3xl font-bold ${
              recentAvg === null
                ? "text-slate"
                : recentAvg >= 60
                  ? "text-forest"
                  : "text-red-600"
            }`}
          >
            {recentAvg !== null ? `${recentAvg}점` : "—"}
          </p>
          <p className="mt-1 text-xs text-slate">전 과목 통합</p>
        </div>

        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">
            총 응시 회차
          </p>
          <p className="mt-3 text-3xl font-bold text-ink">
            {scores.filter(
              (s) => s.attendType !== "ABSENT",
            ).length}
            <span className="ml-1 text-base font-normal text-slate">
              / {scores.length}
            </span>
          </p>
          <p className="mt-1 text-xs text-slate">응시 / 전체</p>
        </div>
      </div>

      {/* Per-subject goal cards */}
      <div className="mt-8">
        <h2 className="mb-4 text-lg font-semibold text-ink">과목별 목표 달성 현황</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {individualSubjects.map((sub) => {
            const targetPct =
              sub.target !== null && sub.avg !== null
                ? Math.min(Math.round((sub.avg / sub.target) * 100), 120)
                : null;
            const cutoffPct =
              sub.avg !== null
                ? Math.min(Math.round((sub.avg / sub.cutoff) * 100), 120)
                : null;

            return (
              <div
                key={sub.subject}
                className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-ink">{sub.label}</h3>
                  {sub.avg !== null && (
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                        sub.avg >= sub.cutoff
                          ? "border-forest/20 bg-forest/10 text-forest"
                          : "border-red-200 bg-red-50 text-red-600"
                      }`}
                    >
                      {sub.avg >= sub.cutoff ? "합격선 이상" : "합격선 미달"}
                    </span>
                  )}
                </div>

                {/* Score row */}
                <div className="mt-4 flex items-end gap-6">
                  <div>
                    <p className="text-xs text-slate">평균 점수</p>
                    <p
                      className={`text-2xl font-bold tabular-nums ${
                        sub.avg !== null
                          ? getScoreColor(sub.avg, sub.cutoff)
                          : "text-slate"
                      }`}
                    >
                      {sub.avg !== null ? `${sub.avg}` : "—"}
                      {sub.avg !== null && (
                        <span className="text-sm font-normal">점</span>
                      )}
                    </p>
                    <p className="text-[10px] text-slate">
                      {sub.count}회 응시 기준
                    </p>
                  </div>

                  {sub.latest !== null && (
                    <div>
                      <p className="text-xs text-slate">최근 점수</p>
                      <p className="text-lg font-semibold tabular-nums text-ink">
                        {sub.latest}점
                      </p>
                    </div>
                  )}

                  <div className="ml-auto text-right">
                    <p className="text-xs text-slate">합격선</p>
                    <p className="text-lg font-semibold text-slate">
                      {sub.cutoff}점
                    </p>
                  </div>

                  {sub.target !== null && (
                    <div className="text-right">
                      <p className="text-xs text-slate">목표</p>
                      <p className="text-lg font-semibold text-ember">
                        {sub.target}점
                      </p>
                    </div>
                  )}
                </div>

                {/* Progress bars */}
                <div className="mt-4 space-y-2">
                  {/* Cutoff progress */}
                  <div>
                    <div className="flex justify-between text-[10px] text-slate mb-0.5">
                      <span>합격선 달성률</span>
                      <span>
                        {cutoffPct !== null ? `${cutoffPct}%` : "데이터 없음"}
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink/10">
                      {cutoffPct !== null && (
                        <div
                          className={`h-full rounded-full transition-all ${getProgressColor(cutoffPct)}`}
                          style={{ width: `${Math.min(cutoffPct, 100)}%` }}
                        />
                      )}
                    </div>
                  </div>

                  {/* Target progress */}
                  {sub.target !== null && (
                    <div>
                      <div className="flex justify-between text-[10px] text-slate mb-0.5">
                        <span>목표 달성률</span>
                        <span>
                          {targetPct !== null ? `${targetPct}%` : "데이터 없음"}
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink/10">
                        {targetPct !== null && (
                          <div
                            className={`h-full rounded-full transition-all ${getProgressColor(targetPct)}`}
                            style={{ width: `${Math.min(targetPct, 100)}%` }}
                          />
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Gap note */}
                {sub.avg !== null && sub.avg < sub.cutoff && (
                  <p className="mt-3 text-[11px] text-red-600">
                    합격선까지{" "}
                    <strong>{Math.round((sub.cutoff - sub.avg) * 10) / 10}점</strong>{" "}
                    부족
                  </p>
                )}
                {sub.avg !== null &&
                  sub.target !== null &&
                  sub.avg < sub.target && (
                    <p className="mt-1 text-[11px] text-amber-700">
                      목표까지{" "}
                      <strong>
                        {Math.round((sub.target - sub.avg) * 10) / 10}점
                      </strong>{" "}
                      남음
                    </p>
                  )}
                {sub.avg !== null && sub.avg >= sub.cutoff && sub.target === null && (
                  <p className="mt-3 text-[11px] text-forest">
                    합격선을 초과하고 있습니다.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Cumulative section */}
      {cumulativeSubject && (
        <div className="mt-6 rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-ink">
            종합 (누적 모의고사)
          </h2>
          <div className="mt-4 flex flex-wrap gap-8">
            <div>
              <p className="text-xs text-slate">평균 점수</p>
              <p
                className={`mt-1 text-2xl font-bold tabular-nums ${
                  cumulativeSubject.avg !== null
                    ? cumulativeSubject.avg >= cumulativeSubject.cutoff
                      ? "text-forest"
                      : "text-red-600"
                    : "text-slate"
                }`}
              >
                {cumulativeSubject.avg !== null
                  ? `${cumulativeSubject.avg}점`
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate">최근 점수</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-ink">
                {cumulativeSubject.latest !== null
                  ? `${cumulativeSubject.latest}점`
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate">합격선 기준</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate">
                {cumulativeSubject.cutoff}점
              </p>
            </div>
            {cumulativeSubject.target !== null && (
              <div>
                <p className="text-xs text-slate">목표</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-ember">
                  {cumulativeSubject.target}점
                </p>
              </div>
            )}
          </div>
          <p className="mt-3 text-xs text-slate">
            응시 횟수: {cumulativeSubject.count}회
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href={`/admin/students/${examNumber}/scores`}
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 px-4 py-2 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink"
        >
          성적 상세 보기 →
        </Link>
        <Link
          href={`/admin/students/${examNumber}/edit`}
          className="inline-flex items-center gap-1.5 rounded-full bg-ember px-4 py-2 text-sm font-medium text-white transition hover:bg-ember/90"
        >
          목표 점수 수정 →
        </Link>
      </div>
    </div>
  );
}
