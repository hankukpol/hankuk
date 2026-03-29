import { AdminRole, ExamType } from "@prisma/client";
import Link from "next/link";
import { StudentManager } from "@/components/students/student-manager";
import { requireAdminContext } from "@/lib/auth";
import { listStudentsPage } from "@/lib/students/service";

export const dynamic = "force-dynamic";

type StudentsPageProps = {
  searchParams?: {
    examType?: ExamType;
    search?: string;
    generation?: string;
    activeOnly?: string;
    page?: string;
    pageSize?: string;
    sort?: string;
    sortDir?: string;
  };
};

export default async function AdminStudentsPage({ searchParams }: StudentsPageProps) {
  const examType = searchParams?.examType ?? "GONGCHAE";
  const search = searchParams?.search ?? "";
  const generation = searchParams?.generation ?? "";
  const activeOnly = searchParams?.activeOnly !== "false";
  const page = Math.max(1, Number(searchParams?.page ?? "1") || 1);
  const pageSize = Math.min(Math.max(Number(searchParams?.pageSize ?? "30") || 30, 1), 100);
  const sortRaw = searchParams?.sort;
  const sort =
    sortRaw === "name" || sortRaw === "examNumber" || sortRaw === "registeredAt"
      ? sortRaw
      : undefined;
  const sortDirRaw = searchParams?.sortDir;
  const sortDir = sortDirRaw === "asc" || sortDirRaw === "desc" ? sortDirRaw : undefined;
  const [, result] = await Promise.all([
    requireAdminContext(AdminRole.TEACHER),
    listStudentsPage({
      examType,
      search,
      generation: generation ? Number(generation) : undefined,
      activeOnly,
      page,
      pageSize,
      sort,
      sortDir,
    }),
  ]);

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        F-02 Students
      </div>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <h1 className="text-3xl font-semibold">수강생 관리</h1>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/students/compare"
            className="inline-flex items-center gap-1.5 rounded-full border border-forest/20 bg-forest/5 px-4 py-2 text-sm font-semibold text-forest shadow-sm transition hover:bg-forest/10"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
              />
            </svg>
            비교 분석
          </Link>
          <Link
            href="/admin/students/bulk-operations"
            className="inline-flex items-center gap-1.5 rounded-full border border-ember/20 bg-ember/10 px-4 py-2 text-sm font-semibold text-ember shadow-sm transition hover:bg-ember/20"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 6h16M4 10h16M4 14h16M4 18h16"
              />
            </svg>
            일괄 작업
          </Link>
          <Link
            href="/admin/students/bulk-archive"
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 bg-white px-4 py-2 text-sm font-medium text-slate shadow-sm transition hover:border-ember/30 hover:text-ember"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
              />
            </svg>
            일괄 비활성화
          </Link>
        </div>
      </div>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        공채와 경채 수강생을 구분해 조회하고, 개별 등록과 수정, 비활성화, 학생 상세 이력 조회를 이 화면에서 처리합니다.
      </p>
      <div className="mt-8">
        <StudentManager
          students={result.students.map((student) => ({
            ...student,
            registeredAt: student.registeredAt?.toISOString() ?? null,
          }))}
          filters={{
            examType,
            search,
            generation,
            activeOnly,
            page: result.page,
            pageSize: result.pageSize,
            totalCount: result.totalCount,
            sort: sort ?? "",
            sortDir: sortDir ?? "",
          }}
        />
      </div>
    </div>
  );
}
