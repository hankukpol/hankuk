import { AdminRole, Subject } from "@prisma/client";
import {
  getAnalyticsContext,
  readStringParam,
} from "@/lib/analytics/ui";
import { STATUS_LABEL } from "@/lib/analytics/presentation";
import { requireAdminContext } from "@/lib/auth";
import {
  ATTEND_TYPE_LABEL,
  EXAM_TYPE_LABEL,
  SUBJECT_LABEL,
} from "@/lib/constants";
import { formatDate, todayDateInputValue } from "@/lib/format";
import {
  getDateQueryRows,
  getStudentHistoryRows,
  getSubjectTrendRows,
  type QueryMode,
} from "@/lib/query/service";
import Link from "next/link";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { FilterPresetControls } from "@/components/ui/filter-preset-controls";
import { ResponsiveTable } from "@/components/ui/responsive-table";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

const MODE_OPTIONS: Array<{ value: QueryMode; label: string }> = [
  { value: "date", label: "날짜별 조회" },
  { value: "subject", label: "과목별 조회" },
  { value: "student", label: "수강생별 조회" },
];

export default async function AdminQueryPage({ searchParams }: PageProps) {
  const [, { periods, selectedPeriod, examType }] = await Promise.all([
    requireAdminContext(AdminRole.VIEWER),
    getAnalyticsContext(searchParams),
  ]);
  const mode = (readStringParam(searchParams, "mode") as QueryMode | undefined) ?? "date";
  const legacyDate = readStringParam(searchParams, "date");
  const dateFrom = readStringParam(searchParams, "dateFrom") ?? legacyDate ?? todayDateInputValue();
  const dateTo = readStringParam(searchParams, "dateTo") ?? legacyDate ?? dateFrom;
  const subject = (readStringParam(searchParams, "subject") as Subject | undefined) ?? undefined;
  const keyword = readStringParam(searchParams, "keyword") ?? "";

  const [dateRows, subjectRows, studentRows] = await Promise.all([
    mode === "date" && dateFrom
      ? getDateQueryRows({
          mode,
          periodId: selectedPeriod?.id,
          examType,
          date: legacyDate ?? undefined,
          dateFrom,
          dateTo,
        })
      : Promise.resolve([]),
    mode === "subject" && subject
      ? getSubjectTrendRows({
          mode,
          periodId: selectedPeriod?.id,
          examType,
          subject,
        })
      : Promise.resolve([]),
    mode === "student" && keyword.trim()
      ? getStudentHistoryRows({
          mode,
          periodId: selectedPeriod?.id,
          examType,
          keyword,
        })
      : Promise.resolve([]),
  ]);

  const exportParams = new URLSearchParams();
  exportParams.set("mode", mode);
  exportParams.set("examType", examType);

  if (selectedPeriod?.id) {
    exportParams.set("periodId", String(selectedPeriod.id));
  }

  if (dateFrom) {
    exportParams.set("dateFrom", dateFrom);
  }

  if (dateTo) {
    exportParams.set("dateTo", dateTo);
  }

  if (subject) {
    exportParams.set("subject", subject);
  }

  if (keyword) {
    exportParams.set("keyword", keyword);
  }

  const hasRows =
    dateRows.length > 0 || subjectRows.length > 0 || studentRows.length > 0;

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        F-08 Query
      </div>
      <h1 className="mt-5 text-3xl font-semibold">다차원 조회</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        특정 날짜 전체 성적, 과목별 추이, 수강생별 전체 이력을 한 화면에서 조회합니다.
      </p>

      <form id="query-filter-form" className="mt-8 grid gap-4 rounded-[28px] border border-ink/10 bg-mist p-6 md:grid-cols-5">
        <div>
          <label className="mb-2 block text-sm font-medium">조회 모드</label>
          <select
            name="mode"
            defaultValue={mode}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
          >
            {MODE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
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
          <label className="mb-2 block text-sm font-medium">과목 / 키워드</label>
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
              name="keyword"
              defaultValue={keyword}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
              placeholder="수험번호 또는 이름"
            />
          </div>
        </div>
        <div className="md:col-span-5 flex flex-wrap items-center justify-between gap-3">
          <FilterPresetControls
            pathname="/admin/query"
            storageKey="admin-query-filter-presets"
            formId="query-filter-form"
            currentFilters={{
              mode,
              periodId: selectedPeriod?.id ? String(selectedPeriod.id) : "",
              examType,
              dateFrom,
              dateTo,
              subject: subject ?? "",
              keyword,
            }}
          />
          <div className="flex flex-wrap justify-end gap-3">
            {hasRows ? (
              <>
                <a
                  href={`/api/export/query?${exportParams.toString()}&format=xlsx`}
                  className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
                >
                  xlsx 내보내기
                </a>
                <a
                  href={`/api/export/query?${exportParams.toString()}&format=csv`}
                  className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
                >
                  csv 내보내기
                </a>
              </>
            ) : null}
            <button
              type="submit"
              className="inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest"
            >
              조회
            </button>
          </div>
        </div>
      </form>

      {mode === "date" ? (
        <section className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">날짜별 전체 성적</h2>
              <p className="mt-2 text-sm text-slate sm:hidden">모바일에서는 카드뷰로, 큰 화면에서는 표로 표시됩니다.</p>
            </div>
            <span className="rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold text-slate">
              {dateRows.length}건
            </span>
          </div>
          <div className="mt-6">
            <ResponsiveTable
              data={dateRows}
              caption="날짜별 전체 성적 목록"
              emptyState="날짜를 선택하면 결과가 표시됩니다."
              keyExtractor={(row) => `${row.sessionId}-${row.examNumber}`}
              cardTitle={(row) => `${row.examNumber} · ${row.studentName}`}
              cardDescription={(row) => `${formatDate(row.examDate)} · ${SUBJECT_LABEL[row.subject]}`}
              columns={[
                { id: "examDate", header: "시험일", cell: (row) => formatDate(row.examDate), hideOnMobile: true },
                { id: "subject", header: "과목", cell: (row) => SUBJECT_LABEL[row.subject], hideOnMobile: true },
                { id: "examNumber", header: "수험번호", cell: (row) => row.examNumber, hideOnMobile: true },
                { id: "studentName", header: "이름", cell: (row) => row.studentName, hideOnMobile: true },
                { id: "attendType", header: "출결", cell: (row) => ATTEND_TYPE_LABEL[row.attendType] },
                { id: "rawScore", header: "원점수", cell: (row) => row.rawScore ?? "-" },
                { id: "finalScore", header: "최종점수", cell: (row) => row.finalScore ?? "-" },
                { id: "currentStatus", header: "현재 상태", cell: (row) => STATUS_LABEL[row.currentStatus] },
              ]}
            />
          </div>
        </section>
      ) : null}

      {mode === "subject" ? (
        <section className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">과목별 추이</h2>
              <p className="mt-2 text-sm text-slate sm:hidden">시험 회차별 집계를 모바일 카드뷰로 전환했습니다.</p>
            </div>
            <span className="rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold text-slate">
              {subjectRows.length}회차
            </span>
          </div>
          <div className="mt-6">
            <ResponsiveTable
              data={subjectRows}
              caption="과목별 추이 요약 표"
              emptyState="과목을 선택하면 추이 결과가 표시됩니다."
              keyExtractor={(row) => String(row.sessionId)}
              cardTitle={(row) => `${formatDate(row.examDate)} · ${row.week}주차`}
              cardDescription={(row) => SUBJECT_LABEL[row.subject]}
              columns={[
                { id: "examDate", header: "시험일", cell: (row) => formatDate(row.examDate), hideOnMobile: true },
                { id: "week", header: "주차", cell: (row) => `${row.week}주차`, hideOnMobile: true },
                { id: "averageScore", header: "평균", cell: (row) => row.averageScore ?? "-" },
                { id: "highestScore", header: "최고", cell: (row) => row.highestScore ?? "-" },
                { id: "lowestScore", header: "최저", cell: (row) => row.lowestScore ?? "-" },
                { id: "normalCount", header: "현장", cell: (row) => row.normalCount },
                { id: "liveCount", header: "온라인", cell: (row) => row.liveCount },
                { id: "absentCount", header: "결시", cell: (row) => row.absentCount },
                { id: "excusedCount", header: "사유 결시", cell: (row) => row.excusedCount },
              ]}
            />
          </div>
        </section>
      ) : null}

      {mode === "student" ? (
        <section className="mt-8 rounded-[28px] border border-ink/10 bg-white p-6">
          <h2 className="text-xl font-semibold">수강생 검색 결과</h2>
          <p className="mt-2 text-sm text-slate">
            이 화면에서는 검색 결과만 확인하고, 상세 이력과 수정은 전용 학생 페이지에서 처리합니다.
          </p>
          <div className="mt-6 space-y-4">
            {studentRows.length === 0 ? (
              <div className="rounded-[28px] border border-dashed border-ink/10 p-8 text-center text-sm text-slate">
                수험번호 또는 이름을 입력하면 결과가 표시됩니다.
              </div>
            ) : null}
            {studentRows.map((student) => (
              <article key={student.examNumber} className="rounded-[28px] border border-ink/10 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold">
                      {student.examNumber} · {student.name}
                    </h3>
                    <p className="mt-2 text-sm text-slate">
                      {EXAM_TYPE_LABEL[student.examType]} · 현재 상태 {STATUS_LABEL[student.currentStatus]} · {student.isActive ? "활성" : "비활성"}
                    </p>
                  </div>
                  <p className="text-sm text-slate">{student.phone ?? "-"}</p>
                </div>

                <div className="mt-4 grid gap-3 rounded-[24px] bg-mist/60 p-4 md:grid-cols-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate">scores</p>
                    <p className="mt-2 text-lg font-semibold">{student.scores.length}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate">latest exam</p>
                    <p className="mt-2 text-lg font-semibold">
                      {student.scores[0] ? formatDate(student.scores[0].examDate) : "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate">latest subject</p>
                    <p className="mt-2 text-lg font-semibold">
                      {student.scores[0] ? SUBJECT_LABEL[student.scores[0].subject] : "-"}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href={`/admin/students/${student.examNumber}/history`}
                    className="inline-flex items-center rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-forest"
                  >
                    성적 이력
                  </Link>
                  <Link
                    href={`/admin/students/${student.examNumber}/analysis`}
                    className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
                  >
                    기간별 분석
                  </Link>
                  <Link
                    href={`/admin/students/analyze?examNumber=${student.examNumber}`}
                    className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
                  >
                    누적 분석
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
