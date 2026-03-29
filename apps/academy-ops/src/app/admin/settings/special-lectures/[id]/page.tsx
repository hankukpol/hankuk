import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { EXAM_CATEGORY_LABEL, ENROLLMENT_STATUS_LABEL, ENROLLMENT_STATUS_COLOR } from "@/lib/constants";

export const dynamic = "force-dynamic";

const LECTURE_TYPE_LABEL: Record<string, string> = {
  THEMED: "테마 특강",
  SINGLE: "단과",
  INTERVIEW_COACHING: "면접 코칭",
};

type PageProps = { params: Promise<{ id: string }> };

export default async function SpecialLectureDetailPage({ params }: PageProps) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const { id } = await params;

  const lecture = await getPrisma().specialLecture.findUnique({
    where: { id },
    include: {
      subjects: {
        include: { instructor: { select: { name: true } } },
        orderBy: { sortOrder: "asc" },
      },
      discountPolicies: { where: { isActive: true }, orderBy: { isExclusive: "desc" } },
      enrollments: {
        include: {
          student: { select: { name: true, phone: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      },
      _count: {
        select: {
          enrollments: { where: { status: { in: ["ACTIVE", "COMPLETED"] } } },
        },
      },
    },
  });

  if (!lecture) notFound();

  const totalEnrollCount = lecture._count.enrollments;

  return (
    <div className="p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "설정", href: "/admin/settings/special-lectures" },
          { label: "특강 단과 관리", href: "/admin/settings/special-lectures" },
          { label: lecture.name },
        ]}
      />

      {/* Header */}
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ink">
            특강 · 단과 상세
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-semibold">{lecture.name}</h1>
            <span className="rounded-full border border-ink/10 bg-ink/5 px-2 py-0.5 text-xs text-slate">
              {LECTURE_TYPE_LABEL[lecture.lectureType] ?? lecture.lectureType}
            </span>
            {lecture.examCategory && (
              <span className="rounded-full border border-forest/20 bg-forest/10 px-2 py-0.5 text-xs text-forest">
                {EXAM_CATEGORY_LABEL[lecture.examCategory]}
              </span>
            )}
            {!lecture.isActive && (
              <span className="rounded-full border border-ink/10 bg-ink/5 px-2 py-0.5 text-xs text-slate">
                비활성
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate">
            {lecture.startDate.toLocaleDateString("ko-KR")} ~{" "}
            {lecture.endDate.toLocaleDateString("ko-KR")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Link
            href={`/admin/settings/special-lectures/${id}/revenue`}
            className="rounded-[20px] border border-ember/30 bg-ember/5 px-4 py-2 text-sm font-medium text-ember transition hover:bg-ember/10"
          >
            수익 분석
          </Link>
          <Link
            href={`/admin/settings/special-lectures/${id}/edit`}
            className="rounded-[20px] border border-forest/30 bg-forest/10 px-4 py-2 text-sm font-medium text-forest transition hover:bg-forest/20"
          >
            수정
          </Link>
          <Link
            href={`/admin/settings/special-lectures/${id}/registrations`}
            className="rounded-[20px] bg-ember px-4 py-2 text-sm font-medium text-white transition hover:bg-ember/90"
          >
            수강생 목록
          </Link>
          <Link
            href="/admin/settings/special-lectures"
            className="rounded-[20px] border border-ink/20 px-4 py-2 text-sm font-medium text-slate transition-colors hover:border-ink/40 hover:text-ink"
          >
            ← 목록으로
          </Link>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="rounded-[20px] border border-forest/20 bg-forest/5 px-5 py-4">
              <p className="text-xs text-slate">수강 등록</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-forest">
                {totalEnrollCount}명
              </p>
            </div>
            {lecture.maxCapacityOffline && (
              <div className="rounded-[20px] border border-ink/10 bg-white px-5 py-4">
                <p className="text-xs text-slate">오프라인 정원</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-ink">
                  {lecture.maxCapacityOffline}명
                </p>
              </div>
            )}
            {lecture.hasLive && lecture.maxCapacityLive && (
              <div className="rounded-[20px] border border-ink/10 bg-white px-5 py-4">
                <p className="text-xs text-slate">라이브 정원</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-ink">
                  {lecture.maxCapacityLive}명
                </p>
              </div>
            )}
            {lecture.fullPackagePrice && (
              <div className="rounded-[20px] border border-ember/20 bg-ember/5 px-5 py-4">
                <p className="text-xs text-slate">패키지 가격</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-ember">
                  {lecture.fullPackagePrice.toLocaleString()}원
                </p>
              </div>
            )}
          </div>

          {/* Lecture info */}
          <div className="rounded-[20px] border border-ink/10 bg-white px-6 py-5">
            <h2 className="text-sm font-semibold text-ink">강좌 정보</h2>
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div>
                <dt className="text-xs text-slate">강좌명</dt>
                <dd className="mt-0.5 font-medium text-ink">{lecture.name}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate">유형</dt>
                <dd className="mt-0.5 text-ink">
                  {LECTURE_TYPE_LABEL[lecture.lectureType] ?? lecture.lectureType}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate">수험 유형</dt>
                <dd className="mt-0.5 text-ink">
                  {lecture.examCategory
                    ? EXAM_CATEGORY_LABEL[lecture.examCategory]
                    : "공통 (전체)"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate">복합 과목</dt>
                <dd className="mt-0.5 text-ink">{lecture.isMultiSubject ? "예" : "아니오"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate">라이브</dt>
                <dd className="mt-0.5 text-ink">{lecture.hasLive ? "지원" : "미지원"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate">대기 등록</dt>
                <dd className="mt-0.5 text-ink">{lecture.waitlistAllowed ? "허용" : "불허"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate">기간</dt>
                <dd className="mt-0.5 text-ink">
                  {lecture.startDate.toLocaleDateString("ko-KR")} ~{" "}
                  {lecture.endDate.toLocaleDateString("ko-KR")}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate">상태</dt>
                <dd className="mt-0.5">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                      lecture.isActive
                        ? "bg-forest/10 text-forest"
                        : "bg-slate/10 text-slate"
                    }`}
                  >
                    {lecture.isActive ? "활성" : "비활성"}
                  </span>
                </dd>
              </div>
            </dl>
          </div>

          {/* Subjects table */}
          {lecture.subjects.length > 0 && (
            <div className="rounded-[20px] border border-ink/10 bg-white overflow-hidden">
              <div className="px-6 py-4 border-b border-ink/5">
                <h2 className="text-sm font-semibold text-ink">과목별 상세</h2>
              </div>
              <table className="min-w-full text-sm divide-y divide-ink/5">
                <thead>
                  <tr className="bg-mist/50">
                    {["과목명", "강사", "수강료", "배분율", "강사 수령"].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-2 text-left text-xs font-medium text-slate whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {lecture.subjects.map((s) => (
                    <tr key={s.id} className="hover:bg-mist/20">
                      <td className="px-4 py-2.5 font-medium text-ink">{s.subjectName}</td>
                      <td className="px-4 py-2.5 text-slate">{s.instructor.name}</td>
                      <td className="px-4 py-2.5 tabular-nums text-slate whitespace-nowrap">
                        {s.price.toLocaleString()}원
                      </td>
                      <td className="px-4 py-2.5 tabular-nums text-slate">{s.instructorRate}%</td>
                      <td className="px-4 py-2.5 tabular-nums text-ember font-semibold whitespace-nowrap">
                        {Math.round((s.price * s.instructorRate) / 100).toLocaleString()}원
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Discount policies */}
          {lecture.discountPolicies.length > 0 && (
            <div className="rounded-[20px] border border-ink/10 bg-white px-6 py-5">
              <h2 className="mb-3 text-sm font-semibold text-ink">할인 정책</h2>
              <ul className="space-y-2 text-sm">
                {lecture.discountPolicies.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-4">
                    <span className="text-ink">{d.name}</span>
                    <span className="tabular-nums text-ember font-semibold">
                      {d.discountType === "RATE"
                        ? `${d.discountValue}%`
                        : `${d.discountValue.toLocaleString()}원`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Right: recent enrollments */}
        <div className="space-y-6">
          <div className="rounded-[20px] border border-ink/10 bg-white px-6 py-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">
                최근 수강생
                <span className="ml-1 text-xs font-normal text-slate">최신 10건</span>
              </h2>
              <Link
                href={`/admin/settings/special-lectures/${id}/registrations`}
                className="text-xs text-forest hover:text-ink font-medium"
              >
                전체 보기 →
              </Link>
            </div>
            {lecture.enrollments.length === 0 ? (
              <p className="text-xs text-slate">수강 등록이 없습니다.</p>
            ) : (
              <ul className="space-y-2">
                {lecture.enrollments.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-2 text-xs">
                    <Link
                      href={`/admin/students/${e.examNumber}`}
                      className="font-medium text-ink hover:text-forest"
                    >
                      {e.student.name}
                    </Link>
                    <span
                      className={`inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${ENROLLMENT_STATUS_COLOR[e.status]}`}
                    >
                      {ENROLLMENT_STATUS_LABEL[e.status]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
