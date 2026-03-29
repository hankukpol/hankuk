import { AdminRole, EnrollmentStatus } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import {
  ENROLLMENT_STATUS_LABEL,
  ENROLLMENT_STATUS_COLOR,
} from "@/lib/constants";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string }>;
};

export default async function SpecialLectureRegistrationsPage({
  params,
  searchParams,
}: PageProps) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const { id } = await params;
  const { status: statusFilter } = await searchParams;

  const lecture = await getPrisma().specialLecture.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      lectureType: true,
      examCategory: true,
    },
  });

  if (!lecture) notFound();

  const validStatuses = Object.values(EnrollmentStatus);
  const filterStatus =
    statusFilter && validStatuses.includes(statusFilter as EnrollmentStatus)
      ? (statusFilter as EnrollmentStatus)
      : null;

  const enrollments = await getPrisma().courseEnrollment.findMany({
    where: {
      specialLectureId: id,
      ...(filterStatus ? { status: filterStatus } : {}),
    },
    include: {
      student: { select: { name: true, phone: true, examNumber: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const statusCounts = await getPrisma().courseEnrollment.groupBy({
    by: ["status"],
    where: { specialLectureId: id },
    _count: { _all: true },
  });

  const countMap = Object.fromEntries(
    statusCounts.map((s) => [s.status, s._count._all]),
  ) as Partial<Record<EnrollmentStatus, number>>;

  const totalAllCount = statusCounts.reduce((acc, s) => acc + s._count._all, 0);

  const LECTURE_TYPE_LABEL: Record<string, string> = {
    THEMED: "테마 특강",
    SINGLE: "단과",
    INTERVIEW_COACHING: "면접 코칭",
  };

  return (
    <div className="p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "설정", href: "/admin/settings/special-lectures" },
          { label: "특강 단과 관리", href: "/admin/settings/special-lectures" },
          {
            label: lecture.name,
            href: `/admin/settings/special-lectures/${id}`,
          },
          { label: "수강생 목록" },
        ]}
      />

      {/* Header */}
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ink">
            수강생 목록
          </div>
          <h1 className="mt-4 text-3xl font-semibold">{lecture.name}</h1>
          <p className="mt-1 text-sm text-slate">
            {LECTURE_TYPE_LABEL[lecture.lectureType] ?? lecture.lectureType}
            {lecture.examCategory ? ` · ${lecture.examCategory}` : ""}
            {" · "}
            {lecture.startDate.toLocaleDateString("ko-KR")} ~{" "}
            {lecture.endDate.toLocaleDateString("ko-KR")}
          </p>
        </div>
        <Link
          href={`/admin/settings/special-lectures/${id}`}
          className="rounded-[20px] border border-ink/20 px-4 py-2 text-sm font-medium text-slate transition-colors hover:border-ink/40 hover:text-ink"
        >
          ← 강좌 상세
        </Link>
      </div>

      {/* Status filter tabs */}
      <div className="mt-6 flex flex-wrap gap-2">
        <Link
          href={`/admin/settings/special-lectures/${id}/registrations`}
          className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
            !filterStatus
              ? "bg-ink text-white"
              : "border border-ink/10 bg-white text-slate hover:border-ink/30"
          }`}
        >
          전체 ({totalAllCount})
        </Link>
        {(
          [
            "ACTIVE",
            "PENDING",
            "WAITING",
            "SUSPENDED",
            "COMPLETED",
            "WITHDRAWN",
            "CANCELLED",
          ] as EnrollmentStatus[]
        ).map((s) => {
          const cnt = countMap[s] ?? 0;
          if (cnt === 0 && filterStatus !== s) return null;
          return (
            <Link
              key={s}
              href={`/admin/settings/special-lectures/${id}/registrations?status=${s}`}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                filterStatus === s
                  ? "bg-ink text-white"
                  : "border border-ink/10 bg-white text-slate hover:border-ink/30"
              }`}
            >
              {ENROLLMENT_STATUS_LABEL[s]} ({cnt})
            </Link>
          );
        })}
      </div>

      {/* Table */}
      <div className="mt-6 overflow-hidden rounded-[20px] border border-ink/10 bg-white">
        {enrollments.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate">
            {filterStatus
              ? `"${ENROLLMENT_STATUS_LABEL[filterStatus]}" 상태의 수강생이 없습니다.`
              : "등록된 수강생이 없습니다."}
          </div>
        ) : (
          <table className="min-w-full divide-y divide-ink/10 text-sm">
            <thead>
              <tr>
                {[
                  "학번",
                  "이름",
                  "연락처",
                  "상태",
                  "수강료",
                  "등록일",
                  "액션",
                ].map((h) => (
                  <th
                    key={h}
                    className="bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase text-slate"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10">
              {enrollments.map((e) => (
                <tr key={e.id} className="transition hover:bg-mist/30">
                  <td className="px-4 py-3 tabular-nums text-slate">
                    <Link
                      href={`/admin/students/${e.examNumber}`}
                      className="hover:text-forest"
                    >
                      {e.examNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-medium text-ink">
                    <Link
                      href={`/admin/students/${e.examNumber}`}
                      className="hover:text-forest"
                    >
                      {e.student.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-slate">
                    {e.student.phone ?? "-"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${ENROLLMENT_STATUS_COLOR[e.status]}`}
                    >
                      {ENROLLMENT_STATUS_LABEL[e.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-ink">
                    <div>{e.finalFee.toLocaleString()}원</div>
                    {e.discountAmount > 0 && (
                      <div className="text-xs text-ember">
                        할인 -{e.discountAmount.toLocaleString()}원
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-slate whitespace-nowrap">
                    {e.createdAt.toLocaleDateString("ko-KR")}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/enrollments/${e.id}`}
                      className="inline-flex items-center rounded-full border border-ink/10 px-3 py-1 text-xs font-semibold transition hover:border-forest/30 hover:text-forest"
                    >
                      상세
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer count */}
      <p className="mt-4 text-xs text-slate">
        총 {enrollments.length}건
        {filterStatus ? ` (필터: ${ENROLLMENT_STATUS_LABEL[filterStatus]})` : ""}
      </p>
    </div>
  );
}
