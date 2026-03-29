import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import IssuanceClient, {
  type IssuanceRow,
  type EnrollmentRow,
  type IssuanceStats,
} from "./issuance-client";

export const dynamic = "force-dynamic";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatKorDate(date: Date): string {
  return `${date.getFullYear()}년 ${(date.getMonth() + 1).toString().padStart(2, "0")}월 ${date
    .getDate()
    .toString()
    .padStart(2, "0")}일`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DocumentsHubPage() {
  await requireAdminContext(AdminRole.COUNSELOR);

  const prisma = getPrisma();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // Fetch issuances with student and issuer info
  const rawIssuances = await prisma.documentIssuance.findMany({
    orderBy: { issuedAt: "desc" },
    take: 200,
    include: {
      student: { select: { name: true } },
      issuedByUser: { select: { name: true } },
    },
  });

  // Fetch recent enrollments that can have certificates
  const rawEnrollments = await prisma.courseEnrollment.findMany({
    where: {
      status: { in: ["ACTIVE", "COMPLETED", "SUSPENDED"] },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: {
      id: true,
      examNumber: true,
      status: true,
      startDate: true,
      endDate: true,
      courseType: true,
      updatedAt: true,
      student: { select: { name: true } },
      cohort: { select: { name: true } },
      product: { select: { name: true } },
      specialLecture: { select: { name: true } },
    },
  });

  // Aggregate counts
  const [todayCount, monthCount, totalCount] = await Promise.all([
    prisma.documentIssuance.count({ where: { issuedAt: { gte: todayStart } } }),
    prisma.documentIssuance.count({ where: { issuedAt: { gte: monthStart } } }),
    prisma.documentIssuance.count(),
  ]);

  const today = formatKorDate(now);

  // Serialize data for client component
  const issuances: IssuanceRow[] = rawIssuances.map((iss) => ({
    id: iss.id,
    examNumber: iss.examNumber,
    studentName: iss.student?.name ?? iss.examNumber,
    docType: iss.docType,
    issuedAt: iss.issuedAt.toISOString(),
    issuedByName: iss.issuedByUser?.name ?? null,
    note: iss.note ?? null,
  }));

  const enrollments: EnrollmentRow[] = rawEnrollments.map((enr) => ({
    id: enr.id,
    examNumber: enr.examNumber,
    studentName: enr.student?.name ?? enr.examNumber,
    courseName:
      enr.cohort?.name ??
      enr.specialLecture?.name ??
      enr.product?.name ??
      "강좌 미지정",
    courseType: enr.courseType,
    status: enr.status,
    startDate: enr.startDate.toISOString(),
    endDate: enr.endDate?.toISOString() ?? null,
    updatedAt: enr.updatedAt.toISOString(),
  }));

  const stats: IssuanceStats = {
    issuedToday: todayCount,
    issuedThisMonth: monthCount,
    issuedTotal: totalCount,
  };

  return (
    <div className="p-8 sm:p-10">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 text-sm text-slate hover:text-ink transition"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          대시보드
        </Link>
        <span className="text-ink/20">/</span>
        <span className="text-sm font-medium text-ink">서류 발급</span>
      </div>

      {/* Header */}
      <div className="inline-flex rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ink">
        서류 발급 관리
      </div>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">서류 발급 센터</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate">
            수강확인서, 출결확인서, 수강등록확인서, 교육비납입증명서 등 공식 서류를 발급하고
            이력을 관리합니다.
          </p>
        </div>
        <Link
          href="/admin/students"
          className="inline-flex items-center gap-2 rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-forest/90"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          학생 검색
        </Link>
      </div>

      {/* Document Types Quick Access */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* 수강확인서 */}
        <div className="rounded-[20px] border border-ink/10 bg-white p-5 flex flex-col gap-3">
          <div className="h-9 w-9 rounded-full bg-forest/10 flex items-center justify-center">
            <svg className="h-5 w-5 text-forest" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-ink text-sm">수강확인서</p>
            <p className="mt-1 text-xs text-slate leading-relaxed">현재 수강 강좌·기간 확인</p>
          </div>
          <Link
            href="/admin/students"
            className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-forest hover:text-forest/80 transition"
          >
            학생 검색 후 발급
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>

        {/* 출결확인서 */}
        <div className="rounded-[20px] border border-ink/10 bg-white p-5 flex flex-col gap-3">
          <div className="h-9 w-9 rounded-full bg-ember/10 flex items-center justify-center">
            <svg className="h-5 w-5 text-ember" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-ink text-sm">출결확인서</p>
            <p className="mt-1 text-xs text-slate leading-relaxed">출석·결석일 현황 증명</p>
          </div>
          <Link
            href="/admin/students"
            className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-ember hover:text-ember/80 transition"
          >
            학생 검색 후 발급
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>

        {/* 수강등록확인서 */}
        <div className="rounded-[20px] border border-ink/10 bg-white p-5 flex flex-col gap-3">
          <div className="h-9 w-9 rounded-full bg-sky-50 flex items-center justify-center">
            <svg className="h-5 w-5 text-sky-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-ink text-sm">수강등록확인서</p>
            <p className="mt-1 text-xs text-slate leading-relaxed">수납 정보 포함 공식 문서</p>
          </div>
          <Link
            href="/admin/enrollments"
            className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-sky-600 hover:text-sky-700 transition"
          >
            수강 목록에서 발급
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>

        {/* 교육비납입증명서 */}
        <div className="rounded-[20px] border border-ink/10 bg-white p-5 flex flex-col gap-3">
          <div className="h-9 w-9 rounded-full bg-violet-50 flex items-center justify-center">
            <svg className="h-5 w-5 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-ink text-sm">교육비납입증명서</p>
            <p className="mt-1 text-xs text-slate leading-relaxed">연말정산 교육비 증명</p>
          </div>
          <Link
            href="/admin/students"
            className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-violet-600 hover:text-violet-700 transition"
          >
            학생 검색 후 발급
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </div>

      {/* Quick Issue */}
      <div className="mt-8 rounded-[20px] border border-ink/10 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold text-ink">빠른 발급 — 학번으로 이동</h2>
        <p className="text-xs text-slate mb-4">
          학번을 입력하면 해당 학생의 서류 발급 페이지로 바로 이동합니다.
        </p>
        <QuickIssueFormClient />
      </div>

      {/* How-to guide */}
      <div className="mt-6 rounded-[20px] border border-forest/20 bg-forest/5 p-5">
        <h3 className="text-sm font-semibold text-forest mb-3">발급 방법 안내</h3>
        <ol className="space-y-2 text-sm text-slate list-decimal list-inside leading-relaxed">
          <li>
            <span className="font-medium text-ink">수강확인서 · 출결확인서 · 교육비납입증명서</span>
            — 학생 상세 페이지 &rarr; 상단 &ldquo;서류 발급&rdquo; 버튼 클릭
          </li>
          <li>
            <span className="font-medium text-ink">수강등록확인서</span>
            — 수강 목록 &rarr; 해당 수강 클릭 &rarr; &ldquo;수강등록확인서&rdquo; 버튼 클릭
          </li>
          <li>
            인쇄 대화상자에서 용지 크기를 <span className="font-medium text-ink">A4</span>로 선택하세요.
          </li>
        </ol>
      </div>

      {/* Issuance Client: filterable table */}
      <IssuanceClient
        issuances={issuances}
        enrollments={enrollments}
        stats={stats}
      />

      {/* Footer */}
      <p className="mt-6 text-xs text-slate/60">
        발급 기준일: {today} · 서류는 인쇄 또는 PDF로 저장하세요.
      </p>
    </div>
  );
}

// ─── Quick Issue Form (Client Island) ────────────────────────────────────────
import { QuickIssueFormClient } from "./quick-issue-form-client";
