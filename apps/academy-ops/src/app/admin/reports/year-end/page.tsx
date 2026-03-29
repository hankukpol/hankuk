import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { PrintButton } from "@/components/ui/print-button";
import { requireAdminContext } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { withPrismaReadRetry } from "@/lib/prisma";
import { getYearEndReport } from "@/lib/analytics/year-end-report";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: {
    year?: string | string[];
  };
};

const PAYMENT_CATEGORY_LABEL: Record<string, string> = {
  TUITION: "수강료",
  FACILITY: "시설비",
  TEXTBOOK: "교재",
  MATERIAL: "교구·소모품",
  SINGLE_COURSE: "단과 POS",
  PENALTY: "위약금",
  ETC: "기타",
};

const ENROLLMENT_STATUS_LABEL: Record<string, string> = {
  PENDING: "대기",
  ACTIVE: "수강 중",
  WAITING: "대기자",
  SUSPENDED: "정지",
  COMPLETED: "수강 완료",
  WITHDRAWN: "중도 퇴원",
  CANCELLED: "취소",
};

const ENROLLMENT_STATUS_COLOR: Record<string, string> = {
  PENDING: "border-amber-200 bg-amber-50 text-amber-700",
  ACTIVE: "border-forest/20 bg-forest/10 text-forest",
  WAITING: "border-sky-200 bg-sky-50 text-sky-700",
  SUSPENDED: "border-purple-200 bg-purple-50 text-purple-700",
  COMPLETED: "border-ink/10 bg-mist text-slate",
  WITHDRAWN: "border-red-200 bg-red-50 text-red-700",
  CANCELLED: "border-red-200 bg-red-50 text-red-700",
};

const EXAM_CATEGORY_LABEL: Record<string, string> = {
  GONGCHAE: "공채",
  GYEONGCHAE: "경채",
  SOGANG: "소강",
  CUSTOM: "기타",
};

const SPECIAL_LECTURE_TYPE_LABEL: Record<string, string> = {
  THEMED: "테마 특강",
  SINGLE: "단과",
  INTERVIEW_COACHING: "면접 코칭",
};

function parseYearParam(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !/^\d{4}$/.test(raw)) {
    return new Date().getFullYear();
  }
  return Number(raw);
}

function formatKRW(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

function formatCompactKRW(value: number) {
  if (Math.abs(value) >= 100_000_000) {
    return `${(value / 100_000_000).toFixed(1)}억원`;
  }
  if (Math.abs(value) >= 10_000) {
    return `${Math.round(value / 10_000).toLocaleString("ko-KR")}만원`;
  }
  return formatKRW(value);
}

function formatMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-");
  return `${year}.${month}`;
}

function KpiCard({
  label,
  value,
  note,
  tone = "default",
}: {
  label: string;
  value: string;
  note: string;
  tone?: "default" | "ember" | "forest" | "red";
}) {
  const toneClass =
    tone === "ember"
      ? "border-ember/20 bg-ember/5"
      : tone === "forest"
        ? "border-forest/20 bg-forest/5"
        : tone === "red"
          ? "border-red-200 bg-red-50"
          : "border-ink/10 bg-white";

  return (
    <article className={`rounded-[24px] border p-5 shadow-sm ${toneClass}`}>
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate">{label}</p>
      <p className="mt-3 text-2xl font-semibold text-ink">{value}</p>
      <p className="mt-2 text-xs text-slate">{note}</p>
    </article>
  );
}

export default async function YearEndReportPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.MANAGER);

  const year = parseYearParam(searchParams?.year);
  const data = await withPrismaReadRetry(() => getYearEndReport(year));
  const maxCollectedRevenue = Math.max(
    1,
    ...data.monthlyRows.map((row) => Math.max(0, row.collectedNetRevenue)),
  );
  const maxCategoryRevenue = Math.max(
    1,
    ...data.categoryRows.map((row) => Math.max(0, row.collectedNetAmount)),
  );
  const maxCohortRevenue = Math.max(
    1,
    ...data.cohortRows.map((row) => Math.max(0, row.revenue)),
  );

  const prevYear = year - 1;
  const nextYear = year + 1;
  const currentYear = new Date().getFullYear();

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        연간 보고서
      </div>

      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-ink">연간 실적 보고서</h1>
          <p className="mt-3 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            {year}년 수납, 환불, 신규 등록, 기수 운영, 특강 매출, 주요 등록 학생을 원장/관리자
            시선으로 한 번에 보는 결산형 보고서입니다.
          </p>
        </div>

        <div className="no-print flex flex-wrap gap-2">
          <Link
            href={`/admin/reports/year-end?year=${prevYear}`}
            className="inline-flex items-center rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink"
          >
            ← {prevYear}
          </Link>
          {year !== currentYear ? (
            <Link
              href={`/admin/reports/year-end?year=${currentYear}`}
              className="inline-flex items-center rounded-full border border-ember/20 bg-ember/5 px-4 py-2 text-sm font-medium text-ember transition hover:border-ember/40 hover:bg-ember/10"
            >
              올해
            </Link>
          ) : null}
          <Link
            href={`/admin/reports/year-end?year=${nextYear}`}
            className="inline-flex items-center rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink"
          >
            {nextYear} →
          </Link>
          <Link
            href={`/admin/reports/annual?year=${year}`}
            className="inline-flex items-center rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink"
          >
            기존 연간 보고서
          </Link>
          <Link
            href="/admin/reports"
            className="inline-flex items-center rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink"
          >
            보고서 허브
          </Link>
          <PrintButton
            label="인쇄"
            className="inline-flex items-center rounded-full border border-forest/20 bg-forest/5 px-4 py-2 text-sm font-medium text-forest transition hover:border-forest/40 hover:bg-forest/10"
          />
        </div>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="실수납"
          value={formatCompactKRW(data.summary.totalCollectedNetRevenue)}
          note={`승인 수납 ${formatCompactKRW(data.summary.totalApprovedNetRevenue)} · 환불 ${formatCompactKRW(data.summary.totalRefundAmount)}`}
          tone="ember"
        />
        <KpiCard
          label="신규 등록"
          value={`${data.summary.newEnrollmentCount.toLocaleString("ko-KR")}건`}
          note={`중도 이탈 ${data.summary.withdrawnEnrollmentCount.toLocaleString("ko-KR")}건`}
          tone="forest"
        />
        <KpiCard
          label="현재 재원"
          value={`${data.summary.currentActiveEnrollmentCount.toLocaleString("ko-KR")}명`}
          note={`할인 적용 ${formatCompactKRW(data.summary.totalDiscountAmount)}`}
        />
        <KpiCard
          label="특강 매출"
          value={formatCompactKRW(data.summary.specialLectureRevenue)}
          note={`미지급 정산 ${formatCompactKRW(data.summary.pendingSpecialLectureSettlementAmount)}`}
          tone="forest"
        />
        <KpiCard
          label="필기 합격"
          value={`${data.summary.writtenPassCount.toLocaleString("ko-KR")}명`}
          note={`최종 합격 ${data.summary.finalPassCount.toLocaleString("ko-KR")}명`}
        />
        <KpiCard
          label="총 승인 결제"
          value={`${data.summary.paymentCount.toLocaleString("ko-KR")}건`}
          note={`총수납 ${formatCompactKRW(data.summary.totalGrossRevenue)}`}
        />
        <KpiCard
          label="환불 규모"
          value={formatCompactKRW(data.summary.totalRefundAmount)}
          note="연간 완료 환불 기준"
          tone="red"
        />
        <KpiCard
          label="등록 유지력"
          value={
            data.summary.newEnrollmentCount > 0
              ? `${Math.max(
                  0,
                  Math.round(
                    ((data.summary.newEnrollmentCount - data.summary.withdrawnEnrollmentCount) /
                      data.summary.newEnrollmentCount) *
                      100,
                  ),
                )}%`
              : "-"
          }
          note="신규 등록 대비 중도 이탈 반영"
        />
      </div>

      <div className="mt-4 rounded-[24px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
        특강 미지급 정산 예정액 {formatKRW(data.summary.pendingSpecialLectureSettlementAmount)}
        <span className="ml-3 text-amber-700/80">
          연간 실수납 {formatKRW(data.summary.totalCollectedNetRevenue)} 대비 비중을 함께 확인하세요.
        </span>
      </div>

      <section className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-ink">월별 실적 흐름</h2>
            <p className="mt-1 text-sm text-slate">
              월별 실수납, 신규 등록, 중도 이탈, 특강 매출, 합격 지표를 함께 확인합니다.
            </p>
          </div>
          <Link href="/admin/reports/monthly" className="text-sm text-slate hover:text-ember">
            월간 보고서 →
          </Link>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {data.monthlyRows.map((row) => {
            const width = Math.round((Math.max(0, row.collectedNetRevenue) / maxCollectedRevenue) * 100);
            return (
              <article key={row.monthKey} className="rounded-[22px] border border-ink/10 bg-mist/50 p-4">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-semibold text-ink">{formatMonthLabel(row.monthKey)}</span>
                  <span className="text-slate">
                    실수납 {formatCompactKRW(row.collectedNetRevenue)} · 신규 {row.newEnrollments}건
                  </span>
                </div>
                <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-ink/10">
                  <div className="h-full rounded-full bg-ember" style={{ width: `${width}%` }} />
                </div>
                <div className="mt-3 grid gap-2 text-xs text-slate sm:grid-cols-2 xl:grid-cols-3">
                  <span>승인 수납 {formatCompactKRW(row.approvedNetRevenue)}</span>
                  <span>환불 {formatCompactKRW(row.refundTotal)}</span>
                  <span>특강 매출 {formatCompactKRW(row.specialLectureRevenue)}</span>
                  <span>중도 이탈 {row.withdrawnEnrollments}건</span>
                  <span>필기 합격 {row.writtenPasses}명</span>
                  <span>최종 합격 {row.finalPasses}명</span>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <section className="rounded-[28px] border border-ink/10 bg-white p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-ink">유형별 수납 구성</h2>
              <p className="mt-1 text-sm text-slate">수납 카테고리별 승인 금액, 환불, 실수납을 정리했습니다.</p>
            </div>
            <Link href="/admin/analytics/revenue" className="text-sm text-slate hover:text-ember">
              수납 분석 →
            </Link>
          </div>

          <div className="mt-5 space-y-4">
            {data.categoryRows.map((row) => {
              const width = Math.round((Math.max(0, row.collectedNetAmount) / maxCategoryRevenue) * 100);
              return (
                <article key={row.category}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium text-ink">{PAYMENT_CATEGORY_LABEL[row.category] ?? row.category}</span>
                    <span className="text-slate">
                      실수납 {formatCompactKRW(row.collectedNetAmount)} · {row.paymentCount}건
                    </span>
                  </div>
                  <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-ink/10">
                    <div className="h-full rounded-full bg-forest" style={{ width: `${width}%` }} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate">
                    <span>총수납 {formatCompactKRW(row.approvedNetAmount)}</span>
                    <span>환불 {formatCompactKRW(row.refundAmount)}</span>
                    <span>할인 {formatCompactKRW(row.discountAmount)}</span>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="rounded-[28px] border border-ink/10 bg-white p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-ink">기수별 등록 랭킹</h2>
              <p className="mt-1 text-sm text-slate">연간 신규 등록 기준 상위 기수의 매출과 운영 학생 수입니다.</p>
            </div>
            <Link href="/admin/cohorts" className="text-sm text-slate hover:text-ember">
              기수 관리 →
            </Link>
          </div>

          <div className="mt-5 space-y-4">
            {data.cohortRows.length === 0 ? (
              <div className="rounded-[20px] border border-dashed border-ink/10 px-4 py-8 text-center text-sm text-slate">
                연간 등록 기수 데이터가 없습니다.
              </div>
            ) : (
              data.cohortRows.map((row, index) => {
                const width = Math.round((Math.max(0, row.revenue) / maxCohortRevenue) * 100);
                return (
                  <article key={row.cohortId} className="rounded-[22px] border border-ink/10 bg-mist/50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-ink">
                          {index + 1}. <Link href={`/admin/cohorts/${row.cohortId}`} className="hover:text-ember hover:underline">{row.cohortName}</Link>
                        </p>
                        <p className="mt-1 text-xs text-slate">
                          {EXAM_CATEGORY_LABEL[row.examCategory] ?? row.examCategory} · 등록 {row.enrollCount}건 · 운영 학생 {row.activeCount}명
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-forest">{formatCompactKRW(row.revenue)}</p>
                    </div>
                    <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-ink/10">
                      <div className="h-full rounded-full bg-ember" style={{ width: `${width}%` }} />
                    </div>
                    <p className="mt-2 text-xs text-slate">건당 평균 {formatCompactKRW(row.averageRevenue)}</p>
                  </article>
                );
              })
            )}
          </div>
        </section>
      </div>

      <section className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-ink">특강 매출 랭킹</h2>
            <p className="mt-1 text-sm text-slate">특강별 매출과 미지급 정산 예정액을 연말 결산 관점으로 정리했습니다.</p>
          </div>
          <Link href="/admin/analytics/special-lecture-revenue" className="text-sm text-slate hover:text-ember">
            특강 매출 분석 →
          </Link>
        </div>

        {data.specialLectureRows.length === 0 ? (
          <div className="mt-6 rounded-[20px] border border-dashed border-ink/10 px-4 py-8 text-center text-sm text-slate">
            연간 특강 매출 데이터가 없습니다.
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full divide-y divide-ink/10 text-sm">
              <thead className="bg-mist/80 text-left">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">특강</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">유형</th>
                  <th className="px-4 py-3 font-semibold">강사</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">등록</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">매출</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">미지급 정산</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">상세</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {data.specialLectureRows.map((row) => (
                  <tr key={row.lectureId}>
                    <td className="px-4 py-4">
                      <Link
                        href={`/admin/settings/special-lectures/${row.lectureId}/revenue`}
                        className="font-semibold text-forest hover:underline"
                      >
                        {row.lectureName}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-slate">
                      {SPECIAL_LECTURE_TYPE_LABEL[row.lectureType] ?? row.lectureType}
                    </td>
                    <td className="px-4 py-4 text-slate">{row.instructorNames.join(", ") || "-"}</td>
                    <td className="whitespace-nowrap px-4 py-4 text-ink">
                      {row.enrollCount}건 / {row.activeStudentCount}명
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 font-semibold text-ink">
                      {formatKRW(row.revenue)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-amber-700">
                      {row.pendingSettlementAmount > 0 ? formatKRW(row.pendingSettlementAmount) : "-"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4">
                      <Link
                        href={`/admin/settings/special-lectures/${row.lectureId}/revenue`}
                        className="text-sm text-slate hover:text-ember"
                      >
                        상세 →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-ink">연간 주요 등록 학생</h2>
            <p className="mt-1 text-sm text-slate">학생 4대 데이터 기준으로 올해 등록 규모가 큰 학생을 함께 봅니다.</p>
          </div>
          <Link href="/admin/students" className="text-sm text-slate hover:text-ember">
            학생 목록 →
          </Link>
        </div>

        {data.studentRows.length === 0 ? (
          <div className="mt-6 rounded-[20px] border border-dashed border-ink/10 px-4 py-8 text-center text-sm text-slate">
            연간 등록 학생 데이터가 없습니다.
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full divide-y divide-ink/10 text-sm">
              <thead className="bg-mist/80 text-left">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">학생</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">연락처</th>
                  <th className="px-4 py-3 font-semibold">수강내역</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">연간 등록금</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">최근 등록일</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {data.studentRows.map((row) => (
                  <tr key={row.examNumber} className="align-top">
                    <td className="whitespace-nowrap px-4 py-4">
                      <div className="flex flex-col">
                        <Link
                          href={`/admin/students/${row.examNumber}`}
                          className="font-semibold text-forest hover:underline"
                        >
                          {row.name}
                        </Link>
                        <Link
                          href={`/admin/students/${row.examNumber}`}
                          className="text-xs text-slate hover:text-forest hover:underline"
                        >
                          {row.examNumber}
                        </Link>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-slate">{row.mobile ?? "-"}</td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-2">
                        {row.enrollments.map((enrollment) => (
                          <Link
                            key={enrollment.id}
                            href={`/admin/enrollments/${enrollment.id}`}
                            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition hover:border-ink/30 ${ENROLLMENT_STATUS_COLOR[enrollment.status] ?? "border-ink/10 bg-mist text-slate"}`}
                          >
                            {enrollment.name} · {ENROLLMENT_STATUS_LABEL[enrollment.status] ?? enrollment.status}
                          </Link>
                        ))}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 font-semibold text-ink">
                      {formatKRW(row.totalRegisteredAmount)}
                      <p className="mt-1 text-xs font-normal text-slate">등록 {row.enrollmentCount}건</p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-slate">{formatDate(row.latestEnrollmentAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>


    </div>
  );
}

