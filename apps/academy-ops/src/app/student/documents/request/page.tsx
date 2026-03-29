import type { Metadata } from "next";
import Link from "next/link";
import { EnrollmentStatus } from "@prisma/client";
import { StudentLookupForm } from "@/components/student-portal/student-lookup-form";
import { getAcademyRuntimeBranding } from "@/lib/academy-branding";
import { hasDatabaseConfig } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import { getStudentPortalViewer } from "@/lib/student-portal/service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "증명서 신청",
};

// ─── Types ──────────────────────────────────────────────────────────────────

type DocItem = {
  id: string;
  title: string;
  titleEn: string;
  description: string;
  isAvailable: boolean;
  unavailableReason?: string;
  href: string | null;
  isDigital: boolean;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

const ACTIVE_STATUSES: EnrollmentStatus[] = [
  EnrollmentStatus.ACTIVE,
  EnrollmentStatus.SUSPENDED,
];

const COMPLETED_STATUSES: EnrollmentStatus[] = [
  EnrollmentStatus.COMPLETED,
];

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function StudentDocumentRequestPage() {
  if (!hasDatabaseConfig()) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
              서비스 준비 중
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              DB 연결 후 사용할 수 있습니다.
            </h1>
          </section>
        </div>
      </main>
    );
  }

  const viewer = await getStudentPortalViewer();

  if (!viewer) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl space-y-6">
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-[#1F4D3A]">
              증명서 신청
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              로그인 후 신청할 수 있습니다.
            </h1>
          </section>
          <StudentLookupForm redirectPath="/student/documents/request" />
        </div>
      </main>
    );
  }

  const prisma = getPrisma();
  const branding = await getAcademyRuntimeBranding(viewer.academyId ?? undefined);

  // Check for active enrollment
  const activeEnrollment = await prisma.courseEnrollment.findFirst({
    where: {
      examNumber: viewer.examNumber,
      status: { in: ACTIVE_STATUSES },
    },
    include: {
      cohort: { select: { name: true, startDate: true, endDate: true } },
      product: { select: { name: true } },
      specialLecture: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Check for completed enrollment
  const completedEnrollment = await prisma.courseEnrollment.findFirst({
    where: {
      examNumber: viewer.examNumber,
      status: { in: COMPLETED_STATUSES },
    },
    orderBy: { updatedAt: "desc" },
  });

  // Check for scores
  const hasScores = await prisma.score.findFirst({
    where: {
      examNumber: viewer.examNumber,
      finalScore: { not: null },
    },
  });

  const hasActiveEnrollment = activeEnrollment !== null;
  const hasCompletedEnrollment = completedEnrollment !== null;

  const docItems: DocItem[] = [
    {
      id: "enrollment-cert",
      title: "재학증명서",
      titleEn: "Enrollment Certificate",
      description: "현재 수강 중임을 증명하는 서류입니다.",
      isAvailable: hasActiveEnrollment,
      unavailableReason: hasActiveEnrollment
        ? undefined
        : "현재 수강 중인 강좌가 없습니다.",
      href: hasActiveEnrollment
        ? "/student/documents/enrollment-certificate"
        : null,
      isDigital: true,
    },
    {
      id: "score-report",
      title: "성적증명서",
      titleEn: "Academic Record",
      description: "응시한 모의고사 성적을 증명하는 서류입니다.",
      isAvailable: hasScores !== null,
      unavailableReason:
        hasScores !== null ? undefined : "조회된 성적 데이터가 없습니다.",
      href: hasScores !== null ? "/student/documents/grade-report" : null,
      isDigital: true,
    },
    {
      id: "completion-cert",
      title: "수료증",
      titleEn: "Completion Certificate",
      description: "강좌 수료를 증명하는 서류입니다. 오프라인 발급 전용입니다.",
      isAvailable: hasCompletedEnrollment,
      unavailableReason: hasCompletedEnrollment
        ? undefined
        : "수료한 강좌가 없습니다.",
      href: null,
      isDigital: false,
    },
    {
      id: "attendance-cert",
      title: "수강증명서",
      titleEn: "Attendance Certificate",
      description: "수강 사실을 증명하는 서류입니다. 오프라인 발급 전용입니다.",
      isAvailable: hasActiveEnrollment || hasCompletedEnrollment,
      unavailableReason:
        hasActiveEnrollment || hasCompletedEnrollment
          ? undefined
          : "수강 이력이 없습니다.",
      href: null,
      isDigital: false,
    },
  ];

  const activeCohortName =
    activeEnrollment?.cohort?.name ??
    activeEnrollment?.product?.name ??
    activeEnrollment?.specialLecture?.name ??
    null;

  return (
    <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl space-y-6">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-slate">
          <Link
            href="/student/documents"
            className="transition hover:text-ember"
          >
            증명서 발급
          </Link>
          <span>/</span>
          <span className="text-ink font-medium">증명서 신청</span>
        </nav>

        {/* Header */}
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-[#1F4D3A]">
            Document Request
          </div>
          <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-4xl">
            증명서 신청
          </h1>
          <p className="mt-4 text-sm leading-7 text-slate sm:text-base">
            {viewer.name} ({viewer.examNumber}) 님의 증명서를 신청합니다.
            {activeCohortName && (
              <>
                {" "}
                현재 수강 중: <span className="font-semibold text-ink">{activeCohortName}</span>
              </>
            )}
          </p>

          {/* Info notice */}
          <div className="mt-6 flex items-start gap-3 rounded-[20px] border border-ink/10 bg-mist px-4 py-3.5">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.253a.25.25 0 0 1 .244.304l-.459 2.066A1.75 1.75 0 0 0 10.747 15H11a.75.75 0 0 0 0-1.5h-.253a.25.25 0 0 1-.244-.304l.459-2.066A1.75 1.75 0 0 0 9.253 9H9Z"
                clipRule="evenodd"
              />
            </svg>
            <p className="text-xs leading-6 text-slate">
              <span className="font-semibold text-ink">디지털 발급</span>은 즉시
              인쇄할 수 있습니다.{" "}
              <span className="font-semibold text-ink">오프라인 발급</span>은
              영업일 1~2일 이내에 처리되며, 직접 방문 또는 우편으로 수령할 수
              있습니다.
            </p>
          </div>
        </section>

        {/* Document list */}
        <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
          <h2 className="mb-4 text-base font-semibold text-ink">
            발급 가능 서류
          </h2>
          <ul className="space-y-3">
            {docItems.map((doc) => (
              <li
                key={doc.id}
                className={`flex flex-wrap items-center justify-between gap-4 rounded-[20px] border p-4 transition-colors ${
                  doc.isAvailable
                    ? "border-ink/10 bg-white hover:bg-mist/40"
                    : "border-ink/5 bg-mist/50 opacity-60"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink text-sm">
                      {doc.title}
                    </span>
                    <span className="text-[10px] text-slate font-medium">
                      {doc.titleEn}
                    </span>
                    {doc.isDigital ? (
                      <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-2 py-0.5 text-[10px] font-semibold text-[#1F4D3A]">
                        디지털
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full border border-ink/10 bg-mist px-2 py-0.5 text-[10px] font-semibold text-slate">
                        오프라인
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate">{doc.description}</p>
                  {!doc.isAvailable && doc.unavailableReason && (
                    <p className="mt-1 text-xs text-amber-600">
                      {doc.unavailableReason}
                    </p>
                  )}
                </div>

                <div className="flex-shrink-0">
                  {doc.isAvailable && doc.href ? (
                    <Link
                      href={doc.href}
                      className="inline-flex items-center gap-1.5 rounded-full bg-ember px-4 py-2 text-xs font-semibold text-white transition hover:bg-ember/90 active:scale-95"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 16 16"
                        fill="currentColor"
                        className="h-3.5 w-3.5"
                      >
                        <path
                          fillRule="evenodd"
                          d="M8 1.75a.75.75 0 0 1 .75.75v5.69l1.97-1.97a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 1.06-1.06l1.97 1.97V2.5A.75.75 0 0 1 8 1.75ZM3.75 13a.75.75 0 0 0 0 1.5h8.5a.75.75 0 0 0 0-1.5h-8.5Z"
                          clipRule="evenodd"
                        />
                      </svg>
                      즉시 발급
                    </Link>
                  ) : doc.isAvailable && !doc.isDigital ? (
                    <span className="inline-flex items-center rounded-full border border-ink/10 bg-mist px-4 py-2 text-xs font-semibold text-slate">
                      방문 신청
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full border border-ink/5 bg-mist/50 px-4 py-2 text-xs font-semibold text-slate/50 cursor-not-allowed">
                      신청 불가
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Contact notice */}
        <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#1F4D3A]"
            >
              <path
                fillRule="evenodd"
                d="M2 3.5A1.5 1.5 0 0 1 3.5 2h1.148a1.5 1.5 0 0 1 1.465 1.175l.716 3.223a1.5 1.5 0 0 1-1.052 1.767l-.933.267c-.41.117-.643.555-.48.95a11.542 11.542 0 0 0 6.254 6.254c.395.163.833-.07.95-.48l.267-.933a1.5 1.5 0 0 1 1.767-1.052l3.223.716A1.5 1.5 0 0 1 18 15.352V16.5a1.5 1.5 0 0 1-1.5 1.5H15c-1.149 0-2.263-.15-3.326-.43A13.022 13.022 0 0 1 2.43 8.326 13.019 13.019 0 0 1 2 5V3.5Z"
                clipRule="evenodd"
              />
            </svg>
            <div>
              <p className="text-sm font-semibold text-ink">
                오프라인 서류 발급 문의
              </p>
              <p className="mt-1 text-xs leading-6 text-slate">
                수료증 · 수강증명서 등 오프라인 발급 서류는{" "}
                <span className="font-semibold text-ink">{branding.academyName}</span>{" "}
                방문 또는{" "}
                {branding.phoneHref ? (
                  <a href={branding.phoneHref} className="font-semibold text-ember hover:underline">
                    {branding.phone}
                  </a>
                ) : (
                  <span className="font-semibold text-ink">학원 연락처</span>
                )}
                로 신청해 주세요.
                <br />
                영업시간: 평일 09:00 ~ 21:00 / 주말 09:00 ~ 18:00
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
