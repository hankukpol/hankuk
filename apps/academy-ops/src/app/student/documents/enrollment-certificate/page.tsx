import type { Metadata } from "next";
import Link from "next/link";
import { EnrollmentStatus } from "@prisma/client";
import { StudentLookupForm } from "@/components/student-portal/student-lookup-form";
import { getAcademyRuntimeBranding } from "@/lib/academy-branding";
import { hasDatabaseConfig } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import { getStudentPortalViewer } from "@/lib/student-portal/service";
import { EnrollmentCertPrintButton } from "./print-button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "재학증명서",
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatKoreanDate(date: Date): string {
  return `${date.getFullYear()}년 ${String(date.getMonth() + 1).padStart(2, "0")}월 ${String(date.getDate()).padStart(2, "0")}일`;
}

function formatKoreanDateRange(
  start: Date | null | undefined,
  end: Date | null | undefined,
): string {
  if (!start) return "-";
  const s = formatKoreanDate(start);
  if (!end) return `${s} ~`;
  return `${s} ~ ${formatKoreanDate(end)}`;
}

const ACTIVE_STATUSES: EnrollmentStatus[] = [
  EnrollmentStatus.ACTIVE,
  EnrollmentStatus.SUSPENDED,
];

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function EnrollmentCertificatePage() {
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
        </section>
      </main>
    );
  }

  const viewer = await getStudentPortalViewer();

  if (!viewer) {
    return (
      <main className="space-y-6 px-0 py-6">
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-[#1F4D3A]">
            재학증명서
          </div>
          <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
            로그인 후 확인할 수 있습니다.
          </h1>
        </section>
        <StudentLookupForm redirectPath="/student/documents/enrollment-certificate" />
      </main>
    );
  }

  const prisma = getPrisma();

  // Fetch student detail
  const student = await prisma.student.findUnique({
    where: { examNumber: viewer.examNumber },
    select: {
      examNumber: true,
      name: true,
      phone: true,
      birthDate: true,
      className: true,
      generation: true,
    },
  });

  // Fetch active enrollments
  const enrollments = await prisma.courseEnrollment.findMany({
    where: {
      examNumber: viewer.examNumber,
      status: { in: ACTIVE_STATUSES },
    },
    include: {
      cohort: { select: { name: true, startDate: true, endDate: true } },
      product: { select: { name: true } },
      specialLecture: { select: { name: true } },
    },
    orderBy: { startDate: "desc" },
    take: 5,
  });

  const today = new Date();
  const branding = await getAcademyRuntimeBranding(viewer.academyId ?? undefined);
  const academyContactLine =
    branding.contactLine ?? "학원 연락처는 관리자에게 문의해 주세요.";

  if (enrollments.length === 0) {
    return (
      <main className="space-y-6 px-0 py-6">
        {/* Nav */}
        <div className="no-print">
          <Link
            href="/student/documents/request"
            className="inline-flex items-center gap-1 text-sm text-slate transition hover:text-ember"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
            </svg>
            증명서 신청으로 돌아가기
          </Link>
        </div>
        <section className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
            발급 불가
          </div>
          <h2 className="mt-5 text-xl font-semibold">
            현재 수강 중인 강좌가 없습니다.
          </h2>
          <p className="mt-3 text-sm text-slate">
            재학증명서는 현재 수강 중(ACTIVE)인 강좌가 있을 때만 발급할 수
            있습니다.
          </p>
        </section>
      </main>
    );
  }

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; margin: 0; padding: 0; }
          .cert-wrapper { padding: 0 !important; background: white !important; }
          .cert-paper {
            width: 100% !important;
            max-width: none !important;
            box-shadow: none !important;
            border: 1px solid #ccc !important;
            border-radius: 0 !important;
            margin: 0 !important;
          }
        }
        @page {
          size: A4 portrait;
          margin: 20mm;
        }
      `}</style>

      <main className="space-y-6 px-0 py-6">
        {/* Top navigation bar — screen only */}
        <div className="no-print flex flex-wrap items-center justify-between gap-4">
          <Link
            href="/student/documents/request"
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 px-4 py-2 text-sm text-slate transition hover:border-ink/30 hover:text-ink"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
            </svg>
            증명서 신청
          </Link>
          <EnrollmentCertPrintButton />
        </div>

        {/* A4 certificate */}
        <div className="cert-wrapper flex justify-center">
          <div
            className="cert-paper w-full max-w-[640px] overflow-hidden rounded-[16px] border border-ink/15 bg-white shadow-xl"
            style={{ fontFamily: "'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif" }}
          >
            {/* Header band */}
            <div className="px-10 pb-6 pt-8" style={{ backgroundColor: "#1F4D3A" }}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: "rgba(255,255,255,0.6)" }}>
                    {branding.englishBrandName}
                  </p>
                  <p className="mt-1.5 text-3xl font-bold tracking-wide text-white">
                    재 학 증 명 서
                  </p>
                  <p className="mt-1 text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>
                    ENROLLMENT CERTIFICATE
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.6)" }}>
                    발급일
                  </p>
                  <p className="mt-1 text-sm font-bold text-white">
                    {formatKoreanDate(today)}
                  </p>
                </div>
              </div>
            </div>

            {/* Academy info band */}
            <div
              className="flex flex-wrap items-center justify-between gap-2 px-10 py-2.5 text-[11px]"
              style={{ backgroundColor: branding.themeColor, color: "white" }}
            >
              <span className="font-semibold">{branding.academyName}</span>
              <span>{academyContactLine}</span>
            </div>

            {/* Body */}
            <div className="px-10 py-8">
              {/* Purpose note */}
              <p className="mb-6 text-sm leading-8 text-slate">
                아래 사람은 본 학원에 현재 수강 중임을 증명합니다.
              </p>

              {/* Student info table */}
              <div className="divide-y divide-ink/10 rounded-[12px] border border-ink/10 text-sm">
                <div className="flex">
                  <div className="w-28 flex-shrink-0 bg-mist/80 px-4 py-3 text-xs font-semibold text-slate">
                    성명
                  </div>
                  <div className="flex-1 px-4 py-3 font-semibold text-ink">
                    {student?.name ?? viewer.name}
                  </div>
                </div>
                <div className="flex">
                  <div className="w-28 flex-shrink-0 bg-mist/80 px-4 py-3 text-xs font-semibold text-slate">
                    학번
                  </div>
                  <div className="flex-1 px-4 py-3 font-mono font-semibold text-ink">
                    {viewer.examNumber}
                  </div>
                </div>
                {student?.birthDate && (
                  <div className="flex">
                    <div className="w-28 flex-shrink-0 bg-mist/80 px-4 py-3 text-xs font-semibold text-slate">
                      생년월일
                    </div>
                    <div className="flex-1 px-4 py-3 font-semibold text-ink">
                      {formatKoreanDate(student.birthDate)}
                    </div>
                  </div>
                )}
                {viewer.className && (
                  <div className="flex">
                    <div className="w-28 flex-shrink-0 bg-mist/80 px-4 py-3 text-xs font-semibold text-slate">
                      수강반
                    </div>
                    <div className="flex-1 px-4 py-3 font-semibold text-ink">
                      {viewer.className}
                    </div>
                  </div>
                )}
                {viewer.generation && (
                  <div className="flex">
                    <div className="w-28 flex-shrink-0 bg-mist/80 px-4 py-3 text-xs font-semibold text-slate">
                      기수
                    </div>
                    <div className="flex-1 px-4 py-3 font-semibold text-ink">
                      {viewer.generation}기
                    </div>
                  </div>
                )}
              </div>

              {/* Enrollment details */}
              <div className="mt-6">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate">
                  수강 내역
                </p>
                <div className="divide-y divide-ink/10 rounded-[12px] border border-ink/10 text-sm">
                  {enrollments.map((e) => {
                    const courseName =
                      e.cohort?.name ?? e.product?.name ?? e.specialLecture?.name ?? "-";
                    const period = formatKoreanDateRange(
                      e.startDate,
                      e.endDate ?? e.cohort?.endDate ?? null,
                    );
                    return (
                      <div key={e.id} className="px-4 py-3">
                        <p className="font-semibold text-ink">{courseName}</p>
                        <p className="mt-0.5 text-xs text-slate">수강기간: {period}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Footer / seal */}
              <div className="mt-10 flex flex-wrap items-end justify-between gap-6 border-t border-ink/10 pt-6">
                <div>
                  <p className="text-sm text-slate">
                    발급일:{" "}
                    <span className="font-semibold text-ink">
                      {formatKoreanDate(today)}
                    </span>
                  </p>
                  <p className="mt-2 text-xs leading-6 text-slate">
                    위 사항이 사실임을 증명합니다.
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-base font-bold text-ink">{branding.academyName}</p>
                  {branding.address ? (
                    <p className="mt-0.5 text-xs text-slate">{branding.address}</p>
                  ) : null}
                  {branding.phone ? (
                    <p className="mt-0.5 text-xs text-slate">Tel. {branding.phone}</p>
                  ) : null}
                  <div
                    className="ml-auto mt-3 flex h-16 w-16 flex-col items-center justify-center rounded-full border-2 text-[10px] font-bold"
                    style={{ borderColor: branding.themeColor, color: branding.themeColor }}
                  >
                    <span className="leading-tight">학원</span>
                    <span className="leading-tight">직인</span>
                    <span className="mt-0.5">(인)</span>
                  </div>
                  <span className="text-xs text-slate">원장</span>
                </div>
              </div>

              {/* Print note — screen only */}
              <p className="mt-6 text-center text-[11px] text-slate/50 no-print">
                이 문서는 온라인 발급 재학증명서입니다. 직인이 필요한 경우 학원에 방문하세요.
              </p>
            </div>
          </div>
        </div>

        {/* Bottom print button — screen only */}
        <div className="flex justify-center no-print pb-6">
          <EnrollmentCertPrintButton />
        </div>
      </main>
    </>
  );
}
