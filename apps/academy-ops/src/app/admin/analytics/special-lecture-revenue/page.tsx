import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { withPrismaReadRetry } from "@/lib/prisma";
import {
  ENROLLMENT_STATUS_COLOR,
  ENROLLMENT_STATUS_LABEL,
  EXAM_CATEGORY_LABEL,
} from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { getSpecialLectureRevenueAnalytics } from "@/lib/analytics/special-lecture-revenue";

export const dynamic = "force-dynamic";

const LECTURE_TYPE_LABEL: Record<string, string> = {
  THEMED: "테마 특강",
  SINGLE: "단과",
  INTERVIEW_COACHING: "면접 코칭",
};

function formatKRW(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

function formatMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-");
  return `${year}.${month}`;
}

export default async function SpecialLectureRevenueAnalyticsPage() {
  await requireAdminContext(AdminRole.MANAGER);

  const data = await withPrismaReadRetry(() => getSpecialLectureRevenueAnalytics());
  const revenueMax = Math.max(1, ...data.monthlyTrend.map((row) => row.revenue));

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        매출 분석
      </div>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-ink">특강 매출 분석</h1>
          <p className="mt-3 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            전체 특강의 등록 매출, 강사 배분 예정액, 학원 수익, 최근 등록 학생을 한 번에 보는
            관리자용 분석 화면입니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/admin/settings/special-lectures"
            className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink"
          >
            특강 설정
          </Link>
          <Link
            href="/admin/special-lectures"
            className="inline-flex items-center rounded-full border border-forest/20 bg-forest/5 px-4 py-2 text-sm font-medium text-forest transition hover:border-forest/40 hover:bg-forest/10"
          >
            특강 현황
          </Link>
        </div>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <KpiCard label="전체 특강" value={`${data.summary.lectureCount}개`} />
        <KpiCard label="운영 중" value={`${data.summary.activeLectureCount}개`} tone="forest" />
        <KpiCard label="등록 인원" value={`${data.summary.totalEnrollments}명`} />
        <KpiCard label="총 매출" value={formatKRW(data.summary.totalRevenue)} tone="ember" />
        <KpiCard label="강사 배분" value={formatKRW(data.summary.totalInstructorShare)} />
        <KpiCard label="학원 수익" value={formatKRW(data.summary.totalAcademyShare)} tone="forest" />
      </div>

      <div className="mt-4 rounded-[24px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
        미지급 정산 {data.summary.pendingSettlementCount}건 · 예정 금액 {formatKRW(data.summary.pendingSettlementAmount)}
        <span className="ml-3 text-amber-700/80">지급 완료 {data.summary.paidSettlementCount}건</span>
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-[28px] border border-ink/10 bg-white p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-ink">월별 특강 매출</h2>
              <p className="mt-1 text-sm text-slate">최근 6개월 등록 기준</p>
            </div>
            <Link href="/admin/analytics/revenue" className="text-sm text-slate hover:text-ember">
              전체 수납 분석 →
            </Link>
          </div>
          <div className="mt-6 space-y-4">
            {data.monthlyTrend.map((row) => {
              const width = Math.round((row.revenue / revenueMax) * 100);
              return (
                <div key={row.monthKey}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-ink">{formatMonthLabel(row.monthKey)}</span>
                    <span className="text-slate">
                      {row.enrollCount}명 · {formatKRW(row.revenue)}
                    </span>
                  </div>
                  <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-ink/10">
                    <div className="h-full rounded-full bg-ember" style={{ width: `${width}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-[28px] border border-ink/10 bg-white p-6">
          <h2 className="text-xl font-semibold text-ink">강사 배분 상위</h2>
          <p className="mt-1 text-sm text-slate">전체 특강 기준 배분 예정액 상위 순</p>
          <div className="mt-5 space-y-3">
            {data.instructorRows.length === 0 ? (
              <div className="rounded-[20px] border border-dashed border-ink/10 px-4 py-8 text-center text-sm text-slate">
                집계 가능한 강사 데이터가 없습니다.
              </div>
            ) : (
              data.instructorRows.slice(0, 8).map((row, index) => (
                <div key={row.instructorId} className="rounded-[20px] border border-ink/10 bg-mist/50 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-ink">
                        {index + 1}. {row.instructorName}
                      </p>
                      <p className="mt-1 text-xs text-slate">
                        강좌 {row.lectureCount}개 · 과목 {row.subjectCount}개
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-ember">{formatKRW(row.totalInstructorShare)}</p>
                      <p className="mt-1 text-xs text-slate">배분 기준 매출 {formatKRW(row.totalRevenue)}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <section className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-ink">강좌별 매출 랭킹</h2>
            <p className="mt-1 text-sm text-slate">강좌별 총매출, 강사 배분, 학원 수익, 미지급 정산을 함께 봅니다.</p>
          </div>
          <span className="inline-flex rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold text-slate">
            총 {data.lectureRows.length}개 강좌
          </span>
        </div>

        {data.lectureRows.length === 0 ? (
          <div className="mt-6 rounded-[20px] border border-dashed border-ink/10 px-4 py-8 text-center text-sm text-slate">
            등록된 특강 매출 데이터가 없습니다.
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full divide-y divide-ink/10 text-sm">
              <thead className="bg-mist/80 text-left">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">강좌명</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">유형</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">기간</th>
                  <th className="px-4 py-3 font-semibold">강사</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">등록</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">총 매출</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">강사 배분</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">학원 수익</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">미지급</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">상세</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {data.lectureRows.map((row) => (
                  <tr key={row.lectureId}>
                    <td className="px-4 py-4">
                      <div className="flex flex-col gap-1">
                        <Link
                          href={`/admin/settings/special-lectures/${row.lectureId}/revenue`}
                          className="font-semibold text-forest hover:underline"
                        >
                          {row.lectureName}
                        </Link>
                        <span className="text-xs text-slate">
                          {row.examCategory
                            ? EXAM_CATEGORY_LABEL[row.examCategory as keyof typeof EXAM_CATEGORY_LABEL] ?? row.examCategory
                            : "직렬 미지정"}
                        </span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-slate">
                      {LECTURE_TYPE_LABEL[row.lectureType] ?? row.lectureType}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-slate">
                      {formatDate(row.startDate)} ~ {formatDate(row.endDate)}
                    </td>
                    <td className="px-4 py-4 text-slate">{row.instructorNames.join(", ")}</td>
                    <td className="whitespace-nowrap px-4 py-4 text-ink">{row.enrollCount}명</td>
                    <td className="whitespace-nowrap px-4 py-4 font-semibold text-ink">
                      {formatKRW(row.totalRevenue)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 font-semibold text-ember">
                      {formatKRW(row.instructorShare)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 font-semibold text-forest">
                      {formatKRW(row.academyShare)}
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
            <h2 className="text-xl font-semibold text-ink">최근 특강 등록 학생</h2>
            <p className="mt-1 text-sm text-slate">학생명, 학번, 연락처, 전체 수강내역을 함께 보여줍니다.</p>
          </div>
          <Link href="/admin/special-lectures" className="text-sm text-slate hover:text-ember">
            특강 현황 →
          </Link>
        </div>

        {data.recentEnrollments.length === 0 ? (
          <div className="mt-6 rounded-[20px] border border-dashed border-ink/10 px-4 py-8 text-center text-sm text-slate">
            최근 특강 등록 학생이 없습니다.
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full divide-y divide-ink/10 text-sm">
              <thead className="bg-mist/80 text-left">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">학생</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">연락처</th>
                  <th className="px-4 py-3 font-semibold">수강내역</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">특강</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">수강료</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">등록일</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {data.recentEnrollments.map((row) => (
                  <tr key={row.enrollmentId} className="align-top">
                    <td className="whitespace-nowrap px-4 py-4">
                      <div className="flex flex-col">
                        <Link
                          href={`/admin/students/${row.examNumber}`}
                          className="font-semibold text-forest hover:underline"
                        >
                          {row.studentName}
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
                            className="rounded-full border border-ink/10 bg-mist px-2.5 py-1 text-xs text-slate transition hover:border-ink/30 hover:text-ink"
                          >
                            {enrollment.name} · {ENROLLMENT_STATUS_LABEL[enrollment.status]}
                          </Link>
                        ))}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4">
                      <Link
                        href={`/admin/settings/special-lectures/${row.lectureId}/revenue`}
                        className="text-ink hover:text-ember hover:underline"
                      >
                        {row.lectureName}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 font-semibold text-ink">
                      {formatKRW(row.finalFee)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-slate">{formatDate(row.createdAt)}</td>
                    <td className="whitespace-nowrap px-4 py-4">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${ENROLLMENT_STATUS_COLOR[row.status]}`}>
                        {ENROLLMENT_STATUS_LABEL[row.status]}
                      </span>
                    </td>
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

function KpiCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "ember" | "forest";
}) {
  const toneClass =
    tone === "ember"
      ? "border-ember/20 bg-ember/5 text-ember"
      : tone === "forest"
        ? "border-forest/20 bg-forest/5 text-forest"
        : "border-ink/10 bg-white text-ink";

  return (
    <article className={`rounded-[24px] border p-5 shadow-sm ${toneClass}`}>
      <p className="text-xs font-medium uppercase tracking-widest text-slate">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </article>
  );
}
