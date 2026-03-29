import { AdminRole } from "@prisma/client";
import { MergeWorkbench } from "@/components/students/merge-workbench";
import { requireAdminContext } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminStudentMergePage() {
  await requireAdminContext(AdminRole.TEACHER);

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        F-03 Merge
      </div>
      <h1 className="mt-5 text-3xl font-semibold">학생 병합</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        같은 학생이 서로 다른 수험번호로 중복 등록된 경우 원본 계정의 성적·출결·사유서·상담·포인트·알림 이력을
        대상 계정으로 병합합니다. 병합 후 원본 학생은 비활성 상태로 남습니다.
      </p>
      <div className="mt-8">
        <MergeWorkbench />
      </div>
    </div>
  );
}
