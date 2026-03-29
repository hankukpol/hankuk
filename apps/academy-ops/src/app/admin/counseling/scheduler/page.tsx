import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { AppointmentCalendar } from "./appointment-calendar";
import type { CalendarAppointment } from "./appointment-calendar";

export const dynamic = "force-dynamic";

export default async function CounselingSchedulerPage() {
  const context = await requireAdminContext(AdminRole.COUNSELOR);

  const prisma = getPrisma();
  const now = new Date();

  // Fetch appointments for current month ±1 week buffer
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 2, 0);

  const appointments = await prisma.counselingAppointment.findMany({
    where: {
      scheduledAt: { gte: from, lte: to },
    },
    include: {
      student: {
        select: {
          examNumber: true,
          name: true,
          phone: true,
        },
      },
    },
    orderBy: { scheduledAt: "asc" },
  });

  const rows: CalendarAppointment[] = appointments.map((appt) => ({
    id: appt.id,
    examNumber: appt.examNumber,
    scheduledAt: appt.scheduledAt.toISOString(),
    counselorName: appt.counselorName,
    agenda: appt.agenda ?? null,
    status: appt.status as "SCHEDULED" | "COMPLETED" | "CANCELLED",
    cancelReason: appt.cancelReason ?? null,
    studentName: appt.student.name,
    studentPhone: appt.student.phone ?? null,
  }));

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            면담 스케줄러
          </div>
          <h1 className="mt-5 text-3xl font-semibold">면담 예약 캘린더</h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            시간대별 면담 예약 현황을 시각적으로 확인하고 빈 슬롯을 클릭해 바로 예약을 추가하세요.
          </p>
        </div>
        <Link
          href="/admin/counseling"
          className="mt-5 inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-5 py-2.5 text-sm font-semibold text-ink transition hover:border-forest/30 hover:text-forest sm:mt-0"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          면담 지원 홈
        </Link>
      </div>

      {/* Quick stats */}
      <div className="mt-6 grid grid-cols-3 gap-4 sm:grid-cols-3">
        <div className="rounded-[24px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-semibold text-slate">이번달 예약</p>
          <p className="mt-2 text-2xl font-bold text-ink">
            {appointments.filter((a) => {
              const d = new Date(a.scheduledAt);
              return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
            }).length}
            <span className="ml-1 text-sm font-normal text-slate">건</span>
          </p>
        </div>
        <div className="rounded-[24px] border border-forest/20 bg-forest/5 p-5">
          <p className="text-xs font-semibold text-forest">예약됨</p>
          <p className="mt-2 text-2xl font-bold text-forest">
            {appointments.filter((a) => a.status === "SCHEDULED").length}
            <span className="ml-1 text-sm font-normal text-slate">건</span>
          </p>
        </div>
        <div className="rounded-[24px] border border-slate/20 bg-slate/5 p-5">
          <p className="text-xs font-semibold text-slate">완료</p>
          <p className="mt-2 text-2xl font-bold text-slate">
            {appointments.filter((a) => a.status === "COMPLETED").length}
            <span className="ml-1 text-sm font-normal text-slate">건</span>
          </p>
        </div>
      </div>

      <div className="mt-6">
        <AppointmentCalendar
          initialAppointments={rows}
          defaultCounselorName={context.adminUser.name}
        />
      </div>
    </div>
  );
}
