import Link from "next/link";
import { AdminRole, type ExamType } from "@prisma/client";
import { StudentComparisonAnalysis } from "@/components/students/student-comparison-analysis";
import {
  getStudentComparisonAnalysis,
  type StudentComparisonLoadResult,
} from "@/lib/analytics/analysis";
import { requireAdminContext } from "@/lib/auth";
import { EXAM_TYPE_LABEL } from "@/lib/constants";

export const dynamic = "force-dynamic";

const RECENT_OPTIONS = [5, 10, 20] as const;

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

function readParam(searchParams: PageProps["searchParams"], key: string) {
  const value = searchParams?.[key];
  return Array.isArray(value) ? value[0] : value;
}

function readNumberParam(searchParams: PageProps["searchParams"], key: string) {
  const raw = readParam(searchParams, key);
  if (!raw) {
    return undefined;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeRecent(value?: number) {
  return RECENT_OPTIONS.includes(value as (typeof RECENT_OPTIONS)[number]) ? value : 10;
}

function mismatchMessage(examTypeA: ExamType, examTypeB: ExamType) {
  return `같은 직렬 학생끼리만 비교할 수 있습니다. 현재 선택은 ${EXAM_TYPE_LABEL[examTypeA]} / ${EXAM_TYPE_LABEL[examTypeB]} 입니다.`;
}

function validationMessage(result: Exclude<StudentComparisonLoadResult, { kind: "ok" }>) {
  switch (result.kind) {
    case "same_student":
      return "동일한 수험번호를 양쪽에 동시에 비교할 수 없습니다.";
    case "missing_student_a":
      return `비교 A 수험번호 ${result.examNumber}에 해당하는 학생을 찾을 수 없습니다.`;
    case "missing_student_b":
      return `비교 B 수험번호 ${result.examNumber}에 해당하는 학생을 찾을 수 없습니다.`;
    case "exam_type_mismatch":
      return mismatchMessage(result.examTypeA, result.examTypeB);
    default:
      return "학생 비교 데이터를 불러오지 못했습니다.";
  }
}

export default async function StudentComparePage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.VIEWER);

  const examNumberA = readParam(searchParams, "a")?.trim() ?? "";
  const examNumberB = readParam(searchParams, "b")?.trim() ?? "";
  const periodId = readNumberParam(searchParams, "periodId");
  const recent = normalizeRecent(readNumberParam(searchParams, "recent"));

  let comparisonResult: StudentComparisonLoadResult | null = null;
  let loadError: string | null = null;

  try {
    if (examNumberA && examNumberB) {
      comparisonResult = await getStudentComparisonAnalysis({
        examNumberA,
        examNumberB,
        periodId,
        recent,
      });
    }
  } catch (error) {
    console.error("Failed to load student comparison", error);
    loadError = "학생 비교 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }

  const comparisonData = comparisonResult?.kind === "ok" ? comparisonResult.data : null;
  const comparisonValidationError =
    comparisonResult && comparisonResult.kind !== "ok" ? validationMessage(comparisonResult) : null;

  return (
    <div className="space-y-8 p-8 sm:p-10">
      <div>
        <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
          학생 비교 분석
        </div>
        <h1 className="mt-5 text-3xl font-semibold text-ink">학생 대 학생 비교</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate">
          두 학생의 같은 기간 성적과 출결 흐름을 같은 기준으로 비교합니다. URL 파라미터만으로 동일한 비교 화면을 다시 열 수 있습니다.
        </p>
      </div>

      <form method="GET" className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_220px_220px_auto]">
          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">비교 A</span>
            <input
              name="a"
              defaultValue={examNumberA}
              placeholder="수험번호 입력"
              className="w-full rounded-2xl border border-ink/10 bg-mist/40 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ember/30"
            />
          </label>

          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">비교 B</span>
            <input
              name="b"
              defaultValue={examNumberB}
              placeholder="수험번호 입력"
              className="w-full rounded-2xl border border-ink/10 bg-mist/40 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ember/30"
            />
          </label>

          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">최근 N회</span>
            <select
              name="recent"
              defaultValue={String(comparisonData?.recentCount ?? recent)}
              className="w-full rounded-2xl border border-ink/10 bg-mist/40 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ember/30"
            >
              {RECENT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  최근 {option}회
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">기간</span>
            <select
              name="periodId"
              defaultValue={comparisonData?.selectedPeriod ? String(comparisonData.selectedPeriod.id) : ""}
              className="w-full rounded-2xl border border-ink/10 bg-mist/40 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ember/30"
              disabled={!comparisonData || comparisonData.availablePeriods.length === 0}
            >
              {!comparisonData || comparisonData.availablePeriods.length === 0 ? (
                <option value="">비교 후 선택</option>
              ) : null}
              {comparisonData?.availablePeriods.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.name}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-end">
            <button
              type="submit"
              className="inline-flex h-12 items-center justify-center rounded-full bg-ink px-5 text-sm font-semibold text-white transition hover:bg-forest"
            >
              비교하기
            </button>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate">
          이름 검색은 아직 지원하지 않습니다. 공유 안정성을 위해 수험번호 기준으로만 비교합니다.
        </p>
      </form>

      {loadError ? (
        <div className="rounded-[28px] border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          {loadError}
        </div>
      ) : null}

      {comparisonValidationError && !loadError ? (
        <div className="rounded-[28px] border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          {comparisonValidationError}
        </div>
      ) : null}

      {comparisonData ? <StudentComparisonAnalysis data={comparisonData} /> : null}

      {!comparisonData && !loadError && !comparisonValidationError ? (
        <section className="rounded-[28px] border border-dashed border-ink/15 bg-mist/30 p-10 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-dashed border-ink/20 text-2xl text-slate">
            ↔
          </div>
          <h2 className="mt-5 text-xl font-semibold text-ink">비교할 두 학생을 선택하세요</h2>
          <p className="mt-3 text-sm leading-7 text-slate">
            예시: <code className="rounded bg-white px-2 py-1 text-xs">/admin/students/compare?a=2026001&b=2026002</code>
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link
              href="/admin/students/analyze"
              className="inline-flex items-center rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:border-ember/30 hover:text-ember"
            >
              누적 분석으로 이동
            </Link>
            <Link
              href="/admin/students"
              className="inline-flex items-center rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:border-ember/30 hover:text-ember"
            >
              전체 명단 보기
            </Link>
          </div>
        </section>
      ) : null}
    </div>
  );
}
