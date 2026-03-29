import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminRole, EnrollmentStatus } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { getCohortAnalytics } from "@/lib/analytics/cohort-analytics";
import {
  ENROLLMENT_STATUS_COLOR,
  ENROLLMENT_STATUS_LABEL,
  EXAM_CATEGORY_LABEL,
} from "@/lib/constants";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

function scoreBandClass(range: string) {
  if (range === "90~100") return "bg-forest";
  if (range === "80~89") return "bg-sky-600";
  if (range === "70~79") return "bg-amber-500";
  if (range === "60~69") return "bg-orange-500";
  if (range === "40~59") return "bg-rose-500";
  return "bg-gray-400";
}

function courseNameOf(item: {
  cohort?: { name: string } | null;
  product?: { name: string } | null;
  specialLecture?: { name: string } | null;
}) {
  return item.cohort?.name ?? item.product?.name ?? item.specialLecture?.name ?? "강좌 미지정";
}

export default async function CohortScoreDistributionPage({ params }: PageProps) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const { id } = await params;
  const prisma = getPrisma();

  const [cohort, analytics] = await Promise.all([
    prisma.cohort.findUnique({
      where: { id },
      include: {
        enrollments: {
          where: {
            status: { in: ["ACTIVE", "COMPLETED", "PENDING", "SUSPENDED"] },
          },
          orderBy: [{ createdAt: "asc" }],
          select: {
            id: true,
            examNumber: true,
            status: true,
            student: {
              select: {
                name: true,
                phone: true,
                courseEnrollments: {
                  orderBy: [{ createdAt: "desc" }],
                  select: {
                    id: true,
                    status: true,
                    cohort: { select: { name: true } },
                    product: { select: { name: true } },
                    specialLecture: { select: { name: true } },
                  },
                },
              },
            },
          },
        },
      },
    }),
    getCohortAnalytics(id),
  ]);

  if (!cohort) notFound();

  const detailsByExamNumber = new Map<
    string,
    {
      name: string;
      phone: string | null;
      enrollmentStatus: EnrollmentStatus;
      enrollmentList: Array<{
        id: string;
        name: string;
        status: EnrollmentStatus;
      }>;
    }
  >();

  for (const enrollment of cohort.enrollments) {
    if (!detailsByExamNumber.has(enrollment.examNumber)) {
      detailsByExamNumber.set(enrollment.examNumber, {
        name: enrollment.student?.name ?? "-",
        phone: enrollment.student?.phone ?? null,
        enrollmentStatus: enrollment.status,
        enrollmentList:
          enrollment.student?.courseEnrollments.map((item) => ({
            id: item.id,
            name: courseNameOf(item),
            status: item.status,
          })) ?? [],
      });
    }
  }

  const scoredCount = analytics.students.filter((student) => student.avgScore !== null).length;
  const maxDistributionCount = Math.max(
    1,
    ...analytics.scoreDistribution.map((item) => item.count),
  );
  const examCategoryLabel =
    EXAM_CATEGORY_LABEL[cohort.examCategory as keyof typeof EXAM_CATEGORY_LABEL] ??
    cohort.examCategory;

  return (
    <div className="p-8 sm:p-10">
      <div className="flex flex-wrap items-center gap-2 text-sm text-slate">
        <Link href="/admin/cohorts" className="transition hover:text-ink">
          기수 현황
        </Link>
        <span className="text-slate/40">/</span>
        <Link href={`/admin/cohorts/${cohort.id}`} className="transition hover:text-ink">
          {cohort.name}
        </Link>
        <span className="text-slate/40">/</span>
        <span className="text-ink">성적 분포</span>
      </div>

      <div className="mt-4">
        <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
          성적 관리 · 기수 분포
        </div>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-ink">{cohort.name} 성적 분포</h1>
            <p className="mt-2 text-sm text-slate">
              기수 기간 내 시험 결과를 기준으로 평균 점수, 합격권 비율, 출석률, 학생별 분포를
              확인합니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/admin/cohorts/${cohort.id}`}
              className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink"
            >
              기수 상세
            </Link>
            <Link
              href="/admin/results/distribution"
              className="inline-flex items-center rounded-full border border-forest/20 bg-forest/5 px-4 py-2 text-sm font-medium text-forest transition hover:border-forest/40 hover:bg-forest/10"
            >
              전체 분포 분석
            </Link>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
        <div className="grid gap-4 md:grid-cols-4">
          <div>
            <p className="text-xs font-medium text-slate">기수 구분</p>
            <p className="mt-1 text-sm font-semibold text-ink">{examCategoryLabel}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate">분석 기간</p>
            <p className="mt-1 text-sm font-semibold text-ink">
              {formatDate(cohort.startDate)} ~ {formatDate(cohort.endDate)}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate">집계 학생</p>
            <p className="mt-1 text-sm font-semibold text-ink">{analytics.totalEnrolled}명</p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate">점수 보유 학생</p>
            <p className="mt-1 text-sm font-semibold text-ink">{scoredCount}명</p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <article className="rounded-[20px] border border-ink/10 bg-white p-4">
          <p className="text-xs font-medium text-slate">총 재원</p>
          <p className="mt-1 text-2xl font-bold text-ink tabular-nums">
            {analytics.totalEnrolled}
          </p>
        </article>
        <article className="rounded-[20px] border border-forest/20 bg-forest/5 p-4">
          <p className="text-xs font-medium text-forest">활성/신청</p>
          <p className="mt-1 text-2xl font-bold text-forest tabular-nums">
            {analytics.activeCount}
          </p>
        </article>
        <article className="rounded-[20px] border border-sky-200 bg-sky-50 p-4">
          <p className="text-xs font-medium text-sky-700">평균 점수</p>
          <p className="mt-1 text-2xl font-bold text-sky-700 tabular-nums">
            {analytics.avgScore !== null ? `${analytics.avgScore}점` : "-"}
          </p>
        </article>
        <article className="rounded-[20px] border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-medium text-amber-700">합격권 비율</p>
          <p className="mt-1 text-2xl font-bold text-amber-700 tabular-nums">
            {analytics.passRate}%
          </p>
        </article>
        <article className="rounded-[20px] border border-purple-200 bg-purple-50 p-4">
          <p className="text-xs font-medium text-purple-700">출석률</p>
          <p className="mt-1 text-2xl font-bold text-purple-700 tabular-nums">
            {analytics.attendanceRate}%
          </p>
        </article>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-[28px] border border-ink/10 bg-white p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-ink">점수 구간 분포</h2>
              <p className="mt-1 text-sm text-slate">
                학생별 평균 점수를 구간화한 분포입니다.
              </p>
            </div>
            <span className="inline-flex rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold text-slate">
              집계 {scoredCount}명
            </span>
          </div>

          <div className="mt-6 space-y-4">
            {analytics.scoreDistribution.map((item) => {
              const ratioByMax = Math.round((item.count / maxDistributionCount) * 100);
              const share = scoredCount === 0 ? 0 : Math.round((item.count / scoredCount) * 100);
              return (
                <div key={item.range}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-ink">{item.range}점</span>
                    <span className="text-slate">
                      {item.count}명 · {share}%
                    </span>
                  </div>
                  <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-ink/10">
                    <div
                      className={`h-full rounded-full ${scoreBandClass(item.range)}`}
                      style={{ width: `${ratioByMax}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-[28px] border border-ink/10 bg-white p-6">
          <h2 className="text-xl font-semibold text-ink">해석 메모</h2>
          <div className="mt-5 space-y-3 text-sm text-slate">
            <div className="rounded-[20px] border border-ink/10 bg-mist/60 p-4">
              <p className="font-semibold text-ink">평균 점수</p>
              <p className="mt-1">
                {analytics.avgScore !== null
                  ? `${analytics.avgScore}점으로 집계되었습니다. 평균은 학생별 기수 기간 평균 점수 기준입니다.`
                  : "아직 집계 가능한 점수 데이터가 없어 평균 점수를 산출하지 못했습니다."}
              </p>
            </div>
            <div className="rounded-[20px] border border-ink/10 bg-mist/60 p-4">
              <p className="font-semibold text-ink">합격권 비율</p>
              <p className="mt-1">
                평균 점수 80점 이상 학생 비중은 {analytics.passRate}%입니다. 기수 운영 판단 시
                상담·보강 대상과 상위권 관리를 함께 볼 수 있습니다.
              </p>
            </div>
            <div className="rounded-[20px] border border-ink/10 bg-mist/60 p-4">
              <p className="font-semibold text-ink">학생 기본 정보 표시</p>
              <p className="mt-1">
                아래 표는 학생명, 학번, 연락처, 전체 수강내역을 모두 포함해 운영 문서 기준에 맞춰
                구성했습니다.
              </p>
            </div>
          </div>
        </section>
      </div>

      <div className="mt-8">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-ink">학생별 상세</h2>
          <p className="mt-1 text-sm text-slate">
            학생명과 학번을 클릭하면 학생 상세 페이지로 이동합니다.
          </p>
        </div>

        {analytics.students.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-ink/10 bg-white p-10 text-center text-sm text-slate">
            아직 이 기수에 표시할 학생 데이터가 없습니다.
          </div>
        ) : (
          <div className="overflow-hidden rounded-[28px] border border-ink/10 bg-white">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-ink/10 text-sm">
                <thead className="bg-mist/80 text-left">
                  <tr>
                    <th className="whitespace-nowrap px-4 py-3 font-semibold">순위</th>
                    <th className="whitespace-nowrap px-4 py-3 font-semibold">학생</th>
                    <th className="whitespace-nowrap px-4 py-3 font-semibold">연락처</th>
                    <th className="px-4 py-3 font-semibold">수강내역</th>
                    <th className="whitespace-nowrap px-4 py-3 font-semibold">평균 점수</th>
                    <th className="whitespace-nowrap px-4 py-3 font-semibold">응시/출석</th>
                    <th className="whitespace-nowrap px-4 py-3 font-semibold">출석률</th>
                    <th className="whitespace-nowrap px-4 py-3 font-semibold">상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/10">
                  {analytics.students.map((student, index) => {
                    const detail = detailsByExamNumber.get(student.examNumber);
                    const currentStatus =
                      detail?.enrollmentStatus ??
                      (student.enrollmentStatus as EnrollmentStatus);

                    return (
                      <tr key={`${student.examNumber}-${index}`} className="align-top">
                        <td className="whitespace-nowrap px-4 py-4 text-slate">
                          {student.avgScore !== null ? (
                            <span className="font-semibold text-ink">{index + 1}</span>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-4">
                          <div className="flex flex-col">
                            <Link
                              href={`/admin/students/${student.examNumber}`}
                              className="font-semibold text-forest hover:underline"
                            >
                              {detail?.name ?? student.name}
                            </Link>
                            <Link
                              href={`/admin/students/${student.examNumber}`}
                              className="text-xs text-slate hover:text-forest hover:underline"
                            >
                              {student.examNumber}
                            </Link>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 text-gray-700">
                          {detail?.phone ?? "-"}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex flex-wrap gap-2">
                            {detail?.enrollmentList.length ? (
                              detail.enrollmentList.map((item) => (
                                <Link
                                  key={item.id}
                                  href={`/admin/enrollments/${item.id}`}
                                  className="rounded-full border border-ink/10 bg-mist px-2.5 py-1 text-xs text-slate transition hover:border-ink/30 hover:text-ink"
                                >
                                  {item.name} · {ENROLLMENT_STATUS_LABEL[item.status]}
                                </Link>
                              ))
                            ) : (
                              <span className="text-xs text-slate">수강내역 없음</span>
                            )}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-4">
                          {student.avgScore !== null ? (
                            <span
                              className={`font-semibold tabular-nums ${
                                student.avgScore >= 80 ? "text-forest" : "text-ink"
                              }`}
                            >
                              {student.avgScore}점
                            </span>
                          ) : (
                            <span className="text-slate">미집계</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 text-gray-700">
                          {student.attendedCount} / {student.sessionCount}
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 font-medium tabular-nums text-gray-700">
                          {student.attendanceRate}%
                        </td>
                        <td className="whitespace-nowrap px-4 py-4">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
                              ENROLLMENT_STATUS_COLOR[currentStatus]
                            }`}
                          >
                            {ENROLLMENT_STATUS_LABEL[currentStatus]}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
