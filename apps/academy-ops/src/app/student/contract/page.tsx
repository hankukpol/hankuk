import Link from "next/link";
import { CourseType, EnrollmentStatus } from "@prisma/client";
import { StudentLookupForm } from "@/components/student-portal/student-lookup-form";
import { hasDatabaseConfig } from "@/lib/env";
import { formatDate, formatDateWithWeekday } from "@/lib/format";
import { getPrisma } from "@/lib/prisma";
import { getStudentPortalViewer } from "@/lib/student-portal/service";

export const dynamic = "force-dynamic";

// ─── Label maps ────────────────────────────────────────────────────────────────

const ENROLLMENT_STATUS_LABEL: Record<EnrollmentStatus, string> = {
  PENDING: "대기 중",
  ACTIVE: "수강 중",
  WAITING: "대기자",
  SUSPENDED: "휴원",
  COMPLETED: "수강 완료",
  WITHDRAWN: "자퇴",
  CANCELLED: "취소",
};

const ENROLLMENT_STATUS_COLOR: Record<EnrollmentStatus, string> = {
  PENDING: "border-amber-200 bg-amber-50 text-amber-700",
  ACTIVE: "border-forest/20 bg-forest/10 text-forest",
  WAITING: "border-sky-200 bg-sky-50 text-sky-700",
  SUSPENDED: "border-orange-200 bg-orange-50 text-orange-700",
  COMPLETED: "border-ink/10 bg-mist text-slate",
  WITHDRAWN: "border-red-200 bg-red-50 text-red-700",
  CANCELLED: "border-ink/10 bg-mist text-slate",
};

const COURSE_TYPE_LABEL: Record<CourseType, string> = {
  COMPREHENSIVE: "종합반",
  SPECIAL_LECTURE: "특강",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatAmount(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type ContractItem = { label: string; amount: number };

// ─── Data fetching ─────────────────────────────────────────────────────────────

async function fetchContractData(examNumber: string) {
  const prisma = getPrisma();

  const enrollments = await prisma.courseEnrollment.findMany({
    where: { examNumber },
    orderBy: [{ createdAt: "desc" }],
    include: {
      product: {
        select: { id: true, name: true, examCategory: true },
      },
      cohort: {
        select: { id: true, name: true, startDate: true, endDate: true },
      },
      specialLecture: {
        select: { id: true, name: true, startDate: true, endDate: true },
      },
      contract: {
        select: {
          id: true,
          items: true,
          note: true,
          issuedAt: true,
          printedAt: true,
        },
      },
    },
  });

  return enrollments;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function StudentContractPage() {
  if (!hasDatabaseConfig()) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
              Contract Unavailable
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              수강계약서는 DB 연결 후 사용할 수 있습니다.
            </h1>
            <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
              현재 환경에는 계약서 데이터를 불러올 데이터베이스가 연결되어 있지 않습니다.
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
        </div>
      </main>
    );
  }

  const viewer = await getStudentPortalViewer();

  if (!viewer) {
    return (
      <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
            <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
              수강계약서
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
              수강계약서는 로그인 후 확인할 수 있습니다.
            </h1>
            <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
              학생 포털에 로그인하면 수강 등록 시 발행된 계약서를 확인할 수 있습니다.
            </p>
          </section>

          <StudentLookupForm redirectPath="/student/contract" />
        </div>
      </main>
    );
  }

  const enrollments = await fetchContractData(viewer.examNumber);

  // Count enrollments that have a contract
  const contractCount = enrollments.filter((e) => e.contract !== null).length;

  return (
    <main className="min-h-screen bg-mist px-4 py-6 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">

        {/* ── Header ── */}
        <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
                Course Contract
              </div>
              <h1 className="mt-5 text-3xl font-semibold leading-tight sm:text-5xl">
                {viewer.name}의 수강계약서
              </h1>
              <p className="mt-5 text-sm leading-8 text-slate sm:text-base">
                수강 등록 시 발행된 계약서를 확인할 수 있습니다.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/student"
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                포털로 돌아가기
              </Link>
              <Link
                href="/student/enrollment"
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                수강 정보 보기
              </Link>
            </div>
          </div>

          {/* KPI cards */}
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
              <p className="text-sm text-slate">총 수강 등록</p>
              <p className="mt-3 text-2xl font-bold text-ink">
                {enrollments.length}건
              </p>
            </article>
            <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
              <p className="text-sm text-slate">계약서 발행</p>
              <p className="mt-3 text-2xl font-bold text-forest">
                {contractCount}건
              </p>
            </article>
            <article className="rounded-[24px] border border-ink/10 bg-mist p-4">
              <p className="text-sm text-slate">계약서 미발행</p>
              <p
                className={`mt-3 text-2xl font-bold ${
                  enrollments.length - contractCount > 0 ? "text-amber-600" : "text-slate"
                }`}
              >
                {enrollments.length - contractCount}건
              </p>
            </article>
          </div>
        </section>

        {/* ── Contract list ── */}
        {enrollments.length === 0 ? (
          <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
            <h2 className="text-xl font-semibold">수강계약서 목록</h2>
            <div className="mt-6 rounded-[24px] border border-dashed border-ink/10 p-8 text-center text-sm text-slate">
              등록된 수강 내역이 없습니다.
            </div>
          </section>
        ) : (
          <section className="rounded-[28px] border border-ink/10 bg-white p-5 sm:p-6">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">수강계약서 목록</h2>
                <p className="mt-2 text-sm leading-7 text-slate">
                  전체 {enrollments.length}건의 수강 등록 내역입니다.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {enrollments.map((enrollment) => {
                const contract = enrollment.contract;
                const courseName =
                  enrollment.courseType === CourseType.COMPREHENSIVE
                    ? enrollment.product?.name ?? "종합반"
                    : enrollment.specialLecture?.name ?? "특강";
                const courseLabel = COURSE_TYPE_LABEL[enrollment.courseType];
                const cohortName = enrollment.cohort?.name ?? null;

                // Parse contract items from JSON
                let contractItems: ContractItem[] = [];
                if (contract?.items) {
                  try {
                    const parsed = contract.items as unknown;
                    if (Array.isArray(parsed)) {
                      contractItems = parsed as ContractItem[];
                    }
                  } catch {
                    contractItems = [];
                  }
                }

                return (
                  <article
                    key={enrollment.id}
                    className="rounded-[24px] border border-ink/10 p-5"
                  >
                    {/* Enrollment header */}
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold text-slate">
                            {courseLabel}
                          </span>
                          <span
                            className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${ENROLLMENT_STATUS_COLOR[enrollment.status]}`}
                          >
                            {ENROLLMENT_STATUS_LABEL[enrollment.status]}
                          </span>
                          {/* Contract badge */}
                          {contract ? (
                            <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold text-forest">
                              발행완료
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold text-slate">
                              미발행
                            </span>
                          )}
                        </div>
                        <p className="mt-3 text-lg font-semibold">
                          {courseName}
                          {cohortName ? ` · ${cohortName}기` : ""}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-4 text-sm text-slate">
                          <span>
                            수강료:{" "}
                            <span className="font-semibold text-ink">
                              {formatAmount(enrollment.finalFee)}
                            </span>
                            {enrollment.discountAmount > 0 && (
                              <span className="ml-1 text-ember">
                                (할인 {formatAmount(enrollment.discountAmount)})
                              </span>
                            )}
                          </span>
                          <span>
                            등록일:{" "}
                            <span className="font-semibold text-ink">
                              {formatDateWithWeekday(enrollment.createdAt)}
                            </span>
                          </span>
                          {enrollment.startDate && (
                            <span>
                              수강 시작:{" "}
                              <span className="font-semibold text-ink">
                                {formatDate(enrollment.startDate)}
                              </span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Contract view buttons */}
                      <div className="flex flex-shrink-0 flex-wrap gap-2">
                        <Link
                          href={`/student/contract/${enrollment.id}`}
                          className="inline-flex items-center gap-1.5 rounded-full border border-forest/30 bg-forest/5 px-4 py-2 text-sm font-semibold text-forest transition hover:bg-forest/10"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            className="h-4 w-4"
                          >
                            <path
                              fillRule="evenodd"
                              d="M4 4a2 2 0 0 1 2-2h4.586A2 2 0 0 1 12 2.586L15.414 6A2 2 0 0 1 16 7.414V16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4Zm2 6a.75.75 0 0 1 .75-.75h6.5a.75.75 0 0 1 0 1.5h-6.5A.75.75 0 0 1 6 10Zm.75 2.25a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Z"
                              clipRule="evenodd"
                            />
                          </svg>
                          상세 보기
                        </Link>
                        {contract && (
                          <Link
                            href={`/admin/enrollments/${enrollment.id}/contract`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-full border border-ember/30 bg-ember/5 px-4 py-2 text-sm font-semibold text-ember transition hover:bg-ember/10"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                              className="h-4 w-4"
                            >
                              <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
                              <path
                                fillRule="evenodd"
                                d="M.664 10.59a1.651 1.651 0 0 1 0-1.186A10.004 10.004 0 0 1 10 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0 1 10 17c-4.257 0-7.893-2.66-9.336-6.41ZM14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z"
                                clipRule="evenodd"
                              />
                            </svg>
                            계약서 보기
                          </Link>
                        )}
                      </div>
                    </div>

                    {/* Contract detail — issued date / printed date */}
                    {contract && (
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-[20px] border border-ink/10 bg-mist px-4 py-3 text-sm">
                          <p className="text-slate">발행일</p>
                          <p className="mt-1.5 font-semibold">
                            {formatDateWithWeekday(contract.issuedAt)}
                          </p>
                        </div>
                        <div className="rounded-[20px] border border-ink/10 bg-mist px-4 py-3 text-sm">
                          <p className="text-slate">출력일</p>
                          <p className="mt-1.5 font-semibold">
                            {contract.printedAt
                              ? formatDateWithWeekday(contract.printedAt)
                              : "미출력"}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Contract items breakdown */}
                    {contract && contractItems.length > 0 && (
                      <div className="mt-4 overflow-x-auto rounded-[20px] border border-ink/10">
                        <table className="min-w-full divide-y divide-ink/10 text-sm">
                          <thead className="bg-mist/80 text-left">
                            <tr>
                              <th className="px-4 py-3 font-semibold">항목</th>
                              <th className="px-4 py-3 text-right font-semibold">
                                금액
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-ink/10">
                            {contractItems.map((item, idx) => (
                              <tr key={idx}>
                                <td className="px-4 py-3">{item.label}</td>
                                <td className="px-4 py-3 text-right font-semibold">
                                  {formatAmount(item.amount)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="border-t border-ink/10 bg-mist/50">
                            <tr>
                              <td className="px-4 py-3 font-semibold">합계</td>
                              <td className="px-4 py-3 text-right font-bold text-ember">
                                {formatAmount(
                                  contractItems.reduce(
                                    (sum, item) => sum + item.amount,
                                    0,
                                  ),
                                )}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}

                    {/* Note */}
                    {contract?.note && (
                      <div className="mt-4 rounded-[20px] border border-ink/10 bg-white px-4 py-3 text-sm leading-7 text-slate">
                        메모: {contract.note}
                      </div>
                    )}

                    {/* No contract message */}
                    {!contract && (
                      <div className="mt-4 rounded-[20px] border border-dashed border-amber-200 bg-amber-50/50 px-4 py-4 text-sm text-amber-700">
                        <p className="font-semibold">계약서 미발행</p>
                        <p className="mt-1 text-amber-600">
                          이 수강 등록에 대한 계약서가 아직 발행되지 않았습니다.
                          관리사무실에 문의해 주세요.
                        </p>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        )}

      </div>
    </main>
  );
}
