import Link from "next/link";
import {
  AdminRole,
  ExamCategory,
  RefundStatus,
} from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import {
  applyAcademyScope,
  getAdminAcademyScope,
  resolveVisibleAcademyId,
} from "@/lib/academy-scope";
import { EXAM_CATEGORY_LABEL } from "@/lib/constants";

export const dynamic = "force-dynamic";

type SearchParams = {
  year?: string;
  startMonth?: string;
  endMonth?: string;
  examCategory?: string;
  cohortId?: string;
};

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => index + 1);
const SETTLED_REFUND_STATUSES: RefundStatus[] = ["APPROVED", "COMPLETED"];
const ACTIVE_ENROLLMENT_STATUSES = ["ACTIVE", "PENDING", "SUSPENDED"] as const;

const COURSE_TYPE_LABEL: Record<string, string> = {
  COMPREHENSIVE: "종합반",
  SPECIAL_LECTURE: "특강 단과",
};

function formatKRW(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

function parseYear(value: string | undefined) {
  const currentYear = new Date().getFullYear();
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < currentYear - 5 || parsed > currentYear + 1) {
    return currentYear;
  }
  return parsed;
}

function parseMonth(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 12) {
    return fallback;
  }
  return parsed;
}

function parseExamCategory(value: string | undefined): ExamCategory | "ALL" {
  if (!value) return "ALL";
  return Object.values(ExamCategory).includes(value as ExamCategory)
    ? (value as ExamCategory)
    : "ALL";
}

function monthLabel(year: number, month: number) {
  return `${year}년 ${month}월`;
}

function buildRangeLabel(year: number, startMonth: number, endMonth: number) {
  if (startMonth === endMonth) {
    return monthLabel(year, startMonth);
  }
  return `${monthLabel(year, startMonth)} ~ ${monthLabel(year, endMonth)}`;
}

function enrollmentLabel(enrollment: {
  courseType: string;
  cohort: { name: string | null } | null;
  product: { name: string; examCategory: ExamCategory } | null;
  specialLecture: { name: string; examCategory: ExamCategory | null } | null;
}) {
  return (
    enrollment.cohort?.name ??
    enrollment.product?.name ??
    enrollment.specialLecture?.name ??
    COURSE_TYPE_LABEL[enrollment.courseType] ??
    "연결 수강 없음"
  );
}

function resolveEnrollmentExamCategory(enrollment: {
  cohort: { examCategory: ExamCategory } | null;
  product: { examCategory: ExamCategory } | null;
  specialLecture: { examCategory: ExamCategory | null } | null;
} | null) {
  if (!enrollment) return null;
  return (
    enrollment.cohort?.examCategory ??
    enrollment.product?.examCategory ??
    enrollment.specialLecture?.examCategory ??
    null
  );
}

export default async function RefundSettlementPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  await requireAdminContext(AdminRole.MANAGER);

  const today = new Date();
  const year = parseYear(searchParams?.year);
  const requestedStartMonth = parseMonth(searchParams?.startMonth, today.getMonth() + 1);
  const requestedEndMonth = parseMonth(searchParams?.endMonth, requestedStartMonth);
  const startMonth = Math.min(requestedStartMonth, requestedEndMonth);
  const endMonth = Math.max(requestedStartMonth, requestedEndMonth);
  const selectedExamCategory = parseExamCategory(searchParams?.examCategory);
  const selectedCohortId = searchParams?.cohortId?.trim() ? searchParams.cohortId.trim() : "ALL";

  const startDate = new Date(year, startMonth - 1, 1, 0, 0, 0, 0);
  const endDate = new Date(year, endMonth, 0, 23, 59, 59, 999);

  const academyScope = await getAdminAcademyScope();
  const visibleAcademyId = resolveVisibleAcademyId(academyScope);
  const prisma = getPrisma();

  const [cohorts, settledRefunds, pendingRefundCount] = await Promise.all([
    prisma.cohort.findMany({
      where: applyAcademyScope({}, visibleAcademyId),
      orderBy: [{ examCategory: "asc" }, { startDate: "desc" }],
      select: {
        id: true,
        name: true,
        examCategory: true,
      },
    }),
    prisma.refund.findMany({
      where: {
        status: { in: SETTLED_REFUND_STATUSES },
        processedAt: { gte: startDate, lte: endDate },
        ...(visibleAcademyId === null ? {} : { payment: { academyId: visibleAcademyId } }),
      },
      orderBy: [{ processedAt: "desc" }, { createdAt: "desc" }],
      include: {
        payment: {
          select: {
            id: true,
            academyId: true,
            enrollmentId: true,
            examNumber: true,
            netAmount: true,
            grossAmount: true,
            processedAt: true,
            note: true,
            student: {
              select: {
                examNumber: true,
                name: true,
                phone: true,
                courseEnrollments: {
                  where: {
                    ...(visibleAcademyId === null ? {} : { academyId: visibleAcademyId }),
                    status: { in: [...ACTIVE_ENROLLMENT_STATUSES] },
                  },
                  orderBy: [{ createdAt: "desc" }],
                  take: 4,
                  select: {
                    id: true,
                    courseType: true,
                    cohort: { select: { name: true, examCategory: true } },
                    product: { select: { name: true, examCategory: true } },
                    specialLecture: { select: { name: true, examCategory: true } },
                  },
                },
              },
            },
            processor: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    }),
    prisma.refund.count({
      where: {
        status: "PENDING",
        processedAt: { gte: startDate, lte: endDate },
        ...(visibleAcademyId === null ? {} : { payment: { academyId: visibleAcademyId } }),
      },
    }),
  ]);

  const enrollmentIds = Array.from(
    new Set(
      settledRefunds
        .map((refund) => refund.payment.enrollmentId)
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const linkedEnrollments = enrollmentIds.length
    ? await prisma.courseEnrollment.findMany({
        where: applyAcademyScope(
          {
            id: { in: enrollmentIds },
          },
          visibleAcademyId,
        ),
        select: {
          id: true,
          courseType: true,
          status: true,
          finalFee: true,
          cohortId: true,
          cohort: { select: { id: true, name: true, examCategory: true } },
          product: { select: { name: true, examCategory: true } },
          specialLecture: { select: { name: true, examCategory: true } },
        },
      })
    : [];

  const enrollmentMap = new Map(linkedEnrollments.map((enrollment) => [enrollment.id, enrollment]));

  const rows = settledRefunds
    .map((refund) => {
      const linkedEnrollment = refund.payment.enrollmentId
        ? (enrollmentMap.get(refund.payment.enrollmentId) ?? null)
        : null;
      const activeEnrollments = refund.payment.student?.courseEnrollments ?? [];
      const enrollmentCategory =
        resolveEnrollmentExamCategory(linkedEnrollment) ??
        resolveEnrollmentExamCategory(activeEnrollments[0] ?? null);
      const deductionAmount = Math.max(refund.payment.netAmount - refund.amount, 0);

      return {
        refund,
        linkedEnrollment,
        activeEnrollments,
        enrollmentCategory,
        deductionAmount,
      };
    })
    .filter((row) => {
      if (selectedExamCategory !== "ALL" && row.enrollmentCategory !== selectedExamCategory) {
        return false;
      }
      if (selectedCohortId !== "ALL" && row.linkedEnrollment?.cohortId !== selectedCohortId) {
        return false;
      }
      return true;
    });

  const totalPaidAmount = rows.reduce((sum, row) => sum + row.refund.payment.netAmount, 0);
  const totalRefundAmount = rows.reduce((sum, row) => sum + row.refund.amount, 0);
  const totalDeductionAmount = rows.reduce((sum, row) => sum + row.deductionAmount, 0);

  const monthlyBreakdown = MONTH_OPTIONS
    .filter((month) => month >= startMonth && month <= endMonth)
    .map((month) => {
      const monthRows = rows.filter(
        (row) => row.refund.processedAt.getFullYear() === year && row.refund.processedAt.getMonth() + 1 === month,
      );

      return {
        month,
        count: monthRows.length,
        paidAmount: monthRows.reduce((sum, row) => sum + row.refund.payment.netAmount, 0),
        deductionAmount: monthRows.reduce((sum, row) => sum + row.deductionAmount, 0),
        refundAmount: monthRows.reduce((sum, row) => sum + row.refund.amount, 0),
      };
    });

  const filteredCohorts =
    selectedExamCategory === "ALL"
      ? cohorts
      : cohorts.filter((cohort) => cohort.examCategory === selectedExamCategory);

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        수강 관리
      </div>

      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-ink">환불 정산 허브</h1>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-slate">
            현재 코드에 저장된 환불 데이터 기준으로 기간별 환불 금액과 공제액을 정리합니다. 학생 4대 데이터와
            연결 수강 정보를 같이 보여 주도록 맞췄습니다.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/payments/refunds"
            className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-ink/30"
          >
            환불 대기
          </Link>
          <Link
            href="/admin/payments/refund-calculator"
            className="inline-flex items-center gap-2 rounded-full border border-ember/20 bg-ember/10 px-4 py-2 text-sm font-medium text-ember transition hover:border-ember/40 hover:bg-ember/20"
          >
            환불 계산기
          </Link>
          <Link
            href={`/admin/settlements/reconciliation?month=${year}-${String(endMonth).padStart(2, "0")}`}
            className="inline-flex items-center gap-2 rounded-full border border-forest/20 bg-forest/10 px-4 py-2 text-sm font-medium text-forest transition hover:border-forest/40 hover:bg-forest/20"
          >
            월 정산 대조표
          </Link>
        </div>
      </div>

      <form className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
        <div className="grid gap-4 md:grid-cols-5">
          <label className="space-y-2 text-sm">
            <span className="font-medium text-ink">연도</span>
            <select
              name="year"
              defaultValue={String(year)}
              className="w-full rounded-2xl border border-ink/10 px-4 py-3 outline-none transition focus:border-ink/30"
            >
              {Array.from({ length: 6 }, (_, index) => year - 3 + index).map((optionYear) => (
                <option key={optionYear} value={optionYear}>
                  {optionYear}년
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2 text-sm">
            <span className="font-medium text-ink">시작 월</span>
            <select
              name="startMonth"
              defaultValue={String(startMonth)}
              className="w-full rounded-2xl border border-ink/10 px-4 py-3 outline-none transition focus:border-ink/30"
            >
              {MONTH_OPTIONS.map((month) => (
                <option key={`start-${month}`} value={month}>
                  {month}월
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2 text-sm">
            <span className="font-medium text-ink">종료 월</span>
            <select
              name="endMonth"
              defaultValue={String(endMonth)}
              className="w-full rounded-2xl border border-ink/10 px-4 py-3 outline-none transition focus:border-ink/30"
            >
              {MONTH_OPTIONS.map((month) => (
                <option key={`end-${month}`} value={month}>
                  {month}월
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2 text-sm">
            <span className="font-medium text-ink">유형</span>
            <select
              name="examCategory"
              defaultValue={selectedExamCategory}
              className="w-full rounded-2xl border border-ink/10 px-4 py-3 outline-none transition focus:border-ink/30"
            >
              <option value="ALL">전체</option>
              {Object.values(ExamCategory).map((examCategory) => (
                <option key={examCategory} value={examCategory}>
                  {EXAM_CATEGORY_LABEL[examCategory]}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2 text-sm">
            <span className="font-medium text-ink">기수</span>
            <select
              name="cohortId"
              defaultValue={selectedCohortId}
              className="w-full rounded-2xl border border-ink/10 px-4 py-3 outline-none transition focus:border-ink/30"
            >
              <option value="ALL">전체</option>
              {filteredCohorts.map((cohort) => (
                <option key={cohort.id} value={cohort.id}>
                  {cohort.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate">
            집계 범위: <span className="font-semibold text-ink">{buildRangeLabel(year, startMonth, endMonth)}</span>
            {selectedExamCategory !== "ALL" ? (
              <span className="ml-2 text-slate">
                · {EXAM_CATEGORY_LABEL[selectedExamCategory]}
              </span>
            ) : null}
            {selectedCohortId !== "ALL" ? (
              <span className="ml-2 text-slate">
                · {cohorts.find((cohort) => cohort.id === selectedCohortId)?.name ?? "선택 기수"}
              </span>
            ) : null}
          </p>
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-forest"
          >
            필터 적용
          </button>
        </div>
      </form>

      <section className="mt-8 grid gap-4 lg:grid-cols-4">
        <article className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">환불 건수</p>
          <p className="mt-2 text-3xl font-semibold text-ink">{rows.length.toLocaleString()}</p>
          <p className="mt-1 text-xs text-slate">승인 또는 완료 기준</p>
        </article>
        <article className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">원수납액 합계</p>
          <p className="mt-2 text-2xl font-semibold text-ink">{formatKRW(totalPaidAmount)}</p>
          <p className="mt-1 text-xs text-slate">환불이 연결된 결제 기준</p>
        </article>
        <article className="rounded-[28px] border border-amber-200 bg-amber-50 p-6 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-widest text-amber-700">공제액 합계</p>
          <p className="mt-2 text-2xl font-semibold text-amber-800">{formatKRW(totalDeductionAmount)}</p>
          <p className="mt-1 text-xs text-amber-700">원수납액에서 환불액을 제외한 금액</p>
        </article>
        <article className="rounded-[28px] border border-red-200 bg-red-50 p-6 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-widest text-red-600">실환불액 합계</p>
          <p className="mt-2 text-2xl font-semibold text-red-700">{formatKRW(totalRefundAmount)}</p>
          <p className="mt-1 text-xs text-red-600">처리 대기 {pendingRefundCount.toLocaleString()}건 별도</p>
        </article>
      </section>

      <section className="mt-8 grid gap-4 xl:grid-cols-[1.25fr_2fr]">
        <article className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-ink">월별 환불 현황</h2>
              <p className="mt-1 text-sm text-slate">선택한 기간 안에서 월별 환불 흐름을 다시 정리합니다.</p>
            </div>
          </div>

          <div className="mt-5 overflow-hidden rounded-[20px] border border-ink/10">
            <table className="min-w-full divide-y divide-ink/10 text-sm">
              <thead className="bg-mist/80 text-left">
                <tr>
                  <th className="px-4 py-3 font-semibold text-slate">월</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate">건수</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate">원수납액</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate">공제액</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate">환불액</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10 bg-white">
                {monthlyBreakdown.map((row) => (
                  <tr key={`month-${row.month}`}>
                    <td className="px-4 py-3 font-medium text-ink">{row.month}월</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate">{row.count.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate">{formatKRW(row.paidAmount)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-amber-700">{formatKRW(row.deductionAmount)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-red-600">{formatKRW(row.refundAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-ink">환불 정산 목록</h2>
              <p className="mt-1 text-sm text-slate">
                현재 코드에 저장된 환불 레코드와 연결 결제 기준으로 정렬했습니다.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/admin/payments/refunds"
                className="inline-flex items-center rounded-full border border-ink/10 px-3 py-1.5 text-xs font-semibold text-slate transition hover:border-ink/30 hover:text-ink"
              >
                환불 대기 보기
              </Link>
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="mt-5 rounded-[20px] border border-dashed border-ink/10 bg-mist/40 px-6 py-12 text-center text-sm text-slate">
              선택한 조건에 해당하는 환불 정산 내역이 없습니다.
            </div>
          ) : (
            <div className="mt-5 overflow-x-auto rounded-[20px] border border-ink/10">
              <table className="min-w-full divide-y divide-ink/10 text-sm">
                <thead className="bg-mist/80 text-left">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-slate">No.</th>
                    <th className="px-4 py-3 font-semibold text-slate">학생</th>
                    <th className="px-4 py-3 font-semibold text-slate">연결 수강</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate">원수납액</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate">공제액</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate">환불액</th>
                    <th className="px-4 py-3 font-semibold text-slate">환불 사유</th>
                    <th className="px-4 py-3 font-semibold text-slate">처리일</th>
                    <th className="px-4 py-3 font-semibold text-slate">처리자</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/10 bg-white">
                  {rows.map((row, index) => {
                    const student = row.refund.payment.student;
                    const activeEnrollments = row.activeEnrollments.map((enrollment) => enrollmentLabel(enrollment));
                    const linkedCourseLabel = row.linkedEnrollment
                      ? enrollmentLabel(row.linkedEnrollment)
                      : "연결 수강 없음";

                    return (
                      <tr key={row.refund.id} className="align-top hover:bg-mist/30">
                        <td className="px-4 py-4 text-slate">{index + 1}</td>
                        <td className="px-4 py-4">
                          {row.refund.payment.examNumber ? (
                            <Link
                              href={`/admin/students/${row.refund.payment.examNumber}`}
                              className="font-semibold text-ink hover:text-ember"
                            >
                              {student?.name ?? "학생 정보 없음"}
                            </Link>
                          ) : (
                            <span className="font-semibold text-ink">{student?.name ?? "학생 정보 없음"}</span>
                          )}
                          <p className="mt-1 text-xs text-slate">
                            학번: {row.refund.payment.examNumber ?? "없음"}
                          </p>
                          <p className="text-xs text-slate">연락처: {student?.phone ?? "-"}</p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {activeEnrollments.length > 0 ? (
                              activeEnrollments.map((label) => (
                                <span
                                  key={`${row.refund.id}-${label}`}
                                  className="inline-flex rounded-full border border-ink/10 bg-mist px-2 py-0.5 text-[11px] font-medium text-slate"
                                >
                                  {label}
                                </span>
                              ))
                            ) : (
                              <span className="text-[11px] text-slate">현재 수강 없음</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <p className="font-medium text-ink">{linkedCourseLabel}</p>
                          <p className="mt-1 text-xs text-slate">
                            {row.enrollmentCategory ? EXAM_CATEGORY_LABEL[row.enrollmentCategory] : "유형 미지정"}
                            {row.linkedEnrollment ? (
                              <span className="ml-1">
                                · {COURSE_TYPE_LABEL[row.linkedEnrollment.courseType] ?? row.linkedEnrollment.courseType}
                              </span>
                            ) : null}
                          </p>
                          <div className="mt-2">
                            <Link
                              href={`/admin/payments/refunds/${row.refund.id}`}
                              className="text-xs font-semibold text-ember hover:underline"
                            >
                              환불 상세 보기
                            </Link>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-right tabular-nums text-slate">
                          {formatKRW(row.refund.payment.netAmount)}
                        </td>
                        <td className="px-4 py-4 text-right tabular-nums text-amber-700">
                          {formatKRW(row.deductionAmount)}
                        </td>
                        <td className="px-4 py-4 text-right tabular-nums font-semibold text-red-600">
                          {formatKRW(row.refund.amount)}
                        </td>
                        <td className="px-4 py-4 text-slate">
                          <p>{row.refund.reason}</p>
                          <p className="mt-1 text-xs text-slate">
                            상태: {row.refund.status === "COMPLETED" ? "처리 완료" : "승인됨"}
                          </p>
                        </td>
                        <td className="px-4 py-4 text-slate">
                          {row.refund.processedAt.toLocaleDateString("ko-KR")}
                        </td>
                        <td className="px-4 py-4 text-slate">
                          {row.refund.payment.processor.name}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </article>
      </section>
    </div>
  );
}
