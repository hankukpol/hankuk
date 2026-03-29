import { AdminRole, EnrollmentStatus } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { BulkStatusForm, type BulkEnrollmentRow } from "./bulk-status-form";

export const dynamic = "force-dynamic";

type SearchParams = { status?: string };

export default async function EnrollmentBulkStatusPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireAdminContext(AdminRole.MANAGER);

  // Resolve initial status from query param, default to ACTIVE
  const rawStatus = searchParams.status?.toUpperCase();
  const allowedStatuses: EnrollmentStatus[] = [
    EnrollmentStatus.ACTIVE,
    EnrollmentStatus.SUSPENDED,
    EnrollmentStatus.WAITING,
    EnrollmentStatus.PENDING,
  ];
  const initialStatus: EnrollmentStatus =
    rawStatus && allowedStatuses.includes(rawStatus as EnrollmentStatus)
      ? (rawStatus as EnrollmentStatus)
      : EnrollmentStatus.ACTIVE;

  // Load initial data for the selected status
  const enrollments = await getPrisma().courseEnrollment.findMany({
    where: { status: initialStatus },
    include: {
      student: { select: { name: true, phone: true } },
      cohort: { select: { name: true, examCategory: true } },
      product: { select: { name: true } },
      specialLecture: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const rows: BulkEnrollmentRow[] = enrollments.map((e) => ({
    id: e.id,
    examNumber: e.examNumber,
    courseType: e.courseType,
    startDate: e.startDate.toISOString(),
    endDate: e.endDate?.toISOString() ?? null,
    finalFee: e.finalFee,
    status: e.status,
    enrollSource: e.enrollSource,
    createdAt: e.createdAt.toISOString(),
    student: { name: e.student.name, phone: e.student.phone },
    cohort: e.cohort,
    product: e.product,
    specialLecture: e.specialLecture,
  }));

  return (
    <div className="p-8 sm:p-10">
      {/* 브레드크럼 */}
      <div className="flex items-center gap-2 text-sm text-[#4B5563] mb-6">
        <Link href="/admin/enrollments" className="hover:text-[#C55A11] transition-colors">
          수강 등록 목록
        </Link>
        <span>/</span>
        <span className="text-[#111827] font-medium">일괄 상태 변경</span>
      </div>

      {/* 헤더 */}
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        수강 관리
      </div>
      <div className="mt-5 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold">일괄 상태 변경</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-[#4B5563]">
            여러 수강 내역을 한 번에 선택해 상태를 일괄 변경합니다.
            수강 취소, 수료 처리, 휴원, 복교를 지원합니다.
          </p>
        </div>
        <Link
          href="/admin/enrollments"
          className="shrink-0 inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-mist"
        >
          목록으로 돌아가기
        </Link>
      </div>

      {/* 주의사항 */}
      <div className="mt-6 rounded-[20px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
        <p className="font-semibold mb-1">주의사항</p>
        <ul className="list-disc list-inside space-y-0.5 text-xs">
          <li>수강 취소(WITHDRAWN), 수료(COMPLETED) 처리는 되돌릴 수 없습니다.</li>
          <li>허용되지 않는 상태 전환(예: 대기 → 수료)은 자동으로 건너뜁니다.</li>
          <li>이 작업은 실장(MANAGER) 이상만 수행할 수 있습니다.</li>
        </ul>
      </div>

      <div className="mt-8">
        <BulkStatusForm initialEnrollments={rows} initialStatus={initialStatus} />
      </div>
    </div>
  );
}
