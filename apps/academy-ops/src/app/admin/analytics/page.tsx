import { AdminRole, Subject } from "@prisma/client";
import Link from "next/link";
import {
  BarComparisonChart,
  DistributionChart,
  RadarComparisonChart,
  TrendLineChart,
} from "@/components/analytics/charts";
import { GenerationCohortAnalysisPanel } from "@/components/analytics/generation-cohort-analysis";
import { SubjectRankingTable } from "@/components/analytics/subject-ranking-table";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { FilterPresetControls } from "@/components/ui/filter-preset-controls";
import {
  getDailyAnalysis,
  getMonthlyStudentAnalysis,
  getSubjectStudentRanking,
  getSubjectTrendAnalysis,
} from "@/lib/analytics/analysis";
import { getGenerationCohortAnalysis } from "@/lib/analytics/cohort-analysis";
import {
  getAnalyticsContext,
  getDefaultMonthOption,
  getMonthOptions,
  readStringParam,
} from "@/lib/analytics/ui";
import { requireAdminContext } from "@/lib/auth";
import { withPrismaReadRetry } from "@/lib/prisma";
import {
  EXAM_TYPE_LABEL,
  SUBJECT_LABEL,
} from "@/lib/constants";
import { formatDate, todayDateInputValue } from "@/lib/format";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

type AnalyticsTab = "daily" | "monthly" | "subject" | "cohort";

const TAB_LABEL: Record<AnalyticsTab, string> = {
  daily: "\uC77C\uC77C \uBD84\uC11D",
  monthly: "\uC6D4\uAC04 \uBD84\uC11D",
  subject: "\uACFC\uBAA9\uBCC4 \uBD84\uC11D",
  cohort: "\uAE30\uC218 \uBE44\uAD50",
};

function readAnalyticsTab(searchParams: PageProps["searchParams"]): AnalyticsTab {
  const value = readStringParam(searchParams, "tab");
  return value === "monthly" || value === "subject" || value === "cohort" ? value : "daily";
}

function readSubjectParam(searchParams: PageProps["searchParams"]) {
  const value = readStringParam(searchParams, "subject");
  return value && Object.values(Subject).includes(value as Subject)
    ? (value as Subject)
    : undefined;
}

export default async function AdminAnalyticsPage({ searchParams }: PageProps) {
  const [, { periods, selectedPeriod, examType }] = await Promise.all([
    requireAdminContext(AdminRole.VIEWER),
    withPrismaReadRetry(() => getAnalyticsContext(searchParams)),
  ]);
  const tab = readAnalyticsTab(searchParams);
  const legacyDate = readStringParam(searchParams, "date");
  const dateFrom = readStringParam(searchParams, "dateFrom") ?? legacyDate ?? todayDateInputValue();
  const dateTo = readStringParam(searchParams, "dateTo") ?? legacyDate ?? dateFrom;
  const subject = readSubjectParam(searchParams);
  const examNumber = readStringParam(searchParams, "examNumber") ?? "";
  const monthOptions = getMonthOptions(selectedPeriod, examType);
  const monthKey = readStringParam(searchParams, "monthKey") ?? "";
  const selectedMonth =
    monthOptions.find((option) => `${option.year}-${option.month}` === monthKey) ??
    getDefaultMonthOption(monthOptions);

  const [dailyData, monthlyData, subjectData, subjectRanking, cohortData] = await withPrismaReadRetry(() =>
    Promise.all([
      tab === "daily"
        ? getDailyAnalysis({
            periodId: selectedPeriod?.id,
            examType,
            date: legacyDate ?? undefined,
            dateFrom,
            dateTo,
            search: examNumber,
          })
        : Promise.resolve([]),
      tab === "monthly"
        ? getMonthlyStudentAnalysis({
            periodId: selectedPeriod?.id,
            examType,
            year: selectedMonth?.year,
            month: selectedMonth?.month,
            examNumber: examNumber || undefined,
          })
        : Promise.resolve(null),
      tab === "subject"
        ? getSubjectTrendAnalysis({
            periodId: selectedPeriod?.id,
            examType,
            subject,
            examNumber: examNumber || undefined,
          })
        : Promise.resolve([]),
      tab === "subject"
        ? getSubjectStudentRanking({
            periodId: selectedPeriod?.id,
            examType,
            subject,
          })
        : Promise.resolve([]),
      tab === "cohort" && selectedPeriod
        ? getGenerationCohortAnalysis({
            periodId: selectedPeriod.id,
            examType,
          })
        : Promise.resolve(null),
    ]),
  );

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        F-13 Analytics
      </div>
      <h1 className="mt-5 text-3xl font-semibold">성적 분석</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        일일, 월별, 과목별, 개인 분석에 공통으로 쓰이는 관리자용 차트 화면입니다.
      </p>

      <form id="analytics-filter-form" className="mt-8 grid gap-4 rounded-[28px] border border-ink/10 bg-mist p-6 md:grid-cols-6">
        <div>
          <label className="mb-2 block text-sm font-medium">탭</label>
          <select
            name="tab"
            defaultValue={tab}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
          >
            {Object.entries(TAB_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium">시험 기간</label>
          <select
            name="periodId"
            defaultValue={selectedPeriod?.id ? String(selectedPeriod.id) : ""}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
          >
            {periods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium">직렬</label>
          <select
            name="examType"
            defaultValue={examType}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
          >
            <option value="GONGCHAE">{EXAM_TYPE_LABEL.GONGCHAE}</option>
            <option value="GYEONGCHAE">{EXAM_TYPE_LABEL.GYEONGCHAE}</option>
          </select>
        </div>
                <div>
          <label className="mb-2 block text-sm font-medium">날짜 범위</label>
          <DateRangePicker
            fromName="dateFrom"
            toName="dateTo"
            defaultFrom={dateFrom}
            defaultTo={dateTo}
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium">월 선택</label>
          <select
            name="monthKey"
            defaultValue={selectedMonth ? `${selectedMonth.year}-${selectedMonth.month}` : ""}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
          >
            {monthOptions.map((option) => (
              <option key={`${option.year}-${option.month}`} value={`${option.year}-${option.month}`}>
                {option.year}년 {option.month}월
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium">과목 / 수험번호</label>
          <div className="grid gap-2">
            <select
              name="subject"
              defaultValue={subject ?? ""}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            >
              <option value="">과목 선택</option>
              {Object.values(Subject).map((value) => (
                <option key={value} value={value}>
                  {SUBJECT_LABEL[value]}
                </option>
              ))}
            </select>
            <input
              type="text"
              name="examNumber"
              defaultValue={examNumber}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
              placeholder="수험번호 또는 학생 검색"
            />
          </div>
        </div>
        <div className="md:col-span-6 flex flex-wrap items-center justify-between gap-3">
          <FilterPresetControls
            pathname="/admin/analytics"
            storageKey="admin-analytics-filter-presets"
            formId="analytics-filter-form"
            currentFilters={{
              tab,
              periodId: selectedPeriod?.id ? String(selectedPeriod.id) : "",
              examType,
              dateFrom,
              dateTo,
              monthKey: selectedMonth ? `${selectedMonth.year}-${selectedMonth.month}` : "",
              subject: subject ?? "",
              examNumber,
            }}
          />
          <div className="flex justify-end">
          <button
            type="submit"
            className="inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest"
          >
            분석 실행
          </button>
          </div>
        </div>
      </form>

      {tab === "daily" ? (
        <div className="mt-8 space-y-8">
          {dailyData.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-ink/10 p-8 text-sm text-slate">
              날짜를 선택하면 해당 일자의 시험 분석이 표시됩니다.
            </div>
          ) : null}
          {dailyData.map((session) => (
            <section key={session.sessionId} className="rounded-[28px] border border-ink/10 bg-white p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-semibold">{SUBJECT_LABEL[session.subject]}</h2>
                  <p className="mt-3 text-sm leading-7 text-slate">
                    {session.periodName} · {formatDate(session.examDate)} · {session.week}주차
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  <div className="rounded-2xl bg-mist px-4 py-3 text-sm">
                    <div className="text-slate">응시 인원</div>
                    <div className="mt-2 text-lg font-semibold">{session.participantCount}명</div>
                  </div>
                  <div className="rounded-2xl bg-mist px-4 py-3 text-sm">
                    <div className="text-slate">전체 평균</div>
                    <div className="mt-2 text-lg font-semibold">{session.averageScore ?? "-"}</div>
                  </div>
                  <div className="rounded-2xl bg-mist px-4 py-3 text-sm">
                    <div className="text-slate">상위 10%</div>
                    <div className="mt-2 text-lg font-semibold">{session.top10Average ?? "-"}</div>
                  </div>
                  <div className="rounded-2xl bg-mist px-4 py-3 text-sm">
                    <div className="text-slate">상위 30%</div>
                    <div className="mt-2 text-lg font-semibold">{session.top30Average ?? "-"}</div>
                  </div>
                  <div className="rounded-2xl bg-mist px-4 py-3 text-sm">
                    <div className="text-slate">최고점</div>
                    <div className="mt-2 text-lg font-semibold">{session.highestScore ?? "-"}</div>
                  </div>
                </div>
              </div>

              {session.searchedStudent ? (
                <div className="mt-6 rounded-[24px] border border-ember/20 bg-ember/10 p-4 text-sm">
                  <span className="font-semibold">{session.searchedStudent.name}</span> ({session.searchedStudent.examNumber})
                  : 점수 {session.searchedStudent.score ?? "-"} / 석차 {session.searchedStudent.rank ?? "-"}위
                </div>
              ) : null}

              <div className="mt-6 grid gap-6 xl:grid-cols-2">
                <article className="rounded-[24px] border border-ink/10 p-4">
                  <h3 className="text-lg font-semibold">성적 분포</h3>
                  <div className="mt-4">
                    <DistributionChart data={session.histogram} />
                  </div>
                </article>
                <article className="rounded-[24px] border border-ink/10 p-4">
                  <h3 className="text-lg font-semibold">오답률 TOP 5</h3>
                  <div className="mt-4 overflow-x-auto rounded-[20px] border border-ink/10">
                    <table className="min-w-full divide-y divide-ink/10 text-sm">
                      <thead className="bg-mist/80 text-left">
                        <tr>
                          <th className="px-4 py-3 font-semibold">문항</th>
                          <th className="px-4 py-3 font-semibold">정답</th>
                          <th className="px-4 py-3 font-semibold">정답률</th>
                          <th className="px-4 py-3 font-semibold">최다 오답</th>
                          <th className="px-4 py-3 font-semibold">선택 비율</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ink/10">
                        {session.topWrongQuestions.map((question) => (
                          <tr key={question.questionNo}>
                            <td className="px-4 py-3">{question.questionNo}</td>
                            <td className="px-4 py-3">{question.correctAnswer}</td>
                            <td className="px-4 py-3">{question.correctRate.toFixed(1)}%</td>
                            <td className="px-4 py-3">{question.mostCommonWrongAnswer ?? "-"}</td>
                            <td className="px-4 py-3">
                              {question.distribution
                                .slice(0, 4)
                                .map((entry) => `${entry.answer}:${entry.percentage.toFixed(1)}%`)
                                .join(" / ")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </article>
              </div>
            </section>
          ))}
        </div>
      ) : null}

      {tab === "monthly" ? (
        <div className="mt-8 space-y-8">
          {!monthlyData ? (
            <div className="rounded-[28px] border border-dashed border-ink/10 p-8 text-sm text-slate">
              월과 수험번호를 함께 선택하면 개인 월별 분석이 표시됩니다.
            </div>
          ) : (
            <>
              <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <article className="rounded-[28px] border border-ink/10 bg-mist p-6">
                  <p className="text-sm text-slate">학생</p>
                  <p className="mt-4 text-2xl font-semibold">
                    {monthlyData.student.name} ({monthlyData.student.examNumber})
                  </p>
                </article>
                <article className="rounded-[28px] border border-ink/10 bg-mist p-6">
                  <p className="text-sm text-slate">월 평균</p>
                  <p className="mt-4 text-2xl font-semibold">{monthlyData.summary.monthlyAverage ?? "-"}</p>
                </article>
                <article className="rounded-[28px] border border-ink/10 bg-mist p-6">
                  <p className="text-sm text-slate">참여율</p>
                  <p className="mt-4 text-2xl font-semibold">{monthlyData.summary.attendanceRate.toFixed(1)}%</p>
                </article>
                <article className="rounded-[28px] border border-ink/10 bg-mist p-6">
                  <p className="text-sm text-slate">출석 회차</p>
                  <p className="mt-4 text-2xl font-semibold">
                    {monthlyData.summary.attendedCount} / {monthlyData.summary.sessionCount}
                  </p>
                </article>
              </section>

              <section className="grid gap-6 xl:grid-cols-2">
                <article className="rounded-[28px] border border-ink/10 bg-white p-6">
                  <h2 className="text-xl font-semibold">과목별 레이더</h2>
                  <div className="mt-4">
                    <RadarComparisonChart data={monthlyData.radarData} />
                  </div>
                </article>
                <article className="rounded-[28px] border border-ink/10 bg-white p-6">
                  <h2 className="text-xl font-semibold">개인 vs 평균 vs 상위 10%</h2>
                  <div className="mt-4">
                    <BarComparisonChart
                      data={monthlyData.barData}
                      xKey="subject"
                      bars={[
                        { dataKey: "studentAverage", color: "#EA580C", name: "개인 평균" },
                        { dataKey: "cohortAverage", color: "#2563EB", name: "전체 평균" },
                        { dataKey: "top10Average", color: "#0F766E", name: "상위 10%" },
                      ]}
                    />
                  </div>
                </article>
              </section>

              <section className="rounded-[28px] border border-ink/10 bg-white p-6">
                <h2 className="text-xl font-semibold">과목별 상세</h2>
                <div className="mt-6 overflow-x-auto rounded-[24px] border border-ink/10">
                  <table className="min-w-full divide-y divide-ink/10 text-sm">
                    <thead className="bg-mist/80 text-left">
                      <tr>
                        <th className="px-4 py-3 font-semibold">과목</th>
                        <th className="px-4 py-3 font-semibold">개인 평균</th>
                        <th className="px-4 py-3 font-semibold">전체 평균</th>
                        <th className="px-4 py-3 font-semibold">상위 10%</th>
                        <th className="px-4 py-3 font-semibold">상위 30%</th>
                        <th className="px-4 py-3 font-semibold">석차</th>
                        <th className="px-4 py-3 font-semibold">목표</th>
                        <th className="px-4 py-3 font-semibold">달성률</th>
                        <th className="px-4 py-3 font-semibold">평가</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink/10">
                      {monthlyData.subjectSummary.map((row) => (
                        <tr key={row.subject}>
                          <td className="px-4 py-3">{SUBJECT_LABEL[row.subject]}</td>
                          <td className="px-4 py-3">{row.studentAverage ?? "-"}</td>
                          <td className="px-4 py-3">{row.cohortAverage ?? "-"}</td>
                          <td className="px-4 py-3">{row.top10Average ?? "-"}</td>
                          <td className="px-4 py-3">{row.top30Average ?? "-"}</td>
                          <td className="px-4 py-3">
                            {row.rank ? `${row.rank}/${row.participantCount}` : "-"}
                          </td>
                          <td className="px-4 py-3">{row.targetScore ?? "-"}</td>
                          <td className="px-4 py-3">
                            {row.achievementRate ? `${row.achievementRate.toFixed(1)}%` : "-"}
                          </td>
                          <td className="px-4 py-3">{row.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </div>
      ) : null}

      {tab === "subject" ? (
        <div className="mt-8 space-y-8">
          {subjectData.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-ink/10 p-8 text-sm text-slate">
              과목을 선택하면 전체 기간 추이가 표시됩니다.
            </div>
          ) : (
            <>
              <section className="rounded-[28px] border border-ink/10 bg-white p-6">
                <h2 className="text-xl font-semibold">과목 추이 차트</h2>
                <div className="mt-4">
                  <TrendLineChart
                    data={subjectData.map((row) => ({
                      label: formatDate(row.examDate),
                      averageScore: row.averageScore,
                      top10Average: row.top10Average,
                      top30Average: row.top30Average,
                      studentScore: row.studentScore,
                    }))}
                    xKey="label"
                    lines={[
                      { dataKey: "averageScore", color: "#2563EB", name: "전체 평균" },
                      { dataKey: "top10Average", color: "#0F766E", name: "상위 10%" },
                      { dataKey: "top30Average", color: "#7C3AED", name: "상위 30%" },
                      { dataKey: "studentScore", color: "#EA580C", name: "개인 점수" },
                    ]}
                  />
                </div>
              </section>

              <section className="rounded-[28px] border border-ink/10 bg-white p-6">
                <h2 className="text-xl font-semibold">회차별 상세</h2>
                <div className="mt-6 overflow-x-auto rounded-[24px] border border-ink/10">
                  <table className="min-w-full divide-y divide-ink/10 text-sm">
                    <thead className="bg-mist/80 text-left">
                      <tr>
                        <th className="px-4 py-3 font-semibold">시험일</th>
                        <th className="px-4 py-3 font-semibold">주차</th>
                        <th className="px-4 py-3 font-semibold">응시 인원</th>
                        <th className="px-4 py-3 font-semibold">전체 평균</th>
                        <th className="px-4 py-3 font-semibold">상위 10%</th>
                        <th className="px-4 py-3 font-semibold">상위 30%</th>
                        <th className="px-4 py-3 font-semibold">최고점</th>
                        <th className="px-4 py-3 font-semibold">개인 점수</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink/10">
                      {subjectData.map((row) => (
                        <tr key={row.sessionId}>
                          <td className="px-4 py-3">{formatDate(row.examDate)}</td>
                          <td className="px-4 py-3">{row.week}주차</td>
                          <td className="px-4 py-3">{row.participantCount}</td>
                          <td className="px-4 py-3">{row.averageScore ?? "-"}</td>
                          <td className="px-4 py-3">{row.top10Average ?? "-"}</td>
                          <td className="px-4 py-3">{row.top30Average ?? "-"}</td>
                          <td className="px-4 py-3">{row.highestScore ?? "-"}</td>
                          <td className="px-4 py-3">{row.studentScore ?? "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="rounded-[28px] border border-ink/10 bg-white p-6">
                <h2 className="text-xl font-semibold">전체 학생 과목별 순위</h2>
                <p className="mt-2 text-sm text-slate">
                  해당 기간 내 선택 과목의 평균 점수 기준 전체 학생 순위입니다.
                </p>
                <div className="mt-6">
                  <SubjectRankingTable rows={subjectRanking} />
                </div>
              </section>
            </>
          )}
        </div>
      ) : null}
      {tab === "cohort" ? (
        <GenerationCohortAnalysisPanel data={cohortData} />
      ) : null}

      {/* 분석 허브 바로가기 */}
      <div className="mt-8 rounded-[28px] border border-ink/10 bg-mist p-6">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-slate">
          관련 분석
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Link
            href="/admin/analytics/enrollments"
            className="group rounded-[20px] border border-ink/10 bg-white p-4 shadow-sm transition-all hover:border-forest/30 hover:shadow-md"
          >
            <p className="font-semibold text-ink group-hover:text-forest">수강 등록 통계</p>
            <p className="mt-1 text-xs text-slate">월별 신규 등록 추이 및 상태별 현황</p>
          </Link>
          <Link
            href="/admin/analytics/retention"
            className="group rounded-[20px] border border-ink/10 bg-white p-4 shadow-sm transition-all hover:border-forest/30 hover:shadow-md"
          >
            <p className="font-semibold text-ink group-hover:text-forest">재원율 분석</p>
            <p className="mt-1 text-xs text-slate">수강생 유지율·중도탈락·재등록 현황</p>
          </Link>
          <Link
            href="/admin/analytics/prospects"
            className="group rounded-[20px] border border-ink/10 bg-white p-4 shadow-sm transition-all hover:border-forest/30 hover:shadow-md"
          >
            <p className="font-semibold text-ink group-hover:text-forest">상담·전환 분석</p>
            <p className="mt-1 text-xs text-slate">신규 상담부터 수강 전환까지의 전환율 및 추이</p>
          </Link>
          <Link
            href="/admin/analytics/revenue"
            className="group rounded-[20px] border border-ink/10 bg-white p-4 shadow-sm transition-all hover:border-forest/30 hover:shadow-md"
          >
            <p className="font-semibold text-ink group-hover:text-forest">수납 분석</p>
            <p className="mt-1 text-xs text-slate">연간 수납 카테고리·결제수단 분석</p>
          </Link>
          <Link
            href="/admin/analytics/counseling"
            className="group rounded-[20px] border border-ink/10 bg-white p-4 shadow-sm transition-all hover:border-forest/30 hover:shadow-md"
          >
            <p className="font-semibold text-ink group-hover:text-forest">면담 현황 분석</p>
            <p className="mt-1 text-xs text-slate">월별 면담 기록·상담사별 통계·수강 전환율</p>
          </Link>
          <Link
            href="/admin/analytics/payments"
            className="group rounded-[20px] border border-ink/10 bg-white p-4 shadow-sm transition-all hover:border-ember/30 hover:shadow-md"
          >
            <p className="font-semibold text-ink group-hover:text-ember">결제 수단 분석</p>
            <p className="mt-1 text-xs text-slate">결제수단·항목별 수납 현황, 환불율, 월별 추이</p>
          </Link>
          <Link
            href="/admin/analytics/discounts"
            className="group rounded-[20px] border border-ink/10 bg-white p-4 shadow-sm transition-all hover:border-forest/30 hover:shadow-md"
          >
            <p className="font-semibold text-ink group-hover:text-forest">할인코드 분석</p>
            <p className="mt-1 text-xs text-slate">코드별 사용 현황, 할인 총액, 미사용 코드 파악</p>
          </Link>
          <Link
            href="/admin/analytics/cohorts"
            className="group rounded-[20px] border border-ink/10 bg-white p-4 shadow-sm transition-all hover:border-forest/30 hover:shadow-md"
          >
            <p className="font-semibold text-ink group-hover:text-forest">기수별 코호트 분석</p>
            <p className="mt-1 text-xs text-slate">기수별 등록수·탈락률·성적·출석률 비교, 전기수 대비 ▲▼ 배지</p>
          </Link>
          <Link
            href="/admin/analytics/special-lecture-revenue"
            className="group rounded-[20px] border border-ink/10 bg-white p-4 shadow-sm transition-all hover:border-ember/30 hover:shadow-md"
          >
            <p className="font-semibold text-ink group-hover:text-ember">특강 매출 분석</p>
            <p className="mt-1 text-xs text-slate">특강 매출, 강사 배분 예정액, 학원 수익 비교</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
