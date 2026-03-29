import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { getAdminMemoDashboardData } from "@/lib/admin-memos/service";
import { formatDate } from "@/lib/format";

type AdminMemoDashboardPanelProps = {
  currentAdminId: string;
  currentAdminRole: AdminRole;
};

export async function AdminMemoDashboardPanel({
  currentAdminId,
  currentAdminRole,
}: AdminMemoDashboardPanelProps) {
  if (currentAdminRole === AdminRole.VIEWER) {
    return null;
  }

  const overview = await getAdminMemoDashboardData(currentAdminId);

  return (
    <section className="rounded-[28px] border border-ink/10 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
            Admin Memo
          </div>
          <h2 className="mt-4 text-xl font-semibold text-ink">운영 메모 포커스</h2>
          <p className="mt-2 text-sm text-slate">
            학생 공지와 분리된 내부 메모 보드입니다. 급한 일과 공유 메모만 빠르게 확인할 수 있습니다.
          </p>
        </div>
        <Link href="/admin/memos" className="inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest">
          운영 메모 열기
        </Link>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[22px] border border-ink/10 bg-mist p-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">Mine</p><p className="mt-3 text-3xl font-semibold text-ink">{overview.myOpenCount}</p><p className="mt-1 text-xs text-slate">내가 맡은 진행 메모</p></div>
        <div className="rounded-[22px] border border-ink/10 bg-mist p-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">Shared</p><p className="mt-3 text-3xl font-semibold text-ink">{overview.sharedOpenCount}</p><p className="mt-1 text-xs text-slate">공용 진행 메모</p></div>
        <div className="rounded-[22px] border border-red-200 bg-red-50 p-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-700">Overdue</p><p className="mt-3 text-3xl font-semibold text-ink">{overview.overdueCount}</p><p className="mt-1 text-xs text-slate">마감이 지난 메모</p></div>
        <div className="rounded-[22px] border border-amber-200 bg-amber-50 p-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Pinned</p><p className="mt-3 text-3xl font-semibold text-ink">{overview.pinnedOpenCount}</p><p className="mt-1 text-xs text-slate">상단 고정 메모</p></div>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        {overview.focusMemos.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-ink/10 px-5 py-10 text-center text-sm text-slate xl:col-span-2">
            진행 중인 운영 메모가 없습니다.
          </div>
        ) : (
          overview.focusMemos.map((memo) => (
            <article key={memo.id} className="rounded-[24px] border border-ink/10 bg-white p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold text-slate">{memo.scope === "TEAM" ? "공용 메모" : "개인 메모"}</span>
                {memo.isPinned ? <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">고정</span> : null}
              </div>
              <h3 className="mt-4 text-lg font-semibold text-ink">{memo.title}</h3>
              {memo.content ? <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-sm leading-7 text-slate">{memo.content}</p> : <p className="mt-3 text-sm text-slate">본문 없음</p>}
              <p className="mt-4 text-xs text-slate">작성 {memo.owner.name}{memo.assignee ? ` · 담당 ${memo.assignee.name}` : ""}{memo.dueAt ? ` · 마감 ${formatDate(memo.dueAt)}` : ""}</p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
