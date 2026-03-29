import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { BulkArchiveForm } from "./bulk-archive-form";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type StatusFilter = "inactive_candidates" | "already_inactive";

function parseStatusParam(value: string | string[] | undefined): StatusFilter {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "already_inactive") return "already_inactive";
  return "inactive_candidates";
}

export default async function BulkArchivePage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.MANAGER);

  const sp = searchParams ? await searchParams : {};
  const status = parseStatusParam(sp.status);

  const db = getPrisma();

  // 90 days ago threshold
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);

  if (status === "inactive_candidates") {
    // Students that are isActive:true but have no ACTIVE enrollment
    // and whose most-recent enrollment ended more than 90 days ago.
    const candidates = await db.student.findMany({
      where: {
        isActive: true,
        courseEnrollments: {
          // Must NOT have any ACTIVE enrollment
          none: { status: "ACTIVE" },
        },
      },
      select: {
        examNumber: true,
        name: true,
        phone: true,
        isActive: true,
        courseEnrollments: {
          select: { endDate: true, status: true },
          orderBy: { endDate: "desc" },
          take: 1,
        },
        _count: {
          select: {
            courseEnrollments: {
              where: { status: "ACTIVE" },
            },
          },
        },
      },
      orderBy: { name: "asc" },
    });

    // Filter: last enrollment ended > 90 days ago OR no enrollment at all
    const filtered = candidates.filter((s) => {
      const lastEnroll = s.courseEnrollments[0];
      if (!lastEnroll) return true; // no enrollment history → candidate
      if (!lastEnroll.endDate) return false; // open-ended enrollment still running
      return lastEnroll.endDate < cutoff;
    });

    const studentRows = filtered.map((s) => ({
      examNumber: s.examNumber,
      name: s.name,
      phone: s.phone ?? null,
      isActive: s.isActive,
      lastEnrollmentEnd: s.courseEnrollments[0]?.endDate?.toISOString() ?? null,
      activeEnrollmentCount: s._count.courseEnrollments,
    }));

    return (
      <BulkArchivePage_UI
        status={status}
        students={studentRows}
        candidateCount={studentRows.length}
        alreadyInactiveCount={null}
      />
    );
  }

  // already_inactive
  const inactiveStudents = await db.student.findMany({
    where: { isActive: false },
    select: {
      examNumber: true,
      name: true,
      phone: true,
      isActive: true,
      courseEnrollments: {
        select: { endDate: true, status: true },
        orderBy: { endDate: "desc" },
        take: 1,
      },
      _count: {
        select: {
          courseEnrollments: {
            where: { status: "ACTIVE" },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  const studentRows = inactiveStudents.map((s) => ({
    examNumber: s.examNumber,
    name: s.name,
    phone: s.phone ?? null,
    isActive: s.isActive,
    lastEnrollmentEnd: s.courseEnrollments[0]?.endDate?.toISOString() ?? null,
    activeEnrollmentCount: s._count.courseEnrollments,
  }));

  return (
    <BulkArchivePage_UI
      status={status}
      students={studentRows}
      candidateCount={null}
      alreadyInactiveCount={studentRows.length}
    />
  );
}

// ─── UI shell (pure JSX) ───────────────────────────────────────────────────

type UiProps = {
  status: StatusFilter;
  students: {
    examNumber: string;
    name: string;
    phone: string | null;
    isActive: boolean;
    lastEnrollmentEnd: string | null;
    activeEnrollmentCount: number;
  }[];
  candidateCount: number | null;
  alreadyInactiveCount: number | null;
};

function BulkArchivePage_UI({
  status,
  students,
  candidateCount,
  alreadyInactiveCount,
}: UiProps) {
  return (
    <div className="p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "수강생 관리", href: "/admin/students" },
          { label: "일괄 비활성화" },
        ]}
      />

      {/* Header */}
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        수강생 관리
      </div>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-ink">일괄 비활성화</h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            활성 수강이 없고 마지막 수강 종료일이 90일 이상 지난 학생을 비활성화 후보로
            표시합니다. 체크박스로 선택 후 일괄 처리할 수 있습니다.
          </p>
        </div>
        <Link
          href="/admin/students"
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 bg-white px-4 py-2 text-sm font-medium text-slate shadow-sm transition hover:border-forest/30 hover:text-forest"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          학생 목록으로
        </Link>
      </div>

      {/* Filter tabs */}
      <div className="mt-8 flex gap-2">
        <Link
          href="/admin/students/bulk-archive?status=inactive_candidates"
          className={`rounded-full px-4 py-2 text-sm font-medium transition ${
            status === "inactive_candidates"
              ? "bg-ember text-white shadow-sm"
              : "border border-ink/15 bg-white text-slate hover:border-ember/30 hover:text-ember"
          }`}
        >
          비활성화 후보
          {candidateCount !== null && (
            <span className="ml-2 rounded-full bg-white/20 px-1.5 py-0.5 text-xs">
              {candidateCount}
            </span>
          )}
        </Link>
        <Link
          href="/admin/students/bulk-archive?status=already_inactive"
          className={`rounded-full px-4 py-2 text-sm font-medium transition ${
            status === "already_inactive"
              ? "bg-slate text-white shadow-sm"
              : "border border-ink/15 bg-white text-slate hover:border-ink/30 hover:text-ink"
          }`}
        >
          이미 비활성
          {alreadyInactiveCount !== null && (
            <span className="ml-2 rounded-full bg-white/20 px-1.5 py-0.5 text-xs">
              {alreadyInactiveCount}
            </span>
          )}
        </Link>
      </div>

      {/* Info notice for candidates */}
      {status === "inactive_candidates" && (
        <div className="mt-6 rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          활성 수강(ACTIVE)이 없고, 마지막 수강 종료일이 90일 이상 지난 학생입니다.
          비활성화하면 학생 목록에서 기본적으로 숨겨지지만 데이터는 보존됩니다.
        </div>
      )}
      {status === "already_inactive" && (
        <div className="mt-6 rounded-[20px] border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
          이미 비활성화된 학생 목록입니다. 재활성화가 필요한 경우 선택 후 재활성화하세요.
        </div>
      )}

      {/* Form with table */}
      <div className="mt-6">
        <BulkArchiveForm students={students} status={status} />
      </div>
    </div>
  );
}
