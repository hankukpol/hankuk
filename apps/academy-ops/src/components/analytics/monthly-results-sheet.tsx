import Link from "next/link";
import { type MonthlyResultsSheetRow } from "@/lib/analytics/service";
import { formatMonthLabel, formatRank, formatScore } from "@/lib/analytics/presentation";

type MonthlyResultsSheetProps = {
  year?: number;
  month?: number;
  rows: MonthlyResultsSheetRow[];
  title?: string;
  subtitle?: string;
  className?: string;
  printTitle?: string;
};

function noteClass(note: string | null) {
  if (note === "개근") {
    return "text-forest";
  }

  return "";
}

export function MonthlyResultsSheet({
  year,
  month,
  rows,
  title,
  subtitle,
  className,
  printTitle,
}: MonthlyResultsSheetProps) {
  const resolvedSubtitle =
    subtitle ?? (year && month ? formatMonthLabel(year, month) : "");
  const headCellClass = "border border-slate-200 bg-slate-50 px-3 py-3 font-semibold";
  const headNameCellClass = "border border-slate-200 bg-slate-50 px-4 py-3 font-semibold";
  const bodyCellClass = "border border-slate-200 px-3 py-3 font-semibold";
  const bodyNameCellClass = "border border-slate-200 px-4 py-3 text-left";

  return (
    <div
      className={`${className ? `${className} ` : ""}overflow-x-auto rounded-[28px] border border-ink/10 bg-white`}
      data-print-title={printTitle ?? undefined}
    >
      <div className="min-w-[960px]">
        <div className="print-sheet-heading border-b border-ink/10 px-6 py-5 text-center">
          <h2 className="text-2xl font-semibold">{title ?? "월간 성적표"}</h2>
          {resolvedSubtitle ? (
            <p className="mt-2 text-sm text-slate">{resolvedSubtitle}</p>
          ) : null}
        </div>

        <table className="min-w-full border-collapse text-center text-sm">
          <thead>
            <tr>
              <th className={headCellClass}>번호</th>
              <th className={headNameCellClass}>이름</th>
              <th className={headCellClass}>모의고사 점수</th>
              <th className={headCellClass}>객관식 석차</th>
              <th className={headCellClass}>경찰학 OX 점수</th>
              <th className={headCellClass}>주관식 석차</th>
              <th className={headCellClass}>합산 평균</th>
              <th className={headCellClass}>합산 석차</th>
              <th className={headCellClass}>참여율</th>
              <th className={headCellClass}>비고</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={row.examNumber}
                className={row.isActive ? "" : "bg-slate-50/80 text-slate"}
              >
                <td className={bodyCellClass}>{index + 1}</td>
                <td className={bodyNameCellClass}>
                  <Link
                    prefetch={false}
                    href={`/admin/students/${row.examNumber}?tab=history`}
                    className="font-semibold underline-offset-4 hover:text-forest hover:underline"
                  >
                    {row.name}
                  </Link>
                </td>
                <td className={bodyCellClass}>
                  {formatScore(row.mockAverage)}
                </td>
                <td className={`${bodyCellClass} text-red-500`}>
                  {formatRank(row.mockRank)}
                </td>
                <td className={bodyCellClass}>
                  {row.policeOxAverage === null ? "-" : formatScore(row.policeOxAverage)}
                </td>
                <td className={`${bodyCellClass} text-red-500`}>
                  {formatRank(row.policeOxRank)}
                </td>
                <td className={bodyCellClass}>
                  {formatScore(row.combinedAverage)}
                </td>
                <td className={`${bodyCellClass} text-red-500`}>
                  {formatRank(row.combinedRank)}
                </td>
                <td className={bodyCellClass}>
                  {Math.round(row.participationRate)}%
                </td>
                <td className={`${bodyCellClass} ${noteClass(row.note)}`}>
                  {row.note ?? ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
