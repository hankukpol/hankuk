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
    /* DESIGN.md 5.8 — 표를 감싼 프레임은 테두리 없이 하나만 둔다.

       640px 미만에서는 순위·이름·누적시간 셋만 남기고, 학습일과 일평균은 누적시간
       아래로 접는다. 다섯 열은 폰 화면에 들어가지 않아 옆으로 끌어야 했는데,
       랭킹에서 옆으로 끌어야 보이는 값은 사실상 없는 값이다. */
    <div className="admin-table-frame">
      <table className="w-full">
        <thead>
          <tr>
            <th>순위</th>
            <th className="admin-table-name">이름</th>
            {showStudentNumber ? (
              <th className="hidden sm:table-cell admin-table-name">수험번호</th>
            ) : null}
            <th className="admin-table-amount">
              <span className="sm:hidden">학습시간</span>
              <span className="hidden sm:inline">월 누적 학습시간</span>
            </th>
            <th className="hidden sm:table-cell admin-table-amount">학습일</th>
            <th className="hidden sm:table-cell admin-table-amount">일평균</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.key}
              className={row.isMe ? "bg-admin-accent-soft" : "bg-admin-surface"}
            >
              <td>{row.rank}등</td>
              <td className="admin-table-name">
                <div className="flex items-center justify-center gap-2">
                  <span className="font-semibold text-admin-text">{row.name}</span>
                  {row.isMe ? (
                    <span className="admin-badge border-admin-accent-line bg-admin-accent-soft text-admin-accent">
                      나
                    </span>
                  ) : null}
                </div>
                {showStudentNumber ? (
                  <div className="admin-help mt-1 sm:hidden">{row.studentNumber ?? "-"}</div>
                ) : null}
              </td>
              {showStudentNumber ? (
                <td className="hidden sm:table-cell">{row.studentNumber ?? "-"}</td>
              ) : null}
              <td className="admin-table-amount">
                {formatStudyMinutes(row.totalMinutes)}
                <div className="admin-help mt-1 whitespace-normal sm:hidden">
                  {row.studyDays}일 · 일평균 {formatStudyMinutes(row.dailyAverageMinutes)}
                </div>
              </td>
              <td className="hidden sm:table-cell admin-table-amount">{row.studyDays}일</td>
              <td className="hidden sm:table-cell admin-table-amount">
                {formatStudyMinutes(row.dailyAverageMinutes)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
