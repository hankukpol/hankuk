import type { AttendType } from "@prisma/client";

const ATTEND_TYPE_LABEL: Record<AttendType, string> = {
  NORMAL: "출석",
  LIVE: "생방",
  EXCUSED: "공결",
  ABSENT: "결석",
};

const ATTEND_TYPE_COLOR: Record<AttendType, string> = {
  NORMAL: "bg-green-100 text-green-700",
  LIVE: "bg-sky-100 text-sky-700",
  EXCUSED: "bg-amber-100 text-amber-700",
  ABSENT: "bg-red-100 text-red-700",
};

type LogRow = {
  id: string;
  attendDate: Date;
  attendType: AttendType;
  classroom: { name: string; generation: number | null } | null;
};

export function AttendanceHistorySection({ logs }: { logs: LogRow[] }) {
  const counts = {
    NORMAL: logs.filter((l) => l.attendType === "NORMAL").length,
    LIVE: logs.filter((l) => l.attendType === "LIVE").length,
    EXCUSED: logs.filter((l) => l.attendType === "EXCUSED").length,
    ABSENT: logs.filter((l) => l.attendType === "ABSENT").length,
  };
  const total = logs.length;
  const attendanceRate =
    total > 0
      ? Math.round(
          ((counts.NORMAL + counts.LIVE + counts.EXCUSED) / total) * 100,
        )
      : 0;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <div className="rounded-[24px] border border-ink/10 bg-white p-4 shadow-panel">
          <p className="text-xs font-medium text-slate">출석률</p>
          <p
            className={`mt-2 text-2xl font-bold ${
              attendanceRate >= 90
                ? "text-forest"
                : attendanceRate >= 70
                  ? "text-amber-600"
                  : "text-red-600"
            }`}
          >
            {attendanceRate}%
          </p>
        </div>
        {(["NORMAL", "LIVE", "EXCUSED", "ABSENT"] as AttendType[]).map(
          (type) => (
            <div
              key={type}
              className="rounded-[24px] border border-ink/10 bg-white p-4 shadow-panel"
            >
              <p className="text-xs font-medium text-slate">
                {ATTEND_TYPE_LABEL[type]}
              </p>
              <p className="mt-2 text-2xl font-bold">{counts[type]}일</p>
            </div>
          ),
        )}
      </div>

      {/* Log table */}
      {logs.length === 0 ? (
        <div className="rounded-[24px] border border-ink/10 bg-white p-8 text-center text-sm text-slate shadow-panel">
          최근 6개월 출결 기록이 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[24px] border border-ink/10 bg-white shadow-panel">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-left text-xs font-medium text-slate">
                <th className="px-4 py-3">날짜</th>
                <th className="px-4 py-3">반</th>
                <th className="px-4 py-3">출결</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="px-4 py-2 font-mono text-xs">
                    {new Date(log.attendDate).toLocaleDateString("ko-KR", {
                      month: "2-digit",
                      day: "2-digit",
                      weekday: "short",
                    })}
                  </td>
                  <td className="px-4 py-2 text-xs text-slate">
                    {log.classroom
                      ? `${log.classroom.name}${log.classroom.generation ? ` ${log.classroom.generation}기` : ""}`
                      : "—"}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${ATTEND_TYPE_COLOR[log.attendType]}`}
                    >
                      {ATTEND_TYPE_LABEL[log.attendType]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
