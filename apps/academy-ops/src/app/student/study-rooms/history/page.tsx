import type { Metadata } from "next";
import Link from "next/link";
import { BookingStatus } from "@prisma/client";
import { StudentLookupForm } from "@/components/student-portal/student-lookup-form";
import { hasDatabaseConfig } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import { getStudentPortalViewer } from "@/lib/student-portal/service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "스터디룸 이용 내역",
};

const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  PENDING: "승인 대기",
  CONFIRMED: "확정",
  CANCELLED: "취소",
  NOSHOW: "노쇼",
};

const BOOKING_STATUS_BADGE: Record<BookingStatus, string> = {
  PENDING: "border-amber-200 bg-amber-50 text-amber-700",
  CONFIRMED: "border-forest/20 bg-forest/10 text-forest",
  CANCELLED: "border-ink/10 bg-mist text-slate",
  NOSHOW: "border-red-200 bg-red-50 text-red-700",
};

const DAY_OF_WEEK_KR = ["일", "월", "화", "수", "목", "금", "토"];

function formatBookingDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const dow = DAY_OF_WEEK_KR[date.getDay()] ?? "";
  return `${y}년 ${m}월 ${d}일 (${dow})`;
}

function calcDurationHours(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  const startMins = (sh ?? 0) * 60 + (sm ?? 0);
  const endMins = (eh ?? 0) * 60 + (em ?? 0);
  return Math.max(0, (endMins - startMins) / 60);
}

function getThisMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  return { start, end };
}

type PageProps = {
  searchParams: { status?: string; from?: string; to?: string };
};

export default async function StudyRoomHistoryPage({ searchParams }: PageProps) {
  if (!hasDatabaseConfig()) {
    return (
      <main className="space-y-6 px-0 py-6">
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
            Unavailable
          </div>
          <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
            DB 연결 후 사용할 수 있습니다.
          </h1>
          <div className="mt-8">
            <Link
              href="/student"
              className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
            >
              학생 포털로 돌아가기
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const viewer = await getStudentPortalViewer();

  if (!viewer) {
    return (
      <main className="space-y-6 px-0 py-6">
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            Login Required
          </div>
          <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
            스터디룸 이용 내역
          </h1>
          <p className="mt-5 text-sm leading-8 text-slate">
            스터디룸 이용 내역은 로그인 후 확인할 수 있습니다.
          </p>
        </section>
        <StudentLookupForm redirectPath="/student/study-rooms/history" />
      </main>
    );
  }

  // Parse filters
  const statusFilter = searchParams.status as BookingStatus | undefined;
  const validStatuses: BookingStatus[] = ["PENDING", "CONFIRMED", "CANCELLED", "NOSHOW"];
  const activeStatus =
    statusFilter && validStatuses.includes(statusFilter) ? statusFilter : undefined;

  const fromDate = searchParams.from ? new Date(searchParams.from) : undefined;
  const toDate = searchParams.to
    ? (() => {
        const d = new Date(searchParams.to);
        d.setHours(23, 59, 59, 999);
        return d;
      })()
    : undefined;

  const allBookings = await getPrisma().studyRoomBooking.findMany({
    where: {
      examNumber: viewer.examNumber,
      ...(activeStatus ? { status: activeStatus } : {}),
      ...(fromDate || toDate
        ? {
            bookingDate: {
              ...(fromDate ? { gte: fromDate } : {}),
              ...(toDate ? { lte: toDate } : {}),
            },
          }
        : {}),
    },
    include: {
      room: {
        select: { id: true, name: true, capacity: true },
      },
    },
    orderBy: [{ bookingDate: "desc" }, { startTime: "asc" }],
  });

  // KPI calculations (unfiltered totals for the student)
  const allBookingsUnfiltered = await getPrisma().studyRoomBooking.findMany({
    where: { examNumber: viewer.examNumber },
    select: { status: true, startTime: true, endTime: true, bookingDate: true },
  });

  const totalCount = allBookingsUnfiltered.length;
  const totalHours = allBookingsUnfiltered
    .filter((b) => b.status === "CONFIRMED")
    .reduce((acc, b) => acc + calcDurationHours(b.startTime, b.endTime), 0);
  const noshowCount = allBookingsUnfiltered.filter((b) => b.status === "NOSHOW").length;

  const { start: monthStart, end: monthEnd } = getThisMonthRange();
  const thisMonthCount = allBookingsUnfiltered.filter((b) => {
    const d = b.bookingDate;
    return d >= monthStart && d <= monthEnd;
  }).length;

  const isFiltered = !!activeStatus || !!fromDate || !!toDate;

  return (
    <main className="space-y-6 px-0 py-6">
      {/* Header */}
      <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
              Study Room History
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-4xl">
              스터디룸 이용 내역
            </h1>
            <p className="mt-3 text-sm leading-7 text-slate">
              전체 스터디룸 예약 및 이용 내역을 확인합니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/student/study-rooms"
              className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
            >
              예약 현황
            </Link>
            <Link
              href="/student"
              className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
            >
              포털 홈
            </Link>
          </div>
        </div>

        {/* KPI row */}
        <div className="mt-8 grid gap-4 sm:grid-cols-4">
          <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
            <p className="text-sm text-slate">총 예약 건수</p>
            <p className="mt-3 text-2xl font-semibold">{totalCount}건</p>
          </article>
          <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
            <p className="text-sm text-slate">총 이용 시간</p>
            <p className="mt-3 text-2xl font-semibold">
              {totalHours % 1 === 0
                ? `${totalHours}시간`
                : `${totalHours.toFixed(1)}시간`}
            </p>
          </article>
          <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
            <p className="text-sm text-slate">이번달 예약</p>
            <p className="mt-3 text-2xl font-semibold">{thisMonthCount}건</p>
          </article>
          <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
            <p className="text-sm text-slate">노쇼 건수</p>
            <p className="mt-3 text-2xl font-semibold">
              {noshowCount > 0 ? (
                <span className="text-red-600">{noshowCount}건</span>
              ) : (
                <span>0건</span>
              )}
            </p>
          </article>
        </div>
      </section>

      {/* Filters */}
      <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
        <h2 className="text-sm font-semibold">필터</h2>
        <form method="GET" className="mt-4 flex flex-wrap items-end gap-4">
          {/* Status filter */}
          <div className="min-w-[140px]">
            <label className="mb-1.5 block text-xs font-medium text-slate" htmlFor="filter-status">
              예약 상태
            </label>
            <select
              id="filter-status"
              name="status"
              defaultValue={activeStatus ?? ""}
              className="w-full rounded-xl border border-ink/10 bg-mist px-3 py-2 text-sm focus:border-ember/40 focus:outline-none focus:ring-2 focus:ring-ember/20"
            >
              <option value="">전체</option>
              <option value="PENDING">승인 대기</option>
              <option value="CONFIRMED">확정</option>
              <option value="CANCELLED">취소</option>
              <option value="NOSHOW">노쇼</option>
            </select>
          </div>

          {/* Date range */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate" htmlFor="filter-from">
              시작일
            </label>
            <input
              id="filter-from"
              type="date"
              name="from"
              defaultValue={searchParams.from ?? ""}
              className="rounded-xl border border-ink/10 bg-mist px-3 py-2 text-sm focus:border-ember/40 focus:outline-none focus:ring-2 focus:ring-ember/20"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate" htmlFor="filter-to">
              종료일
            </label>
            <input
              id="filter-to"
              type="date"
              name="to"
              defaultValue={searchParams.to ?? ""}
              className="rounded-xl border border-ink/10 bg-mist px-3 py-2 text-sm focus:border-ember/40 focus:outline-none focus:ring-2 focus:ring-ember/20"
            />
          </div>

          <button
            type="submit"
            className="inline-flex items-center rounded-full bg-ember px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-ember/90"
          >
            적용
          </button>
          {isFiltered && (
            <Link
              href="/student/study-rooms/history"
              className="inline-flex items-center rounded-full border border-ink/10 px-5 py-2.5 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
            >
              초기화
            </Link>
          )}
        </form>
      </section>

      {/* Results table */}
      <section className="rounded-[28px] border border-ink/10 bg-white shadow-panel">
        <div className="flex items-center justify-between border-b border-ink/10 px-6 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate">
              History
            </p>
            <h2 className="mt-0.5 text-lg font-semibold">
              {isFiltered ? "필터 결과" : "전체 내역"}
            </h2>
          </div>
          <span className="inline-flex rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold text-slate">
            {allBookings.length}건
          </span>
        </div>

        {allBookings.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-sm font-semibold text-ink">
              {isFiltered ? "조건에 맞는 예약 내역이 없습니다" : "스터디룸 이용 내역이 없습니다"}
            </p>
            <p className="mt-2 text-sm text-slate">
              {isFiltered
                ? "필터 조건을 변경하거나 초기화해 보세요."
                : "스터디룸 예약이 생기면 여기에 표시됩니다."}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink/10 bg-mist/60 text-left">
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                      날짜
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                      스터디룸
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                      시간대
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                      상태
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate">
                      메모
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {allBookings.map((booking) => (
                    <tr
                      key={booking.id}
                      className="transition-colors hover:bg-mist/40"
                    >
                      <td className="px-6 py-4 text-sm font-medium text-ink">
                        {formatBookingDate(booking.bookingDate)}
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-sm font-semibold text-ink">
                          {booking.room.name}
                        </span>
                        {booking.room.capacity > 1 && (
                          <span className="ml-2 inline-flex rounded-full border border-ink/10 bg-mist px-2 py-0.5 text-[10px] font-semibold text-slate">
                            최대 {booking.room.capacity}명
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-sm text-slate">
                        {booking.startTime} ~ {booking.endTime}
                        <span className="ml-2 text-xs text-slate/70">
                          ({calcDurationHours(booking.startTime, booking.endTime).toFixed(1)}h)
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${BOOKING_STATUS_BADGE[booking.status]}`}
                        >
                          {BOOKING_STATUS_LABEL[booking.status]}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-xs text-slate">
                        {booking.note ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="divide-y divide-ink/5 sm:hidden">
              {allBookings.map((booking) => (
                <article
                  key={booking.id}
                  className="flex items-start justify-between gap-3 px-5 py-4"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm font-semibold text-ink">
                      {booking.room.name}
                    </p>
                    <p className="text-xs text-slate">
                      {formatBookingDate(booking.bookingDate)}
                    </p>
                    <p className="text-xs font-medium text-ink">
                      {booking.startTime} ~ {booking.endTime}
                    </p>
                    {booking.note && (
                      <p className="text-xs text-slate">메모: {booking.note}</p>
                    )}
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${BOOKING_STATUS_BADGE[booking.status]}`}
                  >
                    {BOOKING_STATUS_LABEL[booking.status]}
                  </span>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
