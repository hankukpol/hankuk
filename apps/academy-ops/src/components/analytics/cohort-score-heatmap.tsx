import type { GenerationCohortHeatmapData } from "@/lib/analytics/cohort-analysis";
import { formatScore } from "@/lib/analytics/presentation";
import { SUBJECT_LABEL } from "@/lib/constants";

type Props = {
  data: GenerationCohortHeatmapData;
};

type HeatmapCell = GenerationCohortHeatmapData["rows"][number]["cells"][number];
type HeatmapSubject = GenerationCohortHeatmapData["subjects"][number];

type WeakCell = {
  rowKey: string;
  rowLabel: string;
  subject: HeatmapSubject["subject"];
  averageScore: number | null;
  sessionCount: number;
  scoredCount: number;
  studentCount: number;
};

function toneForCell(cell: HeatmapCell) {
  if (cell.sessionCount === 0) {
    return "border-dashed border-ink/10 bg-white text-slate";
  }

  if (cell.averageScore === null || cell.scoredCount === 0) {
    return "border-rose-200 bg-rose-50 text-rose-800";
  }

  if (cell.averageScore >= 90) {
    return "border-forest/30 bg-forest text-white";
  }

  if (cell.averageScore >= 80) {
    return "border-forest/20 bg-forest/80 text-white";
  }

  if (cell.averageScore >= 70) {
    return "border-sky-200 bg-sky-100 text-sky-900";
  }

  if (cell.averageScore >= 60) {
    return "border-amber-200 bg-amber-100 text-amber-900";
  }

  return "border-red-200 bg-red-100 text-red-900";
}

function describeCell(cell: HeatmapCell) {
  if (cell.sessionCount === 0) {
    return "시험 없음";
  }

  if (cell.averageScore === null || cell.scoredCount === 0) {
    return `${cell.sessionCount}회 중 미응시`;
  }

  if (cell.scoredCount < cell.sessionCount) {
    return `${cell.scoredCount}/${cell.sessionCount}회 기록`;
  }

  return cell.scoredCount > 1 ? `${cell.scoredCount}회 평균` : "1회 기록";
}

function renderCellValue(cell: HeatmapCell) {
  if (cell.sessionCount === 0) {
    return "시험 없음";
  }

  if (cell.averageScore === null || cell.scoredCount === 0) {
    return "미응시";
  }

  return formatScore(cell.averageScore);
}

function buildWeakCells(data: GenerationCohortHeatmapData) {
  return data.rows
    .flatMap((row) =>
      row.cells
        .filter((cell) => cell.sessionCount > 0)
        .map(
          (cell): WeakCell => ({
            rowKey: row.key,
            rowLabel: row.label,
            subject: cell.subject,
            averageScore: cell.averageScore,
            sessionCount: cell.sessionCount,
            scoredCount: cell.scoredCount,
            studentCount: row.studentCount,
          }),
        ),
    )
    .sort((left, right) => {
      const leftRank = left.averageScore === null ? -1 : left.averageScore;
      const rightRank = right.averageScore === null ? -1 : right.averageScore;

      return (
        leftRank - rightRank ||
        left.rowLabel.localeCompare(right.rowLabel, "ko-KR") ||
        SUBJECT_LABEL[left.subject].localeCompare(SUBJECT_LABEL[right.subject], "ko-KR")
      );
    })
    .slice(0, 6);
}

function renderWeakMeta(cell: WeakCell) {
  if (cell.averageScore === null || cell.scoredCount === 0) {
    return `${cell.sessionCount}회 중 기록 없음`;
  }

  return `${cell.scoredCount}/${cell.sessionCount}회 기록 · ${cell.studentCount}명`;
}

export function CohortScoreHeatmap({ data }: Props) {
  const weakCells = buildWeakCells(data);

  if (data.subjects.length === 0 || data.rows.length === 0) {
    return (
      <section className="rounded-[28px] border border-dashed border-ink/10 bg-white p-8 text-center text-sm text-slate">
        코호트 분석 히트맵을 표시할 데이터가 없습니다.
      </section>
    );
  }

  return (
    <section className="rounded-[28px] border border-ink/10 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-ink">코호트별 성적 히트맵</h2>
          <p className="mt-2 text-sm text-slate">
            기수별 평균 점수를 과목 단위로 비교합니다. 기록이 비거나 점수가 낮은 구간은 별도 톤으로 강조합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full border border-red-200 bg-red-100 px-3 py-1 text-red-900">60점 미만</span>
          <span className="rounded-full border border-amber-200 bg-amber-100 px-3 py-1 text-amber-900">60-79점</span>
          <span className="rounded-full border border-sky-200 bg-sky-100 px-3 py-1 text-sky-900">70점대</span>
          <span className="rounded-full border border-forest/20 bg-forest/80 px-3 py-1 text-white">80점 이상</span>
          <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-rose-800">미응시</span>
          <span className="rounded-full border border-ink/10 bg-white px-3 py-1 text-slate">시험 없음</span>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-[24px] border border-ink/10">
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="bg-mist/70 text-left text-slate">
              <th className="sticky left-0 z-10 border-b border-r border-ink/10 bg-mist/70 px-4 py-3 font-semibold text-ink">
                기수
              </th>
              {data.subjects.map((subject) => (
                <th
                  key={subject.subject}
                  className="min-w-[156px] border-b border-ink/10 px-3 py-3 font-semibold"
                >
                  <div>{SUBJECT_LABEL[subject.subject]}</div>
                  <div className="mt-1 text-[11px] font-normal text-slate">{subject.sessionCount}회 시험</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => {
              const cellMap = new Map(row.cells.map((cell) => [cell.subject, cell]));

              return (
                <tr key={row.key}>
                  <th className="sticky left-0 z-10 border-r border-b border-ink/10 bg-white px-4 py-3 text-left font-semibold text-ink">
                    <div>{row.label}</div>
                    <div className="mt-1 text-[11px] font-normal text-slate">{row.studentCount}명</div>
                  </th>
                  {data.subjects.map((subject) => {
                    const cell =
                      cellMap.get(subject.subject) ?? {
                        subject: subject.subject,
                        averageScore: null,
                        sessionCount: 0,
                        scoredCount: 0,
                      };

                    return (
                      <td key={`${row.key}-${subject.subject}`} className="border-b border-ink/10 p-2 align-top">
                        <div className={`rounded-[18px] border px-3 py-4 ${toneForCell(cell)}`}>
                          <p className="text-lg font-semibold">{renderCellValue(cell)}</p>
                          <p className="mt-2 text-[11px] opacity-80">{describeCell(cell)}</p>
                          <p className="mt-1 text-[11px] opacity-70">기록 {cell.scoredCount}/{cell.sessionCount}</p>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {weakCells.length > 0 ? (
        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-base font-semibold text-ink">주의 코호트</h3>
            <p className="text-xs text-slate">평균 점수가 낮거나 기록 누락이 있는 코호트-과목 조합입니다.</p>
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            {weakCells.map((cell) => (
              <article key={`${cell.rowKey}-${cell.subject}`} className="rounded-[20px] border border-ink/10 bg-mist/40 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">주의 코호트</p>
                <p className="mt-2 text-base font-semibold text-ink">{cell.rowLabel}</p>
                <p className="mt-1 text-sm text-slate">{SUBJECT_LABEL[cell.subject]}</p>
                <p className={`mt-3 text-2xl font-semibold ${cell.averageScore === null ? "text-rose-700" : "text-red-700"}`}>
                  {cell.averageScore === null || cell.scoredCount === 0 ? "미응시" : formatScore(cell.averageScore)}
                </p>
                <p className="mt-1 text-xs text-slate">{renderWeakMeta(cell)}</p>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
