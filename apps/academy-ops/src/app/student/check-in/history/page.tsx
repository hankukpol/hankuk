import Link from "next/link";
import { hasDatabaseConfig } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import { getStudentPortalViewer } from "@/lib/student-portal/service";
import { formatDateWithWeekday } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "출석 이력",
};

const STATUS_LABEL: Record<string, string> = {
  PRESENT: "출석",
  LATE: "지각",
  ABSENT: "결석",
  EXCUSED: "공결",
};

const STATUS_BADGE_CLASS: Record<string, string> = {
  PRESENT: "bg-forest/10 text-forest",
  LATE: "bg-amber-100 text-amber-700",
  ABSENT: "bg-red-100 text-red-600",
  EXCUSED: "bg-sky-100 text-sky-700",
};

export default async function CheckInHistoryPage() {
  if (!hasDatabaseConfig()) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <h1 className="text-2xl font-semibold">출석 이력</h1>
            <p className="mt-2 text-sm text-slate">DB 연결 후 사용할 수 있습니다.</p>
          </section>
        </div>
      </main>
    );
  }

  const viewer = await getStudentPortalViewer();

  if (!viewer) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <h1 className="mb-4 text-2xl font-semibold">출석 이력</h1>
            <p className="mb-6 text-sm text-slate">
              출석 이력을 확인하려면 로그인해 주세요.
            </p>
            <Link
              href="/student/login?redirectTo=/student/check-in/history"
              className="inline-flex items-center justify-center rounded-full bg-ink px-6 py-3 text-sm font-semibold text-white transition hover:bg-forest"
            >
              로그인
            </Link>
          </section>
        </div>
      </main>
    );
  }

  // 최근 60일 강의 출결 기록 조회
  const since = new Date();
  since.setDate(since.getDate() - 60);

  const records = await getPrisma().lectureAttendance.findMany({
    where: {
      studentId: viewer.examNumber,
      checkedAt: { gte: since },
    },
    include: {
      session: {
        include: {
          schedule: {
            select: {
              subjectName: true,
              instructorName: true,
              cohort: { select: { name: true } },
            },
          },
        },
      },
    },
    orderBy: { checkedAt: "desc" },
    take: 200,
  });

  // 날짜별 그룹핑 (세션 날짜 기준 YYYY-MM-DD)
  const grouped = records.reduce<
    Record<string, typeof records>
  >((acc, r) => {
    // sessionDate는 날짜 전용 필드, checkedAt은 타임스탬프 — 세션 날짜 기준으로 그룹
    const dateKey = r.session.sessionDate.toISOString().slice(0, 10);
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(r);
    return acc;
  }, {});

  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  return (
    <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* 헤더 */}
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="flex items-center gap-3">
            <Link
              href="/student/attendance"
              className="inline-flex items-center gap-1 text-sm text-slate transition hover:text-ink"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              출결 현황
            </Link>
          </div>
          <div className="mt-4">
            <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
              Check-in History
            </div>
            <h1 className="mt-3 text-2xl font-semibold sm:text-3xl">출석 이력</h1>
            <p className="mt-1 text-sm text-slate">
              {viewer.name}의 최근 60일 강의 출석 기록 ({records.length}건)
            </p>
          </div>
        </section>

        {/* 기록 없음 */}
        {sortedDates.length === 0 ? (
          <section className="rounded-[32px] border border-ink/10 bg-white p-8 shadow-panel text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-mist">
              <svg className="h-7 w-7 text-slate" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="mt-3 text-sm font-medium text-ink">출석 기록이 없습니다</p>
            <p className="mt-1 text-xs text-slate">최근 60일간 강의 출결 기록이 없습니다.</p>
          </section>
        ) : (
          sortedDates.map((dateKey) => {
            const dayRecords = grouped[dateKey];
            // 로컬 자정 기준으로 Date 생성 (타임존 오프셋 없이 표시)
            const [year, month, day] = dateKey.split("-").map(Number);
            const dateObj = new Date(year, (month ?? 1) - 1, day ?? 1);

            return (
              <section
                key={dateKey}
                className="overflow-hidden rounded-[32px] border border-ink/10 bg-white shadow-panel"
              >
                {/* 날짜 헤더 */}
                <div className="flex items-center justify-between border-b border-ink/5 px-6 py-4">
                  <p className="text-sm font-semibold text-ink">
                    {formatDateWithWeekday(dateObj)}
                  </p>
                  <span className="text-xs text-slate">{dayRecords.length}건</span>
                </div>

                {/* 강의별 행 */}
                <div className="divide-y divide-ink/5">
                  {dayRecords.map((r) => {
                    const label = STATUS_LABEL[r.status] ?? r.status;
                    const badgeClass =
                      STATUS_BADGE_CLASS[r.status] ?? "bg-ink/10 text-ink";
                    const timeStr = r.checkedAt.toLocaleTimeString("ko-KR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    });

                    return (
                      <div
                        key={r.id}
                        className="flex items-center justify-between px-6 py-4 gap-4"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-ink">
                            {r.session.schedule.subjectName}
                          </p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate">
                            <span>{r.session.schedule.cohort.name}</span>
                            {r.session.schedule.instructorName && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>{r.session.schedule.instructorName}</span>
                              </>
                            )}
                            <span aria-hidden="true">·</span>
                            <span>
                              {r.session.startTime} ~ {r.session.endTime}
                            </span>
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeClass}`}
                          >
                            {label}
                          </span>
                          <span className="text-xs text-slate">{timeStr}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })
        )}
      </div>
    </main>
  );
}
