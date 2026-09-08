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
      <div className="admin-help px-4 py-10 text-center">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="admin-table-frame">
      <div className="admin-table-frame overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr>
              <th className="admin-table-name">순위</th>
              <th className="admin-table-name">이름</th>
              {showStudentNumber ? (
                <th className="admin-table-name">학번</th>
              ) : null}
              <th className="admin-table-amount">월 누적 학습시간</th>
              <th className="admin-table-amount">학습일</th>
              <th className="admin-table-amount">일평균</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.key}
                className={row.isMe ? "bg-[rgba(37,99,235,0.06)]" : "bg-white"}
              >
                <td>{row.rank}등</td>
                <td>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-900">{row.name}</span>
                    {row.isMe ? (
                      <span className="rounded-lg bg-blue-100 px-2 py-0.5 text-[13px] font-semibold text-blue-700">
                        나
                      </span>
                    ) : null}
                  </div>
                </td>
                {showStudentNumber ? (
                  <td>{row.studentNumber ?? "-"}</td>
                ) : null}
                <td className="admin-table-amount">
                  {formatStudyMinutes(row.totalMinutes)}
                </td>
                <td className="admin-table-amount">{row.studyDays}일</td>
                <td className="admin-table-amount">
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
