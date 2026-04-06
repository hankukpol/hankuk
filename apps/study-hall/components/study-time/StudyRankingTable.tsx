import { formatStudyMinutes } from "@/lib/study-time-meta";

export type StudyRankingTableRow = {
  key: string;
  rank: number;
  name: string;
  studentNumber?: string;
  totalMinutes: number;
  studyDays: number;
  dailyAverageMinutes: number;
  isMe?: boolean;
};

type StudyRankingTableProps = {
  rows: StudyRankingTableRow[];
  showStudentNumber?: boolean;
  emptyText: string;
};

export function StudyRankingTable({
  rows,
  showStudentNumber = false,
  emptyText,
}: StudyRankingTableProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-[10px] border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[10px] border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">순위</th>
              <th className="px-4 py-3 text-left font-semibold">이름</th>
              {showStudentNumber ? (
                <th className="px-4 py-3 text-left font-semibold">학번</th>
              ) : null}
              <th className="px-4 py-3 text-right font-semibold">월 누적 학습시간</th>
              <th className="px-4 py-3 text-right font-semibold">학습일</th>
              <th className="px-4 py-3 text-right font-semibold">일평균</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr
                key={row.key}
                className={row.isMe ? "bg-[rgba(37,99,235,0.06)]" : "bg-white"}
              >
                <td className="px-4 py-3 font-bold text-slate-900">{row.rank}등</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-900">{row.name}</span>
                    {row.isMe ? (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                        나
                      </span>
                    ) : null}
                  </div>
                </td>
                {showStudentNumber ? (
                  <td className="px-4 py-3 text-slate-500">{row.studentNumber ?? "-"}</td>
                ) : null}
                <td className="px-4 py-3 text-right font-semibold text-slate-900">
                  {formatStudyMinutes(row.totalMinutes)}
                </td>
                <td className="px-4 py-3 text-right text-slate-600">{row.studyDays}일</td>
                <td className="px-4 py-3 text-right text-slate-600">
                  {formatStudyMinutes(row.dailyAverageMinutes)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
