import Link from "next/link";
import { redirect } from "next/navigation";
import { AttendStatus, StudentStatus } from "@prisma/client";
import { StudentLookupForm } from "@/components/student-portal/student-lookup-form";
import { AttendanceSection } from "@/components/student-portal/attendance-section";
import { STATUS_BADGE_CLASS, STATUS_LABEL } from "@/lib/analytics/presentation";
import { hasDatabaseConfig } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import { getStudentPortalViewer } from "@/lib/student-portal/service";
import {
  getStudentPortalAttendancePageData,
  getStudentPortalAttendanceCalendarData,
} from "@/student-portal-api-data";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export const dynamic = "force-dynamic";

function readPeriodId(searchParams: PageProps["searchParams"]) {
  const value = searchParams?.periodId;
  const raw = Array.isArray(value) ? value[0] : value;

  if (!raw) {
    return undefined;
  }

  const periodId = Number(raw);
  return Number.isInteger(periodId) && periodId > 0 ? periodId : undefined;
}

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default async function StudentAttendancePage({ searchParams }: PageProps) {
  if (!hasDatabaseConfig()) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
              Student Attendance Unavailable
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              출결 화면은 DB 연결 후 사용할 수 있습니다.
            </h1>
            <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
              현재 환경에는 학생 출결 데이터를 불러올 데이터베이스가 연결되어 있지 않습니다.
            </p>
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
            <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
              Student Attendance Login
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              출결 화면은 로그인 후 확인할 수 있습니다.
            </h1>
            <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
              학생 포털에 로그인하면 최근 시험 출결과 주간, 월간 결석 현황을 함께 볼 수 있습니다.
            </p>
          </section>

          <StudentLookupForm redirectPath="/student/attendance" />
        </div>
      </main>
    );
  }

  const requestedPeriodId = readPeriodId(searchParams);

  // Fetch lecture attendance for the student
  async function getLectureAttendanceData(examNumber: string) {
    const prisma = getPrisma();

    const activeEnrollment = await prisma.courseEnrollment.findFirst({
      where: {
        examNumber,
        status: "ACTIVE",
        cohortId: { not: null },
      },
      orderBy: { createdAt: "desc" },
      select: {
        cohortId: true,
        cohort: { select: { id: true, name: true } },
      },
    });

    if (!activeEnrollment?.cohortId) {
      return null;
    }

    const cohortId = activeEnrollment.cohortId;

    const attendances = await prisma.lectureAttendance.findMany({
      where: {
        studentId: examNumber,
        session: {
          schedule: { cohortId },
          isCancelled: false,
        },
      },
      include: {
        session: {
          include: {
            schedule: { select: { subjectName: true } },
          },
        },
      },
      orderBy: { session: { sessionDate: "desc" } },
      take: 30,
    });

    const totalSessions = attendances.length;
    const presentCount = attendances.filter((a) => a.status === AttendStatus.PRESENT).length;
    const absentCount = attendances.filter((a) => a.status === AttendStatus.ABSENT).length;
    const lateCount = attendances.filter((a) => a.status === AttendStatus.LATE).length;
    const attendanceRate = totalSessions > 0 ? Math.round((presentCount / totalSessions) * 100) : 100;

    return {
      cohortName: activeEnrollment.cohort?.name ?? null,
      stats: { totalSessions, presentCount, absentCount, lateCount, attendanceRate },
      recentAttendances: attendances.map((a) => ({
        id: a.id,
        sessionDate:
          a.session.sessionDate instanceof Date
            ? a.session.sessionDate.toISOString()
            : String(a.session.sessionDate),
        subjectName: a.session.schedule.subjectName,
        startTime: a.session.startTime,
        endTime: a.session.endTime,
        status: a.status,
        note: a.note,
      })),
    };
  }

  // 출결 페이지 데이터 + 이번 달 캘린더 데이터 + 강의 출결 데이터 병렬 로드
  const [data, calendarData, lectureData, studentStatus] = await Promise.all([
    getStudentPortalAttendancePageData({
      examNumber: viewer.examNumber,
      periodId: requestedPeriodId,
    }),
    getStudentPortalAttendanceCalendarData({
      examNumber: viewer.examNumber,
      month: currentMonthKey(),
    }),
    getLectureAttendanceData(viewer.examNumber),
    getPrisma().student.findUnique({
      where: { examNumber: viewer.examNumber },
      select: { currentStatus: true },
    }),
  ]);

  if (!data) {
    return null;
  }

  if (requestedPeriodId !== undefined && !data.periods.some((period) => period.id === requestedPeriodId)) {
    redirect("/student/attendance");
  }

  const initialMonth = calendarData?.month ?? currentMonthKey();
  const initialCalendarRecords = calendarData?.records ?? [];
  const initialMonthlySummary = calendarData?.summary ?? {
    present: 0,
    excused: 0,
    absent: 0,
    total: 0,
    attendanceRate: 0,
    streak: 0,
  };

  return (
    <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* ── 헤더 ── */}
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
                Student Attendance
              </div>
              <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
                {data.student.name}의 출결 현황
              </h1>
              <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
                월별 캘린더, 출석률, 연속 출석 스트릭을 한 화면에서 확인할 수 있습니다.
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div
                className={`inline-flex rounded-full border px-4 py-3 text-sm font-semibold ${STATUS_BADGE_CLASS[data.summary.currentStatus]}`}
              >
                {STATUS_LABEL[data.summary.currentStatus]}
              </div>
              <Link
                href="/student/check-in/history"
                className="inline-flex items-center gap-1.5 rounded-full border border-forest/30 bg-forest/5 px-4 py-2 text-sm font-semibold text-forest transition hover:bg-forest/10"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                </svg>
                출석 이력
              </Link>
              <Link
                href="/student/attendance/calendar"
                className="inline-flex items-center gap-1.5 rounded-full border border-forest/30 bg-forest/5 px-4 py-2 text-sm font-semibold text-forest transition hover:bg-forest/10"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path fillRule="evenodd" d="M5.75 2a.75.75 0 0 1 .75.75V4h7V2.75a.75.75 0 0 1 1.5 0V4h.25A2.75 2.75 0 0 1 18 6.75v8.5A2.75 2.75 0 0 1 15.25 18H4.75A2.75 2.75 0 0 1 2 15.25v-8.5A2.75 2.75 0 0 1 4.75 4H5V2.75A.75.75 0 0 1 5.75 2Zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75Z" clipRule="evenodd" />
                </svg>
                달력 보기
              </Link>
              <Link
                href="/student/absence-notes"
                className="inline-flex items-center gap-1.5 rounded-full border border-ember/30 bg-ember/5 px-4 py-2 text-sm font-semibold text-ember transition hover:bg-ember/10"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
                </svg>
                결석확인서 제출
              </Link>
            </div>
          </div>
        </section>

        {/* ── 기간 선택 폼 ── */}
        <form className="grid gap-4 rounded-[28px] border border-ink/10 bg-white p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:p-6">
          <div>
            <label className="mb-2 block text-sm font-medium">조회 기간</label>
            <select
              name="periodId"
              defaultValue={data.selectedPeriod?.id ? String(data.selectedPeriod.id) : ""}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            >
              {data.periods.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className="inline-flex min-h-12 items-center justify-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest"
            >
              기간 적용
            </button>
          </div>
        </form>

        {/* ── 요약 + 캘린더 + 상세 목록 (클라이언트 컴포넌트) ── */}
        <AttendanceSection
          initialCalendarRecords={initialCalendarRecords}
          initialMonthlySummary={initialMonthlySummary}
          initialMonth={initialMonth}
          summary={data.summary}
          recentSessions={data.recentSessions}
          studentName={data.student.name}
        />

        {/* ── 강의 출결 현황 ── */}
        <LectureAttendanceSection
          lectureData={lectureData}
          warningStatus={studentStatus?.currentStatus ?? StudentStatus.NORMAL}
        />
      </div>
    </main>
  );
}

// ─── 강의 출결 섹션 ───────────────────────────────────────────────────────────

type LectureAttendanceSectionProps = {
  lectureData: {
    cohortName: string | null;
    stats: {
      totalSessions: number;
      presentCount: number;
      absentCount: number;
      lateCount: number;
      attendanceRate: number;
    };
    recentAttendances: Array<{
      id: string;
      sessionDate: string;
      subjectName: string;
      startTime: string;
      endTime: string;
      status: AttendStatus;
      note: string | null;
    }>;
  } | null;
  warningStatus: StudentStatus;
};

function getWarningBadge(status: StudentStatus): { label: string; className: string } {
  if (status === StudentStatus.WARNING_1) {
    return {
      label: "경고 1차",
      className: "border-amber-300 bg-amber-50 text-amber-800",
    };
  }
  if (status === StudentStatus.WARNING_2) {
    return {
      label: "경고 2차",
      className: "border-red-300 bg-red-50 text-red-700",
    };
  }
  if (status === StudentStatus.DROPOUT) {
    return {
      label: "수강취소 위기",
      className: "border-red-800 bg-red-900/10 text-red-900",
    };
  }
  return {
    label: "정상",
    className: "border-forest/30 bg-forest/10 text-forest",
  };
}

function getAttendStatusLabel(status: AttendStatus): { label: string; className: string } {
  if (status === AttendStatus.PRESENT) {
    return { label: "출석", className: "border-forest/30 bg-forest/10 text-forest" };
  }
  if (status === AttendStatus.ABSENT) {
    return { label: "결석", className: "border-red-200 bg-red-50 text-red-700" };
  }
  if (status === AttendStatus.LATE) {
    return { label: "지각", className: "border-amber-200 bg-amber-50 text-amber-700" };
  }
  return { label: status, className: "border-ink/20 bg-ink/5 text-slate" };
}

function formatSessionDate(isoDate: string): string {
  const d = new Date(isoDate);
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  const dayLabel = days[d.getDay()];
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return `${ymd}(${dayLabel})`;
}

function LectureAttendanceSection({ lectureData, warningStatus }: LectureAttendanceSectionProps) {
  const warningBadge = getWarningBadge(warningStatus);

  return (
    <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            Lecture Attendance
          </div>
          <h2 className="mt-4 text-xl font-semibold text-ink">
            강의 출결 현황
            {lectureData?.cohortName && (
              <span className="ml-2 text-base font-normal text-slate">({lectureData.cohortName})</span>
            )}
          </h2>
        </div>
        {/* Warning status badge */}
        <span
          className={`inline-flex items-center rounded-full border px-4 py-2 text-sm font-semibold ${warningBadge.className}`}
        >
          {warningBadge.label}
        </span>
      </div>

      {!lectureData || lectureData.stats.totalSessions === 0 ? (
        <div className="mt-6 rounded-2xl border border-ink/10 bg-mist px-6 py-10 text-center">
          <p className="text-sm text-slate">강의 출결 기록이 없습니다.</p>
          <p className="mt-1 text-xs text-slate/60">수강 중인 기수에 강의가 등록되면 여기에 표시됩니다.</p>
        </div>
      ) : (
        <>
          {/* Stats row */}
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-ink/10 bg-mist p-4 text-center">
              <p className="text-xs text-slate">총 강의 수</p>
              <p className="mt-1 text-2xl font-bold text-ink">
                {lectureData.stats.totalSessions}
                <span className="ml-0.5 text-sm font-normal text-slate">회</span>
              </p>
            </div>
            <div className="rounded-2xl border border-forest/20 bg-forest/5 p-4 text-center">
              <p className="text-xs text-slate">출석</p>
              <p className="mt-1 text-2xl font-bold text-forest">
                {lectureData.stats.presentCount}
                <span className="ml-0.5 text-sm font-normal text-slate">회</span>
              </p>
            </div>
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-center">
              <p className="text-xs text-slate">결석</p>
              <p className={`mt-1 text-2xl font-bold ${lectureData.stats.absentCount > 0 ? "text-red-600" : "text-ink"}`}>
                {lectureData.stats.absentCount}
                <span className="ml-0.5 text-sm font-normal text-slate">회</span>
              </p>
            </div>
            <div className="rounded-2xl border border-ink/10 bg-white p-4 text-center">
              <p className="text-xs text-slate">출석률</p>
              <p
                className={`mt-1 text-2xl font-bold ${
                  lectureData.stats.attendanceRate >= 90
                    ? "text-forest"
                    : lectureData.stats.attendanceRate >= 70
                      ? "text-amber-600"
                      : "text-red-600"
                }`}
              >
                {lectureData.stats.attendanceRate}
                <span className="ml-0.5 text-sm font-normal text-slate">%</span>
              </p>
              {lectureData.stats.lateCount > 0 && (
                <p className="mt-0.5 text-xs text-slate/70">
                  지각 {lectureData.stats.lateCount}회 포함
                </p>
              )}
            </div>
          </div>

          {/* Recent sessions table */}
          <div className="mt-6 overflow-x-auto rounded-2xl border border-ink/10">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-mist text-left">
                  <th className="whitespace-nowrap px-5 py-3 font-semibold text-slate">날짜</th>
                  <th className="whitespace-nowrap px-5 py-3 font-semibold text-slate">과목</th>
                  <th className="whitespace-nowrap px-5 py-3 font-semibold text-slate">시간</th>
                  <th className="whitespace-nowrap px-5 py-3 font-semibold text-slate">출결</th>
                </tr>
              </thead>
              <tbody>
                {lectureData.recentAttendances.map((a, idx) => {
                  const statusBadge = getAttendStatusLabel(a.status);
                  const isEven = idx % 2 === 0;
                  return (
                    <tr
                      key={a.id}
                      className={`border-b border-ink/5 ${isEven ? "" : "bg-gray-50/40"}`}
                    >
                      <td className="whitespace-nowrap px-5 py-3 font-medium text-ink">
                        {formatSessionDate(a.sessionDate)}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-ink">
                        {a.subjectName}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-slate">
                        {a.startTime} ~ {a.endTime}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusBadge.className}`}
                        >
                          {statusBadge.label}
                        </span>
                        {a.note && (
                          <p className="mt-0.5 text-xs text-slate/70">{a.note}</p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
