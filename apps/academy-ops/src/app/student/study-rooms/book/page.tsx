import Link from "next/link";
import type { Metadata } from "next";
import { BookingStatus } from "@prisma/client";
import { StudentLookupForm } from "@/components/student-portal/student-lookup-form";
import { getAcademyRuntimeBranding } from "@/lib/academy-branding";
import { hasDatabaseConfig } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import { getStudentPortalViewer } from "@/lib/student-portal/service";
import { StudyRoomBookingForm } from "./booking-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "스터디룸 예약 신청",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

function buildDaySlots(baseDate: Date, count = 8) {
  const slots = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const dow = DAY_NAMES[d.getDay()] ?? "";
    slots.push({
      date: `${y}-${m}-${day}`,
      label: `${parseInt(m)}월 ${parseInt(day)}일 (${dow})`,
      isToday: i === 0,
    });
  }
  return slots;
}

function formatDateKR(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const dow = DAY_NAMES[date.getDay()] ?? "";
  return `${y}년 ${m}월 ${d}일 (${dow})`;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

async function fetchRooms() {
  return getPrisma().studyRoom.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, capacity: true, description: true },
  });
}

async function fetchUpcomingBookings(examNumber: string, fromDate: Date) {
  return getPrisma().studyRoomBooking.findMany({
    where: {
      examNumber,
      bookingDate: { gte: fromDate },
      status: {
        in: [BookingStatus.PENDING, BookingStatus.CONFIRMED],
      },
    },
    include: {
      room: { select: { id: true, name: true } },
    },
    orderBy: [{ bookingDate: "asc" }, { startTime: "asc" }],
    take: 10,
  });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function StudyRoomBookPage() {
  if (!hasDatabaseConfig()) {
    return (
      <main className="space-y-6 px-0 py-6">
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
            Booking Unavailable
          </div>
          <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-4xl">
            스터디룸 예약은 DB 연결 후 사용할 수 있습니다.
          </h1>
          <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
            현재 환경에는 데이터베이스가 연결되어 있지 않습니다.
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
            Study Room Booking
          </div>
          <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-4xl">
            스터디룸 예약 신청
          </h1>
          <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
            로그인하면 스터디룸 예약을 신청할 수 있습니다.
          </p>
        </section>
        <StudentLookupForm redirectPath="/student/study-rooms/book" />
      </main>
    );
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [rooms, upcomingBookings] = await Promise.all([
    fetchRooms(),
    fetchUpcomingBookings(viewer.examNumber, today),
  ]);
  const branding = await getAcademyRuntimeBranding(viewer.academyId ?? undefined);

  const daySlots = buildDaySlots(today, 8);

  return (
    <main className="space-y-4 px-0 py-6">
      {/* Header */}
      <section className="rounded-[28px] border border-ink/10 bg-white p-5 shadow-panel sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
              Book a Room
            </div>
            <h1 className="mt-3 text-2xl font-semibold leading-tight sm:text-3xl">
              스터디룸 예약 신청
            </h1>
            <p className="mt-2 text-xs leading-6 text-slate">
              오늘부터 8일간 예약 가능합니다. 신청 후 직원 승인 시 확정됩니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/student/study-rooms"
              className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
            >
              예약 현황
            </Link>
            <Link
              href="/student"
              className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
            >
              포털로
            </Link>
          </div>
        </div>
      </section>

      {/* Booking form */}
      {rooms.length === 0 ? (
        <section className="rounded-[28px] border border-ink/10 bg-white p-5 shadow-panel sm:p-6">
          <div className="rounded-[20px] border border-dashed border-ink/10 px-5 py-12 text-center">
            <p className="text-sm font-semibold text-ink">현재 이용 가능한 스터디룸이 없습니다</p>
            <p className="mt-2 text-sm text-slate">
              스터디룸 이용은 학원 직원에게 문의해 주세요.
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
        </section>
      ) : (
        <section className="rounded-[28px] border border-ink/10 bg-white p-5 shadow-panel sm:p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate">New Booking</p>
          <h2 className="mt-1 text-xl font-semibold">예약 신청</h2>
          <p className="mt-1 text-xs text-slate">
            원하는 스터디룸, 날짜, 시간대를 선택한 후 신청하세요.
          </p>
          <div className="mt-5">
            <StudyRoomBookingForm rooms={rooms} daySlots={daySlots} />
          </div>
        </section>
      )}

      {/* Upcoming bookings */}
      {upcomingBookings.length > 0 && (
        <section className="rounded-[28px] border border-ink/10 bg-white p-5 shadow-panel sm:p-6">
          <div className="flex items-center justify-between gap-3">
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

          <div className="mt-4 flex flex-col gap-2">
            {upcomingBookings.map((booking) => {
              const isPending = booking.status === BookingStatus.PENDING;
              return (
                <article
                  key={booking.id}
                  className={`flex flex-wrap items-start justify-between gap-3 rounded-[20px] border px-5 py-4 ${
                    isPending
                      ? "border-amber-200 bg-amber-50/60"
                      : "border-forest/20 bg-forest/5"
                  }`}
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm font-semibold text-ink">{booking.room.name}</p>
                    <p className="text-xs text-slate">{formatDateKR(booking.bookingDate)}</p>
                    <p
                      className={`text-xs font-semibold ${isPending ? "text-amber-700" : "text-forest"}`}
                    >
                      {booking.startTime} ~ {booking.endTime}
                    </p>
                    {booking.note && (
                      <p className="text-xs text-slate">메모: {booking.note}</p>
                    )}
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${
                      isPending
                        ? "border-amber-200 bg-amber-50 text-amber-700"
                        : "border-forest/20 bg-forest/10 text-forest"
                    }`}
                  >
                    {isPending ? "승인 대기" : "확정"}
                  </span>
                </article>
              );
            })}
          </div>

          <p className="mt-3 text-right text-xs text-slate">
            <Link
              href="/student/study-rooms"
              className="text-ember hover:underline"
            >
              전체 예약 내역 보기 →
            </Link>
          </p>
        </section>
      )}

      {/* Usage guide */}
      <section className="rounded-[28px] border border-ink/10 bg-white p-5 shadow-panel sm:p-6">
        <h2 className="text-sm font-semibold text-ink">스터디룸 이용 안내</h2>
        <ul className="mt-3 space-y-2 text-xs text-slate">
          <li>· 예약 신청 후 담당 직원이 검토·승인합니다.</li>
          <li>· 승인된 예약은 &quot;확정&quot; 상태로 변경됩니다.</li>
          <li>· 예약 변경 또는 취소는 학원으로 연락해 주세요.</li>
          <li>· 예약 시간을 준수해 주세요. 장시간 미사용 시 취소될 수 있습니다.</li>
        </ul>
        <div className="mt-4 flex flex-wrap gap-3">
          {branding.phoneHref ? (
            <a
              href={branding.phoneHref}
              className="inline-flex items-center rounded-full border border-ink/10 bg-mist px-4 py-2 text-xs font-semibold text-ink transition hover:border-ember/30 hover:text-ember"
            >
              {branding.phone}
            </a>
          ) : null}
          <span className="inline-flex items-center rounded-full border border-ink/10 bg-mist px-4 py-2 text-xs text-slate">
            평일 09:00 ~ 21:00 / 주말 09:00 ~ 18:00
          </span>
        </div>
      </section>
    </main>
  );
}
