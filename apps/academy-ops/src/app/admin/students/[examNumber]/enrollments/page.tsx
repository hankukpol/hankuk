import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import {
  COURSE_TYPE_LABEL,
  ENROLLMENT_STATUS_LABEL,
  ENROLLMENT_STATUS_COLOR,
  EXAM_CATEGORY_LABEL,
} from "@/lib/constants";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ examNumber: string }>;
};

const SUB_NAV = [
  { href: "enrollments", label: "수업" },
  { href: "payments", label: "수납" },
] as const;

export default async function StudentEnrollmentsPage({ params }: PageProps) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const { examNumber } = await params;
  const prisma = getPrisma();

  const [student, enrollments] = await Promise.all([
    prisma.student.findUnique({
      where: { examNumber },
      select: { name: true, examNumber: true, phone: true, isActive: true },
    }),
    prisma.courseEnrollment.findMany({
      where: { examNumber },
      include: {
        cohort: { select: { name: true, examCategory: true } },
        product: { select: { name: true } },
        specialLecture: { select: { name: true } },
        staff: { select: { name: true } },
        leaveRecords: { orderBy: { leaveDate: "desc" } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  if (!student) notFound();

  // KPI counts
  const total = enrollments.length;
  const active = enrollments.filter((e) => e.status === "ACTIVE").length;
  const completed = enrollments.filter((e) => e.status === "COMPLETED").length;
  const withdrawn = enrollments.filter((e) => e.status === "WITHDRAWN").length;
  const waiting = enrollments.filter((e) => e.status === "WAITING").length;

  // Group: current vs past
  const currentEnrollments = enrollments.filter(
    (e) =>
      e.status === "ACTIVE" ||
      e.status === "SUSPENDED" ||
      e.status === "PENDING" ||
      e.status === "WAITING",
  );
  const pastEnrollments = enrollments.filter(
    (e) => !currentEnrollments.includes(e),
  );

  return (
    <div className="p-8 sm:p-10">
      {/* 브레드크럼 */}
      <nav className="mb-6 flex items-center gap-2 text-xs text-slate">
        <Link
          href="/admin/students"
          className="transition-colors hover:text-forest"
        >
          수강생 목록
        </Link>
        <span>/</span>
        <Link
          href={`/admin/students/${examNumber}`}
          className="transition-colors hover:text-forest"
        >
          {student.name}
        </Link>
        <span>/</span>
        <span className="text-ink">수업</span>
      </nav>

      {/* 헤더 */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            수업 이력
          </div>
          <h1 className="mt-4 text-2xl font-semibold text-ink">
            {student.name}
            <span className="ml-2 text-base font-normal text-slate">
              ({student.examNumber})
            </span>
          </h1>
          {student.phone && (
            <p className="mt-1 text-sm text-slate">{student.phone}</p>
          )}
        </div>

        <Link
          href={`/admin/enrollments/new?examNumber=${examNumber}`}
          className="inline-flex items-center rounded-full bg-ember px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-ember/90"
        >
          + 수강 등록
        </Link>
      </div>

      {/* 서브 내비 */}
      <div className="mt-6 flex gap-1 border-b border-ink/10">
        {SUB_NAV.map((item) => (
          <Link
            key={item.href}
            href={`/admin/students/${examNumber}/${item.href}`}
            className={`rounded-t-2xl px-5 py-2.5 text-sm font-semibold transition ${
              item.href === "enrollments"
                ? "-mb-px border border-b-white border-ink/10 bg-white text-ink"
                : "text-slate hover:text-ink"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>

      {/* KPI 카드 */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4 xl:grid-cols-5">
        <div className="rounded-[28px] border border-ink/10 bg-white p-5 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">
            총 수강 횟수
          </p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-ink">
            {total}
            <span className="ml-1 text-base font-normal text-slate">건</span>
          </p>
        </div>
        <div className="rounded-[28px] border border-forest/20 bg-forest/5 p-5 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-wide text-forest">
            현재 수강 중
          </p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-forest">
            {active}
            <span className="ml-1 text-base font-normal text-slate">건</span>
          </p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-5 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">
            수강 완료
          </p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-ink">
            {completed}
            <span className="ml-1 text-base font-normal text-slate">건</span>
          </p>
        </div>
        <div className="rounded-[28px] border border-red-100 bg-red-50 p-5 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-wide text-red-600">
            퇴원
          </p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-red-700">
            {withdrawn}
            <span className="ml-1 text-base font-normal text-red-400">건</span>
          </p>
        </div>
        <div className="rounded-[28px] border border-sky-100 bg-sky-50 p-5 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-600">
            대기
          </p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-sky-700">
            {waiting}
            <span className="ml-1 text-base font-normal text-sky-400">건</span>
          </p>
        </div>
      </div>

      {/* 목록 */}
      <div className="mt-6 space-y-6">
        {enrollments.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-ink/10 p-10 text-center text-sm text-slate">
            수강 이력이 없습니다.
          </div>
        ) : (
          <>
            {/* 현재 수강 */}
            {currentEnrollments.length > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-semibold text-ink">
                  현재 수강 중 ({currentEnrollments.length}건)
                </h2>
                <div className="overflow-hidden rounded-[28px] border border-ink/10 shadow-panel">
                  <EnrollmentTable enrollments={currentEnrollments} />
                </div>
              </section>
            )}

            {/* 수강 이력 */}
            {pastEnrollments.length > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-semibold text-slate">
                  수강 이력 ({pastEnrollments.length}건)
                </h2>
                <div className="overflow-hidden rounded-[28px] border border-ink/10 opacity-75 shadow-panel">
                  <EnrollmentTable enrollments={pastEnrollments} />
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {/* 학생 프로필 이동 */}
      <div className="mt-8">
        <Link
          href={`/admin/students/${examNumber}`}
          className="inline-flex items-center gap-1.5 text-sm text-forest transition hover:underline"
        >
          ← 학생 프로필로 이동
        </Link>
      </div>
    </div>
  );
}

type EnrollmentRow = {
  id: string;
  courseType: "COMPREHENSIVE" | "SPECIAL_LECTURE";
  startDate: Date;
  endDate: Date | null;
  regularFee: number;
  discountAmount: number;
  finalFee: number;
  status:
    | "PENDING"
    | "ACTIVE"
    | "WAITING"
    | "SUSPENDED"
    | "COMPLETED"
    | "WITHDRAWN"
    | "CANCELLED";
  isRe: boolean;
  createdAt: Date;
  cohort: { name: string; examCategory: string } | null;
  product: { name: string } | null;
  specialLecture: { name: string } | null;
  staff: { name: string };
  leaveRecords: {
    id: string;
    leaveDate: Date;
    returnDate: Date | null;
    reason: string | null;
  }[];
};

function EnrollmentTable({ enrollments }: { enrollments: EnrollmentRow[] }) {
  return (
    <table className="min-w-full divide-y divide-ink/10 text-sm">
      <thead className="bg-mist/80 text-left">
        <tr>
          <th className="px-4 py-3 font-semibold">강좌 / 기수</th>
          <th className="px-4 py-3 font-semibold">유형</th>
          <th className="px-4 py-3 font-semibold">기간</th>
          <th className="px-4 py-3 font-semibold text-right">수강료</th>
          <th className="px-4 py-3 font-semibold">상태</th>
          <th className="px-4 py-3 font-semibold">등록 직원</th>
          <th className="px-4 py-3 font-semibold">등록일</th>
          <th className="px-4 py-3 font-semibold">바로가기</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-ink/10 bg-white">
        {enrollments.map((e) => (
          <>
            <tr key={e.id} className="transition hover:bg-mist/40">
              <td className="px-4 py-3">
                <div className="font-medium text-ink">
                  {e.cohort?.name ?? e.specialLecture?.name ?? "-"}
                </div>
                {e.product && (
                  <div className="mt-0.5 text-xs text-slate">{e.product.name}</div>
                )}
                {e.cohort && (
                  <div className="mt-0.5 text-xs text-slate">
                    {EXAM_CATEGORY_LABEL[e.cohort.examCategory as "GONGCHAE" | "GYEONGCHAE" | "SOGANG" | "CUSTOM"]}
                  </div>
                )}
                {e.isRe && (
                  <span className="mt-0.5 inline-flex rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                    재수강
                  </span>
                )}
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${
                    e.courseType === "COMPREHENSIVE"
                      ? "border-forest/20 bg-forest/10 text-forest"
                      : "border-sky-200 bg-sky-50 text-sky-700"
                  }`}
                >
                  {COURSE_TYPE_LABEL[e.courseType]}
                </span>
              </td>
              <td className="px-4 py-3 text-xs text-slate">
                <div>{formatDate(e.startDate.toISOString())}</div>
                <div>
                  {e.endDate
                    ? `~ ${formatDate(e.endDate.toISOString())}`
                    : "~ 미정"}
                </div>
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                <div className="font-medium">{e.finalFee.toLocaleString()}원</div>
                {e.discountAmount > 0 && (
                  <div className="mt-0.5 text-xs text-forest">
                    -{e.discountAmount.toLocaleString()}원 할인
                  </div>
                )}
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${ENROLLMENT_STATUS_COLOR[e.status]}`}
                >
                  {ENROLLMENT_STATUS_LABEL[e.status]}
                </span>
              </td>
              <td className="px-4 py-3 text-xs text-slate">{e.staff.name}</td>
              <td className="px-4 py-3 text-xs text-slate">
                {formatDate(e.createdAt.toISOString())}
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-1.5">
                  <Link
                    href={`/admin/enrollments/${e.id}`}
                    className="inline-flex items-center rounded-full border border-ink/10 px-2.5 py-1 text-xs font-semibold text-slate transition hover:border-ink/30"
                  >
                    상세
                  </Link>
                  <Link
                    href={`/admin/enrollments/${e.id}/card`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center rounded-full border border-forest/20 px-2.5 py-1 text-xs font-semibold text-forest transition hover:border-forest/50"
                  >
                    수강증
                  </Link>
                </div>
              </td>
            </tr>
            {/* 휴원 기록 */}
            {e.leaveRecords.map((leave) => (
              <tr key={`leave-${leave.id}`} className="bg-amber-50/50">
                <td
                  colSpan={8}
                  className="px-4 py-2 text-xs text-slate"
                >
                  <span className="mr-2 inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-semibold text-amber-700">
                    휴원
                  </span>
                  {formatDate(leave.leaveDate.toISOString())} ~{" "}
                  {leave.returnDate
                    ? formatDate(leave.returnDate.toISOString())
                    : "복귀 전"}
                  {leave.reason ? ` · ${leave.reason}` : ""}
                </td>
              </tr>
            ))}
          </>
        ))}
      </tbody>
    </table>
  );
}
