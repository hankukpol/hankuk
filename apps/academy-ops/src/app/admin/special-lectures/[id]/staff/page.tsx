import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";

export const dynamic = "force-dynamic";

const LECTURE_TYPE_LABEL: Record<string, string> = {
  SPECIAL: "특강",
  INTENSIVE: "집중반",
  REVIEW: "복습반",
  TRIAL: "체험반",
};

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function SpecialLectureStaffPage({ params }: PageProps) {
  await requireAdminContext(AdminRole.MANAGER);
  const { id } = await params;

  const prisma = getPrisma();

  const lecture = await prisma.specialLecture.findUnique({
    where: { id },
    include: {
      subjects: {
        include: {
          instructor: {
            select: {
              id: true,
              name: true,
              subject: true,
              phone: true,
              email: true,
              isActive: true,
            },
          },
          _count: {
            select: { seatAssignments: true },
          },
        },
        orderBy: { sortOrder: "asc" },
      },
      enrollments: {
        select: { id: true, status: true },
      },
    },
  });

  if (!lecture) notFound();

  const activeEnrollmentCount = lecture.enrollments.filter(
    (e) => e.status === "ACTIVE",
  ).length;

  // Deduplicate instructors across subjects
  const instructorMap = new Map<
    string,
    {
      id: string;
      name: string;
      subject: string;
      phone: string | null;
      email: string | null;
      isActive: boolean;
      subjects: Array<{
        id: string;
        subjectName: string;
        price: number;
        instructorRate: number;
        sortOrder: number;
      }>;
    }
  >();

  for (const s of lecture.subjects) {
    const instr = s.instructor;
    if (!instructorMap.has(instr.id)) {
      instructorMap.set(instr.id, {
        id: instr.id,
        name: instr.name,
        subject: instr.subject,
        phone: instr.phone ?? null,
        email: instr.email ?? null,
        isActive: instr.isActive,
        subjects: [],
      });
    }
    instructorMap.get(instr.id)!.subjects.push({
      id: s.id,
      subjectName: s.subjectName,
      price: s.price,
      instructorRate: s.instructorRate,
      sortOrder: s.sortOrder,
    });
  }

  const instructors = Array.from(instructorMap.values());

  return (
    <div className="p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "특강 관리", href: "/admin/special-lectures" },
          {
            label: lecture.name,
            href: `/admin/special-lectures/${id}`,
          },
          { label: "강사 관리" },
        ]}
      />

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
            {LECTURE_TYPE_LABEL[lecture.lectureType] ?? lecture.lectureType}
          </div>
          <h1 className="mt-4 text-3xl font-semibold text-ink">
            {lecture.name}
            <span className="ml-3 text-xl font-normal text-slate">강사 관리</span>
          </h1>
          <p className="mt-1 text-sm text-slate">
            {lecture.isMultiSubject ? "복합 특강 (다수 강사)" : "단일 과목 특강"} ·
            수강생 {activeEnrollmentCount}명 활성
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/special-lectures/${id}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 px-4 py-2 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink"
          >
            ← 특강 상세
          </Link>
          <Link
            href="/admin/instructors"
            className="inline-flex items-center gap-1.5 rounded-full bg-ember px-4 py-2 text-sm font-medium text-white transition hover:bg-ember/90"
          >
            강사 목록 관리
          </Link>
        </div>
      </div>

      {/* KPI cards */}
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">
            배정 강사 수
          </p>
          <p className="mt-3 text-3xl font-bold text-ink">
            {instructors.length}
            <span className="ml-1 text-base font-normal text-slate">명</span>
          </p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">
            총 과목 수
          </p>
          <p className="mt-3 text-3xl font-bold text-ink">
            {lecture.subjects.length}
            <span className="ml-1 text-base font-normal text-slate">과목</span>
          </p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">
            패키지 가격
          </p>
          <p className="mt-3 text-3xl font-bold text-ember">
            {lecture.fullPackagePrice != null
              ? lecture.fullPackagePrice.toLocaleString() + "원"
              : "—"}
          </p>
        </div>
      </div>

      {/* Instructor list */}
      <div className="mt-8">
        <h2 className="mb-4 text-lg font-semibold text-ink">배정 강사 목록</h2>

        {instructors.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-ink/10 p-12 text-center">
            <p className="text-sm text-slate">배정된 강사가 없습니다.</p>
            <p className="mt-2 text-xs text-slate/60">
              과목을 추가하면 강사가 자동으로 표시됩니다.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {instructors.map((instr) => (
              <div
                key={instr.id}
                className="rounded-[28px] border border-ink/10 bg-white shadow-sm"
              >
                {/* Instructor header */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/5 px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-forest/10 text-sm font-bold text-forest">
                      {instr.name.charAt(0)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/admin/instructors/${instr.id}`}
                          className="font-semibold text-ink transition hover:text-ember"
                        >
                          {instr.name}
                        </Link>
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                            instr.isActive
                              ? "bg-forest/10 text-forest"
                              : "bg-ink/5 text-slate"
                          }`}
                        >
                          {instr.isActive ? "재직 중" : "비활성"}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-slate">
                        전공: {instr.subject}
                        {instr.phone ? ` · ${instr.phone}` : ""}
                        {instr.email ? ` · ${instr.email}` : ""}
                      </p>
                    </div>
                  </div>
                  <Link
                    href={`/admin/instructors/${instr.id}`}
                    className="rounded-full border border-ink/10 px-3 py-1.5 text-xs font-medium text-slate transition hover:border-ink/30 hover:text-ink"
                  >
                    강사 상세 →
                  </Link>
                </div>

                {/* Subject rows for this instructor */}
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-ink/5 bg-mist/40">
                        {["과목명", "강의료 (수강생 단가)", "강사 수익률", "순서"].map(
                          (h) => (
                            <th
                              key={h}
                              className="px-6 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate"
                            >
                              {h}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink/5">
                      {instr.subjects.map((sub) => (
                        <tr key={sub.id} className="transition hover:bg-mist/30">
                          <td className="px-6 py-3 font-medium text-ink">
                            {sub.subjectName}
                          </td>
                          <td className="px-6 py-3 tabular-nums text-ember font-semibold">
                            {sub.price.toLocaleString()}원
                          </td>
                          <td className="px-6 py-3">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-ink/10">
                                <div
                                  className="h-full rounded-full bg-forest"
                                  style={{
                                    width: `${Math.min(sub.instructorRate, 100)}%`,
                                  }}
                                />
                              </div>
                              <span className="tabular-nums text-xs font-semibold text-forest">
                                {sub.instructorRate}%
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-3 tabular-nums text-slate">
                            {sub.sortOrder + 1}순위
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Per-instructor revenue estimate */}
                <div className="border-t border-ink/5 px-6 py-3">
                  <p className="text-xs text-slate">
                    예상 강사 수익 (수강생 {activeEnrollmentCount}명 기준):{" "}
                    <span className="font-semibold text-ink">
                      {instr.subjects
                        .reduce(
                          (sum, sub) =>
                            sum +
                            Math.round(
                              (sub.price * sub.instructorRate) / 100,
                            ) *
                              activeEnrollmentCount,
                          0,
                        )
                        .toLocaleString()}
                      원
                    </span>
                    <span className="ml-1 text-slate/60">(개인 강의료 × 수익률 × 수강생 수 합산)</span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Settlement link */}
      <div className="mt-8 rounded-[28px] border border-ink/10 bg-mist/50 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-ink">강사 정산 관리</h3>
            <p className="mt-1 text-xs text-slate">
              이 특강의 월별 강사 정산 내역을 확인하고 정산 처리를 진행할 수 있습니다.
            </p>
          </div>
          <Link
            href={`/admin/staff-settlements`}
            className="inline-flex items-center gap-1.5 rounded-full border border-ember/30 bg-ember/5 px-4 py-2 text-sm font-medium text-ember transition hover:bg-ember/10"
          >
            정산 관리 →
          </Link>
        </div>
      </div>
    </div>
  );
}
