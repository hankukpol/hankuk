import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getStudentCumulativeAnalysis } from "@/lib/analytics/analysis";
import { listStudents } from "@/lib/students/service";
import { StudentCumulativeAnalysis } from "@/components/students/student-cumulative-analysis";
import { EXAM_TYPE_LABEL } from "@/lib/constants";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

function readParam(searchParams: PageProps["searchParams"], key: string) {
  const value = searchParams?.[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function StudentAnalyzePage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.VIEWER);

  const q = readParam(searchParams, "q")?.trim() ?? "";
  const examNumber = readParam(searchParams, "examNumber")?.trim() ?? "";

  let cumulativeData = null;
  let searchResults: Awaited<ReturnType<typeof listStudents>> = [];
  let notFound = false;
  let loadError: string | null = null;

  try {
    if (examNumber) {
      cumulativeData = await getStudentCumulativeAnalysis(examNumber);
      if (!cumulativeData) notFound = true;
    } else if (q) {
      searchResults = await listStudents({ search: q, activeOnly: false, limit: 20 });
      if (searchResults.length === 1) {
        cumulativeData = await getStudentCumulativeAnalysis(searchResults[0].examNumber);
      }
    }
  } catch (error) {
    console.error("Failed to load student cumulative analysis", error);
    loadError = "학생 분석 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.";
  }

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        학생 성적 분석
      </div>
      <h1 className="mt-5 text-3xl font-semibold">학생 누적 성적 분석</h1>
      <p className="mt-3 text-sm leading-7 text-slate">
        학생 이름 또는 수험번호로 검색해 전체 기간의 누적 성적 현황을 확인하세요.
      </p>

      {/* Search form */}
      <form method="GET" className="mt-8 flex flex-wrap gap-3 rounded-[28px] border border-ink/10 bg-mist p-6">
        <input
          name="q"
          defaultValue={q || examNumber}
          placeholder="이름 또는 수험번호 입력…"
          autoFocus
          className="flex-1 min-w-[200px] rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ember/30"
        />
        <button
          type="submit"
          className="inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest"
        >
          검색
        </button>
      </form>

      {loadError ? (
        <div className="mt-8 rounded-[28px] border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          {loadError}
        </div>
      ) : null}

      {/* Not found */}
      {notFound && !loadError && (
        <div className="mt-8 rounded-[28px] border border-ink/10 bg-white p-8 text-center text-slate">
          수험번호 <strong>{examNumber}</strong>에 해당하는 학생을 찾을 수 없습니다.
        </div>
      )}

      {/* Multiple search results */}
      {!loadError && !cumulativeData && searchResults.length > 1 && (
        <section className="mt-8">
          <p className="mb-3 text-sm text-slate">
            <strong>{searchResults.length}명</strong>의 학생이 검색되었습니다. 분석할 학생을 선택하세요.
          </p>
          <div className="overflow-hidden rounded-[24px] border border-ink/10 bg-white">
            <table className="min-w-full divide-y divide-ink/10 text-sm">
              <thead className="bg-mist/80 text-left">
                <tr>
                  <th className="px-4 py-3 font-semibold">수험번호</th>
                  <th className="px-4 py-3 font-semibold">이름</th>
                  <th className="px-4 py-3 font-semibold">시험 유형</th>
                  <th className="px-4 py-3 font-semibold">반</th>
                  <th className="px-4 py-3 font-semibold">기수</th>
                  <th className="px-4 py-3 font-semibold"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {searchResults.map((student) => (
                  <tr key={student.examNumber} className="hover:bg-mist/40">
                    <td className="px-4 py-3 font-medium">{student.examNumber}</td>
                    <td className="px-4 py-3">{student.name}</td>
                    <td className="px-4 py-3">{EXAM_TYPE_LABEL[student.examType]}</td>
                    <td className="px-4 py-3">{student.className ?? "-"}</td>
                    <td className="px-4 py-3">{student.generation ?? "-"}기</td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/students/${student.examNumber}?tab=cumulative`}
                        className="rounded-full border border-ink/10 px-3 py-1.5 text-xs font-semibold transition hover:border-ember/30 hover:text-ember"
                      >
                        분석 보기
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* No results */}
      {q && !loadError && !cumulativeData && searchResults.length === 0 && (
        <div className="mt-8 rounded-[28px] border border-ink/10 bg-white p-8 text-center text-slate">
          <strong>&quot;{q}&quot;</strong>에 해당하는 학생을 찾을 수 없습니다.
        </div>
      )}

      {/* Cumulative analysis */}
      {cumulativeData && (
        <div className="mt-8">
          <StudentCumulativeAnalysis data={cumulativeData} />
        </div>
      )}

      {/* Empty state */}
      {!q && !examNumber && (
        <div className="mt-12 flex flex-col items-center gap-4 text-center text-slate">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-dashed border-ink/20 text-2xl">
            🔍
          </div>
          <p className="text-sm">학생 이름이나 수험번호를 검색해 누적 성적 분석을 시작하세요.</p>
        </div>
      )}
    </div>
  );
}
