import type { Metadata } from "next";
import Link from "next/link";
import { RentalStatus } from "@prisma/client";
import { StudentLookupForm } from "@/components/student-portal/student-lookup-form";
import { getAcademyRuntimeBranding } from "@/lib/academy-branding";
import { hasDatabaseConfig } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import { getStudentPortalViewer } from "@/lib/student-portal/service";
import { LockerExtendForm } from "./extend-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "사물함 정보",
};

const ZONE_LABEL: Record<string, string> = {
  CLASS_ROOM: "1강의실 방향",
  JIDEOK_LEFT: "지덕 좌",
  JIDEOK_RIGHT: "지덕 우",
};

const STATUS_LABEL: Record<RentalStatus, string> = {
  ACTIVE: "대여 중",
  RETURNED: "반납 완료",
  EXPIRED: "기간 만료",
  CANCELLED: "취소",
};

const STATUS_BADGE: Record<RentalStatus, string> = {
  ACTIVE: "border-forest/20 bg-forest/10 text-forest",
  RETURNED: "border-ink/10 bg-mist text-slate",
  EXPIRED: "border-amber-200 bg-amber-50 text-amber-700",
  CANCELLED: "border-ink/10 bg-mist text-slate",
};

const FEE_UNIT_LABEL: Record<string, string> = {
  MONTHLY: "월정액",
  PER_COHORT: "기수별",
};

function formatDateKR(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}년 ${m}월 ${d}일`;
}

export default async function StudentLockerPage() {
  if (!hasDatabaseConfig()) {
    return (
      <main className="space-y-6 px-0 py-6">
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
            Locker Unavailable
          </div>
          <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
            사물함 조회는 DB 연결 후 사용할 수 있습니다.
          </h1>
          <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
            현재 환경에는 사물함 대여 정보를 불러올 데이터베이스가 연결되어 있지 않습니다.
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
            Locker Login
          </div>
          <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
            사물함 조회는 로그인 후 확인할 수 있습니다.
          </h1>
          <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
            학생 포털에 로그인하면 배정된 사물함 정보를 확인할 수 있습니다.
          </p>
        </section>

        <StudentLookupForm redirectPath="/student/locker" />
      </main>
    );
  }

  // Fetch all locker rentals for this student
  const allRentals = await getPrisma().lockerRental.findMany({
    where: {
      examNumber: viewer.examNumber,
    },
    include: {
      locker: {
        select: { id: true, zone: true, lockerNumber: true, note: true },
      },
    },
    orderBy: [{ startDate: "desc" }],
    take: 20,
  });

  const currentRental = allRentals.find((r) => r.status === RentalStatus.ACTIVE) ?? null;
  const branding = await getAcademyRuntimeBranding(viewer.academyId ?? undefined);
  const pastRentals = allRentals.filter((r) => r.status !== RentalStatus.ACTIVE);

  // Compute days until expiry for warning banner
  const expiryDaysLeft = (() => {
    if (!currentRental?.endDate) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(currentRental.endDate);
    end.setHours(0, 0, 0, 0);
    return Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  })();

  const showExpiryWarning = expiryDaysLeft !== null && expiryDaysLeft <= 14;

  return (
    <main className="space-y-6 px-0 py-6">
      {/* Expiry warning banner */}
      {showExpiryWarning && (
        <section className="rounded-[28px] border border-amber-200 bg-amber-50 px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-5 w-5 shrink-0 text-amber-600"
            >
              <path
                fillRule="evenodd"
                d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
                clipRule="evenodd"
              />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800">
                {expiryDaysLeft === 0
                  ? "사물함 이용 기간이 오늘 만료됩니다!"
                  : expiryDaysLeft! < 0
                    ? "사물함 이용 기간이 만료되었습니다."
                    : `사물함 이용 기간이 ${expiryDaysLeft}일 후 만료됩니다.`}
              </p>
              <p className="mt-0.5 text-xs text-amber-700">
                만료 예정일:{" "}
                {currentRental?.endDate ? formatDateKR(currentRental.endDate) : ""}
                &nbsp;· 아래에서 연장 신청하거나 학원에 문의해 주세요.
              </p>
            </div>
            {branding.phoneHref ? (
              <a
                href={branding.phoneHref}
                className="shrink-0 rounded-full border border-amber-300 bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-200"
              >
                전화 문의
              </a>
            ) : null}
          </div>
        </section>
      )}

      {/* Header */}
      <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
              Locker
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              사물함 정보
            </h1>
            <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
              배정된 사물함 번호와 대여 내역을 확인할 수 있습니다.
            </p>
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
            <p className="text-sm text-slate">현재 사물함</p>
            {currentRental ? (
              <p className="mt-3 text-xl font-bold text-forest">
                {ZONE_LABEL[currentRental.locker.zone] ?? currentRental.locker.zone}{" "}
                <span className="text-2xl">{currentRental.locker.lockerNumber}번</span>
              </p>
            ) : (
              <p className="mt-3 text-sm font-semibold text-slate">미배정</p>
            )}
          </article>
          <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
            <p className="text-sm text-slate">대여 이력</p>
            <p className="mt-3 text-xl font-semibold">{allRentals.length}건</p>
          </article>
          <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
            <p className="text-sm text-slate">사물함 문의</p>
            <p className="mt-3 text-sm font-semibold">{branding.phone ?? "학원 문의"}</p>
          </article>
        </div>
      </section>

      {/* Current locker */}
      <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate">
              Current
            </p>
            <h2 className="mt-1 text-xl font-semibold">현재 대여 사물함</h2>
          </div>
          {currentRental && (
            <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold text-forest">
              대여 중
            </span>
          )}
        </div>

        {currentRental ? (
          <div className="mt-4 rounded-[24px] border border-forest/20 bg-forest/5 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-3xl font-bold text-ink">
                    {currentRental.locker.lockerNumber}번
                  </span>
                  <span className="inline-flex rounded-full border border-forest/20 bg-white px-2 py-0.5 text-xs font-semibold text-forest">
                    {ZONE_LABEL[currentRental.locker.zone] ?? currentRental.locker.zone}
                  </span>
                </div>
                <p className="text-xs text-slate">
                  대여 시작:{" "}
                  <span className="font-semibold text-ink">{formatDateKR(currentRental.startDate)}</span>
                </p>
                {currentRental.endDate && (
                  <p className="text-xs text-slate">
                    반납 예정:{" "}
                    <span className="font-semibold text-ink">{formatDateKR(currentRental.endDate)}</span>
                  </p>
                )}
                {currentRental.feeAmount > 0 && (
                  <p className="text-xs text-slate">
                    대여료:{" "}
                    <span className="font-semibold text-ink">
                      {currentRental.feeAmount.toLocaleString("ko-KR")}원{" "}
                      ({FEE_UNIT_LABEL[currentRental.feeUnit] ?? currentRental.feeUnit})
                    </span>
                  </p>
                )}
                {currentRental.note && (
                  <p className="text-xs text-slate">메모: {currentRental.note}</p>
                )}
                {currentRental.locker.note && (
                  <p className="text-xs text-slate">사물함 메모: {currentRental.locker.note}</p>
                )}
              </div>
              <span
                className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_BADGE[currentRental.status]}`}
              >
                {STATUS_LABEL[currentRental.status]}
              </span>
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-[24px] border border-dashed border-ink/10 px-5 py-8 text-center">
            <p className="text-sm font-semibold text-ink">현재 배정된 사물함이 없습니다</p>
            <p className="mt-2 text-sm text-slate">
              사물함 배정을 원하시면 학원 직원에게 문의해 주세요.
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
        )}
      </section>

      {/* Locker extension request */}
      <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate">
              Extension
            </p>
            <h2 className="mt-1 text-xl font-semibold">사물함 연장 신청</h2>
          </div>
          {currentRental && (
            <span className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold text-ember">
              연장 가능
            </span>
          )}
        </div>

        {currentRental ? (
          <>
            <p className="mt-3 text-sm text-slate">
              현재 대여 중인{" "}
              <span className="font-semibold text-ink">
                {ZONE_LABEL[currentRental.locker.zone] ?? currentRental.locker.zone}{" "}
                {currentRental.locker.lockerNumber}번
              </span>{" "}
              사물함의 이용 기간을 연장 신청할 수 있습니다.
            </p>
            <LockerExtendForm
              lockerNumber={currentRental.locker.lockerNumber}
              zone={ZONE_LABEL[currentRental.locker.zone] ?? currentRental.locker.zone}
              currentEndDate={currentRental.endDate}
            />
          </>
        ) : (
          <div className="mt-4 rounded-[24px] border border-dashed border-ink/10 px-5 py-8 text-center">
            <p className="text-sm font-semibold text-ink">현재 대여 중인 사물함이 없습니다</p>
            <p className="mt-2 text-sm text-slate">
              사물함을 먼저 배정받아야 연장 신청이 가능합니다.
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
        )}
      </section>

      {/* Past rentals */}
      {pastRentals.length > 0 && (
        <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate">
                History
              </p>
              <h2 className="mt-1 text-xl font-semibold">대여 이력</h2>
            </div>
            <span className="inline-flex rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold text-slate">
              {pastRentals.length}건
            </span>
          </div>

          <div className="flex flex-col gap-2">
            {pastRentals.map((rental) => (
              <article
                key={rental.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-[20px] border border-ink/10 bg-mist/60 px-5 py-4"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-ink">
                      {rental.locker.lockerNumber}번
                    </span>
                    <span className="inline-flex rounded-full border border-ink/10 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate">
                      {ZONE_LABEL[rental.locker.zone] ?? rental.locker.zone}
                    </span>
                  </div>
                  <p className="text-xs text-slate">
                    {formatDateKR(rental.startDate)}
                    {rental.endDate && ` ~ ${formatDateKR(rental.endDate)}`}
                  </p>
                  {rental.note && (
                    <p className="text-xs text-slate">메모: {rental.note}</p>
                  )}
                </div>
                <span
                  className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_BADGE[rental.status]}`}
                >
                  {STATUS_LABEL[rental.status]}
                </span>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* Contact info */}
      <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
        <h2 className="text-lg font-semibold">사물함 이용 안내</h2>
        <div className="mt-4 space-y-3 text-sm text-slate">
          <p>사물함 배정 및 반납은 학원 직원에게 문의해 주세요.</p>
          <p>분실·파손 시 즉시 직원에게 알려 주세요.</p>
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
