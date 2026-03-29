import Link from "next/link";
import type { Metadata } from "next";
import { EnrollmentStatus, CourseType } from "@prisma/client";
import { StudentLookupForm } from "@/components/student-portal/student-lookup-form";
import { getAcademyRuntimeBranding } from "@/lib/academy-branding";
import { hasDatabaseConfig } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import { getStudentPortalViewer } from "@/lib/student-portal/service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "수강 이력",
};

// ─── Labels ───────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<EnrollmentStatus, string> = {
  PENDING: "대기",
  ACTIVE: "수강 중",
  WAITING: "대기자",
  SUSPENDED: "휴원",
  COMPLETED: "수료",
  WITHDRAWN: "중도 퇴원",
  CANCELLED: "취소",
};

const STATUS_BADGE: Record<EnrollmentStatus, string> = {
  ACTIVE: "border-green-200 bg-green-50 text-green-700",
  COMPLETED: "border-forest/20 bg-forest/10 text-forest",
  PENDING: "border-amber-200 bg-amber-50 text-amber-700",
  WAITING: "border-amber-200 bg-amber-50 text-amber-700",
  SUSPENDED: "border-sky-200 bg-sky-50 text-sky-700",
  WITHDRAWN: "border-red-200 bg-red-50 text-red-700",
  CANCELLED: "border-red-200 bg-red-50 text-red-700",
};

const STATUS_TIMELINE_DOT: Record<EnrollmentStatus, string> = {
  ACTIVE: "bg-green-500",
  COMPLETED: "bg-[#1F4D3A]",
  PENDING: "bg-amber-400",
  WAITING: "bg-amber-400",
  SUSPENDED: "bg-sky-400",
  WITHDRAWN: "bg-red-400",
  CANCELLED: "bg-red-400",
};

const COURSE_TYPE_LABEL: Record<CourseType, string> = {
  COMPREHENSIVE: "종합반",
  SPECIAL_LECTURE: "단과·특강",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatAmount(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

function formatDateKR(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}.${m}.${d}`;
}

function calcDays(start: Date, end: Date | null): number {
  const endDate = end ?? new Date();
  const diff = endDate.getTime() - start.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

// ─── Data ─────────────────────────────────────────────────────────────────────

async function fetchEnrollments(examNumber: string) {
  return getPrisma().courseEnrollment.findMany({
    where: { examNumber },
    orderBy: { startDate: "desc" },
    select: {
      id: true,
      courseType: true,
      startDate: true,
      endDate: true,
      regularFee: true,
      discountAmount: true,
      finalFee: true,
      status: true,
      isRe: true,
      cohort: {
        select: { id: true, name: true, startDate: true, endDate: true },
      },
      product: {
        select: { id: true, name: true },
      },
      specialLecture: {
        select: { id: true, name: true },
      },
      leaveRecords: {
        select: { id: true, leaveDate: true, returnDate: true, reason: true },
        orderBy: { leaveDate: "desc" },
      },
    },
  });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function StudentEnrollmentHistoryPage() {
  if (!hasDatabaseConfig()) {
    return (
      <main className="space-y-6 px-0 py-6">
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
            History Unavailable
          </div>
          <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-4xl">
            수강 이력은 DB 연결 후 사용할 수 있습니다.
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
            Enrollment History
          </div>
          <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-4xl">
            수강 이력
          </h1>
          <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
            로그인하면 수강 이력을 타임라인으로 확인할 수 있습니다.
          </p>
        </section>
        <StudentLookupForm redirectPath="/student/enrollment-history" />
      </main>
    );
  }

  const branding = await getAcademyRuntimeBranding(viewer.academyId ?? undefined);
  const enrollments = await fetchEnrollments(viewer.examNumber);

  // KPI calculations
  const totalCount = enrollments.length;
  const totalPaid = enrollments.reduce((sum, e) => sum + e.finalFee, 0);
  const totalDays = enrollments.reduce((sum, e) => sum + calcDays(e.startDate, e.endDate), 0);

  return (
    <main className="space-y-4 px-0 py-6">
      {/* Header */}
      <section className="rounded-[28px] border border-ink/10 bg-white p-5 shadow-panel sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
              Enrollment History
            </div>
            <h1 className="mt-3 text-2xl font-semibold leading-tight sm:text-3xl">수강 이력</h1>
            <p className="mt-2 text-xs leading-6 text-slate">
              전체 수강 이력을 타임라인으로 확인할 수 있습니다.
            </p>
          </div>
          <Link
            href="/student"
            className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            포털로 돌아가기
          </Link>
        </div>

        {/* KPI row */}
        <div className="mt-5 grid grid-cols-3 gap-3">
          <article className="rounded-[20px] border border-ink/10 bg-mist p-4 text-center">
            <p className="text-xs text-slate">총 수강 횟수</p>
            <p className="mt-2 text-2xl font-bold text-ink">{totalCount}</p>
            <p className="text-xs text-slate">회</p>
          </article>
          <article className="rounded-[20px] border border-ink/10 bg-mist p-4 text-center">
            <p className="text-xs text-slate">총 납부액</p>
            <p className="mt-2 text-lg font-bold text-ink">
              {totalPaid >= 10000
                ? `${Math.floor(totalPaid / 10000).toLocaleString("ko-KR")}만`
                : totalPaid.toLocaleString("ko-KR")}
            </p>
            <p className="text-xs text-slate">원</p>
          </article>
          <article className="rounded-[20px] border border-ink/10 bg-mist p-4 text-center">
            <p className="text-xs text-slate">총 수강일수</p>
            <p className="mt-2 text-2xl font-bold text-ink">{totalDays.toLocaleString("ko-KR")}</p>
            <p className="text-xs text-slate">일</p>
          </article>
        </div>
      </section>

      {/* Timeline */}
      {enrollments.length === 0 ? (
        <section className="rounded-[28px] border border-ink/10 bg-white p-5 shadow-panel sm:p-6">
          <div className="rounded-[20px] border border-dashed border-ink/10 px-5 py-12 text-center">
            <p className="text-sm font-semibold text-ink">수강 이력이 없습니다</p>
            <p className="mt-2 text-sm text-slate">
              수강 등록 후 이력이 표시됩니다.
            </p>
            <a
              href={branding.phoneHref ?? undefined}
              className="mt-4 inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
            >{branding.phone ?? "학원 창구"}</a>
          </div>
        </section>
      ) : (
        <section className="rounded-[28px] border border-ink/10 bg-white p-5 shadow-panel sm:p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate">Timeline</p>
          <h2 className="mt-1 text-xl font-semibold">수강 타임라인</h2>

          <div className="relative mt-6">
            {/* Vertical connector line */}
            <div className="absolute left-[9px] top-3 h-[calc(100%-24px)] w-0.5 bg-ink/10" />

            <div className="flex flex-col gap-6">
              {enrollments.map((enrollment, idx) => {
                const courseName =
                  enrollment.product?.name ??
                  enrollment.specialLecture?.name ??
                  "강좌명 미지정";
                const cohortName = enrollment.cohort?.name ?? null;
                const durationDays = calcDays(enrollment.startDate, enrollment.endDate);
                const dotColor = STATUS_TIMELINE_DOT[enrollment.status];

                return (
                  <div key={enrollment.id} className="relative pl-7">
                    {/* Timeline dot */}
                    <div
                      className={`absolute left-0 top-3 h-5 w-5 rounded-full border-2 border-white shadow-sm ${dotColor}`}
                    />

                    {/* Card */}
                    <article className="rounded-[20px] border border-ink/10 bg-white p-4 shadow-sm">
                      {/* Course header */}
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-bold text-ink">{courseName}</span>
                            {enrollment.isRe && (
                              <span className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-2 py-0.5 text-[10px] font-semibold text-ember">
                                재수강
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <span className="inline-flex rounded-full border border-ink/10 bg-mist px-2 py-0.5 text-[10px] font-semibold text-slate">
                              {COURSE_TYPE_LABEL[enrollment.courseType]}
                            </span>
                            {cohortName && (
                              <span className="inline-flex rounded-full border border-ink/10 bg-mist px-2 py-0.5 text-[10px] font-semibold text-slate">
                                {cohortName}
                              </span>
                            )}
                          </div>
                        </div>
                        <span
                          className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_BADGE[enrollment.status]}`}
                        >
                          {STATUS_LABEL[enrollment.status]}
                        </span>
                      </div>

                      {/* Details */}
                      <div className="mt-3 space-y-1.5">
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                          <p className="text-xs text-slate">
                            수강 시작:{" "}
                            <span className="font-semibold text-ink">
                              {formatDateKR(enrollment.startDate)}
                            </span>
                          </p>
                          {enrollment.endDate && (
                            <p className="text-xs text-slate">
                              종료:{" "}
                              <span className="font-semibold text-ink">
                                {formatDateKR(enrollment.endDate)}
                              </span>
                            </p>
                          )}
                          <p className="text-xs text-slate">
                            {durationDays}일
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                          <p className="text-xs text-slate">
                            수강료:{" "}
                            <span className="font-semibold text-ink">
                              {formatAmount(enrollment.finalFee)}
                            </span>
                          </p>
                          {enrollment.discountAmount > 0 && (
                            <p className="text-xs text-slate">
                              할인:{" "}
                              <span className="font-semibold text-red-600">
                                -{formatAmount(enrollment.discountAmount)}
                              </span>
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Leave records */}
                      {enrollment.leaveRecords.length > 0 && (
                        <div className="mt-3 space-y-1.5 rounded-[14px] border border-sky-100 bg-sky-50/60 px-4 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                            휴원 기록
                          </p>
                          {enrollment.leaveRecords.map((leave) => (
                            <div key={leave.id} className="flex flex-wrap items-center gap-2">
                              <span className="inline-flex rounded-full border border-sky-200 bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                                휴원
                              </span>
                              <span className="text-xs text-slate">
                                {formatDateKR(leave.leaveDate)}
                                {leave.returnDate
                                  ? ` ~ ${formatDateKR(leave.returnDate)}`
                                  : " ~ (복교 예정)"}
                              </span>
                              {leave.reason && (
                                <span className="text-xs text-slate">· {leave.reason}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Order indicator */}
                      <div className="mt-3 flex items-center justify-between">
                        <p className="text-[10px] text-slate/60">
                          #{totalCount - idx}번째 수강
                        </p>
                      </div>
                    </article>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Contact */}
      <section className="rounded-[28px] border border-ink/10 bg-white p-5 shadow-panel sm:p-6">
        <h2 className="text-sm font-semibold text-ink">수강 관련 문의</h2>
        <p className="mt-2 text-xs text-slate">
          수강 내역에 오류가 있거나 수강 변경이 필요한 경우 학원으로 문의해 주세요.
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          <a
            href={branding.phoneHref ?? undefined}
            className="inline-flex items-center rounded-full border border-ink/10 bg-mist px-4 py-2 text-xs font-semibold text-ink transition hover:border-ember/30 hover:text-ember"
          >{branding.phone ?? "학원 창구"}</a>
          <span className="inline-flex items-center rounded-full border border-ink/10 bg-mist px-4 py-2 text-xs text-slate">
            평일 09:00 ~ 21:00 / 주말 09:00 ~ 18:00
          </span>
        </div>
      </section>
    </main>
  );
}
