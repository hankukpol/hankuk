import { AdminRole } from "@prisma/client";
import { AttendanceHeatmap } from "@/components/analytics/attendance-heatmap";
import { IntegratedEventCalendar } from "@/components/analytics/integrated-event-calendar";
import { requireAdminContext, roleAtLeast } from "@/lib/auth";
import {
  buildIcalFeedPath,
  createIcalFeedToken,
  hasIcalFeedSecret,
} from "@/lib/calendar/ical-feed";
import { EXAM_TYPE_LABEL } from "@/lib/constants";
import { listPeriodScopedAppointmentsForCalendar } from "@/lib/counseling/service";
import { formatMonthLabel } from "@/lib/analytics/presentation";
import { getAttendanceCalendar } from "@/lib/analytics/service";
import {
  getAnalyticsContext,
  getDefaultMonthOption,
  getMonthOptions,
  readStringParam,
} from "@/lib/analytics/ui";
import { formatDate, formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

function getRequestOrigin() {
  return process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") ?? "";
}

export default async function AdminAttendanceCalendarPage({ searchParams }: PageProps) {
  const [context, { periods, selectedPeriod, examType }] = await Promise.all([
    requireAdminContext(AdminRole.VIEWER),
    getAnalyticsContext(searchParams),
  ]);
  const monthOptions = getMonthOptions(selectedPeriod, examType);
  const requestedMonthKey = readStringParam(searchParams, "monthKey");
  const selectedMonth =
    monthOptions.find((option) => `${option.year}-${option.month}` === requestedMonthKey) ??
    getDefaultMonthOption(monthOptions);
  const canViewIntegratedCalendar = roleAtLeast(context.adminUser.role, AdminRole.TEACHER);
  const isIcalFeedConfigured = hasIcalFeedSecret();
  const requestOrigin = getRequestOrigin();
  const icalFeedPath =
    canViewIntegratedCalendar && selectedPeriod && isIcalFeedConfigured
      ? buildIcalFeedPath({
          periodId: selectedPeriod.id,
          examType,
          token: createIcalFeedToken({
            adminId: context.adminUser.id,
            periodId: selectedPeriod.id,
            examType,
          }),
        })
      : null;
  const icalFeedUrl =
    requestOrigin && icalFeedPath ? new URL(icalFeedPath, requestOrigin).toString() : icalFeedPath;

  const monthStart = selectedMonth
    ? new Date(selectedMonth.year, selectedMonth.month - 1, 1, 0, 0, 0, 0)
    : null;
  const monthEnd = selectedMonth
    ? new Date(selectedMonth.year, selectedMonth.month, 0, 23, 59, 59, 999)
    : null;

  let data: Awaited<ReturnType<typeof getAttendanceCalendar>> | null = null;
  let appointments: Awaited<ReturnType<typeof listPeriodScopedAppointmentsForCalendar>> = [];

  if (selectedPeriod && selectedMonth) {
    [data, appointments] = await Promise.all([
      getAttendanceCalendar(selectedPeriod.id, examType, selectedMonth.year, selectedMonth.month),
      canViewIntegratedCalendar && monthStart && monthEnd
        ? listPeriodScopedAppointmentsForCalendar({
            periodId: selectedPeriod.id,
            examType,
            from: monthStart,
            to: monthEnd,
          })
        : Promise.resolve([] as Awaited<ReturnType<typeof listPeriodScopedAppointmentsForCalendar>>),
    ]);
  }

  const totalAbsent = data?.summary.totalAbsent ?? 0;
  const warningStudentCount = data?.summary.warningStudentCount ?? 0;
  const dropoutStudentCount = data?.summary.dropoutStudentCount ?? 0;

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        F-20 Calendar
      </div>
      <h1 className="mt-5 text-3xl font-semibold">출결 캘린더</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        날짜별 결시, 경고, 탈락 신호를 월간 히트맵으로 확인하고 강사 이상 권한에서는 같은 달 면담 예약까지 한 화면에서 함께 확인합니다.
      </p>

      <form className="mt-8 grid gap-4 rounded-[28px] border border-ink/10 bg-mist p-6 md:grid-cols-4">
        <div>
          <label className="mb-2 block text-sm font-medium">시험 기간</label>
          <select
            name="periodId"
            defaultValue={selectedPeriod?.id ? String(selectedPeriod.id) : ""}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
          >
            {periods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium">직렬</label>
          <select
            name="examType"
            defaultValue={examType}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
          >
            <option value="GONGCHAE">{EXAM_TYPE_LABEL.GONGCHAE}</option>
            <option value="GYEONGCHAE">{EXAM_TYPE_LABEL.GYEONGCHAE}</option>
          </select>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium">대상 월</label>
          <select
            name="monthKey"
            defaultValue={selectedMonth ? `${selectedMonth.year}-${selectedMonth.month}` : ""}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
          >
            {monthOptions.map((option) => (
              <option key={`${option.year}-${option.month}`} value={`${option.year}-${option.month}`}>
                {formatMonthLabel(option.year, option.month)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            className="inline-flex w-full items-center justify-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest"
          >
            조회
          </button>
        </div>
      </form>

      {canViewIntegratedCalendar && selectedPeriod ? (
        <section className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <div className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">
                iCal Feed
              </div>
              <h2 className="mt-4 text-xl font-semibold text-ink">
                {"\uc2dc\ud5d8 \uc77c\uc815 \uad6c\ub3c5 \ub9c1\ud06c"}
              </h2>
              <p className="mt-2 text-sm leading-7 text-slate">
                {selectedPeriod.name} {EXAM_TYPE_LABEL[examType]}{" "}
                {
                  "\uc77c\uc815\uc744 \uce98\ub9b0\ub354 \uc571\uc5d0 \ub4f1\ub85d\ud560 \uc218 \uc788\ub294 \uacf5\uac1c .ics \ub9c1\ud06c\uc785\ub2c8\ub2e4. \uba74\ub2f4 \uc608\uc57d\uc740 \uc81c\uc678\ud558\uace0 \uc2dc\ud5d8 \ud68c\ucc28\ub9cc \uc81c\uacf5\ud569\ub2c8\ub2e4."
                }
              </p>
            </div>
            <div className="rounded-[22px] border border-ink/10 bg-mist/40 px-4 py-3 text-sm text-slate">
              {"Apple Calendar, Google Calendar, Outlook\uc5d0\uc11c \uad6c\ub3c5 \uac00\ub2a5"}
            </div>
          </div>

          {!isIcalFeedConfigured ? (
            <div className="mt-6 rounded-[22px] border border-amber-200 bg-amber-50/80 p-4 text-sm leading-7 text-amber-900">
              <p className="font-semibold">{"\ud658\uacbd \ubcc0\uc218 \uc124\uc815 \ud544\uc694"}</p>
              <p className="mt-1">
                {"\uc11c\ubc84\uc5d0 "}
                <code>ICAL_FEED_SECRET</code>
                {" \uc774 \uc5c6\uc5b4\uc11c \uad6c\ub3c5 \ub9c1\ud06c\ub97c \ub9cc\ub4e4 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4."}
              </p>
            </div>
          ) : (
            <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_auto] xl:items-center">
              <div className="rounded-[22px] border border-ink/10 bg-mist/30 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">
                  Subscription URL
                </p>
                <p className="mt-3 break-all font-mono text-sm text-ink">
                  {icalFeedUrl ?? "\ub9c1\ud06c\ub97c \uc0dd\uc131\ud558\uc9c0 \ubabb\ud588\uc2b5\ub2c8\ub2e4."}
                </p>
              </div>
              <a
                href={icalFeedPath ?? "#"}
                target="_blank"
                rel="noreferrer"
                className={`inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition ${
                  icalFeedPath
                    ? "bg-ink text-white hover:bg-forest"
                    : "pointer-events-none bg-slate-200 text-slate"
                }`}
              >
                {"\uc6d0\ubcf8 .ics \uc5f4\uae30"}
              </a>
            </div>
          )}

          <p className="mt-4 text-xs leading-6 text-slate">
            {
              "\uad8c\ud55c\uc774 \uc0b4\uc544 \uc788\ub294 \uac15\uc0ac \uacc4\uc815\uc5d0\ub9cc \ud1a0\ud070\uc774 \ubc1c\uae09\ub418\uba70, \uacc4\uc815 \ube44\ud65c\uc131\ud654 \uc2dc \uae30\uc874 \ub9c1\ud06c\ub3c4 \uc989\uc2dc \ub9c9\ud799\ub2c8\ub2e4."
            }
          </p>
        </section>
      ) : null}
      {!selectedPeriod || !selectedMonth || !data ? (
        <div className="mt-8 rounded-[28px] border border-dashed border-ink/10 p-8 text-sm text-slate">
          선택한 조건에 해당하는 회차가 없습니다.
        </div>
      ) : (
        <>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <article className="rounded-[24px] border border-ink/10 bg-white p-6">
              <p className="text-sm text-slate">월간 결시 합계</p>
              <p className="mt-3 text-2xl font-semibold">{totalAbsent}명</p>
            </article>
            <article className="rounded-[24px] border border-ink/10 bg-white p-6">
              <p className="text-sm text-slate">월중 경고 표시 학생</p>
              <p className="mt-3 text-2xl font-semibold">{warningStudentCount}명</p>
            </article>
            <article className="rounded-[24px] border border-ink/10 bg-white p-6">
              <p className="text-sm text-slate">월중 탈락 표시 학생</p>
              <p className="mt-3 text-2xl font-semibold">{dropoutStudentCount}명</p>
            </article>
          </div>

          <p className="mt-3 text-xs text-slate">
            경고·탈락은 각 시험일의 판정 기준을 따르며, 상단 카드는 해당 월 안에서 한 번이라도 신호가 발생한 학생을 기준으로 집계합니다.
          </p>

          <AttendanceHeatmap
            year={selectedMonth.year}
            month={selectedMonth.month}
            days={data.days}
          />

          {canViewIntegratedCalendar ? (
            <IntegratedEventCalendar
              key={`${selectedMonth.year}-${selectedMonth.month}-${examType}`}
              year={selectedMonth.year}
              month={selectedMonth.month}
              monthLabel={formatMonthLabel(selectedMonth.year, selectedMonth.month)}
              examType={examType}
              examEvents={data.days.map((day) => ({
                sessionId: day.sessionId,
                dateKey: formatDate(day.date),
                subject: day.subject,
                weekLabel: day.weekLabel,
                isCancelled: day.isCancelled,
                isPendingInput: day.isPendingInput,
                normalCount: day.normalCount,
                liveCount: day.liveCount,
                absentCount: day.absentCount,
                warningCount: day.warningCount,
                dropoutCount: day.dropoutCount,
              }))}
              counselingEvents={appointments.map((appointment) => ({
                appointmentId: appointment.id,
                dateKey: formatDate(appointment.scheduledAt),
                timeLabel: formatDateTime(appointment.scheduledAt).slice(11),
                scheduledAtLabel: formatDateTime(appointment.scheduledAt),
                counselorName: appointment.counselorName,
                agenda: appointment.agenda,
                student: appointment.student,
              }))}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

