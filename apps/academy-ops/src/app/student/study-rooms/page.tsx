import type { Metadata } from "next";
import Link from "next/link";
import { BookingStatus } from "@prisma/client";
import { StudentLookupForm } from "@/components/student-portal/student-lookup-form";
import { getAcademyRuntimeBranding } from "@/lib/academy-branding";
import { hasDatabaseConfig } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import { getStudentPortalViewer } from "@/lib/student-portal/service";
import { BookingRequestForm } from "./booking-request-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "스터디룸 예약",
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

function isUpcoming(bookingDate: Date, endTime: string): boolean {
  const now = new Date();
  const [hStr, mStr] = endTime.split(":");
  const bookingEnd = new Date(bookingDate);
  bookingEnd.setHours(parseInt(hStr ?? "23", 10), parseInt(mStr ?? "59", 10), 0, 0);
  return bookingEnd >= now;
}

export default async function StudentStudyRoomsPage() {
  if (!hasDatabaseConfig()) {
    return (
      <main className="space-y-6 px-0 py-6">
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
            Study Room Unavailable
          </div>
          <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
            스터디룸 조회는 DB 연결 후 사용할 수 있습니다.
          </h1>
          <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
            현재 환경에는 스터디룸 예약 데이터를 불러올 데이터베이스가 연결되어 있지 않습니다.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
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
            Study Room Login
          </div>
          <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
            스터디룸 조회는 로그인 후 확인할 수 있습니다.
          </h1>
          <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
            학생 포털에 로그인하면 배정된 스터디룸 예약 내역을 확인할 수 있습니다.
          </p>
        </section>

        <StudentLookupForm redirectPath="/student/study-rooms" />
      </main>
    );
  }

  // Fetch all bookings for this student, ordered by date (newest first)
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const allBookings = await getPrisma().studyRoomBooking.findMany({
    where: {
      examNumber: viewer.examNumber,
    },
    include: {
      room: {
        select: { id: true, name: true, capacity: true, description: true },
      },
    },
    orderBy: [{ bookingDate: "desc" }, { startTime: "asc" }],
    take: 50,
  });

  const pendingBookings = allBookings.filter((b) => b.status === BookingStatus.PENDING);
  const upcomingBookings = allBookings.filter(
    (b) => b.status === BookingStatus.CONFIRMED && isUpcoming(b.bookingDate, b.endTime),
  );
  const pastBookings = allBookings.filter(
    (b) =>
      b.status !== BookingStatus.PENDING &&
      !upcomingBookings.some((u) => u.id === b.id),
  );
  const branding = await getAcademyRuntimeBranding(viewer.academyId ?? undefined);

  return (
    <main className="space-y-6 px-0 py-6">
      {/* Header */}
      <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
              Study Room
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              스터디룸 예약 현황
            </h1>
            <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
              스터디룸 예약 내역을 확인하고 직접 신청할 수 있습니다. 신청 후 직원 승인 시 확정됩니다.
            </p>
            <BookingRequestForm />
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/student"
              className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
            >
              포털로 돌아가기
            </Link>
          </div>
        </div>

        {/* KPI */}
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
            <p className="text-sm text-slate">예정된 예약</p>
            <p className="mt-3 text-xl font-semibold">{upcomingBookings.length}건</p>
          </article>
          <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
            <p className="text-sm text-slate">승인 대기</p>
            <p className="mt-3 text-xl font-semibold">
              {pendingBookings.length > 0 ? (
                <span className="text-amber-700">{pendingBookings.length}건</span>
              ) : (
                <span>{pendingBookings.length}건</span>
              )}
            </p>
          </article>
          <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
            <p className="text-sm text-slate">전체 이용 내역</p>
            <p className="mt-3 text-xl font-semibold">{allBookings.length}건</p>
          </article>
        </div>
      </section>

      {/* Pending bookings (승인 대기 중) */}
      {pendingBookings.length > 0 && (
        <section className="rounded-[28px] border border-amber-200 bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                Pending
              </p>
              <h2 className="mt-1 text-xl font-semibold">승인 대기 중</h2>
            </div>
            <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
              {pendingBookings.length}건
            </span>
          </div>
          <p className="mt-2 text-xs text-slate">
            아래 예약 신청은 담당 직원이 검토 중입니다. 승인되면 &quot;확정&quot; 상태로 변경됩니다.
          </p>

          <div className="mt-4 flex flex-col gap-2">
            {pendingBookings.map((booking) => (
              <article
                key={booking.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-[20px] border border-amber-200 bg-amber-50/60 px-5 py-4"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-ink">{booking.room.name}</span>
                    {booking.room.capacity > 1 && (
                      <span className="inline-flex rounded-full border border-ink/10 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate">
                        최대 {booking.room.capacity}명
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate">{formatBookingDate(booking.bookingDate)}</p>
                  <p className="text-xs font-semibold text-amber-700">
                    {booking.startTime} ~ {booking.endTime}
                  </p>
                  {booking.note && (
                    <p className="text-xs text-slate">메모: {booking.note}</p>
                  )}
                </div>
                <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                  승인 대기
                </span>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* Upcoming bookings */}
      <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate">
              Upcoming
            </p>
            <h2 className="mt-1 text-xl font-semibold">예정된 예약</h2>
          </div>
          <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold text-forest">
            {upcomingBookings.length}건
          </span>
        </div>

        {upcomingBookings.length === 0 ? (
          <div className="mt-4 rounded-[24px] border border-dashed border-ink/10 px-5 py-8 text-center">
            <p className="text-sm font-semibold text-ink">예정된 스터디룸 예약이 없습니다</p>
            <p className="mt-2 text-sm text-slate">
              스터디룸 이용을 원하시면 학원 직원에게 문의해 주세요.
            </p>
            {branding.phoneHref ? (
              <a
                href={branding.phoneHref}
                className="mt-4 inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                {branding.phone}
              </a>
            ) : null}
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-2">
            {upcomingBookings.map((booking) => (
              <article
                key={booking.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-[20px] border border-forest/20 bg-forest/5 px-5 py-4"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-ink">
                      {booking.room.name}
                    </span>
                    {booking.room.capacity > 1 && (
                      <span className="inline-flex rounded-full border border-ink/10 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate">
                        최대 {booking.room.capacity}명
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate">
                    {formatBookingDate(booking.bookingDate)}
                  </p>
                  <p className="text-xs font-semibold text-forest">
                    {booking.startTime} ~ {booking.endTime}
                  </p>
                  {booking.room.description && (
                    <p className="text-xs text-slate">{booking.room.description}</p>
                  )}
                  {booking.note && (
                    <p className="text-xs text-slate">메모: {booking.note}</p>
                  )}
                </div>
                <span
                  className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${BOOKING_STATUS_BADGE[booking.status]}`}
                >
                  {BOOKING_STATUS_LABEL[booking.status]}
                </span>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Past bookings */}
      {pastBookings.length > 0 && (
        <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate">
                History
              </p>
              <h2 className="mt-1 text-xl font-semibold">이용 내역</h2>
            </div>
            <span className="inline-flex rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold text-slate">
              {pastBookings.length}건
            </span>
          </div>

          <div className="flex flex-col gap-2">
            {pastBookings.map((booking) => (
              <article
                key={booking.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-[20px] border border-ink/10 bg-mist/60 px-5 py-4"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm font-semibold text-ink">{booking.room.name}</p>
                  <p className="text-xs text-slate">
                    {formatBookingDate(booking.bookingDate)}
                    {" · "}
                    {booking.startTime} ~ {booking.endTime}
                  </p>
                  {booking.note && (
                    <p className="text-xs text-slate">메모: {booking.note}</p>
                  )}
                </div>
                <span
                  className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${BOOKING_STATUS_BADGE[booking.status]}`}
                >
                  {BOOKING_STATUS_LABEL[booking.status]}
                </span>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* Contact info */}
      <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
        <h2 className="text-lg font-semibold">스터디룸 이용 안내</h2>
        <div className="mt-4 space-y-3 text-sm text-slate">
          <p>스터디룸 예약은 직원을 통해 신청할 수 있습니다.</p>
          <p>예약 변경 또는 취소가 필요한 경우 학원으로 연락해 주세요.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            {branding.phoneHref ? (
              <a
                href={branding.phoneHref}
                className="inline-flex items-center rounded-full border border-ink/10 bg-mist px-5 py-3 text-sm font-semibold text-ink transition hover:border-ember/30 hover:text-ember"
              >
                전화: {branding.phone}
              </a>
            ) : null}
            <div className="inline-flex items-center rounded-full border border-ink/10 bg-mist px-5 py-3 text-sm text-slate">
              평일 09:00 ~ 21:00 / 주말 09:00 ~ 18:00
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
