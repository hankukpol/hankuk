import { AdminRole } from "@prisma/client";
import { TransferWorkbench } from "@/components/students/transfer-workbench";
import { requireAdminContext } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminStudentTransferPage() {
  await requireAdminContext(AdminRole.TEACHER);

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        F-02 Transfer
      </div>
      <h1 className="mt-5 text-3xl font-semibold">수험번호 이전</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        잘못 등록된 수험번호를 새 번호로 이전하고, 성적·출결·사유서·상담·포인트·알림 이력을 함께 옮깁니다.
        이전 후 기존 학생은 비활성화 상태로 남습니다.
      </p>
      <div className="mt-8">
        <TransferWorkbench />
      </div>
    </div>
  );
}
