import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole, ExamEventType } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { EXAM_TYPE_LABEL } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import {
  getStudentIntegratedScoreHistory,
  STUDENT_SCORE_EXAM_TYPE_LABEL,
  type StudentIntegratedScoreRow,
} from "@/lib/students/integrated-score-history";

export const dynamic = "force-dynamic";

const TYPE_BADGE_CLASS: Record<ExamEventType, string> = {
  MORNING: "border-forest/20 bg-forest/10 text-forest",
  MONTHLY: "border-ember/20 bg-ember/10 text-ember",
  SPECIAL: "border-violet-200 bg-violet-50 text-violet-700",
  EXTERNAL: "border-sky-200 bg-sky-50 text-sky-700",
};

const SUB_NAV = [
  { href: "enrollments", label: "수업" },
  { href: "payments", label: "수납" },
  { href: "scores", label: "성적" },
  { href: "attendance", label: "출결" },
] as const;

const ALL_FILTER = "ALL" as const;
const FILTER_TYPES = [
  ALL_FILTER,
  ExamEventType.MORNING,
  ExamEventType.MONTHLY,
  ExamEventType.SPECIAL,
  ExamEventType.EXTERNAL,
] as const;

type ScoreFilter = (typeof FILTER_TYPES)[number];

type PageProps = {
  params: Promise<{ examNumber: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function pickFirst(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeFilter(value: string | undefined): ScoreFilter {
  if (!value) {
    return ALL_FILTER;
  }

  return FILTER_TYPES.includes(value as ScoreFilter)
    ? (value as ScoreFilter)
    : ALL_FILTER;
}

function buildFilterHref(examNumber: string, filter: ScoreFilter) {
  if (filter === ALL_FILTER) {
    return `/admin/students/${examNumber}/scores`;
  }

  return `/admin/students/${examNumber}/scores?type=${filter}`;
}

function buildRankText(row: StudentIntegratedScoreRow) {
  if (row.rank === null || row.participantCount === null) {
    return "—";
  }

  return `${row.rank}위 / ${row.participantCount}명`;
}

function buildScoreText(row: StudentIntegratedScoreRow) {
  if (row.score !== null) {
    return `${row.score}점`;
  }

  return row.examType === ExamEventType.MORNING ? "—" : "미입력";
}

function buildActionLabel(row: StudentIntegratedScoreRow) {
  if (row.examType === ExamEventType.MORNING) {
    return "성적 수정";
  }

  return row.score === null ? "성적 입력" : "시험 화면";
}

function resolveMetricBadgeClass(row: StudentIntegratedScoreRow) {
  if (row.examType === ExamEventType.MORNING) {
    switch (row.metricLabel) {
      case "출석":
        return "border-forest/20 bg-forest/10 text-forest";
      case "라이브":
        return "border-sky-200 bg-sky-50 text-sky-700";
      case "사유 결시":
        return "border-amber-200 bg-amber-50 text-amber-700";
      default:
        return "border-red-200 bg-red-50 text-red-600";
    }
  }

  switch (row.metricLabel) {
    case "공채 남자":
      return "border-ink/10 bg-white text-ink";
    case "공채 여자":
      return "border-pink-200 bg-pink-50 text-pink-700";
    case "경채":
      return "border-violet-200 bg-violet-50 text-violet-700";
    case "온라인":
      return "border-sky-200 bg-sky-50 text-sky-700";
    default:
      return "border-ink/10 bg-white text-slate";
  }
}

export default async function StudentScoresPage({ params, searchParams }: PageProps) {
  await requireAdminContext(AdminRole.TEACHER);

  const { examNumber } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const selectedFilter = normalizeFilter(pickFirst(resolvedSearchParams.type));
  const history = await getStudentIntegratedScoreHistory(examNumber);

  if (!history) {
    notFound();
  }

  const filteredRows = history.rows.filter((row) =>
    selectedFilter === ALL_FILTER ? true : row.examType === selectedFilter,
  );
  const scoredRows = filteredRows.filter((row) => row.score !== null);
  const averageScore =
    scoredRows.length > 0
      ? Math.round(
          (scoredRows.reduce((sum, row) => sum + (row.score ?? 0), 0) / scoredRows.length) * 10,
        ) / 10
      : null;
  const bestScore =
    scoredRows.length > 0 ? Math.max(...scoredRows.map((row) => row.score ?? 0)) : null;
  const coveredTypeCount = new Set(filteredRows.map((row) => row.examType)).size;
  const currentEnrollmentLabels = history.student.currentEnrollments.map((enrollment) => ({
    id: enrollment.id,
    label: `${enrollment.label} · ${enrollment.statusLabel}`,
  }));

  const typeCounts = Object.fromEntries(
    FILTER_TYPES.map((filter) => [
      filter,
      filter === ALL_FILTER
        ? history.rows.length
        : history.rows.filter((row) => row.examType === filter).length,
    ]),
  ) as Record<ScoreFilter, number>;

  return (
    <div className="p-8 sm:p-10">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <Link
            href={`/admin/students/${examNumber}`}
            className="text-sm text-slate transition hover:text-ember"
          >
            ← {history.student.name} ({examNumber})
          </Link>
          <h1 className="mt-3 text-3xl font-semibold">
            {history.student.name}
            <span className="ml-3 text-xl font-normal text-slate">{examNumber}</span>
          </h1>
          <p className="mt-2 text-sm text-slate">
            {EXAM_TYPE_LABEL[history.student.examType]}
            {history.student.className ? ` · ${history.student.className}반` : ""}
            {history.student.generation ? ` · ${history.student.generation}기` : ""}
            {history.student.mobile ? ` · ${history.student.mobile}` : " · 연락처 미등록"}
            {!history.student.isActive && (
              <span className="ml-2 rounded-full border border-ink/10 bg-mist px-2 py-0.5 text-xs font-semibold">
                비활성
              </span>
            )}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {currentEnrollmentLabels.length > 0 ? (
              currentEnrollmentLabels.map((enrollment) => (
                <span
                  key={enrollment.id}
                  className="inline-flex rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold text-slate"
                >
                  {enrollment.label}
                </span>
              ))
            ) : (
              <span className="inline-flex rounded-full border border-dashed border-ink/15 px-3 py-1 text-xs font-semibold text-slate">
                현재 수강내역 없음
              </span>
            )}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
          <Link
            href={`/admin/students/${examNumber}?tab=counseling`}
            className="inline-flex items-center rounded-full border border-forest/20 px-4 py-2 text-xs font-semibold text-forest transition hover:border-forest/40 hover:bg-forest/5"
          >
            면담 기록
          </Link>
          <Link
            href={`/admin/students/${examNumber}/score-trend${selectedFilter !== ALL_FILTER ? `?type=${selectedFilter}` : ""}`}
            className="inline-flex items-center rounded-full border border-ember/20 px-4 py-2 text-xs font-semibold text-ember transition hover:border-ember/40 hover:bg-ember/5"
          >
            성적 추이
          </Link>
          <a
            href={`/api/students/${examNumber}/scores/export${selectedFilter !== ALL_FILTER ? `?type=${selectedFilter}` : ""}` }
            download
            className="inline-flex items-center rounded-full border border-ink/20 px-4 py-2 text-xs font-semibold text-slate transition hover:border-ink/40 hover:bg-ink/5"
          >
            통합 성적 Excel
          </a>
        </div>
      </div>

      <div className="mt-6 flex gap-1 border-b border-ink/10">
        {SUB_NAV.map((item) => {
          const active = item.href === "scores";
          return (
            <Link
              key={item.href}
              href={`/admin/students/${examNumber}/${item.href}`}
              className={`rounded-t-2xl px-5 py-2.5 text-sm font-semibold transition ${
                active
                  ? "-mb-px border border-b-white border-ink/10 bg-white text-ink"
                  : "text-slate hover:text-ink"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">
            전체 기록
          </p>
          <p className="mt-3 text-3xl font-semibold text-ink">{filteredRows.length}건</p>
          <p className="mt-1 text-xs text-slate">현재 필터 기준 통합 성적 이력</p>
        </article>
        <article className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">
            평균 점수
          </p>
          <p className={`mt-3 text-3xl font-semibold ${averageScore === null ? "text-slate" : averageScore >= 80 ? "text-forest" : averageScore >= 60 ? "text-amber-600" : "text-ember"}`}>
            {averageScore !== null ? `${averageScore}점` : "—"}
          </p>
          <p className="mt-1 text-xs text-slate">점수가 입력된 시험 기준</p>
        </article>
        <article className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">
            최고 점수
          </p>
          <p className="mt-3 text-3xl font-semibold text-ember">
            {bestScore !== null ? `${bestScore}점` : "—"}
          </p>
          <p className="mt-1 text-xs text-slate">통합 시험 기준 최고점</p>
        </article>
        <article className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">
            유형 범위
          </p>
          <p className="mt-3 text-3xl font-semibold text-ink">{coveredTypeCount}종</p>
          <p className="mt-1 text-xs text-slate">아침 · 월말 · 특강 · 외부</p>
        </article>
      </section>

      <section className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-ink">시험 유형 필터</h2>
            <p className="mt-1 text-xs text-slate">
              학생 상세의 모든 시험 성적을 한 화면에서 확인합니다.
            </p>
          </div>
          <span className="text-xs text-slate">
            선택: {selectedFilter === ALL_FILTER ? "전체" : STUDENT_SCORE_EXAM_TYPE_LABEL[selectedFilter]}
          </span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {FILTER_TYPES.map((filter) => {
            const active = selectedFilter === filter;
            const label = filter === ALL_FILTER ? "전체" : STUDENT_SCORE_EXAM_TYPE_LABEL[filter];
            return (
              <Link
                key={filter}
                href={buildFilterHref(examNumber, filter)}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  active
                    ? "border-ember/30 bg-ember/10 text-ember"
                    : "border-ink/10 bg-white text-slate hover:border-ember/20 hover:text-ember"
                }`}
              >
                <span>{label}</span>
                <span className="rounded-full bg-black/5 px-2 py-0.5 text-[11px]">
                  {typeCounts[filter]}
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="mt-8 rounded-[28px] border border-ink/10 bg-white shadow-panel">
        <div className="flex items-center justify-between border-b border-ink/10 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-ink">통합 성적 이력</h2>
            <p className="mt-0.5 text-xs text-slate">
              아침모의고사와 이벤트형 시험 결과를 날짜순으로 합쳐 보여줍니다.
            </p>
          </div>
          <span className="rounded-full border border-ink/10 px-3 py-1 text-xs font-semibold text-slate">
            총 {filteredRows.length}건
          </span>
        </div>

        {filteredRows.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-slate">
            선택한 조건에 맞는 성적 이력이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-mist/60 text-left text-xs text-slate">
                  <th className="px-6 py-3 font-semibold">시험일</th>
                  <th className="px-4 py-3 font-semibold">시험명</th>
                  <th className="px-4 py-3 font-semibold">유형</th>
                  <th className="px-4 py-3 font-semibold">과목</th>
                  <th className="px-4 py-3 font-semibold">상태/구분</th>
                  <th className="px-4 py-3 text-right font-semibold">점수</th>
                  <th className="px-4 py-3 text-right font-semibold">석차</th>
                  <th className="px-4 py-3 font-semibold">메모</th>
                  <th className="px-4 py-3 text-right font-semibold">이동</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {filteredRows.map((row) => (
                  <tr key={row.id} className="transition hover:bg-mist/30">
                    <td className="px-6 py-3 font-mono text-xs text-ink">{formatDate(row.examDate)}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-ink">
                        {row.examType === ExamEventType.MORNING ? `${row.title} 아침모의고사` : row.title}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${TYPE_BADGE_CLASS[row.examType]}`}>
                        {row.examTypeLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ink">{row.subjectLabel}</td>
                    <td className="px-4 py-3">
                      {row.metricLabel ? (
                        <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${resolveMetricBadgeClass(row)}`}>
                          {row.metricLabel}
                        </span>
                      ) : (
                        <span className="text-slate">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {row.score !== null ? (
                        <span className={`font-semibold ${row.score >= 80 ? "text-forest" : row.score >= 60 ? "text-ink" : "text-ember"}`}>
                          {buildScoreText(row)}
                        </span>
                      ) : (
                        <span className="text-slate">{buildScoreText(row)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-slate">{buildRankText(row)}</td>
                    <td className="px-4 py-3 text-xs text-slate">{row.note?.trim() ? row.note : "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={row.detailHref}
                        className="inline-flex items-center rounded-full border border-ink/10 px-3 py-1.5 text-xs font-semibold text-slate transition hover:border-ember/30 hover:text-ember"
                      >
                        {buildActionLabel(row)}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

