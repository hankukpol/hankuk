"use client";

import { AttendType } from "@prisma/client";

interface AttendanceLog {
  examNumber: string;
  attendDate: string; // "YYYY-MM-DD"
  attendType: string;
}

interface StudentRow {
  examNumber: string;
  name: string;
  generation: number | null;
}

interface Props {
  students: StudentRow[];
  attendanceLogs: AttendanceLog[];
  month: string; // "YYYY-MM"
}

const TYPE_LABEL: Record<string, string> = {
  NORMAL: "출",
  LIVE: "라",
  EXCUSED: "공",
  ABSENT: "결",
};

const TYPE_CELL_COLOR: Record<string, string> = {
  NORMAL: "bg-forest/20 text-forest",
  LIVE: "bg-sky-100 text-sky-700",
  EXCUSED: "bg-amber-100 text-amber-700",
  ABSENT: "bg-red-100 text-red-700",
};

export function AttendanceMonthlyView({ students, attendanceLogs, month }: Props) {
  const [year, monthNum] = month.split("-").map(Number);
  const daysInMonth = new Date(year, monthNum, 0).getDate();

  // Build lookup: examNumber → day → attendType
  const logMap = new Map<string, Map<number, string>>();
  for (const log of attendanceLogs) {
    const logMonth = log.attendDate.slice(0, 7); // "YYYY-MM"
    if (logMonth !== month) continue;
    const day = parseInt(log.attendDate.slice(8, 10), 10);
    if (!logMap.has(log.examNumber)) logMap.set(log.examNumber, new Map());
    logMap.get(log.examNumber)!.set(day, log.attendType);
  }

  // Get day of week for column headers (0=Sun, 6=Sat)
  function getDayOfWeek(day: number): number {
    return new Date(year, monthNum - 1, day).getDay();
  }

  // Count totals per student
  function countForStudent(examNumber: string, type: string): number {
    const days = logMap.get(examNumber);
    if (!days) return 0;
    let count = 0;
    for (const t of days.values()) {
      if (t === type) count++;
    }
    return count;
  }

  // Summary totals across all students
  const totalByType: Record<string, number> = { NORMAL: 0, LIVE: 0, EXCUSED: 0, ABSENT: 0 };
  for (const [, days] of logMap) {
    for (const type of days.values()) {
      if (type in totalByType) totalByType[type]++;
    }
  }

  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          {year}년 {monthNum}월 출결 현황
        </h2>
        <span className="text-xs text-slate">이번 달 데이터만 표시됩니다</span>
      </div>

      {/* Summary cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-[16px] border border-forest/20 bg-forest/5 p-4 text-center">
          <p className="text-xl font-bold text-forest">{totalByType.NORMAL}</p>
          <p className="mt-0.5 text-xs text-slate">출석 (정상)</p>
        </div>
        <div className="rounded-[16px] border border-sky-200 bg-sky-50 p-4 text-center">
          <p className="text-xl font-bold text-sky-700">{totalByType.LIVE}</p>
          <p className="mt-0.5 text-xs text-slate">라이브</p>
        </div>
        <div className="rounded-[16px] border border-amber-200 bg-amber-50 p-4 text-center">
          <p className="text-xl font-bold text-amber-700">{totalByType.EXCUSED}</p>
          <p className="mt-0.5 text-xs text-slate">사유 결시</p>
        </div>
        <div className="rounded-[16px] border border-red-200 bg-red-50 p-4 text-center">
          <p className="text-xl font-bold text-red-600">{totalByType.ABSENT}</p>
          <p className="mt-0.5 text-xs text-slate">무단 결시</p>
        </div>
      </div>

      {/* Grid table */}
      <div className="overflow-x-auto rounded-[16px] border border-ink/10">
        <table className="min-w-max text-xs">
          <thead className="bg-mist border-b border-ink/10">
            <tr>
              <th className="sticky left-0 z-10 bg-mist px-3 py-2 text-left font-semibold text-slate whitespace-nowrap">
                학번
              </th>
              <th className="sticky left-16 z-10 bg-mist px-3 py-2 text-left font-semibold text-slate whitespace-nowrap">
                이름
              </th>
              {days.map((d) => {
                const dow = getDayOfWeek(d);
                const isSat = dow === 6;
                const isSun = dow === 0;
                return (
                  <th
                    key={d}
                    className={`w-7 px-1 py-2 text-center font-semibold ${
                      isSat
                        ? "bg-blue-50 text-blue-600"
                        : isSun
                          ? "bg-red-50 text-red-500"
                          : "text-slate"
                    }`}
                  >
                    {d}
                  </th>
                );
              })}
              <th className="bg-forest/5 px-2 py-2 text-center font-semibold text-forest">출</th>
              <th className="bg-sky-50 px-2 py-2 text-center font-semibold text-sky-700">라</th>
              <th className="bg-amber-50 px-2 py-2 text-center font-semibold text-amber-700">공</th>
              <th className="bg-red-50 px-2 py-2 text-center font-semibold text-red-600">결</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {students.map((s) => {
              const studentDays = logMap.get(s.examNumber);
              return (
                <tr key={s.examNumber} className="hover:bg-mist/40">
                  <td className="sticky left-0 z-10 bg-white px-3 py-1.5 text-slate whitespace-nowrap hover:bg-mist/40">
                    {s.examNumber}
                  </td>
                  <td className="sticky left-16 z-10 bg-white px-3 py-1.5 font-medium whitespace-nowrap hover:bg-mist/40">
                    {s.name}
                  </td>
                  {days.map((d) => {
                    const type = studentDays?.get(d);
                    const dow = getDayOfWeek(d);
                    const isSat = dow === 6;
                    const isSun = dow === 0;
                    const bgBase = isSat ? "bg-blue-50/30" : isSun ? "bg-red-50/30" : "";
                    return (
                      <td
                        key={d}
                        className={`w-7 px-1 py-1.5 text-center ${bgBase}`}
                      >
                        {type ? (
                          <span
                            className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${TYPE_CELL_COLOR[type] ?? ""}`}
                          >
                            {TYPE_LABEL[type] ?? type}
                          </span>
                        ) : null}
                      </td>
                    );
                  })}
                  <td className="bg-forest/5 px-2 py-1.5 text-center font-semibold text-forest">
                    {countForStudent(s.examNumber, AttendType.NORMAL) || ""}
                  </td>
                  <td className="bg-sky-50/50 px-2 py-1.5 text-center font-semibold text-sky-700">
                    {countForStudent(s.examNumber, AttendType.LIVE) || ""}
                  </td>
                  <td className="bg-amber-50/50 px-2 py-1.5 text-center font-semibold text-amber-700">
                    {countForStudent(s.examNumber, AttendType.EXCUSED) || ""}
                  </td>
                  <td className="bg-red-50/50 px-2 py-1.5 text-center font-semibold text-red-600">
                    {countForStudent(s.examNumber, AttendType.ABSENT) || ""}
                  </td>
                </tr>
              );
            })}
            {students.length === 0 && (
              <tr>
                <td
                  colSpan={daysInMonth + 6}
                  className="px-4 py-8 text-center text-sm text-slate"
                >
                  재적 학생이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate">
        <span className="flex items-center gap-1">
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-forest/20 text-[9px] font-bold text-forest">출</span>
          정상 출석
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-sky-100 text-[9px] font-bold text-sky-700">라</span>
          라이브
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-100 text-[9px] font-bold text-amber-700">공</span>
          사유 결시
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-red-100 text-[9px] font-bold text-red-600">결</span>
          무단 결시
        </span>
      </div>
    </div>
  );
}
