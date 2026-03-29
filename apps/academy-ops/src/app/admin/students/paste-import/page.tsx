import Link from "next/link";
import { AdminRole, ExamType } from "@prisma/client";
import { PasteImportWorkbench } from "@/components/students/paste-import-workbench";
import { requireAdminContext } from "@/lib/auth";

export const dynamic = "force-dynamic";

type PasteImportPageProps = {
  searchParams?: {
    examType?: ExamType;
  };
};

export default async function PasteImportPage({
  searchParams,
}: PasteImportPageProps) {
  await requireAdminContext(AdminRole.TEACHER);
  const examType = searchParams?.examType ?? "GONGCHAE";

  return (
    <div className="p-8 sm:p-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            F-02-B Paste Import
          </div>
          <h1 className="mt-5 text-3xl font-semibold">수강생 붙여넣기 등록</h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            엑셀에서 복사한 6열 텍스트를 그대로 붙여넣거나, 별도 명단 파일을 업로드해 수강생을 한꺼번에
            등록할 수 있습니다.
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
        <PasteImportWorkbench initialExamType={examType} />
      </div>
    </div>
  );
}
