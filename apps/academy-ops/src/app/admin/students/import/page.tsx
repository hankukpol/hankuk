import Link from "next/link";
import { AdminRole, ExamType } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { StudentImportForm } from "./student-import-form";

export const dynamic = "force-dynamic";

type ImportPageProps = {
  searchParams?: {
    examType?: ExamType;
  };
};

export default async function StudentImportPage({ searchParams }: ImportPageProps) {
  await requireAdminContext(AdminRole.MANAGER);
  const examType = searchParams?.examType ?? "GONGCHAE";

  return (
    <div className="p-8 sm:p-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            F-02-C Excel Import
          </div>
          <h1 className="mt-5 text-3xl font-semibold">학생 데이터 가져오기</h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            Excel(XLSX) 또는 CSV 파일을 업로드해 학생 명단을 한꺼번에 등록하거나 업데이트합니다.
            열 매핑을 직접 지정할 수 있어 다양한 형식의 파일을 지원합니다.
          </p>
        </div>
        <Link
          prefetch={false}
          href={`/admin/students?examType=${examType}`}
          className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
        >
          수강생 목록
        </Link>
      </div>

      <div className="mt-8">
        <StudentImportForm initialExamType={examType} />
      </div>
    </div>
  );
}
