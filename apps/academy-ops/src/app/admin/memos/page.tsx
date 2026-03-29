import { AdminRole } from "@prisma/client";
import { AdminMemoBoard } from "@/components/memos/admin-memo-board";
import { requireAdminContext } from "@/lib/auth";
import { listActiveAdmins, listAdminMemos } from "@/lib/admin-memos/service";

export const dynamic = "force-dynamic";

export default async function AdminMemosPage() {
  const context = await requireAdminContext(AdminRole.TEACHER);
  const [memos, admins] = await Promise.all([
    listAdminMemos(context.adminUser.id),
    listActiveAdmins(),
  ]);

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
        Internal Memo Board
      </div>
      <h1 className="mt-5 text-3xl font-semibold text-ink">운영 메모</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        학생에게 노출되는 공지와 분리된 관리자·직원용 메모 공간입니다. 개인 메모와 공용 메모를
        분리하고, 마감일과 상태로 실제 업무를 추적할 수 있습니다.
      </p>

      <div className="mt-8">
        <AdminMemoBoard
          currentAdminId={context.adminUser.id}
          currentAdminRole={context.adminUser.role}
          initialMemos={memos.map((memo) => ({
            id: memo.id,
            title: memo.title,
            content: memo.content,
            color: memo.color,
            scope: memo.scope,
            status: memo.status,
            isPinned: memo.isPinned,
            dueAt: memo.dueAt?.toISOString() ?? null,
            relatedStudentExamNumber: memo.relatedStudentExamNumber,
            createdAt: memo.createdAt.toISOString(),
            updatedAt: memo.updatedAt.toISOString(),
            owner: memo.owner,
            assignee: memo.assignee,
          }))}
          adminOptions={admins}
        />
      </div>
    </div>
  );
}
