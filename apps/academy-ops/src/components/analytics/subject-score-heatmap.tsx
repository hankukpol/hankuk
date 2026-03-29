import { Subject } from "@prisma/client";
import type { SubjectHeatmapData } from "@/lib/analytics/analysis";
import { formatScore } from "@/lib/analytics/presentation";
import { SUBJECT_LABEL } from "@/lib/constants";

type Props = {
  data: SubjectHeatmapData;
};

type HeatmapCell = SubjectHeatmapData["rows"][number]["cells"][number];

type WeakCell = {
  subject: Subject;
  weekKey: string;
  weekLabel: string;
  score: number | null;
  targetScore: number | null;
  sessionCount: number;
  scoredCount: number;
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

function buildWeakCells(data: SubjectHeatmapData): WeakCell[] {
  const weekLabels = new Map(data.weeks.map((week) => [week.weekKey, week.weekLabel]));

  return data.rows
    .flatMap((row) =>
      row.cells
        .filter((cell) => cell.sessionCount > 0)
        .map((cell) => ({
          subject: row.subject,
          weekKey: cell.weekKey,
          weekLabel: weekLabels.get(cell.weekKey) ?? cell.weekKey,
          score: cell.averageScore,
          targetScore: row.targetScore,
          sessionCount: cell.sessionCount,
          scoredCount: cell.scoredCount,
        })),
    )
    .sort((left, right) => {
      const leftRank = left.score === null ? -1 : left.score;
      const rightRank = right.score === null ? -1 : right.score;
      return leftRank - rightRank || left.weekKey.localeCompare(right.weekKey) || SUBJECT_LABEL[left.subject].localeCompare(SUBJECT_LABEL[right.subject]);
    })
    .slice(0, 5);
}

function describeCell(cell: HeatmapCell) {
  if (cell.sessionCount === 0) {
    return "시험 없음";
  }

  if (cell.averageScore === null || cell.scoredCount === 0) {
    return `${cell.sessionCount}회 미응시`;
  }

  if (cell.scoredCount < cell.sessionCount) {
    return `${cell.scoredCount}/${cell.sessionCount}회 기록`;
  }

  return cell.scoredCount > 1 ? `${cell.scoredCount}회 평균` : "1회 기록";
}

function renderWeakCellValue(cell: WeakCell) {
  if (cell.score === null || cell.scoredCount === 0) {
    return "미응시";
  }

  return formatScore(cell.score);
}

function renderWeakCellMeta(cell: WeakCell) {
  if (cell.score === null || cell.scoredCount === 0) {
    return `${cell.sessionCount}회차 미응시`;
  }

  return `목표 ${cell.targetScore !== null ? formatScore(cell.targetScore) : "-"}`;
}

export function SubjectScoreHeatmap({ data }: Props) {
  const weakCells = buildWeakCells(data);

  if (data.weeks.length === 0 || data.rows.length === 0) {
    return (
      <section className="rounded-[28px] border border-dashed border-ink/10 bg-white p-8 text-center text-sm text-slate">
        과목별 히트맵을 표시할 데이터가 없습니다.
      </section>
    );
  }

  return (
    <section className="rounded-[28px] border border-ink/10 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">과목별 성적 히트맵</h2>
          <p className="mt-2 text-sm text-slate">
            주차와 과목을 교차해 취약 구간을 확인합니다. 셀 색이 진할수록 점수가 높고, 미응시는 별도로 강조됩니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full border border-red-200 bg-red-100 px-3 py-1 text-red-900">60점 미만</span>
          <span className="rounded-full border border-amber-200 bg-amber-100 px-3 py-1 text-amber-900">60-79점</span>
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
                과목
              </th>
              {data.weeks.map((week) => (
                <th key={week.weekKey} className="min-w-[120px] border-b border-ink/10 px-3 py-3 font-semibold">
                  <div>{week.weekLabel}</div>
                  <div className="mt-1 text-[11px] font-normal text-slate">{week.sessionCount}회차</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.subject}>
                <th className="sticky left-0 z-10 border-r border-b border-ink/10 bg-white px-4 py-3 text-left font-semibold text-ink">
                  <div>{SUBJECT_LABEL[row.subject]}</div>
                  <div className="mt-1 text-[11px] font-normal text-slate">
                    목표 {row.targetScore !== null ? formatScore(row.targetScore) : "-"}
                  </div>
                </th>
                {row.cells.map((cell) => {
                  const isBelowTarget =
                    row.targetScore !== null && cell.averageScore !== null && cell.averageScore < row.targetScore;

                  return (
                    <td key={`${row.subject}-${cell.weekKey}`} className="border-b border-ink/10 p-2 align-top">
                      <div
                        className={`rounded-[18px] border px-3 py-4 ${toneForCell(cell)} ${
                          isBelowTarget ? "ring-2 ring-red-200/70 ring-inset" : ""
                        }`}
                      >
                        <p className="text-lg font-semibold">
                          {cell.averageScore === null && cell.sessionCount > 0 ? "미응시" : formatScore(cell.averageScore)}
                        </p>
                        <p className="mt-2 text-[11px] opacity-80">{describeCell(cell)}</p>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {weakCells.length > 0 ? (
        <div className="mt-6 grid gap-3 lg:grid-cols-5">
          {weakCells.map((cell) => (
            <article key={`${cell.subject}-${cell.weekKey}`} className="rounded-[20px] border border-ink/10 bg-mist/40 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">취약 구간</p>
              <p className="mt-2 text-base font-semibold text-ink">{SUBJECT_LABEL[cell.subject]}</p>
              <p className="mt-1 text-sm text-slate">{cell.weekLabel}</p>
              <p className={`mt-3 text-2xl font-semibold ${cell.score === null ? "text-rose-700" : "text-red-700"}`}>
                {renderWeakCellValue(cell)}
              </p>
              <p className="mt-1 text-xs text-slate">{renderWeakCellMeta(cell)}</p>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}