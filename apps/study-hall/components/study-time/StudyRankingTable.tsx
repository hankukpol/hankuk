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
    /* DESIGN.md 5.8 — 표를 감싼 프레임은 테두리 없이 하나만 둔다. */
    <div className="admin-table-frame">
      <table>
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
              className={row.isMe ? "bg-admin-accent-soft" : "bg-admin-surface"}
            >
              <td>{row.rank}등</td>
              <td>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-admin-text">{row.name}</span>
                  {row.isMe ? (
                    <span className="admin-badge border-admin-accent-line bg-admin-accent-soft text-admin-accent">
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
  );
}
