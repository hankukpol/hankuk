import type { Metadata } from "next";
import Link from "next/link";
import { StudentLookupForm } from "@/components/student-portal/student-lookup-form";
import { getAcademyRuntimeBranding } from "@/lib/academy-branding";
import { hasDatabaseConfig } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import { getStudentPortalViewer } from "@/lib/student-portal/service";
import { AppointmentForm } from "./appointment-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "면담 신청",
};

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "접수 완료",
  COMPLETED: "면담 완료",
  CANCELLED: "취소됨",
};

const STATUS_BADGE: Record<string, string> = {
  SCHEDULED: "border-forest/20 bg-forest/10 text-forest",
  COMPLETED: "border-ink/10 bg-mist text-slate",
  CANCELLED: "border-red-200 bg-red-50 text-red-600",
};

function formatKoreanDateTime(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const weekDays = ["일", "월", "화", "수", "목", "금", "토"];
  const wd = weekDays[date.getDay()] ?? "";
  const h = date.getHours();
  const ampm = h < 12 ? "오전" : "오후";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${y}년 ${m}월 ${d}일 (${wd}) ${ampm} ${hour}시`;
}

function formatKoreanDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const weekDays = ["일", "월", "화", "수", "목", "금", "토"];
  const wd = weekDays[date.getDay()] ?? "";
  return `${y}년 ${m}월 ${d}일 (${wd})`;
}

function getTimeLabel(scheduledAt: Date): string {
  const h = scheduledAt.getHours();
  const ampm = h < 12 ? "오전" : "오후";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${ampm} ${hour}시`;
}

function isPast(date: Date): boolean {
  return date < new Date();
}

export default async function StudentCounselingPage() {
  if (!hasDatabaseConfig()) {
    return (
      <main className="space-y-6 px-0 py-6">
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
            면담 신청 준비 중
          </div>
          <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
            면담 신청은 DB 연결 후 사용할 수 있습니다.
          </h1>
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
            면담 신청
          </div>
          <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
            로그인 후 면담을 신청할 수 있습니다.
          </h1>
          <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
            학생 포털에 로그인하면 담당 선생님과의 면담을 신청하고 현황을 확인할 수 있습니다.
          </p>
        </section>
        <StudentLookupForm redirectPath="/student/counseling" />
      </main>
    );
  }

  const branding = await getAcademyRuntimeBranding(viewer.academyId ?? undefined);
  const now = new Date();

  // Fetch student's appointments
  const appointments = await getPrisma().counselingAppointment.findMany({
    where: {
      examNumber: viewer.examNumber,
    },
    orderBy: { scheduledAt: "desc" },
    take: 20,
    select: {
      id: true,
      scheduledAt: true,
      counselorName: true,
      agenda: true,
      status: true,
      cancelReason: true,
      createdAt: true,
    },
  });

  // Split into upcoming and past
  const upcomingAppointments = appointments.filter(
    (a) => a.status === "SCHEDULED" && !isPast(a.scheduledAt),
  );
  const recentAppointments = appointments.filter(
    (a) => a.status !== "SCHEDULED" || isPast(a.scheduledAt),
  ).slice(0, 10);

  return (
    <main className="space-y-6 px-0 py-6">
      {/* Header */}
      <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
              Counseling
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              면담 신청
            </h1>
            <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
              담당 선생님과의 면담을 신청하고 현황을 확인할 수 있습니다.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold text-forest">
                {viewer.name}
              </span>
              <span className="inline-flex rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold text-slate">
                {viewer.examNumber}
              </span>
            </div>
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
        <div className="mt-6 grid grid-cols-3 gap-3">
          <article className="rounded-[20px] border border-forest/20 bg-forest/5 p-3 text-center">
            <p className="text-xs text-slate">예약됨</p>
            <p className="mt-1 text-lg font-bold text-forest">
              {upcomingAppointments.length}
            </p>
          </article>
          <article className="rounded-[20px] border border-ink/10 bg-mist p-3 text-center">
            <p className="text-xs text-slate">면담 완료</p>
            <p className="mt-1 text-lg font-bold text-ink">
              {appointments.filter((a) => a.status === "COMPLETED").length}
            </p>
          </article>
          <article className="rounded-[20px] border border-ink/10 bg-mist p-3 text-center">
            <p className="text-xs text-slate">전체</p>
            <p className="mt-1 text-lg font-bold text-ink">
              {appointments.length}
            </p>
          </article>
        </div>
      </section>

      {/* Upcoming appointments */}
      {upcomingAppointments.length > 0 && (
        <section className="rounded-[28px] border border-forest/20 bg-white p-5 sm:p-6">
          <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-ink">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4 text-forest"
            >
              <path
                fillRule="evenodd"
                d="M5.75 2a.75.75 0 0 1 .75.75V4h7V2.75a.75.75 0 0 1 1.5 0V4h.25A2.75 2.75 0 0 1 18 6.75v8.5A2.75 2.75 0 0 1 15.25 18H4.75A2.75 2.75 0 0 1 2 15.25v-8.5A2.75 2.75 0 0 1 4.75 4H5V2.75A.75.75 0 0 1 5.75 2Zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75Z"
                clipRule="evenodd"
              />
            </svg>
            예약된 면담
          </h2>
          <div className="space-y-3">
            {upcomingAppointments.map((appt) => {
              const daysUntil = Math.ceil(
                (appt.scheduledAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
              );
              return (
                <div
                  key={appt.id}
                  className="rounded-[20px] border border-forest/20 bg-forest/5 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-2.5 py-0.5 text-xs font-semibold text-forest">
                          {STATUS_LABEL["SCHEDULED"]}
                        </span>
                        {daysUntil === 0 ? (
                          <span className="inline-flex rounded-full border border-ember/30 bg-ember/10 px-2.5 py-0.5 text-xs font-semibold text-ember">
                            오늘
                          </span>
                        ) : daysUntil <= 3 ? (
                          <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                            D-{daysUntil}
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full border border-ink/10 bg-mist px-2.5 py-0.5 text-xs font-semibold text-slate">
                            D-{daysUntil}
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-sm font-semibold text-ink">
                        {formatKoreanDate(appt.scheduledAt)}
                      </p>
                      <p className="mt-0.5 text-xs text-slate">
                        희망 시간: {getTimeLabel(appt.scheduledAt)} / 담당: {appt.counselorName}
                      </p>
                    </div>
                  </div>
                  {appt.agenda && (
                    <div className="mt-3 rounded-[14px] border border-forest/10 bg-white px-3 py-2.5">
                      <p className="whitespace-pre-line text-xs leading-5 text-slate">
                        {appt.agenda}
                      </p>
                    </div>
                  )}
                  <p className="mt-2.5 text-[11px] text-slate/60">
                    신청일: {formatKoreanDate(appt.createdAt)}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Appointment request form */}
      <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
        <h2 className="mb-2 flex items-center gap-2 text-base font-semibold text-ink">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-4 w-4 text-ember"
          >
            <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
          </svg>
          면담 신청하기
        </h2>
        <p className="mb-5 text-xs text-slate">
          원하는 날짜와 시간대를 선택하고 상담 내용을 작성해 주세요. 담당자가 확인 후 안내 드립니다.
        </p>
        <AppointmentForm contactPhone={branding.phone} />
      </section>

      {/* Recent / completed appointments */}
      {recentAppointments.length > 0 && (
        <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
          <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-ink">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4 text-slate"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-13a.75.75 0 0 0-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 0 0 0-1.5h-3.25V5Z"
                clipRule="evenodd"
              />
            </svg>
            면담 이력
          </h2>
          <div className="space-y-3">
            {recentAppointments.map((appt) => (
              <div
                key={appt.id}
                className="rounded-[20px] border border-ink/10 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[appt.status] ?? "border-ink/10 bg-mist text-slate"}`}
                      >
                        {STATUS_LABEL[appt.status] ?? appt.status}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-ink">
                      {formatKoreanDateTime(appt.scheduledAt)}
                    </p>
                    {appt.counselorName && appt.counselorName !== "미정" && (
                      <p className="mt-0.5 text-xs text-slate">
                        담당: {appt.counselorName}
                      </p>
                    )}
                  </div>
                </div>
                {appt.status === "CANCELLED" && appt.cancelReason && (
                  <div className="mt-3 rounded-[12px] border border-red-100 bg-red-50 px-3 py-2">
                    <p className="text-xs text-red-600">
                      취소 사유: {appt.cancelReason}
                    </p>
                  </div>
                )}
                {appt.agenda && appt.status !== "CANCELLED" && (
                  <div className="mt-3 rounded-[14px] border border-ink/10 bg-mist/50 px-3 py-2.5">
                    <p className="whitespace-pre-line text-xs leading-5 text-slate">
                      {appt.agenda}
                    </p>
                  </div>
                )}
                <p className="mt-2 text-[11px] text-slate/60">
                  신청일: {formatKoreanDate(appt.createdAt)}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Contact fallback */}
      <section className="rounded-[24px] border border-ink/10 bg-white p-4 text-center">
        <p className="text-xs text-slate">
          면담 취소 또는 변경은 학원으로 직접 문의해 주세요.
        </p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <a
            href={branding.phoneHref ?? undefined}
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 px-4 py-2 text-xs font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-3.5 w-3.5"
            >
              <path
                fillRule="evenodd"
                d="M2 3.5A1.5 1.5 0 0 1 3.5 2h1.148a1.5 1.5 0 0 1 1.465 1.175l.716 3.223a1.5 1.5 0 0 1-1.052 1.767l-.933.267c-.41.117-.643.555-.48.95a11.542 11.542 0 0 0 6.254 6.254c.395.163.833-.07.95-.48l.267-.933a1.5 1.5 0 0 1 1.767-1.052l3.223.716A1.5 1.5 0 0 1 18 15.352V16.5a1.5 1.5 0 0 1-1.5 1.5H15c-1.149 0-2.263-.15-3.326-.43A13.022 13.022 0 0 1 2.43 8.326 13.019 13.019 0 0 1 2 5V3.5Z"
                clipRule="evenodd"
              />
            </svg>
            {branding.phone ?? "학원 창구"}
          </a>
        </div>
        <p className="mt-2 text-[11px] text-slate/60">
          영업 시간: 평일 09~21시 / 주말 09~18시
        </p>
      </section>
    </main>
  );
}
