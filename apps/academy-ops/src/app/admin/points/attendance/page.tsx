import { AdminRole, AttendType, PointType } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

type AchieverRow = {
  rank: number;
  examNumber: string;
  name: string;
  mobile: string | null;
  className: string | null;
  attendDays: number;
  hasPointLog: boolean;
};

type HistoryRow = {
  id: number;
  examNumber: string;
  studentName: string;
  reason: string;
  amount: number;
  grantedAt: string;
};

function pick(params: PageProps["searchParams"], key: string): string | undefined {
  const value = params?.[key];
  return Array.isArray(value) ? value[0] : value;
}

function parseMonth(raw: string | undefined): { year: number; month: number } {
  if (raw && /^\d{4}-\d{2}$/.test(raw)) {
    const [year, month] = raw.split("-").map(Number);
    if (year >= 2020 && month >= 1 && month <= 12) {
      return { year, month };
    }
  }

  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function formatMonthLabel(year: number, month: number): string {
  return `${year}년 ${month}월`;
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function prevMonth(year: number, month: number): { year: number; month: number } {
  if (month === 1) {
    return { year: year - 1, month: 12 };
  }

  return { year, month: month - 1 };
}

function nextMonth(year: number, month: number): { year: number; month: number } {
  if (month === 12) {
    return { year: year + 1, month: 1 };
  }

  return { year, month: month + 1 };
}

export default async function AdminPointsAttendancePage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.TEACHER);

  const prisma = getPrisma();
  const monthParam = pick(searchParams, "month");
  const { year, month } = parseMonth(monthParam);
  const previous = prevMonth(year, month);
  const following = nextMonth(year, month);

  const now = new Date();
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;

  const monthStart = new Date(`${year}-${String(month).padStart(2, "0")}-01`);
  const nextMonthStart = new Date(following.year, following.month - 1, 1);
  const monthStartDateTime = new Date(year, month - 1, 1);
  const nextMonthStartDateTime = new Date(year, month, 1);

  const [thisMonthLogsAgg, thisMonthLogsCount] = await Promise.all([
    prisma.pointLog.aggregate({
      where: {
        type: PointType.PERFECT_ATTENDANCE,
        grantedAt: { gte: monthStartDateTime, lt: nextMonthStartDateTime },
      },
      _sum: { amount: true },
    }),
    prisma.pointLog.count({
      where: {
        type: PointType.PERFECT_ATTENDANCE,
        grantedAt: { gte: monthStartDateTime, lt: nextMonthStartDateTime },
      },
    }),
  ]);

  const allLogsThisMonth = await prisma.classroomAttendanceLog.groupBy({
    by: ["examNumber"],
    where: {
      attendDate: { gte: monthStart, lt: nextMonthStart },
    },
    _count: { _all: true },
  });

  const absentLogsThisMonth = await prisma.classroomAttendanceLog.groupBy({
    by: ["examNumber"],
    where: {
      attendDate: { gte: monthStart, lt: nextMonthStart },
      attendType: AttendType.ABSENT,
    },
    _count: { _all: true },
  });

  const absentSet = new Set(absentLogsThisMonth.map((row) => row.examNumber));
  const achieverExamNumbers = allLogsThisMonth
    .filter((row) => !absentSet.has(row.examNumber))
    .map((row) => row.examNumber);

  const everReceivedGroups = await prisma.pointLog.groupBy({
    by: ["examNumber"],
    where: { type: PointType.PERFECT_ATTENDANCE },
    _count: true,
  });

  const achieverStudents = await prisma.student.findMany({
    where: { examNumber: { in: achieverExamNumbers }, isActive: true },
    select: { examNumber: true, name: true, phone: true, className: true },
  });

  const attendDayMap = new Map(allLogsThisMonth.map((row) => [row.examNumber, row._count._all]));
  const pointLogMap = new Map(
    (
      await prisma.pointLog.findMany({
        where: {
          type: PointType.PERFECT_ATTENDANCE,
          examNumber: { in: achieverExamNumbers },
          grantedAt: { gte: monthStartDateTime, lt: nextMonthStartDateTime },
        },
        select: { examNumber: true },
      })
    ).map((log) => [log.examNumber, true]),
  );

  const achieverRows: AchieverRow[] = achieverStudents
    .map((student) => ({
      rank: 0,
      examNumber: student.examNumber,
      name: student.name,
      mobile: student.phone,
      className: student.className,
      attendDays: attendDayMap.get(student.examNumber) ?? 0,
      hasPointLog: pointLogMap.has(student.examNumber),
    }))
    .sort((a, b) => b.attendDays - a.attendDays || a.name.localeCompare(b.name, "ko"))
    .map((row, index) => ({ ...row, rank: index + 1 }));

  const historyRows: HistoryRow[] = (
    await prisma.pointLog.findMany({
      where: { type: PointType.PERFECT_ATTENDANCE },
      orderBy: { grantedAt: "desc" },
      take: 50,
      include: {
        student: {
          select: { name: true },
        },
      },
    })
  ).map((log) => ({
    id: log.id,
    examNumber: log.examNumber,
    studentName: log.student.name,
    reason: log.reason,
    amount: log.amount,
    grantedAt: log.grantedAt.toISOString(),
  }));

  return (
    <div className="p-8 sm:p-10">
      <nav className="mb-6 flex items-center gap-2 text-xs text-slate">
        <Link href="/admin/points" className="hover:text-forest transition-colors">
          포인트 현황
        </Link>
        <span>/</span>
        <span className="text-ink">개근 포인트 관리</span>
      </nav>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
            포인트 관리
          </div>
          <h1 className="mt-5 text-3xl font-semibold">개근 포인트 현황</h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            월별 개근 달성자와 개근 포인트 지급 이력을 조회합니다.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link
            href="/admin/points"
            className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-mist"
          >
            포인트 현황
          </Link>
          <Link
            href="/admin/points/manage"
            className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-mist"
          >
            포인트 직접 관리
          </Link>
        </div>
      </div>

      <div className="mt-8 flex items-center gap-3 flex-wrap">
        <Link
          href={`/admin/points/attendance?month=${monthKey(previous.year, previous.month)}`}
          className="inline-flex items-center gap-1 rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-mist"
        >
          ← {formatMonthLabel(previous.year, previous.month)}
        </Link>
        <span className="rounded-full border border-ember/20 bg-ember/10 px-5 py-2 text-sm font-semibold text-ember">
          {formatMonthLabel(year, month)}
        </span>
        <Link
          href={`/admin/points/attendance?month=${monthKey(following.year, following.month)}`}
          className="inline-flex items-center gap-1 rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-mist"
        >
          {formatMonthLabel(following.year, following.month)} →
        </Link>
        {!isCurrentMonth ? (
          <Link
            href="/admin/points/attendance"
            className="ml-1 rounded-full border border-forest/20 bg-forest/10 px-4 py-2 text-sm font-medium text-forest transition hover:bg-forest/20"
          >
            이번 달
          </Link>
        ) : null}
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-wider text-slate">개근 포인트 지급 건수</p>
          <p className="mt-3 text-3xl font-bold text-ink">{thisMonthLogsCount.toLocaleString()}</p>
          <p className="mt-1 text-xs text-slate">이번 달 지급 수</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-wider text-slate">개근 포인트 총액</p>
          <p className="mt-3 text-3xl font-bold text-ember">
            {(thisMonthLogsAgg._sum.amount ?? 0).toLocaleString()}
            <span className="ml-1 text-base font-semibold">P</span>
          </p>
          <p className="mt-1 text-xs text-slate">이번 달 합계</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-wider text-slate">개근 달성자</p>
          <p className="mt-3 text-3xl font-bold text-forest">{achieverRows.length.toLocaleString()}</p>
          <p className="mt-1 text-xs text-slate">이번 달 무결시 학생 수</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-wider text-slate">개근 포인트 보유 학생</p>
          <p className="mt-3 text-3xl font-bold text-ink">{everReceivedGroups.length.toLocaleString()}</p>
          <p className="mt-1 text-xs text-slate">누적 수혜 학생 수</p>
        </div>
      </div>

      <div className="mt-10 rounded-[28px] border border-ink/10 bg-white shadow-panel overflow-hidden">
        <div className="px-6 py-5 border-b border-ink/8 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-ink">
              {formatMonthLabel(year, month)} 개근 달성자 목록
            </h2>
            <p className="mt-0.5 text-xs text-slate">ABSENT가 0회인 활성 학생만 표시합니다.</p>
          </div>
          <span className="rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold text-forest">
            {achieverRows.length}명
          </span>
        </div>

        {achieverRows.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate">
            해당 월에 개근 달성자가 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <caption className="sr-only">개근 포인트 대상 학생 목록</caption>
              <thead>
                <tr className="border-b border-ink/8 bg-mist/40">
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                    순위
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                    학번
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                    학생 정보
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                    반
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate">
                    출석일수
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate">
                    지급 상태
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {achieverRows.map((row) => (
                  <tr key={row.examNumber} className="hover:bg-mist/30 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-ink/10 bg-mist text-xs font-semibold text-slate">
                        {row.rank}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Link
                        href={`/admin/students/${row.examNumber}`}
                        className="font-mono text-xs text-slate hover:text-forest transition-colors"
                      >
                        {row.examNumber}
                      </Link>
                    </td>
                    <td className="px-6 py-4">
                      <Link
                        href={`/admin/students/${row.examNumber}`}
                        className="font-medium text-ink hover:text-forest transition-colors"
                      >
                        {row.name}
                      </Link>
                      <p className="mt-1 text-xs text-slate">{row.mobile ?? "-"}</p>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-slate">{row.className ?? "-"}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className="inline-flex items-center rounded-full border border-forest/20 bg-forest/10 px-2.5 py-0.5 text-xs font-semibold text-forest">
                        {row.attendDays}일
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      {row.hasPointLog ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-ember/20 bg-ember/10 px-2.5 py-0.5 text-xs font-semibold text-ember">
                          지급 완료
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full border border-ink/10 bg-mist px-2.5 py-0.5 text-xs font-medium text-slate">
                          미지급
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-8 rounded-[28px] border border-ink/10 bg-white shadow-panel overflow-hidden">
        <div className="px-6 py-5 border-b border-ink/8 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-ink">개근 포인트 지급 이력</h2>
            <p className="mt-0.5 text-xs text-slate">최근 50건의 PERFECT_ATTENDANCE 지급 내역입니다.</p>
          </div>
          <Link
            href="/admin/points/history?type=PERFECT_ATTENDANCE"
            className="text-xs font-medium text-forest hover:underline"
          >
            전체 보기 →
          </Link>
        </div>

        {historyRows.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate">
            개근 포인트 지급 이력이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <caption className="sr-only">개근 포인트 지급 이력</caption>
              <thead>
                <tr className="border-b border-ink/8 bg-mist/40">
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                    지급일
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                    학번
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                    이름
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                    사유
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">
                    포인트
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {historyRows.map((log) => (
                  <tr key={log.id} className="hover:bg-mist/30 transition-colors">
                    <td className="px-6 py-3 whitespace-nowrap text-xs text-slate">
                      {new Date(log.grantedAt).toLocaleDateString("ko-KR", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                      })}
                    </td>
                    <td className="px-6 py-3 whitespace-nowrap">
                      <Link
                        href={`/admin/students/${log.examNumber}`}
                        className="font-mono text-xs text-slate hover:text-forest transition-colors"
                      >
                        {log.examNumber}
                      </Link>
                    </td>
                    <td className="px-6 py-3 whitespace-nowrap">
                      <Link
                        href={`/admin/students/${log.examNumber}`}
                        className="font-medium text-ink hover:text-forest transition-colors"
                      >
                        {log.studentName}
                      </Link>
                    </td>
                    <td className="px-6 py-3 text-slate max-w-[240px] truncate">{log.reason}</td>
                    <td className="px-6 py-3 whitespace-nowrap text-right">
                      <span className="font-bold text-ember">+{log.amount.toLocaleString()}P</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-8 flex gap-3 flex-wrap">
        <Link
          href="/admin/points"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-5 py-2.5 text-sm font-medium text-ink transition hover:bg-mist"
        >
          포인트 현황 대시보드
        </Link>
        <Link
          href="/admin/points/manage"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-5 py-2.5 text-sm font-medium text-ink transition hover:bg-mist"
        >
          포인트 직접 관리
        </Link>
        <Link
          href="/admin/points/leaderboard"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-5 py-2.5 text-sm font-medium text-ink transition hover:bg-mist"
        >
          포인트 리더보드
        </Link>
      </div>
    </div>
  );
}
